import { useEffect, useRef } from 'react';
import { makeCamera, makeRenderer, loadGLB, resize, THREE } from '../../lib/scene';

/* ============================================================
   启动页 → 主页 过渡动画（可调参数）
   ------------------------------------------------------------
   点击进入后，地球模型（3D 头颅）渐进放大，放大过程中同步
   旋转，使界面视角逐步对准模型左侧正面区域，直到模型完全
   覆盖屏幕。随后进入 reveal 阶段：模型继续略微放大产生
   “穿屏”效果，同时整个启动层淡出，露出下方主页内容。

   · 动画速度：修改 durationMs（毫秒），越小越快。
   · 旋转角度：pitch / yaw / roll 目标值，单位为“度”。
   · revealMs：模型穿屏放大 + 淡出的时长。
   ============================================================ */
const DEG = Math.PI / 180;

/* 美术基准视角：顶面 + 正面 + 右侧面（经典三面视图） */
const HEAD_BASE_PITCH_DEG = 25.21; // 原 0.44 rad ≈ 25.2° 俯角，露出顶面
const HEAD_BASE_YAW_DEG = -34.38; // 原 -0.6 rad ≈ -34.4°，适度扩大左侧面（正面）显示面积
const HEAD_BASE_ROLL_DEG = -11.75; // 原 -0.205 rad ≈ -11.7°，保持中棱垂直
const HEAD_MODEL_SCALE = 1.3; // 模型自身放大系数（与改造前一致）
const BASE_GROUP_SCALE = 0.45; // 待机时整体缩放：模型渲染高度约页面 1/5
const IDLE_SWAY_RAD = 0.04; // 待机摆动幅度（±2.3°）

/* 过渡动画配置：可整体导出，也可通过 <HeadViewer transition={...}> 覆盖 */
export const HEAD_TRANSITION = {
  durationMs: 1800, // 动画总时长（速度控制：越小越快）
  overscan: 1.08, // 全屏覆盖余量，>1 保证模型完全遮住屏幕
  pitchToDeg: 0, // 目标俯角：正面平视
  yawToDeg: 0, // 目标偏航：正面正对镜头
  rollToDeg: 0, // 目标滚转：中棱垂直
  revealMs: 750, // reveal 阶段：继续放大 + 启动层淡出的时长
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export default function HeadViewer({
  active = false,
  revealing = false,
  transition: transitionOverride,
  onZoomDone,
  onRevealDone,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const moonRef = useRef(null);
  const startZoomRef = useRef(null);
  const onZoomDoneRef = useRef(onZoomDone);
  const onRevealDoneRef = useRef(onRevealDone);
  const revealingRef = useRef(revealing);
  const revealStartRef = useRef(null);

  const cfgRef = useRef({ ...HEAD_TRANSITION, ...transitionOverride });
  cfgRef.current = { ...HEAD_TRANSITION, ...transitionOverride };
  onZoomDoneRef.current = onZoomDone;
  onRevealDoneRef.current = onRevealDone;
  revealingRef.current = revealing;

  /* revealing 变为 true 时重置 reveal 计时起点 */
  useEffect(() => {
    if (revealing) revealStartRef.current = null;
  }, [revealing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const moonEl = moonRef.current;
    if (!canvas || !wrap || !moonEl) return undefined;

    let disposed = false;

    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = makeCamera(1);

    /* 均匀打光：以环境光为主 + 极弱方向光，配合材质自发光，各面亮度均匀 */
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3850, 1.25));
    const uniKey = new THREE.DirectionalLight(0xffffff, 0.3);
    uniKey.position.set(5, 8, 6);
    scene.add(uniKey);
    const uniFill = new THREE.DirectionalLight(0xffffff, 0.2);
    uniFill.position.set(-5, 2, 5);
    scene.add(uniFill);

    const group = new THREE.Group();
    group.scale.setScalar(BASE_GROUP_SCALE); // 待机尺寸
    scene.add(group);

    /* 头颅绕镜头方向（世界 Z）的滚转轴：用于摆正正面/右侧面之间的中棱 */
    const headPivot = new THREE.Group();
    headPivot.rotation.z = HEAD_BASE_ROLL_DEG * DEG;
    group.add(headPivot);

    let head = null; // mc_head.glb 模型
    let fallback = null; // 加载失败时的线框兜底
    let coverScale = 0; // 计算出的“完全覆盖屏幕”所需 group.scale
    let zoomState = null; // 过渡动画状态
    let pendingZoom = false; // 模型未加载完就点击：先挂起，加载完成立即开播
    let zoomDone = false;
    let revealDone = false;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    moonEl.style.animation = 'none'; // 月球摆动改由 JS 驱动，与地球同相位

    /* 月球固定在头颅的左上角（相对位置与缩放前一致） */
    const _v = new THREE.Vector3();
    function syncMoonPosition() {
      if (!moonEl || !head) return;
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      scene.updateMatrixWorld(true);
      let minX = Infinity;
      let minY = Infinity;
      head.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const b = geo.boundingBox;
        for (const x of [b.min.x, b.max.x]) {
          for (const y of [b.min.y, b.max.y]) {
            for (const z of [b.min.z, b.max.z]) {
              _v.set(x, y, z).applyMatrix4(o.matrixWorld).project(camera);
              const px = (_v.x * 0.5 + 0.5) * canvas.clientWidth;
              const py = (_v.y * 0.5 + 0.5) * canvas.clientHeight;
              if (px < minX) minX = px;
              if (py < minY) minY = py;
            }
          }
        }
      });
      const mw = moonEl.offsetWidth || 18;
      const mh = moonEl.offsetHeight || 18;
      const gap = Math.max(12, Math.round(mw * 0.5) + 7);
      moonEl.style.left = `${minX - mw / 2 - gap}px`;
      moonEl.style.top = `${minY - mh / 2 - gap}px`;
    }

    /* 青色光晕 sprite */
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(26, 188, 156, 0.38)');
    grad.addColorStop(0.4, 'rgba(26, 188, 156, 0.12)');
    grad.addColorStop(1, 'rgba(26, 188, 156, 0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(18, 18, 1);
    group.add(glow);

    /* 计算完全覆盖视口所需的 group.scale：
       以模型“内切球”投影为基准（旋转不改变内切球），
       保证最终任意朝向下的模型剪影都能盖住整个屏幕。 */
    function computeCoverScale() {
      const model = head || fallback;
      if (!model || !zoomState) return BASE_GROUP_SCALE * 8;
      const box = new THREE.Box3();
      let first = true;
      model.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        if (first) {
          box.copy(o.geometry.boundingBox);
          first = false;
        } else {
          box.union(o.geometry.boundingBox);
        }
      });
      if (first) return BASE_GROUP_SCALE * 8;
      const size = box.getSize(new THREE.Vector3());
      const localR = Math.min(size.x, size.y, size.z) / 2;
      const modelScale = head ? HEAD_MODEL_SCALE : 1;
      const k = localR * modelScale; // group.scale = 1 时模型内切球半径（世界单位）
      const dist = camera.position.length(); // 镜头到模型中心（原点）
      const tanHalf = Math.tan((camera.fov * DEG) / 2);
      const ry = Math.tan(Math.asin(Math.min(0.95, k / dist))) / tanHalf; // 每单位缩放的 NDC 高度半径
      const aspect = zoomState.vw / zoomState.vh;
      const rx = ry / aspect; // 屏幕圆投影到 NDC 后，宽度半径 = 高度半径 / aspect
      return Math.max(1 / rx, 1 / ry) * cfgRef.current.overscan;
    }

    /* 启动放大 + 旋转过渡（幂等） */
    function startZoom() {
      if (disposed || zoomState || zoomDone) return;
      if (!head && !fallback) {
        pendingZoom = true; // 模型尚未就绪，加载完成后立即开播
        return;
      }
      pendingZoom = false;
      const rect = wrap.getBoundingClientRect();
      zoomState = {
        start: performance.now(),
        fromX: rect.left,
        fromY: rect.top,
        fromW: rect.width,
        fromH: rect.height,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
      coverScale = computeCoverScale();
    }
    startZoomRef.current = startZoom;

    const headUrl = `${import.meta.env.BASE_URL}models/mc_head.glb`;
    loadGLB(headUrl)
      .then((model) => {
        if (disposed) return;
        head = model;
        head.scale.setScalar(HEAD_MODEL_SCALE);
        head.rotation.order = 'YXZ'; // 先绕 X 再绕 Y，让对角对准镜头
        head.rotation.x = HEAD_BASE_PITCH_DEG * DEG;
        head.rotation.y = HEAD_BASE_YAW_DEG * DEG;
        /* 自发光质感：贴图本身微弱发光，暗部不再发黑 */
        head.traverse((o) => {
          if (o.isMesh) {
            o.material.emissive = new THREE.Color(0xffffff);
            o.material.emissiveMap = o.material.map;
            o.material.emissiveIntensity = 0.6;
          }
        });
        headPivot.add(head);
        syncMoonPosition();
        if (pendingZoom) startZoom(); // 点击发生在加载完成前
      })
      .catch((err) => {
        console.error('mc_head.glb failed', err);
        if (disposed) return;
        // 兜底：生成一个青色线框头颅方块
        fallback = new THREE.Mesh(
          new THREE.BoxGeometry(8, 8, 8),
          new THREE.MeshStandardMaterial({
            color: 0x1abc9c,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
          })
        );
        group.add(fallback);
        if (pendingZoom) startZoom();
      });

    /* ---------- 渲染循环 ---------- */
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      if (disposed) return;
      resize(renderer, camera);
      const t = clock.getElapsedTime();

      if (zoomState && coverScale > 0) {
        /* —— 过渡动画：放大 + 同步旋转 —— */
        const cfg = cfgRef.current;
        const duration = reducedMotion ? 0.001 : cfg.durationMs;
        const p = clamp01((performance.now() - zoomState.start) / duration);
        const e = easeInOutCubic(p);

        /* 画布容器从原位平滑铺满全屏 */
        wrap.style.position = 'fixed';
        wrap.style.left = `${lerp(zoomState.fromX, 0, e).toFixed(2)}px`;
        wrap.style.top = `${lerp(zoomState.fromY, 0, e).toFixed(2)}px`;
        wrap.style.width = `${lerp(zoomState.fromW, zoomState.vw, e).toFixed(2)}px`;
        wrap.style.height = `${lerp(zoomState.fromH, zoomState.vh, e).toFixed(2)}px`;
        wrap.style.zIndex = '80';
        wrap.style.margin = '0';

        /* 模型渐进放大，直至完全覆盖屏幕 */
        group.scale.setScalar(lerp(BASE_GROUP_SCALE, coverScale, e));

        /* 同步旋转：俯仰 / 偏航 / 滚转逐步对准左侧正面 */
        if (head) {
          head.rotation.x = lerp(HEAD_BASE_PITCH_DEG * DEG, cfg.pitchToDeg * DEG, e);
          head.rotation.y = lerp(HEAD_BASE_YAW_DEG * DEG, cfg.yawToDeg * DEG, e);
        }
        headPivot.rotation.z = lerp(HEAD_BASE_ROLL_DEG * DEG, cfg.rollToDeg * DEG, e);

        /* 月球随放大淡出，避免遮挡 */
        moonEl.style.opacity = `${1 - e}`;

        if (p >= 1) {
          if (!zoomDone) {
            zoomDone = true;
            onZoomDoneRef.current?.(); // 覆盖完成：通知上层挂载主页并开始 reveal
          }
          if (revealingRef.current) {
            /* reveal：模型继续放大“穿屏”，同时启动层整体淡出 */
            if (revealStartRef.current === null) revealStartRef.current = performance.now();
            const rp = reducedMotion
              ? 1
              : clamp01((performance.now() - revealStartRef.current) / cfg.revealMs);
            const re = easeOutCubic(rp);
            group.scale.setScalar(coverScale * (1 + 0.14 * re));
            wrap.style.opacity = String(Math.max(0, 1 - re));
            if (rp >= 1 && !revealDone) {
              revealDone = true;
              onRevealDoneRef.current?.();
            }
          }
        }
      } else {
        /* —— 待机：摆动动画 —— */
        const phase = Math.sin(t * 0.9);
        headPivot.rotation.z = HEAD_BASE_ROLL_DEG * DEG + phase * IDLE_SWAY_RAD;
        const moonAmp = moonEl.offsetWidth * 0.2;
        moonEl.style.transform = `rotate(8deg) translateY(${(phase * -moonAmp).toFixed(2)}px)`;
        moonEl.style.opacity = '1';
      }

      if (!zoomState || zoomDone) syncMoonPosition();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      startZoomRef.current = null;
      renderer.setAnimationLoop(null);
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose();
            m.dispose();
          });
        }
      });
    };
  }, []);

  /* active 变为 true 时启动过渡 */
  useEffect(() => {
    if (active) startZoomRef.current?.();
  }, [active]);

  return (
    <div ref={wrapRef} className="earth-wrap">
      <div className="earth-glow" />
      <canvas ref={canvasRef} id="head3d" />
      <div ref={moonRef} className="float-cube" aria-hidden="true" />
    </div>
  );
}

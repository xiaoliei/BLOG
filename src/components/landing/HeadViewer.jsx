import { useEffect, useRef } from 'react';
import { makeCamera, makeRenderer, loadGLB, resize, THREE } from '../../lib/scene';
import { setStarsPaused } from '../../lib/stars';

/* ============================================================
   启动页 → 主页 过渡动画（可调参数）
   ------------------------------------------------------------
   点击进入后，地球模型（3D 头颅）渐进放大，放大过程中同步
   旋转，使界面视角逐步对准模型左侧正面区域。放大/旋转到
   handoffAt（默认 13%，即 yaw -29.9° / pitch 21.9° / roll -10.2°）
   时交接：地球以交接点瞬时速度继续推进、淡出（不急停），同时
   房间聚焦飞行以相同速度起步，形成连续渐变过渡。

   · 动画速度：修改 durationMs（毫秒），越小越快。
   · 旋转角度：pitch / yaw / roll 目标值，单位为“度”。
   · handoffAt：放大/旋转到多少（0~1）时交接，默认 0.13。
   · revealMs：交接后启动层淡出的时长。
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
  durationMs: 2200, // 动画总时长（速度控制：越小越快；放大到 13% 交接点约 700ms）
  overscan: 1.08, // 全屏覆盖余量，>1 保证模型完全遮住屏幕
  pitchToDeg: 0, // 目标俯角：正面平视
  yawToDeg: 0, // 目标偏航：正面正对镜头
  rollToDeg: 0, // 目标滚转：中棱垂直
  handoffAt: 0.13, // 地球放大/旋转到 13%（yaw -29.9° / pitch 21.9° / roll -10.2°）时交接
  revealMs: 700, // 交接后：启动层淡出的时长（渐变过渡，放慢避免突兀）
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
  onZoomHalf,
  onRevealDone,
  debug = false,
  viewerRef = null,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const moonRef = useRef(null);
  const startZoomRef = useRef(null);
  const onZoomHalfRef = useRef(onZoomHalf);
  const onRevealDoneRef = useRef(onRevealDone);
  const revealingRef = useRef(revealing);
  const revealStartRef = useRef(null);
  const dragYawRef = useRef(0); // 调试拖拽叠加的偏航（度）
  const dragPitchRef = useRef(0); // 调试拖拽叠加的俯仰（度）
  const debugStateRef = useRef({ yaw: 0, pitch: 0, roll: 0, e: 0, started: false });
  const debugSeekRef = useRef(null); // 进度条拖拽：非空时直接用该值作为过渡进度（0~1）

  const cfgRef = useRef({ ...HEAD_TRANSITION, ...transitionOverride });
  cfgRef.current = { ...HEAD_TRANSITION, ...transitionOverride };
  onZoomHalfRef.current = onZoomHalf;
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
    let handoffFired = false; // 已交接给房间：冻结放大/旋转
    let handoffE = 0; // 交接瞬间的动画进度
    let handoffAtMs = 0; // 交接触发时刻（用于交接后线性续接）
    let moonPinnedAtHandoff = false; // 交接后把月球重新钉到头颅左上角
    let revealDone = false;
    let currentE = 0; // 当前动画进度（调试面板显示用）
    let cleanupDrag = null; // 调试拖拽监听的清理函数

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    moonEl.style.animation = 'none'; // 月球摆动改由 JS 驱动，与地球同相位

    const _v = new THREE.Vector3();

    /* 头颅（或兜底方块）在画布坐标系中的投影外接矩形（px） */
    function getHeadScreenRect() {
      const model = head || fallback;
      if (!model) return null;
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      scene.updateMatrixWorld(true);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      model.traverse((o) => {
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
              if (px > maxX) maxX = px;
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            }
          }
        }
      });
      if (!Number.isFinite(minX)) return null;
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /* 月球固定在头颅的左上角（相对位置与缩放前一致） */
    function syncMoonPosition() {
      if (!moonEl || !head) return;
      const r = getHeadScreenRect();
      if (!r) return;
      const mw = moonEl.offsetWidth || 18;
      const mh = moonEl.offsetHeight || 18;
      const gap = Math.max(12, Math.round(mw * 0.5) + 7);
      moonEl.style.left = `${r.x - mw / 2 - gap}px`;
      moonEl.style.top = `${r.y - mh / 2 - gap}px`;
    }

    /* 聚焦飞行一半时屏幕的投影矩形：由房间在 .room-root 的 data-mid-rect 暴露。
       地球在交接点（handoffAt）时恰好放大到该矩形，与飞行一半时的屏幕位置一致。 */
    function getMidRect() {
      const raw = document.querySelector('.room-root')?.getAttribute('data-mid-rect');
      if (raw) {
        try {
          const r = JSON.parse(raw);
          if (r.width > 0 && r.height > 0) {
            return { left: r.left, top: r.top, width: r.width, height: r.height };
          }
        } catch { /* 数据损坏时走兜底 */ }
      }
      const h = window.innerHeight * 0.889 * 0.746; // 飞行一半 ≈ 阅读位的 74.6%（近似兜底）
      const w = h * 1.2;
      return { left: (window.innerWidth - w) / 2, top: (window.innerHeight - h) / 2, width: w, height: h };
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
      if (disposed || zoomState) return;
      if (!head && !fallback) {
        pendingZoom = true; // 模型尚未就绪，加载完成后立即开播
        return;
      }
      pendingZoom = false;
      const rect = wrap.getBoundingClientRect();
      const mid = getMidRect(); // 聚焦飞行一半时：屏幕投影矩形（房间暴露）
      zoomState = {
        start: performance.now(),
        fromX: rect.left,
        fromY: rect.top,
        fromW: rect.width,
        fromH: rect.height,
        /* 让地球在 handoffAt 时恰好放大到 mid 矩形，
           与聚焦飞行进行到一半时的屏幕位置一致 */
        target: {
          left: 2 * mid.left - rect.left,
          top: 2 * mid.top - rect.top,
          width: 2 * mid.width - rect.width,
          height: 2 * mid.height - rect.height,
        },
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
      /* 画布盒子固定在起始矩形，改用 transform（translate + 等比 scale）放大：
         避免每帧改 width/height 触发 WebGL 缓冲区重设与布局抖动 */
      wrap.style.position = 'fixed';
      wrap.style.left = `${zoomState.fromX}px`;
      wrap.style.top = `${zoomState.fromY}px`;
      wrap.style.width = `${zoomState.fromW}px`;
      wrap.style.height = `${zoomState.fromH}px`;
      wrap.style.zIndex = '80';
      wrap.style.margin = '0';
      wrap.style.transformOrigin = '0 0';
      coverScale = computeCoverScale();
    }
    startZoomRef.current = startZoom;

    /* 视口高宽变化时重新计算缩放状态：
       保持当前视觉矩形连续（不跳变），并把目标/覆盖比例对准新视口下的屏幕投影矩形 */
    function rebaseZoomOnResize() {
      if (disposed || !zoomState) return;
      const e = clamp01(currentE);
      const mid = getMidRect();
      const v = wrap.getBoundingClientRect();
      const span = e - 0.5; // 设计点：lerp(from, target, 0.5) = mid
      /* 视觉矩形 = lerp(from, target, e)（left/top/width；高度随宽度等比缩放），
         按“当前值连续 + 设计点 mid 在 e=0.5”反解新的 from/target */
      const rebaseDim = (vVal, midVal, fromVal, targetVal) => {
        const d = Math.abs(span) < 0.05
          ? targetVal - fromVal // 接近设计点时 Δ 不稳定，沿用原推进方向
          : (vVal - midVal) / span;
        const from = vVal - e * d;
        return { from, target: from + d };
      };
      const L = rebaseDim(v.left, mid.left, zoomState.fromX, zoomState.target.left);
      const T = rebaseDim(v.top, mid.top, zoomState.fromY, zoomState.target.top);
      const W = rebaseDim(v.width, mid.width, zoomState.fromW, zoomState.target.width);
      const aspect = zoomState.fromH / zoomState.fromW; // 盒子保持等比（默认 1:1）
      zoomState.fromX = L.from;
      zoomState.fromY = T.from;
      zoomState.fromW = Math.max(20, W.from);
      zoomState.fromH = zoomState.fromW * aspect;
      zoomState.target = {
        left: L.target,
        top: T.target,
        width: Math.max(20, W.target),
        height: Math.max(20, W.target) * aspect,
      };
      zoomState.vw = window.innerWidth;
      zoomState.vh = window.innerHeight;
      /* 模型缩放续接：保持当前缩放值，再向新视口的 coverScale 推进 */
      const newCover = computeCoverScale();
      const currentScale = group.scale.x;
      coverScale = e > 0.001
        ? BASE_GROUP_SCALE + (currentScale - BASE_GROUP_SCALE) / e
        : newCover;
      /* 画布盒子同步到新的 from 矩形 */
      wrap.style.left = `${zoomState.fromX}px`;
      wrap.style.top = `${zoomState.fromY}px`;
      wrap.style.width = `${zoomState.fromW}px`;
      wrap.style.height = `${zoomState.fromH}px`;
    }
    window.addEventListener('resize', rebaseZoomOnResize);

    /* 调试模式：拖拽旋转头颅（叠加在动画角度上），并暴露状态/手动跳转 API */
    if (debug) {
      const drag = { active: false, lastX: 0, lastY: 0 };
      const onDown = (e) => {
        drag.active = true;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        e.stopPropagation(); // 拖拽不触发“点击进入”
      };
      const onMove = (e) => {
        if (!drag.active) return;
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        dragYawRef.current += dx * 0.3;
        dragPitchRef.current = Math.max(-80, Math.min(80, dragPitchRef.current + dy * 0.3));
      };
      const onUp = () => {
        drag.active = false;
      };
      wrap.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      if (viewerRef) {
        viewerRef.current = {
          getState: () => ({ ...debugStateRef.current }),
          /* 进度条拖拽：直接跳到过渡动画的某个进度（0~1） */
          seek: (v) => {
            debugSeekRef.current = clamp01(v);
            if (!zoomState && !handoffFired) startZoom(); // 未开始时先进入缩放状态，进度即可预览
          },
          jump: () => {
            if (handoffFired) return;
            handoffFired = true;
            handoffE = currentE;
            /* 交接给房间：启动层淡出后，房间从全景位起跑聚焦飞行
               （与点击“聚焦屏幕阅读”按钮相同的旋转 + zoom-in 动画） */
            onZoomHalfRef.current?.();
            /* 兜底：缩放动画未启动时，reveal 完成交给定时器（否则无人卸载启动层） */
            if (!zoomState) {
              window.setTimeout(() => onRevealDoneRef.current?.(), cfgRef.current.revealMs);
            }
          },
        };
      }
      cleanupDrag = () => {
        wrap.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
    }

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
      /* 画布尺寸不变时跳过 resize，避免每帧重设 WebGL 缓冲区 */
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      if (canvas.width !== cw * renderer.getPixelRatio() || canvas.height !== ch * renderer.getPixelRatio()) {
        resize(renderer, camera);
      }
      const t = clock.getElapsedTime();

      if (zoomState && coverScale > 0) {
        /* —— 过渡动画：放大 + 同步旋转 —— */
        const cfg = cfgRef.current;
        const duration = reducedMotion ? 0.001 : cfg.durationMs;
        const p = clamp01((performance.now() - zoomState.start) / duration);
        const rawE = easeInOutCubic(p);

        /* —— 交接点：放大/旋转到 handoffAt 时冻结，通知上层开始交叉过渡。
           调试模式不自动交接，冻结在该角度等手动跳转。 —— */
        if (!handoffFired && rawE >= cfg.handoffAt && !debug) {
          handoffFired = true;
          handoffE = cfg.handoffAt; // 精确冻结在交接点：角度/缩放与目标完全一致
          handoffAtMs = performance.now();
          setStarsPaused(true); // 交接后与房间双 WebGL 叠加，暂停星空绘制省帧
          onZoomHalfRef.current?.();
        }
        let e;
        if (debug) {
          e = debugSeekRef.current != null
            ? clamp01(debugSeekRef.current)
            : handoffFired
              ? handoffE
              : Math.min(rawE, cfg.handoffAt);
        } else if (handoffFired) {
          /* 交接后地球不再急停：以交接点瞬时速度线性续接推进，
             与聚焦飞行起步速度一致，消除“急停-重启”的顿挫感 */
          const handoffP = Math.cbrt(cfg.handoffAt / 4); // easeInOutCubic 逆（<0.5 段）
          const handoffSlopePerMs = (12 * handoffP * handoffP) / cfg.durationMs;
          e = Math.min(1, cfg.handoffAt + (performance.now() - handoffAtMs) * handoffSlopePerMs);
        } else {
          e = rawE;
        }
        currentE = e;
        const target = zoomState.target;

        /* 画布容器放大改用 transform（合成器友好）：translate 移动 + 等比 scale 放大，
           盒子尺寸固定，避免每帧触发布局与 WebGL 缓冲区重设 */
        const s = lerp(1, target.width / zoomState.fromW, e);
        wrap.style.transform =
          `translate(${lerp(0, target.left - zoomState.fromX, e).toFixed(2)}px,` +
          `${lerp(0, target.top - zoomState.fromY, e).toFixed(2)}px) scale(${s.toFixed(4)})`;

        /* 模型渐进放大（交接后按续接进度继续） */
        group.scale.setScalar(lerp(BASE_GROUP_SCALE, coverScale, e));

        /* 交接时：把月球重新钉在放大后的头颅左上角 */
        if (handoffFired && !moonPinnedAtHandoff) {
          moonPinnedAtHandoff = true;
          syncMoonPosition();
        }

        /* 同步旋转：俯仰 / 偏航 / 滚转逐步对准左侧正面（调试模式可拖拽叠加角度） */
        let pitchDeg = lerp(HEAD_BASE_PITCH_DEG, cfg.pitchToDeg, e);
        let yawDeg = lerp(HEAD_BASE_YAW_DEG, cfg.yawToDeg, e);
        if (debug) {
          pitchDeg += dragPitchRef.current;
          yawDeg += dragYawRef.current;
        }
        if (head) {
          head.rotation.x = pitchDeg * DEG;
          head.rotation.y = yawDeg * DEG;
        }
        headPivot.rotation.z = lerp(HEAD_BASE_ROLL_DEG * DEG, cfg.rollToDeg * DEG, e);

        /* 月球随放大淡出，避免遮挡 */
        moonEl.style.opacity = `${1 - e}`;

        if (revealingRef.current) {
          /* reveal：启动层整体淡出（地球按续接进度继续放大/旋转，不再叠加额外缩放） */
          if (revealStartRef.current === null) revealStartRef.current = performance.now();
          const rp = reducedMotion
            ? 1
            : clamp01((performance.now() - revealStartRef.current) / cfg.revealMs);
          const re = easeOutCubic(rp);
          wrap.style.opacity = String(Math.max(0, 1 - re));
          if (rp >= 1 && !revealDone) {
            revealDone = true;
            onRevealDoneRef.current?.();
          }
        }
      } else {
        /* —— 待机：摆动动画（调试模式可拖拽旋转） —— */
        const phase = Math.sin(t * 0.9);
        headPivot.rotation.z = HEAD_BASE_ROLL_DEG * DEG + phase * IDLE_SWAY_RAD;
        const moonAmp = moonEl.offsetWidth * 0.2;
        moonEl.style.transform = `rotate(8deg) translateY(${(phase * -moonAmp).toFixed(2)}px)`;
        moonEl.style.opacity = '1';
        currentE = 0;
        if (debug && head) {
          head.rotation.x = (HEAD_BASE_PITCH_DEG + dragPitchRef.current) * DEG;
          head.rotation.y = (HEAD_BASE_YAW_DEG + dragYawRef.current) * DEG;
        }
      }

      /* 调试面板：仅调试模式维护状态对象；dataset 仅变化时写入（避免每帧 DOM 变更） */
      if (head) {
        const yawDeg = head.rotation.y / DEG;
        const pitchDeg = head.rotation.x / DEG;
        const rollDeg = headPivot.rotation.z / DEG;
        if (debug) {
          const r = wrap.getBoundingClientRect();
          debugStateRef.current = {
            yaw: yawDeg,
            pitch: pitchDeg,
            roll: rollDeg,
            e: currentE,
            started: !!zoomState,
            rect: {
              left: Math.round(r.left),
              top: Math.round(r.top),
              w: Math.round(r.width),
              h: Math.round(r.height),
            },
          };
        }
        const headStateStr =
          `yaw=${yawDeg.toFixed(1)}` +
          `&pitch=${pitchDeg.toFixed(1)}` +
          `&roll=${rollDeg.toFixed(1)}` +
          `&e=${currentE.toFixed(3)}`;
        if (wrap.dataset.headState !== headStateStr) wrap.dataset.headState = headStateStr;
      }

      if (!zoomState) syncMoonPosition();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      setStarsPaused(false);
      window.removeEventListener('resize', rebaseZoomOnResize);
      cleanupDrag?.();
      if (viewerRef) viewerRef.current = null;
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

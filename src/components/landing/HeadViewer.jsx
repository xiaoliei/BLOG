import { useEffect, useRef } from 'react';
import { makeCamera, makeRenderer, loadGLB, resize, THREE } from '../../lib/scene';

/* 美术标准立方体视角：顶面 + 正面 + 右侧面，正面为主视面（经典三面视图） */
const HEAD_BASE_ROT_X = 0.44; // ≈25° 俯角，露出顶面
const HEAD_BASE_ROT_Y = -0.6; // ≈-34°，适度扩大左侧面（正面）的显示面积
const HEAD_ROLL = -0.205; // 绕镜头方向滚转：保持中棱垂直，并逆时针偏转约 2.3°

export default function HeadViewer() {
  const canvasRef = useRef(null);
  const moonRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const moonEl = moonRef.current;
    if (!canvas || !moonEl) return undefined;

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
    group.scale.setScalar(0.45); // 模型整体缩小：渲染高度约为页面高度的 1/5
    scene.add(group);

    /* 头颅绕镜头方向（世界 Z）的滚转轴：用于摆正正面/右侧面之间的中棱 */
    const headPivot = new THREE.Group();
    headPivot.rotation.z = HEAD_ROLL;
    group.add(headPivot);

    let head = null;
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

    const headUrl = `${import.meta.env.BASE_URL}models/mc_head.glb`;
    loadGLB(headUrl)
      .then((model) => {
        if (disposed) return;
        head = model;
        head.scale.setScalar(1.3); // 与原来体素地球相近的视觉尺寸
        head.rotation.order = 'YXZ'; // 先绕 X 再绕 Y，让对角对准镜头
        head.rotation.x = HEAD_BASE_ROT_X;
        head.rotation.y = HEAD_BASE_ROT_Y;
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
      })
      .catch((err) => {
        console.error('mc_head.glb failed', err);
        if (disposed) return;
        // 兜底：生成一个青色线框头颅方块
        const fallback = new THREE.Mesh(
          new THREE.BoxGeometry(8, 8, 8),
          new THREE.MeshStandardMaterial({
            color: 0x1abc9c,
            wireframe: true,
            transparent: true,
            opacity: 0.5,
          })
        );
        group.add(fallback);
      });

    /* ---------- 渲染循环 ---------- */
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      resize(renderer, camera);
      /* 地球与月球共用同一相位：同时到极限、同时停止、同时反向 */
      const phase = Math.sin(t * 0.9);
      headPivot.rotation.z = HEAD_ROLL + phase * 0.04;
      syncMoonPosition(); // 每帧跟随头颅角重新定位，摆动时也不会重叠
      const moonAmp = moonEl.offsetWidth * 0.2; // 浮动幅度随月球尺寸缩放
      moonEl.style.transform = `rotate(8deg) translateY(${(phase * -moonAmp).toFixed(2)}px)`;
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
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

  return (
    <div className="earth-wrap">
      <div className="earth-glow" />
      <canvas ref={canvasRef} id="head3d" />
      <div ref={moonRef} className="float-cube" aria-hidden="true" />
    </div>
  );
}

import { initSystemClock, runBoot } from './common.js';
import { startStars } from './stars.js';
import { makeRenderer, makeCamera, addLights, loadGLB, resize, THREE } from './scene.js';

const canvas = document.getElementById('earth3d');
const starsCanvas = document.getElementById('stars');
const stage = document.querySelector('.landing-stage');

startStars(starsCanvas);
initSystemClock();

/* ---------- 3D scene ---------- */
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
const camera = makeCamera(1);
addLights(scene, { cyan: true });

const group = new THREE.Group();
scene.add(group);

let earth = null;
let loaded = false;

/* 青色光晕 sprite */
const glowCanvas = document.createElement('canvas');
glowCanvas.width = 256;
glowCanvas.height = 256;
const gctx = glowCanvas.getContext('2d');
const grad = gctx.createRadialGradient(128, 128, 8, 128, 128, 128);
grad.addColorStop(0, 'rgba(26, 188, 156, 0.55)');
grad.addColorStop(0.4, 'rgba(26, 188, 156, 0.16)');
grad.addColorStop(1, 'rgba(26, 188, 156, 0)');
gctx.fillStyle = grad;
gctx.fillRect(0, 0, 256, 256);
const glowTex = new THREE.CanvasTexture(glowCanvas);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
}));
glow.scale.set(20, 20, 1);
group.add(glow);

/* 地球外围的淡色线框八面体，强化"体素/线框"语言 */
const octa = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.OctahedronGeometry(9.2, 1)),
  new THREE.LineBasicMaterial({ color: 0x1abc9c, transparent: true, opacity: 0.16 })
);
group.add(octa);

loadGLB('assets/models/earth.glb')
  .then((model) => {
    earth = model;
    earth.scale.setScalar(1);
    earth.rotation.y = 1.05; // 将大陆面向镜头
    group.add(earth);
    loaded = true;
  })
  .catch((err) => {
    console.error('earth.glb failed', err);
    // 兜底：生成一个青色体素球
    const fallback = new THREE.Mesh(
      new THREE.SphereGeometry(7, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x1abc9c, wireframe: true, transparent: true, opacity: 0.5 })
    );
    group.add(fallback);
    loaded = true;
  });

/* ---------- 交互：点击 / 滚动 / 按键进入 ---------- */
let booting = false;
function enter() {
  if (booting) return;
  booting = true;
  runBoot('archive.html');
}

stage.addEventListener('click', enter);
stage.addEventListener('pointerdown', enter);
window.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > 4) enter();
}, { passive: true });
window.addEventListener('keydown', (e) => {
  if (['Enter', ' ', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) enter();
});

/* ---------- 渲染循环 ---------- */
const clock = new THREE.Clock();
const mouse = { x: 0, y: 0 };

stage.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
  mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
});

renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  resize(renderer, camera);

  if (loaded && earth) {
    // 顺时针小角度 → 逆时针归正，往复循环
    earth.rotation.y = 1.05 + Math.sin(t * 0.5) * 0.24;
    group.position.y = Math.sin(t * 0.9) * 0.12;
    earth.rotation.x = Math.sin(t * 0.35) * 0.04;
  }
  octa.rotation.y = t * 0.05;
  octa.rotation.x = Math.sin(t * 0.2) * 0.08;

  camera.position.x = mouse.x * 1.1;
  camera.position.y = 1.2 - mouse.y * 0.8;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
});

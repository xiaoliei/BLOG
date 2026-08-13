/* ============================================================
 * BLOG_OS — COMPUTER_HEAD 头颅模型查看器
 * 加载 computer_head.glb（generate-head.cjs 由 computer.png 生成），
 * 全屏 OrbitControls 轨道旋转 / 滚轮缩放 / 自动环绕 / 线框切换。
 * 场景与灯光沿用 demo 体素页风格（深蓝径向 + 青色辉光）。
 * ============================================================ */

import { initSystemClock, toast } from './common.js';
import { makeRenderer, makeCamera, resize, loadGLB, measure, frameAround, THREE } from './scene.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

initSystemClock();

const MODEL_URL = 'assets/models/computer_head.glb';

const canvas = document.getElementById('viewer3d');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
const camera = makeCamera(1);
const clock = new THREE.Clock();

/* ---------- 灯光：突出两层头颅的体块 ---------- */
scene.add(new THREE.HemisphereLight(0x6d87a8, 0x0a0f18, 0.85));

const key = new THREE.DirectionalLight(0xfff3e0, 2.1);
key.position.set(8, 12, 7);
scene.add(key);

const fill = new THREE.DirectionalLight(0x9fc7ff, 0.55);
fill.position.set(-7, 4, -6);
scene.add(fill);

const rim = new THREE.DirectionalLight(0x1abc9c, 0.5);
rim.position.set(-2, 5, -10);
scene.add(rim);

const cyanGlow = new THREE.PointLight(0x1abc9c, 18, 26);
cyanGlow.position.set(0, 0, 4);
scene.add(cyanGlow);

/* ---------- 地平面网格 ---------- */
const grid = new THREE.GridHelper(30, 15, 0x1abc9c, 0x2a4a6a);
grid.position.y = -4.6;
grid.material.transparent = true;
grid.material.opacity = 0.2;
scene.add(grid);

/* ---------- 轨道控制器 ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 50;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.4;
camera.position.set(13, 7, 15);

/* ---------- 模型加载 ---------- */
const elState = document.getElementById('head-state');
const elHud = document.getElementById('hud-status');
const elVerts = document.getElementById('stat-verts');
const elTris = document.getElementById('stat-tris');

function setState(text, cls) {
  elState.textContent = text;
  elState.className = cls || '';
  elHud.innerHTML = `COMPUTER_HEAD <i>${text}</i>`;
}

const modelGroup = new THREE.Group();
scene.add(modelGroup);

let wireframe = null;

loadGLB(MODEL_URL)
  .then((model) => {
    model.scale.setScalar(1.3);
    // 让贴图自发光微亮，与启动页头颅观感一致
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.emissive = new THREE.Color(0xffffff);
        o.material.emissiveMap = o.material.map;
        o.material.emissiveIntensity = 0.55;
        o.material.needsUpdate = true;
      }
    });
    modelGroup.add(model);

    const { verts, tris } = measure(model);
    elVerts.textContent = verts.toLocaleString();
    elTris.textContent = tris.toLocaleString();

    // 古铜橙线框 bounding box（与 demo 详情页一致）
    wireframe = frameAround(scene, model, { color: 0xe67e22, pad: 0.4, opacity: 0.85 });

    setState('READY', 'done');
    toast('<span class="t-code">LOAD_OK</span> // computer_head.glb');
  })
  .catch((err) => {
    console.error('computer_head.glb failed', err);
    setState('ERROR', 'error');
    toast('<span class="t-code">LOAD_FAIL 0x500</span> // computer_head.glb 加载失败');
  });

/* ---------- 自动环绕 / 线框切换 ---------- */
const btnRotate = document.getElementById('btn-rotate');
const btnWire = document.getElementById('btn-wire');

btnRotate.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  btnRotate.classList.toggle('on', controls.autoRotate);
  toast(`<span class="t-code">AUTO_ROTATE</span> // ${controls.autoRotate ? 'ON' : 'OFF'}`);
});

let wireOn = false;
btnWire.addEventListener('click', () => {
  wireOn = !wireOn;
  btnWire.classList.toggle('on', wireOn);
  modelGroup.traverse((o) => {
    if (o.isMesh && o.material) o.material.wireframe = wireOn;
  });
  if (wireframe) wireframe.visible = !wireOn;
  toast(`<span class="t-code">WIREFRAME</span> // ${wireOn ? 'ON' : 'OFF'}`);
});

/* ---------- 渲染循环 ---------- */
renderer.setAnimationLoop(() => {
  resize(renderer, camera);
  controls.update();
  // 青色点光随时间呼吸
  cyanGlow.intensity = 16 + Math.sin(clock.getElapsedTime() * 1.8) * 4;
  renderer.render(scene, camera);
});

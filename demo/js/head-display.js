/* ============================================================
 * BLOG_OS — HEAD_DISPLAY 头颅显屏
 * 复制自 computer-display，把程序化显示器替换为 computer_head.glb：
 * 头颅模型作为「主机」，正面（+Z 面）当显示屏，用 CSS3DRenderer
 * 把 xiaoli-home/index.html 实时 iframe 贴在头颅正脸。
 * WebGL 渲染头颅，CSS3D 渲染页面，共享同一 PerspectiveCamera；
 * 转到背面自动隐藏 iframe（防穿透头颅）。
 * ============================================================ */

import { initSystemClock, toast } from './common.js';
import { makeRenderer, makeCamera, resize, loadGLB, THREE } from './scene.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

initSystemClock();

const SCREEN_URL = 'xiaoli-home/index.html';
const MODEL_URL = 'assets/models/computer_head.glb';

/* ---------- WebGL 渲染器 + 场景 ---------- */
const canvas = document.getElementById('viewer3d');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
const camera = makeCamera(1);
camera.position.set(0, 1, 26);

/* ---------- CSS3D 渲染器（叠加层，指针透传） ---------- */
const cssRenderer = new CSS3DRenderer();
const cssScene = new THREE.Scene();
const cssHost = document.getElementById('css3d');
cssRenderer.domElement.style.position = 'absolute';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.left = '0';
cssRenderer.domElement.style.pointerEvents = 'none';
cssHost.appendChild(cssRenderer.domElement);

/* ---------- 头颅模型（替代程序化显示器） ---------- */
const HEAD_SCALE = 1.5;                            // bounds ±4.25 → ±6.375
const FACE_Z = 4.25 * HEAD_SCALE;                  // 帽子层正面 = 6.375
// 屏幕内容区：computer.png 正面 8×8 纹理中，内 6 列×5 行（蓝天+草地）的世界矩形
//   x ±4.78（宽 9.56）/ y -3.19..+4.78（高 7.97），中心偏上 y=+0.80（上方为蓝天下方为草地，无翻转）
const SCREEN_W = 9.6, SCREEN_H = 8.0, SCREEN_CY = 0.80;

const modelGroup = new THREE.Group();
scene.add(modelGroup);

/* ---------- 灯光 ---------- */
scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x0a0f18, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(8, 13, 11);
scene.add(key);
const fill = new THREE.DirectionalLight(0x9fc7ff, 0.5);
fill.position.set(-9, 3, -6);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x1abc9c, 0.45);
rim.position.set(-3, 5, -10);
scene.add(rim);
const cyanGlow = new THREE.PointLight(0x1abc9c, 16, 50);
cyanGlow.position.set(0, 0, 8);
scene.add(cyanGlow);

/* ---------- 地平面网格 ---------- */
const grid = new THREE.GridHelper(60, 30, 0x1abc9c, 0x2a4a6a);
grid.position.y = -FACE_Z - 0.8;
grid.material.transparent = true;
grid.material.opacity = 0.18;
scene.add(grid);

/* ---------- 屏幕外缘青色描边（贴在头颅正面，作嵌入式屏幕边框） ---------- */
const bezel = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-SCREEN_W / 2 - 0.12, -SCREEN_H / 2 - 0.12, 0),
    new THREE.Vector3(SCREEN_W / 2 + 0.12, -SCREEN_H / 2 - 0.12, 0),
    new THREE.Vector3(SCREEN_W / 2 + 0.12, SCREEN_H / 2 + 0.12, 0),
    new THREE.Vector3(-SCREEN_W / 2 - 0.12, SCREEN_H / 2 + 0.12, 0),
  ]),
  new THREE.LineBasicMaterial({ color: 0x1abc9c, transparent: true, opacity: 0.85 })
);
bezel.position.set(0, SCREEN_CY, FACE_Z + 0.02);
scene.add(bezel);

/* ---------- 轨道控制器 ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 12;
controls.maxDistance = 56;
controls.maxPolarAngle = Math.PI * 0.92;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

/* ============================================================
 * CSS3D iframe —— xiaoli-home 实时贴在头颅正面
 * 元素 1200×675px，scale 0.01 → 12×6.75 世界单位
 * ============================================================ */
const iframe = document.createElement('iframe');
iframe.src = SCREEN_URL;
iframe.title = 'xiaoli-home head display';
iframe.style.width = '960px';
iframe.style.height = '800px';
iframe.style.border = '0';
iframe.style.background = '#e9e9e9';

const screenObj = new CSS3DObject(iframe);
screenObj.scale.set(0.01, 0.01, 0.01);
screenObj.position.set(0, SCREEN_CY, FACE_Z + 0.1);
cssScene.add(screenObj);

/* ---------- 加载头颅模型 ---------- */
let head = null;
loadGLB(MODEL_URL)
  .then((model) => {
    head = model;
    head.scale.setScalar(HEAD_SCALE);
    head.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.emissive = new THREE.Color(0xffffff);
        o.material.emissiveMap = o.material.map;
        o.material.emissiveIntensity = 0.55;
        o.material.needsUpdate = true;
      }
    });
    modelGroup.add(head);
  })
  .catch((err) => {
    console.error('computer_head.glb failed', err);
    setState('NO_MODEL', 'error');
  });

/* ---------- iframe 加载状态 ---------- */
const elState = document.getElementById('disp-state');
const elHud = document.getElementById('hud-status');
function setState(text, cls) {
  elState.textContent = text;
  elState.className = cls || '';
  elHud.innerHTML = `HEAD_DISPLAY <i>${text}</i>`;
}
iframe.addEventListener('load', () => {
  setState('READY', 'done');
  toast('<span class="t-code">DISPLAY_ON</span> // xiaoli-home 已上屏');
});
iframe.addEventListener('error', () => setState('ERROR', 'error'));

/* ---------- 背面剔除：相机转到头颅后方时隐藏 iframe ---------- */
const SCREEN_NORMAL = new THREE.Vector3(0, 0, 1);
const _toCam = new THREE.Vector3();

/* ---------- 按钮：自动旋转 / 电源 ---------- */
const btnRotate = document.getElementById('btn-rotate');
const btnPower = document.getElementById('btn-power');
let powered = true;

btnRotate.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  btnRotate.classList.toggle('on', controls.autoRotate);
  toast(`<span class="t-code">AUTO_ROTATE</span> // ${controls.autoRotate ? 'ON' : 'OFF'}`);
});

btnPower.addEventListener('click', () => {
  powered = !powered;
  btnPower.classList.toggle('on', powered);
  screenObj.visible = powered;
  bezel.material.opacity = powered ? 0.85 : 0.15;
  if (head) {
    head.traverse((o) => {
      if (o.isMesh && o.material) o.material.emissiveIntensity = powered ? 0.55 : 0.0;
    });
  }
  toast(`<span class="t-code">POWER</span> // ${powered ? 'ON 显示输出' : 'OFF 待机'}`);
});

/* ---------- 自适应 ---------- */
function doResize() {
  resize(renderer, camera);
  const w = cssHost.clientWidth || window.innerWidth;
  const h = cssHost.clientHeight || window.innerHeight;
  cssRenderer.setSize(w, h);
}
window.addEventListener('resize', doResize);

/* ---------- 渲染循环 ---------- */
renderer.setAnimationLoop(() => {
  doResize();
  controls.update();
  cyanGlow.intensity = 14 + Math.sin(performance.now() * 0.0018) * 3;

  renderer.render(scene, camera);

  // CSS3D 同相机渲染；背面隐藏 iframe
  camera.updateMatrixWorld();
  _toCam.copy(camera.position).sub(screenObj.position);
  iframe.style.opacity = powered && _toCam.dot(SCREEN_NORMAL) > 0.05 ? '1' : '0';

  cssRenderer.render(cssScene, camera);
});

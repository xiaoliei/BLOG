/* ============================================================
 * BLOG_OS — COMPUTER_DISPLAY 显示输出
 * 程序化搭建一台体素风显示器（机身 + 颈柱 + 底座 + 青色描边），
 * 显示屏一侧用 CSS3DRenderer 挂载实时 <iframe>（xiaoli-home/index.html），
 * 相机共享：WebGL 渲染机身，CSS3D 渲染页面，两者用同一 PerspectiveCamera。
 * 背面剔除：相机转到屏幕背后时自动隐藏 iframe（避免穿透机身）。
 * ============================================================ */

import { initSystemClock, toast } from './common.js';
import { makeRenderer, makeCamera, resize, THREE } from './scene.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

initSystemClock();

const SCREEN_URL = 'xiaoli-home/index.html';

/* ---------- WebGL 渲染器 + 场景 ---------- */
const canvas = document.getElementById('viewer3d');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
const camera = makeCamera(1);
camera.position.set(0, 2, 34);

/* ---------- CSS3D 渲染器（叠加层，指针透传） ---------- */
const cssRenderer = new CSS3DRenderer();
const cssScene = new THREE.Scene();
const cssHost = document.getElementById('css3d');
cssRenderer.domElement.style.position = 'absolute';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.left = '0';
cssRenderer.domElement.style.pointerEvents = 'none';
cssHost.appendChild(cssRenderer.domElement);

/* ---------- 显示器尺寸（世界单位） ---------- */
const BODY_W = 17.2, BODY_H = 9.9, BODY_D = 1.0;   // 机身/边框
const SCREEN_W = 16, SCREEN_H = 9;                  // 可视区域 16:9
const FACE_Z = BODY_D / 2;                           // 屏幕朝 +Z

const monitor = new THREE.Group();
scene.add(monitor);

/* 机身材质：深色金属塑料 */
const chassisMat = new THREE.MeshStandardMaterial({
  color: 0x161a21,
  metalness: 0.55,
  roughness: 0.42,
});

/* ---------- 机身（边框立方体） ---------- */
const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D), chassisMat);
monitor.add(body);

/* ---------- 屏幕底板（深色玻璃，承托 iframe） ---------- */
const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
  new THREE.MeshStandardMaterial({ color: 0x04060a, metalness: 0.2, roughness: 0.25, emissive: 0x05121a, emissiveIntensity: 0.4 })
);
glass.position.set(0, 0, FACE_Z + 0.002);
monitor.add(glass);

/* ---------- 屏幕外缘青色描边（赛博点缀） ---------- */
const edge = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(SCREEN_W + 0.12, SCREEN_H + 0.12, 0.02)),
  new THREE.LineBasicMaterial({ color: 0x1abc9c, transparent: true, opacity: 0.85 })
);
edge.position.set(0, 0, FACE_Z);
monitor.add(edge);

/* ---------- 电源指示灯（机身右下） ---------- */
const ledMat = new THREE.MeshStandardMaterial({ color: 0x1abc9c, emissive: 0x1abc9c, emissiveIntensity: 2.2 });
const led = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), ledMat);
led.position.set(BODY_W / 2 - 0.6, -BODY_H / 2 + 0.45, FACE_Z + 0.02);
monitor.add(led);

/* ---------- 颈柱 + 底座 ---------- */
const neck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.6, 0.95), chassisMat);
neck.position.set(0, -BODY_H / 2 - 1.6, -0.1);
monitor.add(neck);

const base = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.3, 0.5, 40), chassisMat);
base.position.set(0, -BODY_H / 2 - 3.6, -0.1);
monitor.add(base);

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
cyanGlow.position.set(0, 0, 7);
scene.add(cyanGlow);

/* ---------- 地平面网格 ---------- */
const grid = new THREE.GridHelper(70, 35, 0x1abc9c, 0x2a4a6a);
grid.position.y = -BODY_H / 2 - 4.0;
grid.material.transparent = true;
grid.material.opacity = 0.18;
scene.add(grid);

/* ---------- 轨道控制器 ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -0.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 12;
controls.maxDistance = 72;
controls.maxPolarAngle = Math.PI * 0.92;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

/* ============================================================
 * CSS3D iframe —— 把 xiaoli-home 实时渲染到屏幕面
 * 元素像素尺寸 1600×900，scale 0.01 → 16×9 世界单位，贴合屏幕
 * ============================================================ */
const iframe = document.createElement('iframe');
iframe.src = SCREEN_URL;
iframe.title = 'xiaoli-home display';
iframe.style.width = '1600px';
iframe.style.height = '900px';
iframe.style.border = '0';
iframe.style.background = '#e9e9e9';

const screenObj = new CSS3DObject(iframe);
screenObj.scale.set(0.01, 0.01, 0.01);
screenObj.position.set(0, 0, FACE_Z + 0.01);
cssScene.add(screenObj);

/* iframe 加载状态 */
const elState = document.getElementById('disp-state');
const elHud = document.getElementById('hud-status');
function setState(text, cls) {
  elState.textContent = text;
  elState.className = cls || '';
  elHud.innerHTML = `COMPUTER_DISPLAY <i>${text}</i>`;
}
iframe.addEventListener('load', () => {
  setState('READY', 'done');
  toast('<span class="t-code">DISPLAY_ON</span> // xiaoli-home 已上屏');
});
iframe.addEventListener('error', () => setState('ERROR', 'error'));

/* ---------- 背面剔除：相机转到屏幕后方时隐藏 iframe ---------- */
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
  glass.material.emissiveIntensity = powered ? 0.4 : 0.0;
  ledMat.emissiveIntensity = powered ? 2.2 : 0.0;
  edge.material.opacity = powered ? 0.85 : 0.2;
  toast(`<span class="t-code">POWER</span> // ${powered ? 'ON 显示输出' : 'OFF 待机'}`);
});

/* ---------- 自适应：两个渲染器同步尺寸 ---------- */
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
  // 青色点光呼吸
  cyanGlow.intensity = 14 + Math.sin(performance.now() * 0.0018) * 3;
  // 电源灯轻微脉动
  if (powered) ledMat.emissiveIntensity = 1.9 + Math.sin(performance.now() * 0.004) * 0.4;

  renderer.render(scene, camera);

  // CSS3D 同相机渲染；背面时隐藏 iframe（防穿透机身）
  camera.updateMatrixWorld();
  _toCam.copy(camera.position).sub(screenObj.position);
  const facing = _toCam.dot(SCREEN_NORMAL);
  iframe.style.opacity = powered && facing > 0.05 ? '1' : '0';

  cssRenderer.render(cssScene, camera);
});

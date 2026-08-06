/* ============================================================
 * BLOG_OS — FIRE_CUBE 火焰动态方块演示
 * 读取 assets/Fire.gif，在浏览器内实时解码每一帧，
 * 作为「前 / 后 / 左 / 右」四片外壁 + 中心两片十字交叉的动画贴图
 * （俯视为「田」字格）。
 * 贴图透明区域直接镂空（无黑色方块底），
 * 四片外壁可绕底部铰链向内倾斜（0°–30° 滑杆调节），
 * 中心两片十字保持竖直。
 * ============================================================ */

import { initSystemClock, toast } from './common.js';
import { makeRenderer, makeCamera, resize, THREE } from './scene.js';
import { decodeGIF } from './gif-decoder.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

initSystemClock();

const canvas = document.getElementById('viewer3d');
const renderer = makeRenderer(canvas);

const scene = new THREE.Scene();
const camera = makeCamera(1);
const clock = new THREE.Clock();

/* ---------- 灯光：主光 + 冷色轮廓 + 随火焰闪烁的暖色点光 ---------- */
scene.add(new THREE.HemisphereLight(0x6d87a8, 0x0a0f18, 0.6));

const key = new THREE.DirectionalLight(0xfff3e0, 1.4);
key.position.set(4, 7, 5);
scene.add(key);

const rim = new THREE.DirectionalLight(0x1abc9c, 0.4);
rim.position.set(-4, 2, -6);
scene.add(rim);

const fireLight = new THREE.PointLight(0xff7a1a, 1.2, 14, 1.8);
fireLight.position.set(0, 0.8, 2.2);
scene.add(fireLight);

/* ---------- 地面网格 ---------- */
const grid = new THREE.GridHelper(22, 11, 0x1abc9c, 0x2a2a3e);
grid.position.y = -2.1;
grid.material.transparent = true;
grid.material.opacity = 0.2;
scene.add(grid);

/* ---------- 轨道控制器 ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3.5;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = 0.1;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.4;
camera.position.set(5.2, 3.4, 5.8);
controls.update();

/* ---------- 火焰面：外壁四片 + 中心十字两片，透明镂空，可向内倾斜 ---------- */
const FACE_SIZE = 2;
const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

// alphaTest 直接丢弃透明像素，避免黑色方块底；
// DoubleSide 保证任意视角都能看到火焰。
const sideMat = new THREE.MeshBasicMaterial({
  map: null,
  transparent: true,
  alphaTest: 0.1,
  side: THREE.DoubleSide,
});

const faces = [];
const INITIAL_TILT = 12;

function applyTilt(deg) {
  const rad = THREE.MathUtils.degToRad(deg);
  faces.forEach((f) => {
    if (f.isCross) return; // 中心十字保持竖直，不参与倾斜
    f.pivot.rotation[f.rotAxis] = f.rotSign * rad;
  });
}

/* 俯视为「田」字：四片外壁围成外框，中心两片十字交叉 */
function buildFaces() {
  const defs = [
    { x: 0, z: 1, yaw: 0, rotAxis: 'x', rotSign: -1 },            // 前壁
    { x: 0, z: -1, yaw: 0, rotAxis: 'x', rotSign: 1 },            // 后壁
    { x: 1, z: 0, yaw: -Math.PI / 2, rotAxis: 'z', rotSign: 1 },  // 右壁
    { x: -1, z: 0, yaw: Math.PI / 2, rotAxis: 'z', rotSign: -1 }, // 左壁
    { x: 0, z: 0, yaw: 0, rotAxis: 'x', rotSign: -1 },            // 中心十字（竖片）
    { x: 0, z: 0, yaw: Math.PI / 2, rotAxis: 'z', rotSign: 1 },   // 中心十字（横片）
  ];
  for (const d of defs) {
    const pivot = new THREE.Group();
    // 铰链在底部棱边（y = -1）
    pivot.position.set(d.x, -FACE_SIZE / 2, d.z);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE), sideMat);
    plane.position.y = FACE_SIZE / 2;
    plane.rotation.y = d.yaw;
    pivot.add(plane);
    cubeGroup.add(pivot);
    faces.push({
      pivot,
      rotAxis: d.rotAxis,
      rotSign: d.rotSign,
      isCross: d.x === 0 && d.z === 0,
    });
  }
  applyTilt(INITIAL_TILT);
}

buildFaces();

/* ---------- 界面元素 ---------- */
const elCount = document.getElementById('fire-count');
const elState = document.getElementById('fire-state');
const elStats = document.getElementById('fire-stats');
const elHud = document.getElementById('hud-status');
const btnRotate = document.getElementById('btn-rotate');
const tiltSlider = document.getElementById('tilt-slider');
const tiltValue = document.getElementById('tilt-value');

function setState(label, cls = '') {
  elState.textContent = label;
  elState.className = cls;
  elHud.innerHTML = `FIRE_CUBE <i>${label}</i>`;
}

/* ---------- 火焰贴图动画 ---------- */
let frames = [];
let delays = [];
let brightness = [];
let frameIdx = 0;
let frameAcc = 0;
let lastUploaded = -1;
let fireTex = null;

function uploadFrame(i) {
  if (i === lastUploaded || !fireTex) return;
  lastUploaded = i;
  const img = fireTex.image;
  const ctx = img.getContext('2d');
  ctx.putImageData(new ImageData(frames[i].data, img.width, img.height), 0, 0);
  fireTex.needsUpdate = true;
}

fetch('assets/Fire.gif')
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  })
  .then((buf) => {
    const gif = decodeGIF(buf);
    frames = gif.frames;
    delays = frames.map((f) => f.delay);
    brightness = frames.map((f) => f.brightness);

    const c = document.createElement('canvas');
    c.width = gif.width;
    c.height = gif.height;
    fireTex = new THREE.CanvasTexture(c);
    fireTex.magFilter = THREE.NearestFilter;
    fireTex.minFilter = THREE.NearestFilter;
    fireTex.generateMipmaps = false;
    fireTex.colorSpace = THREE.SRGBColorSpace;
    sideMat.map = fireTex;
    sideMat.needsUpdate = true;

    uploadFrame(0);
    setState('ANIMATING', 'done');
    elCount.textContent = `01 / ${String(frames.length).padStart(2, '0')}`;

    const totalMs = delays.reduce((a, b) => a + b, 0);
    const minDelay = Math.min(...delays);
    const maxDelay = Math.max(...delays);
    elStats.innerHTML =
      `SRC <b>Fire.gif</b> // FRAMES <b>${frames.length}</b> // 田字格 <b>外壁4+十字2</b><br>` +
      `FACES <b>6</b> // SIZE <b>${gif.width}×${gif.height}</b> // LOOP <b>${(totalMs / 1000).toFixed(1)}s</b>` +
      `${minDelay === maxDelay ? ` // DELAY <b>${minDelay}MS</b>` : ` // DELAY <b>${minDelay}–${maxDelay}MS</b>`}`;

    btnRotate.disabled = false;
    toast(`<span class="t-code">FIRE_GIF_READY</span> // ${frames.length} FRAMES // ${gif.width}×${gif.height}`);
    console.log(`[FIRE_CUBE] decoded ${frames.length} frames ${gif.width}x${gif.height}, loop ${(totalMs/1000).toFixed(1)}s`);

    window.__FIRE_CUBE = {
      THREE,
      get frames() { return frames.length; },
      get frameIndex() { return frameIdx; },
      faces,
      fireTex,
      controls,
      cubeGroup,
      applyTilt,
    };
  })
  .catch((err) => {
    console.error('Fire.gif 解码失败', err);
    setState('ERROR', 'error');
    elStats.textContent = 'TEXTURE_DECODE_FAIL';
  });

/* ---------- 控件 ---------- */
btnRotate.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  btnRotate.textContent = `AUTO_ROTATE: ${controls.autoRotate ? 'ON' : 'OFF'}`;
});

tiltSlider.addEventListener('input', () => {
  const v = Number(tiltSlider.value);
  tiltValue.textContent = `${v}°`;
  applyTilt(v);
});

/* ---------- 渲染循环 ---------- */
renderer.setAnimationLoop(() => {
  resize(renderer, camera);

  const dt = Math.min(clock.getDelta(), 0.1);

  if (frames.length) {
    frameAcc += dt * 1000;
    let guard = 0;
    while (frameAcc >= delays[frameIdx] && guard < 64) {
      frameAcc -= delays[frameIdx];
      frameIdx = (frameIdx + 1) % frames.length;
      guard++;
    }
    uploadFrame(frameIdx);
    fireLight.intensity = 0.7 + 1.7 * brightness[frameIdx];
    elCount.textContent = `${String(frameIdx + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}`;
  }

  // 整体轻微呼吸悬浮
  const t = clock.elapsedTime;
  cubeGroup.position.y = Math.sin(t * 0.7) * 0.08;

  controls.update();
  renderer.render(scene, camera);
});

/* ============================================================
 * BLOG_OS — HEAD_ROTATION 旋转坐标调参工具
 * 启动页地球模型（mc_head.glb）XYZ 角度自由旋转 + 坐标复制。
 * 场景与 src/components/landing/HeadViewer.jsx 完全一致：
 *   相机 (0, 1.2, 18) / group 0.45 / head 1.3 / order YXZ /
 *   head.rotation.x = 俯仰 PITCH
 *   head.rotation.y = 偏航 YAW
 *   headPivot.rotation.z = 滚转 ROLL
 * 读数单位为度，可直接回填 HEAD_TRANSITION 的 pitchToDeg /
 * yawToDeg / rollToDeg。
 * ============================================================ */

import { initSystemClock, toast } from './common.js';
import { startStars } from './stars.js';
import { makeRenderer, makeCamera, resize, loadGLB, THREE } from './scene.js';

initSystemClock();
startStars(document.getElementById('stars'));

/* ---------- 基准视角（与 HeadViewer 常量一致，单位：度） ---------- */
const BASE = { x: 25.21, y: -34.38, z: -11.75 };
const DEG = Math.PI / 180;
const LIMIT = 180; // 各轴旋转范围 ±180°

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const canvas = document.getElementById('head3d');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
const camera = makeCamera(1);

/* ---------- 灯光：与启动页 HeadViewer 一致 ---------- */
scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3850, 1.25));
const uniKey = new THREE.DirectionalLight(0xffffff, 0.3);
uniKey.position.set(5, 8, 6);
scene.add(uniKey);
const uniFill = new THREE.DirectionalLight(0xffffff, 0.2);
uniFill.position.set(-5, 2, 5);
scene.add(uniFill);

const group = new THREE.Group();
group.scale.setScalar(0.45);
scene.add(group);

/* 滚转轴：与 HeadViewer 相同（绕镜头方向的世界 Z） */
const headPivot = new THREE.Group();
headPivot.rotation.z = BASE.z * DEG;
group.add(headPivot);

/* 青色光晕 sprite（同启动页） */
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
const glow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
glow.scale.set(18, 18, 1);
group.add(glow);

let head = null;
let camDist = 18; // 滚轮缩放距离（基准 18，与启动页相机一致）

/* ---------- 旋转状态（度） ---------- */
const rot = { x: BASE.x, y: BASE.y, z: BASE.z };

const elState = document.getElementById('rot-state');
const elHud = document.getElementById('hud-status');
const elReadout = document.getElementById('rot-values');
const sliders = {
  x: document.getElementById('slider-x'),
  y: document.getElementById('slider-y'),
  z: document.getElementById('slider-z'),
};
const elVals = {
  x: document.getElementById('val-x'),
  y: document.getElementById('val-y'),
  z: document.getElementById('val-z'),
};

/* ---------- 应用旋转 + 刷新 UI ---------- */
function applyRotation() {
  if (head) {
    head.rotation.x = rot.x * DEG;
    head.rotation.y = rot.y * DEG;
  }
  headPivot.rotation.z = rot.z * DEG;

  sliders.x.value = rot.x;
  sliders.y.value = rot.y;
  sliders.z.value = rot.z;
  elVals.x.textContent = `${rot.x.toFixed(3)}°`;
  elVals.y.textContent = `${rot.y.toFixed(3)}°`;
  elVals.z.textContent = `${rot.z.toFixed(3)}°`;
  elReadout.value = `X ${rot.x.toFixed(3)}°  Y ${rot.y.toFixed(3)}°  Z ${rot.z.toFixed(3)}°`;
}

function setState(text, cls) {
  elState.textContent = text;
  elState.className = cls || '';
  elHud.innerHTML = `HEAD_ROT <i>${text}</i>`;
}

/* ---------- 滑杆 ---------- */
Object.entries(sliders).forEach(([axis, slider]) => {
  slider.addEventListener('input', () => {
    rot[axis] = clamp(parseFloat(slider.value) || 0, -LIMIT, LIMIT);
    applyRotation();
  });
});

/* ---------- 画布拖拽旋转 ---------- */
canvas.style.touchAction = 'none';
let dragging = null;

canvas.addEventListener('pointerdown', (e) => {
  dragging = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragging.x;
  const dy = e.clientY - dragging.y;
  dragging.x = e.clientX;
  dragging.y = e.clientY;
  if (dragging.shift) {
    rot.z = clamp(rot.z - dx * 0.25, -LIMIT, LIMIT); // SHIFT+拖动 = 滚转
  } else {
    rot.y = clamp(rot.y + dx * 0.3, -LIMIT, LIMIT);
    rot.x = clamp(rot.x + dy * 0.3, -LIMIT, LIMIT);
  }
  applyRotation();
});

const endDrag = () => {
  dragging = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------- 滚轮缩放（仅镜头距离，不影响旋转坐标） ---------- */
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camDist = clamp(camDist + e.deltaY * 0.02, 8, 30);
  },
  { passive: false }
);

/* ---------- 复制 ---------- */
function copyText(text, label) {
  const done = () =>
    toast(`<span class="t-code">${label}</span> // ${text}`);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch {
    toast(`<span class="t-code">COPY_FAIL</span> // 请手动框选上方读数`);
  }
  document.body.removeChild(ta);
}

function copyDegConfig() {
  const text = [
    '{',
    `  pitchToDeg: ${rot.x.toFixed(3)}, // 俯仰 X`,
    `  yawToDeg: ${rot.y.toFixed(3)},   // 偏航 Y`,
    `  rollToDeg: ${rot.z.toFixed(3)},  // 滚转 Z`,
    '}',
  ].join('\n');
  copyText(text, 'COPY_DEG_OK');
}

function copyRadians() {
  const text = `{ x: ${(rot.x * DEG).toFixed(6)}, y: ${(rot.y * DEG).toFixed(6)}, z: ${(rot.z * DEG).toFixed(6)} }`;
  copyText(text, 'COPY_RAD_OK');
}

/* ---------- 复位 ---------- */
function resetView() {
  rot.x = BASE.x;
  rot.y = BASE.y;
  rot.z = BASE.z;
  camDist = 18;
  applyRotation();
  toast('<span class="t-code">RESET_OK</span> // 已复位基准视角');
}

/* ---------- 键盘微调 ---------- */
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // 滑块聚焦时方向键交给原生
  const step = e.shiftKey ? 0.1 : 1;
  const k = e.key.toLowerCase();
  let handled = true;
  switch (k) {
    case 'arrowleft': rot.y = clamp(rot.y - step, -LIMIT, LIMIT); break;
    case 'arrowright': rot.y = clamp(rot.y + step, -LIMIT, LIMIT); break;
    case 'arrowup': rot.x = clamp(rot.x + step, -LIMIT, LIMIT); break;
    case 'arrowdown': rot.x = clamp(rot.x - step, -LIMIT, LIMIT); break;
    case 'q': rot.z = clamp(rot.z - step, -LIMIT, LIMIT); break;
    case 'e': rot.z = clamp(rot.z + step, -LIMIT, LIMIT); break;
    case 'r': resetView(); break;
    case 'c': copyDegConfig(); break;
    default: handled = false;
  }
  if (handled) {
    e.preventDefault();
    applyRotation();
  }
});

document.getElementById('btn-copy-deg').addEventListener('click', copyDegConfig);
document.getElementById('btn-copy-rad').addEventListener('click', copyRadians);
document.getElementById('btn-reset').addEventListener('click', resetView);

/* ---------- 月球定位（同启动页：跟随头颅左上角） ---------- */
const moonEl = document.querySelector('.float-cube');
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

/* ---------- 加载模型（同启动页） ---------- */
loadGLB('assets/models/mc_head.glb')
  .then((model) => {
    head = model;
    head.scale.setScalar(1.3);
    head.rotation.order = 'YXZ';
    head.traverse((o) => {
      if (o.isMesh) {
        o.material.emissive = new THREE.Color(0xffffff);
        o.material.emissiveMap = o.material.map;
        o.material.emissiveIntensity = 0.6;
      }
    });
    headPivot.add(head);
    applyRotation();
    setState('READY', 'ready');
    window.__HEAD_ROT = { rot, camera, head, group, headPivot, resetView, copyDegConfig, copyRadians };
  })
  .catch((err) => {
    console.error('mc_head.glb failed', err);
    setState('ERROR', 'error');
  });

/* ---------- 渲染循环 ---------- */
renderer.setAnimationLoop(() => {
  resize(renderer, camera);
  camera.position.z = camDist;
  camera.lookAt(0, 0, 0);
  syncMoonPosition();
  renderer.render(scene, camera);
});

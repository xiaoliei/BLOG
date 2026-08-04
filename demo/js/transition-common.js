/* ============================================================
 * 过场动画共享工具：缓动、场景搭建、灯光、进度 UI、
 * 页面跳转协议（STANDBY → LOADING → COMPLETE → EXIT → NAV）。
 * ============================================================ */

import { makeRenderer, makeCamera, resize, THREE } from './scene.js';

export { THREE };
export { resize };

// 调试/验证挂载点
window.__THREE = THREE;

export const DEST = 'transition-target.html';

export const EASE = {
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inCubic: (x) => x * x * x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inQuad: (x) => x * x,
  smooth: (x) => x * x * (3 - 2 * x),
};

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(seed) {
  // 简单的可复现伪随机（mulberry32）
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createScene(canvas) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = makeCamera(1);
  return { renderer, scene, camera };
}

export function addStageLights(scene) {
  scene.add(new THREE.HemisphereLight(0x6d87a8, 0x0a0f18, 0.85));

  const key = new THREE.DirectionalLight(0xfff3e0, 1.9);
  key.position.set(9, 16, 7);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9fc7ff, 0.55);
  fill.position.set(-8, 7, -6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x1abc9c, 0.5);
  rim.position.set(-2, 5, -12);
  scene.add(rim);
}

export function addGrid(scene) {
  const grid = new THREE.GridHelper(30, 15, 0x1abc9c, 0x2a4a6a);
  grid.position.y = -1.1;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);
}

/**
 * 从 loadTowerData() 的结果创建 18 层网格（每层一个 pivot，便于逐层动画），
 * 并把模型水平居中（世界包围盒中心移到原点）。
 */
export function createLayerMeshes(data, group) {
  const pivots = data.layers.map((L) => {
    const pivot = new THREE.Group();
    pivot.position.y = L.baseY;
    pivot.scale.y = 1;
    const mesh = new THREE.Mesh(L.geometry, L.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return { pivot, material: L.material, geometry: L.geometry, baseY: L.baseY, mesh };
  });
  group.position.set(-data.bbox.center.x, 0, -data.bbox.center.z);
  return pivots;
}

/**
 * 按模型包围球自动取景：保证塔完整进入画面（兼顾横/竖屏）。
 * 模型组已水平居中，故目标点水平取 0。
 */
export function frameTower(camera, data, { padding = 1.18 } = {}) {
  const c = data.bbox.center;
  const sx = data.bbox.max.x - data.bbox.min.x;
  const sy = data.bbox.max.y - data.bbox.min.y;
  const sz = data.bbox.max.z - data.bbox.min.z;
  const radius = Math.sqrt(sx * sx + sy * sy + sz * sz) / 2;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = camera.aspect || 1.6;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distV = radius / Math.sin(vFov / 2);
  const distH = radius / Math.sin(hFov / 2);
  const dist = Math.max(distV, distH) * padding;

  const dir = new THREE.Vector3(1, 0.72, 1.35).normalize();
  camera.position.set(dir.x * dist, c.y + dir.y * dist, dir.z * dist);
  camera.lookAt(0, c.y, 0);
  camera.updateProjectionMatrix();
}

/**
 * 过渡状态机 + 进度 UI。
 * @returns {{ state, setState, setProgress, start }}
 */
export function createTransition({ onStart }) {
  let state = 'STANDBY';
  const elState = document.getElementById('progress-state');
  const elPct = document.getElementById('progress-pct');
  const elBar = document.getElementById('progress-fill');
  const elText = document.getElementById('progress-text');
  const elHud = document.getElementById('hud-status');
  const btn = document.getElementById('btn-jump');

  function sync() {
    if (elState) elState.textContent = state;
    if (elHud) elHud.innerHTML = `TRANSITION <i>${state}</i>`;
    window.__TRANSITION = { state, progress: window.__TRANSITION ? window.__TRANSITION.progress : 0 };
  }

  const api = {
    get state() {
      return state;
    },
    setState(s) {
      state = s;
      sync();
    },
    setProgress(p) {
      const v = clamp01(p);
      if (elBar) elBar.style.width = `${(v * 100).toFixed(1)}%`;
      if (elPct) elPct.textContent = `${Math.round(v * 100)}%`;
      window.__TRANSITION = { state, progress: v };
    },
    setText(t) {
      if (elText) elText.textContent = t;
    },
    enableBtn(on) {
      if (btn) btn.disabled = !on;
    },
  };

  if (btn) {
    btn.addEventListener('click', () => {
      if (state !== 'STANDBY') return;
      btn.disabled = true;
      api.setState('LOADING');
      onStart();
    });
  }

  sync();
  return api;
}

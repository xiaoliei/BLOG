/* ============================================================
 * SCHEME D — 错位对齐 / 坠落
 * 加载：18 层全息错位抖动，逐层对齐归位；
 * 离场：各层向下跌落淡出。
 * ============================================================ */

import { loadTowerData } from './tower-layers.js';
import {
  createScene, addStageLights, addGrid, createLayerMeshes,
  createTransition, EASE, clamp01, rand, DEST, resize, frameTower, THREE,
} from './transition-common.js';

const { renderer, scene, camera } = createScene(document.getElementById('canvas3d'));
window.__CAMERA = camera;
addStageLights(scene);
addGrid(scene);

const clock = new THREE.Clock();
const modelGroup = new THREE.Group();
scene.add(modelGroup);

let pivots = [];
let off0 = [];
let frame = null;
let phase = 'STANDBY';
let t0 = 0;
let tComplete = 0;
let towerData = null;
let needsFrame = false;

const LOAD_TOTAL = 2.2;   // 对齐时长
const EXIT_STEP = 0.05;   // 坠落间隔
const EXIT_DUR = 0.55;    // 单层坠落时长

const ui = createTransition({
  onStart() {
    if (!pivots.length) {
      ui.setState('STANDBY');
      ui.enableBtn(true);
      return;
    }
    phase = 'LOADING';
    t0 = clock.getElapsedTime();
    ui.setText('ALIGNING 0%');
  },
});

function buildFrame(data) {
  const c = data.bbox.center;
  const sx = data.bbox.max.x - data.bbox.min.x;
  const sy = data.bbox.max.y - data.bbox.min.y;
  const sz = data.bbox.max.z - data.bbox.min.z;
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(sx + 0.6, sy + 0.6, sz + 0.6));
  const mat = new THREE.LineBasicMaterial({
    color: 0x1abc9c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  frame = new THREE.LineSegments(geo, mat);
  frame.position.set(0, c.y, 0);
  modelGroup.add(frame);
}

loadTowerData()
  .then((data) => {
    towerData = data;
    needsFrame = true;
    pivots = createLayerMeshes(data, modelGroup);
    buildFrame(data);
    const rng = rand(778899);
    off0 = pivots.map(() => ({
      x: (rng() - 0.5) * 3.2,
      y: (rng() - 0.5) * 6.5,
      z: (rng() - 0.5) * 3.2,
    }));
    pivots.forEach((P, i) => {
      P.material.opacity = 0.35;
      P.material.emissiveIntensity = 0.5;
      P.material.transparent = true;
      P.pivot.position.set(off0[i].x, P.baseY + off0[i].y, off0[i].z);
    });
    window.__DATA = data;
    window.__PIVOTS = pivots;
    window.__OFF0 = off0;
    ui.setText(`${pivots.length} HOLO LAYERS // 点击开始对齐`);
  })
  .catch((err) => {
    console.error('SCHEME_D 加载失败', err);
    ui.setState('ERROR');
    ui.setText('MODEL_LOAD_FAIL');
  });

renderer.setAnimationLoop(() => {
  resize(renderer, camera);
  if (needsFrame && towerData) {
    frameTower(camera, towerData);
    needsFrame = false;
  }
  const t = clock.getElapsedTime();

  if (phase === 'STANDBY' && pivots.length) {
    modelGroup.rotation.y += 0.0012;
    pivots.forEach((P, i) => {
      const wob = 0.8 + 0.2 * Math.sin(t * 1.4 + i * 1.7);
      P.pivot.position.set(off0[i].x * wob, P.baseY + off0[i].y * wob, off0[i].z * wob);
    });
  } else if (phase === 'LOADING') {
    const dt = t - t0;
    const p = clamp01(dt / LOAD_TOTAL);
    pivots.forEach((P, i) => {
      const ap = clamp01((p - i * 0.055) / 0.5);
      const e = EASE.outCubic(ap);
      P.pivot.position.set(off0[i].x * (1 - e), P.baseY + off0[i].y * (1 - e), off0[i].z * (1 - e));
      P.material.opacity = 0.35 + 0.65 * ap;
      P.material.emissiveIntensity = 0.5 * (1 - ap);
      if (ap >= 1) P.material.transparent = false;
    });
    if (frame) frame.material.opacity = 0.12 + 0.25 * p;
    ui.setProgress(p);
    ui.setText(`ALIGNING ${Math.round(p * 100)}%`);
    if (dt >= LOAD_TOTAL) {
      phase = 'COMPLETE';
      tComplete = t;
      ui.setState('COMPLETE');
      ui.setProgress(1);
      ui.setText('ALIGNED // 即将坠落');
    }
  } else if (phase === 'COMPLETE') {
    if (t - tComplete > 0.4) {
      phase = 'EXIT';
      t0 = t;
      ui.setState('EXIT');
      ui.setText('LAYERS FALLING');
      pivots.forEach((P) => { P.material.transparent = true; });
    }
  } else if (phase === 'EXIT') {
    const dt = t - t0;
    pivots.forEach((P, i) => {
      const target = pivots[pivots.length - 1 - i]; // 顶部先落
      const fp = clamp01((dt - i * EXIT_STEP) / EXIT_DUR);
      if (fp <= 0) return;
      const e = EASE.inCubic(fp);
      target.pivot.position.y = target.baseY - 26 * e * e;
      target.material.opacity = 1 - fp;
    });
    if (frame) frame.material.opacity = Math.max(0, 0.37 * (1 - clamp01(dt / 0.4)));
    const total = (pivots.length - 1) * EXIT_STEP + EXIT_DUR;
    if (dt >= total) {
      window.location.href = DEST;
      return;
    }
  }

  renderer.render(scene, camera);
});

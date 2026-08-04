/* ============================================================
 * SCHEME A — 逐层搭建 / 拆除
 * 加载：18 层方块从底部向上生长；离场：从顶部逐层拆除。
 * ============================================================ */

import { loadTowerData } from './tower-layers.js';
import {
  createScene, addStageLights, addGrid, createLayerMeshes,
  createTransition, EASE, clamp01, DEST, resize, frameTower, THREE,
} from './transition-common.js';

const { renderer, scene, camera } = createScene(document.getElementById('canvas3d'));
window.__CAMERA = camera;
addStageLights(scene);
addGrid(scene);

const clock = new THREE.Clock();
const modelGroup = new THREE.Group();
scene.add(modelGroup);

let pivots = [];
let phase = 'STANDBY';
let t0 = 0;
let tComplete = 0;
let towerData = null;
let needsFrame = false;

const LOAD_STEP = 0.11;   // 搭建：相邻层启动间隔
const LOAD_DUR = 0.38;    // 单层生长时长
const EXIT_STEP = 0.07;   // 拆除：相邻层间隔
const EXIT_DUR = 0.3;     // 单层拆除时长

const ui = createTransition({
  onStart() {
    if (!pivots.length) {
      ui.setState('STANDBY');
      ui.enableBtn(true);
      return;
    }
    phase = 'LOADING';
    t0 = clock.getElapsedTime();
    ui.setText('BUILDING 0/18');
    pivots.forEach((P) => {
      P.pivot.scale.y = 0.02;
      P.material.opacity = 0;
      P.material.emissiveIntensity = 0.5;
      P.material.transparent = true;
    });
  },
});

loadTowerData()
  .then((data) => {
    towerData = data;
    needsFrame = true;
    pivots = createLayerMeshes(data, modelGroup);
    window.__DATA = data;
    window.__PIVOTS = pivots;
    ui.setText(`${pivots.length} LAYERS READY // 点击开始跳转`);
  })
  .catch((err) => {
    console.error('SCHEME_A 加载失败', err);
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
    modelGroup.position.y = Math.sin(t * 0.6) * 0.06;
    modelGroup.rotation.y += 0.0016;
  } else if (phase === 'LOADING') {
    const dt = t - t0;
    const total = (pivots.length - 1) * LOAD_STEP + LOAD_DUR;
    const p = clamp01(dt / total);
    pivots.forEach((P, i) => {
      const lt = dt - i * LOAD_STEP;
      if (lt < 0) return;
      const lp = clamp01(lt / LOAD_DUR);
      P.pivot.scale.y = 0.02 + 0.98 * EASE.outCubic(lp);
      P.material.opacity = EASE.outCubic(clamp01(lp * 1.7));
      P.material.emissiveIntensity = 0.5 * (1 - EASE.outCubic(clamp01(lp * 1.3)));
      if (lp >= 1) P.material.transparent = false;
    });
    ui.setProgress(p);
    ui.setText(`BUILDING ${Math.min(pivots.length, Math.floor(p * pivots.length) + 1)}/${pivots.length}`);
    if (dt >= total) {
      phase = 'COMPLETE';
      tComplete = t;
      ui.setState('COMPLETE');
      ui.setProgress(1);
      ui.setText('BUILD COMPLETE // 即将离场');
    }
  } else if (phase === 'COMPLETE') {
    if (t - tComplete > 0.45) {
      phase = 'EXIT';
      t0 = t;
      ui.setState('EXIT');
      ui.setText('TEARING DOWN // 顶部先拆');
      pivots.forEach((P) => { P.material.transparent = true; });
    }
  } else if (phase === 'EXIT') {
    const dt = t - t0;
    const total = (pivots.length - 1) * EXIT_STEP + EXIT_DUR;
    pivots.forEach((P, i) => {
      const target = pivots[pivots.length - 1 - i]; // 从顶部开始
      const lt = dt - i * EXIT_STEP;
      if (lt < 0) return;
      const lp = clamp01(lt / EXIT_DUR);
      target.pivot.scale.y = 1 - 0.98 * EASE.inCubic(lp);
      target.material.opacity = 1 - lp;
    });
    ui.setProgress(1);
    if (dt >= total) {
      window.location.href = DEST;
      return;
    }
  }

  renderer.render(scene, camera);
});

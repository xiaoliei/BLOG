/* ============================================================
 * SCHEME C — 独立方块聚合 → 完整实体模型
 * 预处理：模型按体素拆成 192 个独立闭合方块（保留原始贴图面片）；
 * 聚合时方块从四周飞入、自旋、按序拼接成原模型；
 * 离场时方块再次飞散。方块数量固定（192），动画在 CPU 完成。
 * ============================================================ */

import { loadTowerData } from './tower-layers.js';
import { buildVoxelCubes } from './tower-cubes.js';
import {
  createScene, addStageLights, addGrid, createLayerMeshes,
  createTransition, EASE, clamp01, DEST, resize, frameTower, THREE,
} from './transition-common.js';

const LOAD_TOTAL = 3.0;       // 聚合时长
const COMPLETE_HOLD = 0.5;    // 完整展示停留
const EXIT_DISPERSAL = 1.3;   // 方块散开时长
const EXIT_FADE_START = 0.7;  // 散开进行到 70%（基本脱离塔身）时开始整体淡出

const { renderer, scene, camera } = createScene(document.getElementById('canvas3d'));
window.__CAMERA = camera;
addStageLights(scene);
addGrid(scene);

const clock = new THREE.Clock();
const modelGroup = new THREE.Group();
scene.add(modelGroup);
const IDENT = new THREE.Quaternion();

let pivots = [];        // 幽灵塔（低透明度剪影，聚合时可见）
let blocks = [];        // 独立方块 { pivot, scatter, quat, seed, center }
let cubeMaterial = null;
let phase = 'STANDBY';
let t0 = 0;
let tComplete = 0;
let towerData = null;
let needsFrame = false;

const ui = createTransition({
  onStart() {
    if (!blocks.length) {
      ui.setState('STANDBY');
      ui.enableBtn(true);
      return;
    }
    phase = 'LOADING';
    t0 = clock.getElapsedTime();
    ui.setText('AGGREGATING 0%');
    blocks.forEach((B) => {
      B.pivot.position.set(
        B.center[0] + B.scatter[0],
        B.center[1] + B.scatter[1],
        B.center[2] + B.scatter[2]
      );
      B.pivot.quaternion.copy(B.quat);
      B.pivot.scale.setScalar(0.35);
    });
    pivots.forEach((P) => {
      P.material.opacity = 0.03;
      P.material.emissiveIntensity = 0.15;
      P.material.transparent = true;
    });
  },
});

loadTowerData()
  .then((data) => {
    towerData = data;
    needsFrame = true;
    pivots = createLayerMeshes(data, modelGroup);
    pivots.forEach((P) => {
      P.material.opacity = 0.03;
      P.material.emissiveIntensity = 0.15;
      P.material.transparent = true;
      P.material.depthWrite = false;
    });

    const built = buildVoxelCubes(data);
    cubeMaterial = built.material;
    blocks = built.pieces.map((pc) => {
      const mesh = new THREE.Mesh(pc.geometry, built.material);
      mesh.frustumCulled = false;
      const pivot = new THREE.Group();
      pivot.position.set(
        pc.center[0] + pc.scatter[0],
        pc.center[1] + pc.scatter[1],
        pc.center[2] + pc.scatter[2]
      );
      pivot.quaternion.copy(pc.quat);
      pivot.scale.setScalar(0.35);
      pivot.add(mesh);
      modelGroup.add(pivot);
      return { pivot, scatter: pc.scatter, quat: pc.quat, seed: pc.seed, center: pc.center };
    });

    window.__DATA = data;
    window.__PIVOTS = pivots;
    window.__CUBES = { count: blocks.length };
    window.__BLOCKS = blocks;
    window.__CUBE_MATERIAL = cubeMaterial;
    ui.setText(`${blocks.length} BLOCKS READY // 点击开始聚合`);
  })
  .catch((err) => {
    console.error('SCHEME_C 加载失败', err);
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
  window.__PHASE = phase;

  if (phase === 'STANDBY' && blocks.length) {
    modelGroup.rotation.y += 0.0012;
  } else if (phase === 'LOADING' && blocks.length) {
    const p = clamp01((t - t0) / LOAD_TOTAL);
    blocks.forEach((B) => {
      const pp = clamp01((p - 0.06 * B.seed) / 0.85);
      const e = EASE.outCubic(pp);
      B.pivot.position.set(
        B.center[0] + B.scatter[0] * (1 - e),
        B.center[1] + B.scatter[1] * (1 - e),
        B.center[2] + B.scatter[2] * (1 - e)
      );
      B.pivot.quaternion.slerpQuaternions(B.quat, IDENT, e);
      B.pivot.scale.setScalar(0.35 + 0.65 * e);
    });
    ui.setProgress(p);
    ui.setText(`AGGREGATING ${Math.round(p * 100)}%`);
    if (p >= 1) {
      phase = 'COMPLETE';
      tComplete = t;
      pivots.forEach((P) => { P.material.opacity = 0; });
      ui.setState('COMPLETE');
      ui.setProgress(1);
      ui.setText('TOWER FORMED // 完整原始模型');
      window.__C_FINAL = { piecesAtRest: true, count: blocks.length };
    }
  } else if (phase === 'COMPLETE') {
    // 调试/验证钩子：冻结阶段推进，便于截取完整实体状态
    if (window.__C_PAUSE) {
      // frozen
    } else if (t - tComplete > COMPLETE_HOLD) {
      phase = 'EXIT';
      t0 = t;
      ui.setState('EXIT');
      ui.setText('BLOCKS DISPERSAL');
    }
  } else if (phase === 'EXIT' && blocks.length) {
    const dt = t - t0;
    const dp = clamp01(dt / EXIT_DISPERSAL);
    blocks.forEach((B) => {
      // 每块错峰沿自己的散射方向飞回聚合前的出发位置（反向聚合，各自飞散）
      const ep = clamp01((dp - 0.12 * B.seed) / 0.8);
      const e = EASE.inCubic(ep);
      B.pivot.position.set(
        B.center[0] + B.scatter[0] * e,
        B.center[1] + B.scatter[1] * e,
        B.center[2] + B.scatter[2] * e
      );
      B.pivot.quaternion.slerpQuaternions(IDENT, B.quat, e);
      B.pivot.scale.setScalar(1 - 0.65 * e);
    });
    // 散开约 70% 后开始整体淡出，与最后收尾的散开重叠完成
    cubeMaterial.opacity = 1 - clamp01((dp - EXIT_FADE_START) / (1 - EXIT_FADE_START));
    if (dp >= 1) {
      window.location.href = DEST;
      return;
    }
  }

  renderer.render(scene, camera);
});

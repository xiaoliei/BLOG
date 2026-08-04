/* ============================================================
 * SCHEME B — 扫描聚能
 * 加载：全息塔 + 激光扫描框从底部扫到顶部，扫过即实体化；
 * 离场：能量向中心收束成光点。
 * ============================================================ */

import { loadTowerData } from './tower-layers.js';
import {
  createScene, addStageLights, addGrid, createLayerMeshes,
  createTransition, EASE, clamp01, lerp, DEST, resize, frameTower, THREE,
} from './transition-common.js';

const { renderer, scene, camera } = createScene(document.getElementById('canvas3d'));
window.__CAMERA = camera;
addStageLights(scene);
addGrid(scene);

const clock = new THREE.Clock();
const modelGroup = new THREE.Group();
scene.add(modelGroup);

let pivots = [];
let frame = null;      // 水平扫描框
let posts = null;      // 四角能量柱
let beam = null;       // 扫描光束平面
let ghostOpacity = 0.08;
let phase = 'STANDBY';
let t0 = 0;
let tComplete = 0;
let towerData = null;
let needsFrame = false;

const LOAD_TOTAL = 2.8;   // 扫描时长
const EXIT_TOTAL = 0.9;   // 收束时长
let scanMinY = -1.5;
let scanMaxY = 18.5;

const ui = createTransition({
  onStart() {
    if (!pivots.length) {
      ui.setState('STANDBY');
      ui.enableBtn(true);
      return;
    }
    phase = 'LOADING';
    t0 = clock.getElapsedTime();
    ui.setText('SCANNING 0%');
    pivots.forEach((P) => {
      P.material.opacity = ghostOpacity;
      P.material.emissiveIntensity = 0.5;
      P.material.transparent = true;
    });
    if (frame) frame.visible = true;
    if (posts) posts.visible = true;
    if (beam) beam.visible = true;
  },
});

function buildScanRig(data) {
  const c = data.bbox.center;
  // 局部坐标（模型组已水平居中，y 不动）
  const minX = data.bbox.min.x - c.x;
  const maxX = data.bbox.max.x - c.x;
  const minZ = data.bbox.min.z - c.z;
  const maxZ = data.bbox.max.z - c.z;
  const minY = data.bbox.min.y;
  const maxY = data.bbox.max.y;
  const pad = 1.1;

  // 水平矩形扫描框（y=0 平面，位置随扫描高度移动）
  const corners = [
    [minX - pad, maxZ + pad],
    [maxX + pad, maxZ + pad],
    [maxX + pad, minZ - pad],
    [minX - pad, minZ - pad],
  ];
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corners[i];
    const [x1, z1] = corners[(i + 1) % 4];
    pts.push(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z1));
  }
  const frameGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const frameMat = new THREE.LineBasicMaterial({
    color: 0x1abc9c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  frame = new THREE.LineSegments(frameGeo, frameMat);

  // 四角能量柱（底部锚定，随扫描高度生长）
  const postMat = new THREE.MeshBasicMaterial({
    color: 0x1abc9c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  posts = new THREE.Group();
  corners.forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1, 0.09), postMat);
    post.position.set(x, minY + 0.5, z);
    post.scale.y = 0.02;
    posts.add(post);
  });

  // 扫描光束平面
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x1abc9c, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  beam = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX + pad * 2, maxZ - minZ + pad * 2), beamMat);
  beam.rotation.x = -Math.PI / 2;

  modelGroup.add(frame, posts, beam);
  return { minY, maxY };
}

loadTowerData()
  .then((data) => {
    towerData = data;
    needsFrame = true;
    pivots = createLayerMeshes(data, modelGroup);
    const bounds = buildScanRig(data);
    scanMinY = bounds.minY - 1;
    scanMaxY = bounds.maxY + 0.5;
    window.__DATA = data;
    window.__PIVOTS = pivots;
    window.__SCAN = { frame, posts, beam, bounds };
    // 待机全息态
    pivots.forEach((P) => {
      P.material.opacity = ghostOpacity;
      P.material.emissiveIntensity = 0.5;
      P.material.transparent = true;
    });
    ui.setText(`${pivots.length} LAYERS GHOST // 点击开始扫描`);
  })
  .catch((err) => {
    console.error('SCHEME_B 加载失败', err);
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
    modelGroup.rotation.y += 0.0014;
  } else if (phase === 'LOADING') {
    const dt = t - t0;
    const p = clamp01(dt / LOAD_TOTAL);
    const scanY = lerp(scanMinY, scanMaxY, EASE.outCubic(p));
    if (frame) frame.position.y = scanY;
    if (posts) posts.children.forEach((post) => { post.scale.y = Math.max(0.02, scanY - scanMinY); });
    if (beam) beam.position.y = scanY;

    pivots.forEach((P) => {
      const fade = clamp01((scanY - P.baseY) / 0.7);
      P.material.opacity = lerp(P.material.opacity, ghostOpacity + 0.92 * fade, 0.25);
      P.material.emissiveIntensity = 0.5 * (1 - fade);
      if (fade >= 1) P.material.transparent = false;
    });
    ui.setProgress(p);
    ui.setText(`SCANNING ${Math.round(p * 100)}%`);
    if (dt >= LOAD_TOTAL) {
      phase = 'COMPLETE';
      tComplete = t;
      ui.setState('COMPLETE');
      ui.setProgress(1);
      ui.setText('SCAN COMPLETE // 即将收束');
    }
  } else if (phase === 'COMPLETE') {
    if (t - tComplete > 0.4) {
      phase = 'EXIT';
      t0 = t;
      ui.setState('EXIT');
      ui.setText('ENERGY COLLAPSE');
    }
  } else if (phase === 'EXIT') {
    const dt = t - t0;
    const p = clamp01(dt / EXIT_TOTAL);
    const e = EASE.inOutCubic(p);
    modelGroup.scale.setScalar(lerp(1, 0.03, e));
    pivots.forEach((P) => {
      P.material.opacity = 1 - e;
      P.material.transparent = true;
    });
    if (frame) frame.material.opacity = 0.9 * (1 - e);
    if (posts) posts.children.forEach((post) => { post.material.opacity = 0.5 * (1 - e); });
    if (beam) beam.material.opacity = 0.1 * (1 - e);
    if (dt >= EXIT_TOTAL) {
      window.location.href = DEST;
      return;
    }
  }

  renderer.render(scene, camera);
});

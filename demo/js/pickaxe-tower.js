/* ============================================================
 * BLOG_OS — STONE_PICKAXE_TOWER 层级加载演示
 * 读取 GLB 体素网格，按世界 Y 切成水平层，
 * 从下到上逐层以「底部挤压生长 + 淡入 + 辉光」过渡动画加载。
 * ============================================================ */

import { initSystemClock, toast } from './common.js';
import { makeRenderer, makeCamera, resize, THREE } from './scene.js';
import { loadTowerData, easeOutCubic } from './tower-layers.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

initSystemClock();

const LAYER_DELAY = 0.24;     // 相邻层启动间隔（秒）
const LAYER_DURATION = 0.5;   // 单层过渡动画时长（秒）

const canvas = document.getElementById('viewer3d');
const renderer = makeRenderer(canvas);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = makeCamera(1);
const clock = new THREE.Clock();
const modelGroup = new THREE.Group();
scene.add(modelGroup);

/* ---------- 灯光：让 18 格高的塔层次清晰 ---------- */
scene.add(new THREE.HemisphereLight(0x6d87a8, 0x0a0f18, 0.85));

const key = new THREE.DirectionalLight(0xfff3e0, 2.3);
key.position.set(9, 16, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -12;
key.shadow.camera.right = 12;
key.shadow.camera.top = 20;
key.shadow.camera.bottom = -4;
key.shadow.camera.near = 1;
key.shadow.camera.far = 50;
key.shadow.bias = -0.0004;
scene.add(key);

const fill = new THREE.DirectionalLight(0x9fc7ff, 0.6);
fill.position.set(-8, 7, -6);
scene.add(fill);

const rim = new THREE.DirectionalLight(0x1abc9c, 0.55);
rim.position.set(-2, 5, -12);
scene.add(rim);

/* ---------- 地平面网格 ---------- */
const grid = new THREE.GridHelper(30, 15, 0x1abc9c, 0x2a4a6a);
grid.position.y = -0.7;
grid.material.transparent = true;
grid.material.opacity = 0.2;
scene.add(grid);

/* ---------- 轨道控制器 ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 8.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minPolarAngle = 0.1;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.3;
camera.position.set(16, 13, 19);
controls.update();

/* ---------- 层级动画状态机 ---------- */
let layers = [];
let animStart = 0;
let animDone = false;
let completeNotified = false;

const elLayerCount = document.getElementById('layer-count');
const elLayerState = document.getElementById('layer-state');
const elLayerFill = document.getElementById('layer-fill');
const elLayerStats = document.getElementById('layer-stats');
const elHudStatus = document.getElementById('hud-status');
const btnReplay = document.getElementById('btn-replay');

function startAnimation() {
  if (!layers.length) return;
  layers.forEach((L) => {
    L.pivot.scale.y = 0.35;
    L.material.opacity = 0;
    L.material.emissiveIntensity = 0.55;
    L.material.transparent = true;
  });
  animStart = clock.getElapsedTime();
  window.__animStartTs = performance.now();
  animDone = false;
  completeNotified = false;
  btnReplay.disabled = true;
  elLayerState.textContent = 'STACKING';
  elLayerState.classList.remove('done', 'error');
  elHudStatus.innerHTML = 'LAYERED_LOAD <i>STACKING</i>';
  elLayerFill.style.width = '0%';
  elLayerCount.textContent = `00 / ${String(layers.length).padStart(2, '0')}`;
}

function updateLayerAnimation() {
  if (!layers.length) return;
  const t = clock.getElapsedTime() - animStart;
  const N = layers.length;
  let lastActive = -1;

  layers.forEach((L, i) => {
    const lt = t - i * LAYER_DELAY;
    if (lt < 0) return;
    lastActive = i;
    const p = Math.min(lt / LAYER_DURATION, 1);
    // 从底部向上“生长”到整格高度：easeOutCubic 无过冲，顶部不会顶出尖刺
    L.pivot.scale.y = 0.35 + 0.65 * easeOutCubic(p);
    L.material.opacity = easeOutCubic(Math.min(p * 1.7, 1));
    L.material.emissiveIntensity = 0.55 * (1 - easeOutCubic(Math.min(p * 1.3, 1)));
    if (p >= 1) {
      // 落定后恢复不透明：保留图集 alphaTest 遮罩语义，避免半透明像素造成的“鬼影”
      L.material.transparent = false;
    }
  });

  const total = (N - 1) * LAYER_DELAY + LAYER_DURATION;
  const progress = Math.max(0, Math.min(1, t / total));
  elLayerFill.style.width = `${(progress * 100).toFixed(1)}%`;
  elLayerCount.textContent = `${String(Math.min(N, lastActive + 1)).padStart(2, '0')} / ${String(N).padStart(2, '0')}`;

  if (!animDone && t >= total) {
    animDone = true;
    layers.forEach((L) => {
      L.pivot.scale.y = 1;
      L.material.opacity = 1;
      L.material.emissiveIntensity = 0;
      L.material.transparent = false;
    });
    elLayerState.textContent = 'COMPLETE';
    elLayerState.classList.add('done');
    elHudStatus.innerHTML = 'LAYERED_LOAD <i class="done-hud">COMPLETE</i>';
    btnReplay.disabled = false;
    if (!completeNotified) {
      completeNotified = true;
      toast(`<span class="t-code">MODEL_LOAD_COMPLETE</span> // ${N} LAYERS // 全部层级已加载`);
    }
  }
}

/* ---------- 加载 GLB 并切层 ---------- */
loadTowerData()
  .then((data) => {
    try {
      layers = data.layers.map((L) => {
        const pivot = new THREE.Group();
        pivot.position.y = L.baseY;
        pivot.scale.y = 0.35;
        const mesh = new THREE.Mesh(L.geometry, L.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        pivot.add(mesh);
        modelGroup.add(pivot);
        return { pivot, material: L.material, geometry: L.geometry, baseY: L.baseY };
      });
      modelGroup.position.set(-data.bbox.center.x, 0, -data.bbox.center.z);
    } catch (err) {
      console.error('切层失败', err);
      elLayerState.textContent = 'ERROR';
      elLayerState.classList.add('error');
      elLayerStats.textContent = 'LAYER_SPLIT_FAIL';
      return;
    }

    let verts = 0;
    let tris = 0;
    layers.forEach((L) => {
      verts += L.geometry.attributes.position.count;
      tris += L.geometry.index.count / 3;
    });
    elLayerStats.textContent =
      `VERTS ${verts.toLocaleString()} // TRIS ${Math.round(tris).toLocaleString()} // LAYERS ${layers.length}`;
    console.log(`[LAYER_LOAD] ${layers.length} layers, ${verts} verts, ${Math.round(tris)} tris`);
    // 调试/验证挂载点
    window.__TOWER = {
      get layers() { return layers; },
      controls,
      modelGroup,
      startAnimation,
    };
    startAnimation();
  })
  .catch((err) => {
    console.error('stone_pickaxe_tower.glb 加载失败', err);
    elLayerState.textContent = 'ERROR';
    elLayerState.classList.add('error');
    elLayerStats.textContent = 'MODEL_LOAD_FAIL';
    elHudStatus.innerHTML = 'LAYERED_LOAD <i>ERROR</i>';
  });

/* ---------- 重播 ---------- */
btnReplay.addEventListener('click', startAnimation);
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    startAnimation();
  }
});

/* ---------- 渲染循环 ---------- */
renderer.setAnimationLoop(() => {
  resize(renderer, camera);
  updateLayerAnimation();

  // 完成后整体轻微呼吸悬浮
  const t = clock.getElapsedTime();
  if (animDone) {
    modelGroup.position.y = Math.sin(t * 0.7) * 0.08;
  }

  controls.update();
  renderer.render(scene, camera);
});

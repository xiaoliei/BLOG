import { initSystemClock, initNav } from './common.js';
import { ARTICLES } from './data.js';
import { makeRenderer, makeCamera, addLights, addFloorGrid, loadGLB, frameAround, measure, resize, THREE } from './scene.js';

initSystemClock();
initNav('a');

const canvas = document.getElementById('viewer3d');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
const camera = makeCamera(1);
addLights(scene);
addFloorGrid(scene);

const group = new THREE.Group();
scene.add(group);

let cluster = null;
let wire = null;

loadGLB('assets/models/cluster.glb')
  .then((model) => {
    cluster = model;
    group.add(model);
    const stats = measure(model);
    document.getElementById('viewer-stats').textContent = `VERTS ${stats.verts.toLocaleString()} // TRIS ${stats.tris.toLocaleString()}`;
    wire = frameAround(scene, model, { color: 0xe67e22, pad: 0.32, opacity: 0.55 });
  })
  .catch((err) => {
    console.error('cluster.glb failed', err);
    document.getElementById('viewer-stats').textContent = 'MODEL_LOAD_FAIL // FALLBACK_PROXY';
  });

/* ---------- 文章列表 ---------- */
const listEl = document.getElementById('doc-list');
let selected = 0;

function renderList() {
  listEl.innerHTML = '';
  ARTICLES.forEach((a, i) => {
    const btn = document.createElement('button');
    btn.className = `doc-card${i === selected ? ' selected' : ''}`;
    btn.dataset.index = i;
    btn.innerHTML = `
      <div class="doc-id">${a.id} // ${a.series}</div>
      <div class="doc-title">${a.title}</div>
      <div class="doc-meta"><span>${a.author}</span><span class="sep">|</span><span>${a.date}</span></div>
      <div class="doc-tags">${a.tags.map((t, ti) => `<span class="tag ${ti === 0 ? 'tag-accent' : ti === 1 ? 'tag-cyan' : ''}">${t}</span>`).join('')}</div>
    `;
    btn.addEventListener('click', () => select(i));
    btn.addEventListener('dblclick', () => openDoc(i));
    listEl.appendChild(btn);
  });
}

function select(i) {
  selected = (i + ARTICLES.length) % ARTICLES.length;
  renderList();
  renderProps(ARTICLES[selected]);
  document.getElementById('viewer-label').innerHTML = `VX_CLUSTER // <b>${ARTICLES[selected].series}</b>.SERIES_${ARTICLES[selected].index}`;
  const card = listEl.querySelector(`[data-index="${selected}"]`);
  if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function openDoc(i) {
  window.location.href = `article.html?id=${ARTICLES[i].id}`;
}

/* ---------- 属性面板 ---------- */
function renderProps(article) {
  const body = document.getElementById('props-body');
  body.innerHTML = '';
  article.props.forEach((p) => {
    const pct = Math.max(0, Math.min(1, p.value / p.max)) * 100;
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `
      <div class="prop-label"><span>${p.label}</span><span class="prop-value">${p.value}</span></div>
      <div class="prop-track"><div class="prop-fill ${p.cls}" data-w="${pct}"></div></div>
    `;
    body.appendChild(row);
  });
  requestAnimationFrame(() => {
    body.querySelectorAll('.prop-fill').forEach((f) => {
      f.style.transform = `scaleX(${f.dataset.w / 100})`;
    });
  });
}

/* ---------- 数据流面板 ---------- */
const LOG_TEMPLATES = [
  ['CHUNK_LOAD 0x{HEX} ................... ', 'ok', 'OK'],
  ['CHUNK_VERIFY 0x{HEX} ................. ', 'ok', 'PASS'],
  ['alloc {SIZE} MB @ 0x{HEX} ............ ', 'sys', 'MAP'],
  ['VOXEL_CACHE hit {PCT}% ................ ', 'sys', 'HIT'],
  ['shader compile {FILE} ................. ', 'ok', 'OK'],
  ['specimen.sync ({ID}) ................. ', 'sys', 'SYNC'],
  ['net: uplink {UP} MB/s ................. ', 'ok', 'TX'],
  ['redstone_tick batch #{N} .............. ', 'warn', 'QUEUE'],
  ['GC sweep {N} pages .................... ', 'warn', 'CLEAN'],
  ['patina_diffuse 0x{HEX} ................ ', 'ok', 'WRITE'],
];
const FILES = ['cu_patina.glsl', 'frame_tick.cpp', 'vault_verify.cpp', 'netherite_noise.glsl', 'resonator_decode.cpp'];

const streamEl = document.getElementById('stream-body');
let logCount = 0;

function pushLog() {
  const t = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
  const ts = new Date().toTimeString().slice(0, 8);
  const line = document.createElement('div');
  line.className = 'stream-line';
  const payload = t[0]
    .replace('{HEX}', (0x3a0000 + Math.floor(Math.random() * 0xffff)).toString(16).toUpperCase())
    .replace('{SIZE}', (64 + Math.floor(Math.random() * 4) * 64))
    .replace('{PCT}', (90 + Math.random() * 9).toFixed(1))
    .replace('{FILE}', FILES[Math.floor(Math.random() * FILES.length)])
    .replace('{ID}', ARTICLES[Math.floor(Math.random() * ARTICLES.length)].id)
    .replace('{UP}', (0.4 + Math.random() * 1.6).toFixed(2))
    .replace('{N}', Math.floor(Math.random() * 9999));
  line.innerHTML = `<span class="ts">[${ts}]</span> ${payload}<span class="${t[1]}">${t[2]}</span>`;
  streamEl.appendChild(line);
  while (streamEl.childElementCount > 80) streamEl.removeChild(streamEl.firstChild);
  streamEl.scrollTop = streamEl.scrollHeight;
  logCount++;
  document.getElementById('stream-count').textContent = `${String(logCount).padStart(4, '0')} EVENTS`;
}

for (let i = 0; i < 14; i++) pushLog();
setInterval(pushLog, 620 + Math.random() * 900);

/* ---------- 键盘 ---------- */
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[1-5]$/.test(e.key)) {
    select(Number(e.key) - 1);
  } else if (e.key === 'Enter') {
    openDoc(selected);
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    select(selected - 1);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    select(selected + 1);
  }
});

/* ---------- 渲染循环 ---------- */
const clock = new THREE.Clock();
const mouse = { x: 0, y: 0 };
const viewer = document.querySelector('.viewer');
viewer.addEventListener('pointermove', (e) => {
  const r = viewer.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
  mouse.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
});

renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  resize(renderer, camera);

  if (cluster) {
    cluster.rotation.y += 0.0012; // 慢自转：约 90 秒一圈
    cluster.position.y = Math.sin(t * 0.5) * 0.05;
  }
  if (wire) {
    wire.rotation.y += 0.0006;
    const s = 1 + Math.sin(t * 1.1) * 0.012;
    wire.scale.set(s, s, s);
  }

  camera.position.x = mouse.x * 1.4;
  camera.position.y = 1.2 - mouse.y * 1.0;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
});

renderList();
select(0);


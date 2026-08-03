import { initSystemClock, initNav, toast } from './common.js';
import { getArticle, prevArticle, nextArticle, ARTICLES } from './data.js';
import { initCodeBlocks } from './highlight.js';
import { makeRenderer, makeCamera, addLights, addFloorGrid, loadGLB, frameAround, measure, resize, THREE } from './scene.js';

initSystemClock();
initNav('a');

const params = new URLSearchParams(window.location.search);
let article = getArticle(params.get('id'));

document.title = `${article.id} // ${article.title} — BLOG_OS`;

/* ---------- 填充文档 ---------- */
document.getElementById('crumb-archive').textContent = 'ARCHIVE';
document.getElementById('crumb-series').textContent = article.series;
document.getElementById('crumb-id').textContent = article.id;

const titleEl = document.getElementById('doc-title');
titleEl.innerHTML = `<span class="glitch" data-text="${article.title}">${article.title}</span>`;
document.getElementById('doc-author').textContent = article.author;
document.getElementById('doc-date').textContent = article.date;
document.getElementById('doc-ref').textContent = `REF: ${article.ref}`;

const bodyEl = document.getElementById('doc-body');
for (const section of article.sections) {
  const sec = document.createElement('div');
  sec.className = 'doc-section';
  sec.innerHTML = `<h2>${section.h}</h2>${section.p.map((p) => `<p>${p}</p>`).join('')}`;
  bodyEl.appendChild(sec);
}

if (article.code) {
  const block = document.createElement('div');
  block.className = 'code-block';
  block.innerHTML = `
    <div class="code-head">
      <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <span class="file">${article.code.file}</span>
      <span class="lang">${article.code.lang}</span>
    </div>
    <div class="code-body"><pre><code>${article.code.src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre></div>
  `;
  bodyEl.appendChild(block);
}

initCodeBlocks();

/* 标签 */
document.getElementById('doc-tags').innerHTML = article.tags
  .map((t, i) => `<span class="tag ${i === 0 ? 'tag-accent' : i === 1 ? 'tag-cyan' : ''}">${t}</span>`)
  .join('');

/* ---------- 属性面板 ---------- */
function renderProps(a) {
  const body = document.getElementById('props-body');
  body.innerHTML = '';
  a.props.forEach((p) => {
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
renderProps(article);

/* ---------- NAV_ASSIST ---------- */
const prev = prevArticle(article.id);
const next = nextArticle(article.id);
document.getElementById('assist-prev').textContent = prev.id;
document.getElementById('assist-next').textContent = next.id;
document.getElementById('assist-index').textContent = `${String(ARTICLES.findIndex((a) => a.id === article.id) + 1).padStart(2, '0')}/${String(ARTICLES.length).padStart(2, '0')}`;

function go(id) {
  window.location.href = `article.html?id=${id}`;
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '1' || e.key === 'ArrowLeft') go(prev.id);
  else if (e.key === '2' || e.key === 'ArrowRight') go(next.id);
  else if (e.key === 'Escape') window.location.href = 'archive.html';
});

/* ---------- 3D 场景 ---------- */
const canvas = document.getElementById('viewer3d');
const renderer = makeRenderer(canvas);
const scene = new THREE.Scene();
const camera = makeCamera(1);
addLights(scene);
addFloorGrid(scene, { y: -2.4 });

const group = new THREE.Group();
scene.add(group);

let block = null;
let wire = null;

loadGLB(article.model)
  .then((model) => {
    block = model;
    group.add(model);
    const stats = measure(model);
    document.getElementById('viewer-stats').textContent = `VERTS ${stats.verts.toLocaleString()} // TRIS ${stats.tris.toLocaleString()}`;
    wire = frameAround(scene, model, { color: 0xe67e22, pad: 0.42, opacity: 0.9 });
  })
  .catch((err) => {
    console.error('block.glb failed', err);
    document.getElementById('viewer-stats').textContent = 'MODEL_LOAD_FAIL // FALLBACK_PROXY';
  });

document.getElementById('viewer-label').innerHTML = `SPECIMEN // <b>${article.id}</b> ${article.series}`;

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

  if (block) {
    block.rotation.y += 0.0016; // 比主页集群略快，形成"聚焦感"
    group.position.y = Math.sin(t * 0.7) * 0.06;
  }
  if (wire) {
    const s = 1 + Math.sin(t * 1.3) * 0.02;
    wire.scale.set(s, s, s);
  }

  camera.position.x = mouse.x * 1.6;
  camera.position.y = 0.9 - mouse.y * 1.1;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
});

setTimeout(() => {
  toast(`<span class="t-code">NAV_ASSIST</span> // [1] ${prev.id} PREV &nbsp;[2] ${next.id} NEXT &nbsp;[ESC] EXIT TO ARCHIVE`);
}, 1200);

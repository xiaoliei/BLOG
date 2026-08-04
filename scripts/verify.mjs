/**
 * BLOG_OS 无头浏览器验证（使用本机 Edge + puppeteer-core）
 * 运行前：npm install --prefix "$env:TEMP\blog-verify" puppeteer-core
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tempVerify = path.join(process.env.TEMP, 'blog-verify', 'node_modules', 'puppeteer-core');
const puppeteer = require(tempVerify);

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:8000';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  :: ${detail}` : ''}`);
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-extensions',
    '--disable-gpu-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=1600,1000',
  ],
});

async function openPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  const badRequests = [];
  page.on('response', (r) => {
    if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 4500));
  return { page, consoleErrors, pageErrors, badRequests };
}

/* ---------- 像素级渲染分析（验证 3D 画面真实绘制） ---------- */
import { readFileSync } from 'node:fs';
const pngjsPath = path.join(process.env.TEMP, 'blog-verify', 'node_modules', 'pngjs');
const { PNG } = require(pngjsPath);

function analyzeShot(file, region) {
  const png = PNG.sync.read(readFileSync(file));
  const { x0, y0, x1, y1 } = region;
  const colors = new Set();
  let painted = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * png.width + x) << 2;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
      total++;
      if (a > 8) {
        painted++;
        colors.add(`${r >> 4}_${g >> 4}_${b >> 4}`);
        if (colors.size > 240) break;
      }
    }
    if (colors.size > 240) break;
  }
  return { painted, total, colors: colors.size, pct: ((painted / total) * 100).toFixed(1) };
}

/* ---------- index ---------- */
{
  const { page, consoleErrors, pageErrors, badRequests } = await openPage(`${BASE}/index.html`);
  report('index: no page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
  report('index: no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
  report('index: no bad requests', badRequests.length === 0, badRequests.join(' | ').slice(0, 300));
  const clock = await page.$eval('[data-clock]', (el) => el.textContent).catch(() => '');
  report('index: clock rendered', /^\d{2}:\d{2}$/.test(clock), clock);
  const clockHtml = await page.evaluate(() => document.querySelector('.landing-clock .time').outerHTML);
  console.log('DEBUG clock html:', clockHtml);
  const stars = await page.$eval('#stars', (el) => el.width > 0 && el.height > 0).catch(() => false);
  report('index: starfield canvas sized', stars);
  const moon = await page.evaluate(() => {
    const el = document.querySelector('.float-cube');
    if (!el) return 'missing';
    const r = el.getBoundingClientRect();
    const size = Math.round(r.width);
    return `${size}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`;
  });
  report('index: moon at head top-left', /^\d{2}x\d{2}@/.test(moon), moon);
  const sky = await page.evaluate(() => getComputedStyle(document.body).backgroundImage.includes('radial-gradient'));
  report('index: deep blue radial sky', sky);
  const gl = await page.evaluate(() => {
    const c = document.getElementById('head3d');
    return `${c && c.width > 0 ? 'sized' : 'empty'}:${c ? c.width : 0}x${c ? c.height : 0}`;
  });
  report('index: renderer sized canvas', gl.startsWith('sized'), gl);
  await page.screenshot({ path: path.join(ROOT, 'preview', 'shot_index.png') });
  await page.click('.landing-stage');
  await page.waitForFunction(() => window.location.pathname.endsWith('archive.html'), { timeout: 8000 }).catch(() => {});
  report('index: click enters archive', page.url().includes('archive.html'), page.url());
  await page.close();
}

/* ---------- archive ---------- */
{
  const { page, consoleErrors, pageErrors, badRequests } = await openPage(`${BASE}/archive.html`);
  report('archive: no page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
  report('archive: no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 500));
  report('archive: no bad requests', badRequests.length === 0, badRequests.join(' | ').slice(0, 300));
  const cards = await page.$$eval('.doc-card', (els) => els.length).catch(() => 0);
  report('archive: 5 doc cards', cards === 5, String(cards));
  const props = await page.$$eval('.prop-row', (els) => els.length).catch(() => 0);
  report('archive: 5 property rows', props === 5, String(props));
  const streams = await page.$$eval('.stream-line', (els) => els.length).catch(() => 0);
  report('archive: stream lines > 10', streams > 10, String(streams));
  const gl = await page.evaluate(() => {
    const c = document.getElementById('viewer3d');
    return `${c && c.width > 0 ? 'sized' : 'empty'}:${c ? c.width : 0}x${c ? c.height : 0}`;
  });
  report('archive: renderer sized canvas', gl.startsWith('sized'), gl);
  const layout = await page.evaluate(() => {
    const q = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    return {
      body: q('body'),
      main: q('main.app'),
      grid: q('.archive-grid'),
      viewer: q('.viewer'),
      canvas: q('#viewer3d'),
      row: getComputedStyle(document.querySelector('.archive-grid')).gridTemplateRows,
      bodyDisplay: getComputedStyle(document.body).display,
    };
  });
  console.log('DEBUG layout:', JSON.stringify(layout));
  const stats = await page.$eval('#viewer-stats', (el) => el.textContent).catch(() => '');
  report('archive: model stats loaded', /VERTS/.test(stats), stats);
  await page.screenshot({ path: path.join(ROOT, 'preview', 'shot_archive.png') });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.location.pathname.endsWith('article.html'), { timeout: 8000 }).catch(() => {});
  report('archive: ENTER opens article', page.url().includes('article.html'), page.url());
  await page.close();
}

/* ---------- article ---------- */
{
  const { page, consoleErrors, pageErrors, badRequests } = await openPage(`${BASE}/article.html?id=QZ_11`);
  report('article: no page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
  report('article: no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 500));
  report('article: no bad requests', badRequests.length === 0, badRequests.join(' | ').slice(0, 300));
  const title = await page.$eval('#doc-title', (el) => el.textContent).catch(() => '');
  report('article: title filled', title.includes('Quartz Resonator Array'), title);
  const crumb = await page.$eval('#crumb-id', (el) => el.textContent).catch(() => '');
  report('article: breadcrumb id', crumb === 'QZ_11', crumb);
  const codeSpans = await page.$$eval('.code-block .c-keyword', (els) => els.length).catch(() => 0);
  report('article: code highlighted', codeSpans > 5, String(codeSpans));
  const props = await page.$$eval('.prop-row', (els) => els.length).catch(() => 0);
  report('article: 5 property rows', props === 5, String(props));
  const assist = await page.$eval('#assist-prev', (el) => el.textContent).catch(() => '');
  report('article: nav assist prev id', /^[A-Z]{2}_\d{2}$/.test(assist), assist);
  const gl = await page.evaluate(() => {
    const c = document.getElementById('viewer3d');
    return `${c && c.width > 0 ? 'sized' : 'empty'}:${c ? c.width : 0}x${c ? c.height : 0}`;
  });
  report('article: renderer sized canvas', gl.startsWith('sized'), gl);
  const layout = await page.evaluate(() => {
    const q = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    return {
      body: q('body'),
      main: q('main.app'),
      grid: q('.archive-grid'),
      viewer: q('.viewer'),
    };
  });
  console.log('DEBUG layout:', JSON.stringify(layout));
  const stats = await page.$eval('#viewer-stats', (el) => el.textContent).catch(() => '');
  report('article: model stats loaded', /VERTS/.test(stats), stats);
  await page.screenshot({ path: path.join(ROOT, 'preview', 'shot_article.png') });
  const before = page.url();
  await page.keyboard.press('2');
  await page.waitForFunction((b) => window.location.href !== b, { timeout: 8000, args: [before] }).catch(() => {});
  const after = page.url();
  report('article: [2] next document', after.includes('article.html') && after !== before, after);
  await page.waitForFunction(() => {
    const el = document.getElementById('assist-prev');
    return el && el.textContent.length > 0;
  }, { timeout: 8000 }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.location.pathname.endsWith('archive.html'), { timeout: 8000 }).catch(() => {});
  report('article: ESC exits to archive', page.url().includes('archive.html'), page.url());
  await page.close();
}

/* ---------- 移动端冒烟 ---------- */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/archive.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3500));
  const cards = await page.$$eval('.doc-card', (els) => els.length).catch(() => 0);
  const viewerH = await page.$eval('.viewer', (el) => el.getBoundingClientRect().height).catch(() => 0);
  report('mobile: archive usable', cards === 5 && viewerH > 200 && errors.length === 0, `cards=${cards} viewerH=${Math.round(viewerH)} errors=${errors.length}`);
  await page.close();
}

await browser.close();

/* ---------- 截图像素分析 ---------- */
const shots = [
  ['preview/shot_index.png', { x0: 580, y0: 240, x1: 1020, y1: 740 }],
  ['preview/shot_archive.png', { x0: 560, y0: 130, x1: 1040, y1: 870 }],
  ['preview/shot_article.png', { x0: 560, y0: 130, x1: 1040, y1: 870 }],
];
for (const [file, region] of shots) {
  try {
    const a = analyzeShot(path.join(ROOT, file), region);
    report(`pixels: ${file} painted`, a.painted > 500 && a.colors > 20, `${a.pct}% painted, ${a.colors} colors`);
  } catch (e) {
    report(`pixels: ${file}`, false, String(e));
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

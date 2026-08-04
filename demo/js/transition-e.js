/* ============================================================
 * SCHEME E — 纯 CSS 定妆照
 * 不加载 WebGL：透明塔图做 CSS 悬浮 + 扫描线，
 * 离场用缩放 + 模糊 + 淡出，任何设备可用。
 * ============================================================ */

import { createTransition, EASE, clamp01, DEST } from './transition-common.js';

const img = document.getElementById('tower-still');
const sweep = document.getElementById('scan-sweep');

let phase = 'STANDBY';
let t0 = 0;
let tHold = 0;
let tExit = 0;

const LOAD_TOTAL = 2.2;

const ui = createTransition({
  onStart() {
    phase = 'LOADING';
    t0 = performance.now();
    ui.setText('LOADING 0%');
  },
});

function tick(now) {
  if (phase === 'LOADING') {
    const p = clamp01((now - t0) / (LOAD_TOTAL * 1000));
    ui.setProgress(EASE.outCubic(p));
    ui.setText(`LOADING ${Math.round(p * 100)}%`);
    if (sweep) sweep.style.setProperty('--sweep', `${(p * 100).toFixed(1)}%`);
    if (p >= 1) {
      phase = 'COMPLETE';
      tHold = now;
      ui.setState('COMPLETE');
      ui.setProgress(1);
      ui.setText('READY // 即将交付目标页');
    }
  } else if (phase === 'COMPLETE') {
    if (now - tHold > 320) {
      phase = 'EXIT';
      tExit = now;
      ui.setState('EXIT');
      ui.setText('PAGE DELIVERY');
      img.classList.add('leaving');
      if (sweep) sweep.style.opacity = '0';
    }
  } else if (phase === 'EXIT') {
    if (now - tExit > 650) {
      window.location.href = DEST;
      return;
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const ready = () => ui.setText('STILL READY // 点击开始跳转');
if (img.complete && img.naturalWidth > 0) ready();
else img.addEventListener('load', ready);

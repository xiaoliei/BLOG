/* BLOG_OS shared system: clock, coordinates, network, toast, boot, nav */

export const SYS = {
  bootAt: Date.now(),
  coords: { x: -128.42, y: 64.0, z: 92.17 },
  net: { state: 'ONLINE', up: 1.24 },
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

function driftCoords() {
  // 缓慢漂移的伪坐标，营造"系统在运行"的感觉
  const c = SYS.coords;
  c.x += (Math.random() - 0.5) * 0.06;
  c.z += (Math.random() - 0.5) * 0.05;
  c.y = 64 + Math.sin(Date.now() / 9000) * 0.4;
  SYS.net.up = Math.max(0.1, SYS.net.up + (Math.random() - 0.5) * 0.35);
}

export function initSystemClock() {
  const els = {
    clock: document.querySelectorAll('[data-clock]'),
    clockSec: document.querySelectorAll('[data-clock-sec]'),
    date: document.querySelectorAll('[data-date]'),
    coords: document.querySelectorAll('[data-coords]'),
    up: document.querySelectorAll('[data-uptime]'),
    net: document.querySelectorAll('[data-net]'),
    upSpeed: document.querySelectorAll('[data-upspeed]'),
  };

  function tick() {
    const now = new Date();
    const hh = pad2(now.getHours());
    const mm = pad2(now.getMinutes());
    const ss = pad2(now.getSeconds());
    const timeStr = `${hh}:${mm}`;
    const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()]}`;

    els.clock.forEach((el) => {
      if (!el.dataset.raw || el.dataset.raw !== timeStr) {
        el.dataset.raw = timeStr;
        el.innerHTML = `${hh}<span class="colon">:</span>${mm}`;
      }
    });
    els.clockSec.forEach((el) => { el.textContent = ss; });
    els.date.forEach((el) => { el.textContent = dateStr; });

    driftCoords();
    const c = SYS.coords;
    const coordStr = `X ${c.x.toFixed(2).padStart(8, ' ')}  Y ${c.y.toFixed(1).padStart(5, ' ')}  Z ${c.z.toFixed(2).padStart(8, ' ')}`;
    els.coords.forEach((el) => {
      el.innerHTML = coordStr.replace(/X (.*?)  Y (.*?)  Z (.*)/, '<span class="c">X</span> $1&nbsp;&nbsp;<span class="c">Y</span> $2&nbsp;&nbsp;<span class="c">Z</span> $3');
    });
    els.up.forEach((el) => { el.textContent = `UP ${fmtUptime(Date.now() - SYS.bootAt)}`; });
    els.net.forEach((el) => {
      el.textContent = SYS.net.state;
      el.className = `net-state ${SYS.net.state.toLowerCase()}`;
    });
    els.upSpeed.forEach((el) => { el.textContent = `${SYS.net.up.toFixed(2)} MB/s`; });
  }

  tick();
  setInterval(tick, 1000);
}

/* ---------- toast ---------- */

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- boot overlay ---------- */

export function runBoot(destination) {
  const boot = document.getElementById('boot');
  if (!boot || boot.classList.contains('on')) return;
  boot.classList.add('on');
  const lines = [
    '<span class="boot-line">> INITIALIZE <b>BLOG_OS</b> v2.0.4 ................ <span class="ok">OK</span></span>',
    '<span class="boot-line">> MOUNTING /archive ........................... <span class="ok">OK</span></span>',
    '<span class="boot-line">> LOAD VOXEL_REGISTRY.glb .................... <span class="ok">OK</span></span>',
    '<span class="boot-line">> AUTH SESSION <b>0x8F2A</b> ....................... <span class="ok">OK</span></span>',
    '<span class="boot-line">> SYNC SPECIMEN_PROPERTIES .................... <span class="ok">OK</span></span>',
    '<span class="boot-line">> ENTERING ARCHIVE_INDEX ...................... <span class="ok">OK</span></span>',
  ];
  const container = boot;
  lines.forEach((line, i) => {
    setTimeout(() => {
      const span = document.createElement('div');
      span.innerHTML = line;
      span.style.opacity = '0';
      container.appendChild(span);
      requestAnimationFrame(() => { span.style.transition = 'opacity 0.2s'; span.style.opacity = '1'; });
    }, 160 + i * 190);
  });
  setTimeout(() => { window.location.href = destination; }, 160 + lines.length * 190 + 700);
}

/* ---------- bottom nav ---------- */

const NAV_TARGETS = {
  a: 'archive.html',
  r: null,
  m: null,
  c: null,
};

export function initNav(active) {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    const key = tab.dataset.nav;
    const isActive = key === active;
    tab.classList.toggle('active', isActive);
    tab.addEventListener('click', () => {
      if (key === active) return;
      const dest = NAV_TARGETS[key];
      if (dest) {
        window.location.href = dest;
      } else {
        toast(`<span class="t-code">MODULE_NOT_FOUND 0x404</span> // ${tab.dataset.label || key.toUpperCase()} 模块建设中`);
      }
    });
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!(k in NAV_TARGETS) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.activeElement && /input|textarea/i.test(document.activeElement.tagName)) return;
    const dest = NAV_TARGETS[k];
    if (dest && k !== active) {
      window.location.href = dest;
    } else if (!dest) {
      toast(`<span class="t-code">MODULE_NOT_FOUND 0x404</span> // ${k.toUpperCase()} 模块建设中`);
    }
  });
}

export function isTouch() {
  return window.matchMedia('(pointer: coarse)').matches;
}

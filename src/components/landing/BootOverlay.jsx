import { useEffect, useMemo, useRef, useState } from 'react';
import { LANDMARKS, WORLD } from '../../config/world.js';
import { TILE_COLOR, generateWorld } from '../../lib/terrain.js';

const FIRST_DELAY = 160;
const NAV_EXTRA = 700;

/* 区块 = 4×4 地块，世界 64×64 → 16×16 颜色图（每像素 = 一个区块） */
const CHUNK_TILES = 4;
const GRID = Math.round(WORLD.tilesX / CHUNK_TILES); // 16
const PX = 14; // 每个区块像素边长（含 1px 网格缝）
const CELL = PX - 1;
const TOTAL_CHUNKS = GRID * GRID;
const LOAD_MS = 190; // 单个区块从激活到着色完成的时长
const WAVE = 1.15; // 加载波推进系数：p=0.87 时波前到达最远角

const C = {
  bg: '#070D16',
  empty: '#0B1420',
  cyan: [26, 188, 156],
  amber: [230, 126, 34],
  white: [240, 246, 252],
  spawn: 'rgba(241, 196, 15, 0.9)',
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/* 每个区块的基准色 = 4×4 地块生物群系颜色的平均值（真实预览世界地形） */
function buildChunkColors(world) {
  const colors = new Array(GRID * GRID);
  for (let cy = 0; cy < GRID; cy += 1) {
    for (let cx = 0; cx < GRID; cx += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = 0; dy < CHUNK_TILES; dy += 1) {
        for (let dx = 0; dx < CHUNK_TILES; dx += 1) {
          const x = cx * CHUNK_TILES + dx;
          const y = cy * CHUNK_TILES + dy;
          const c = hexToRgb(TILE_COLOR[world.tiles[y * WORLD.tilesX + x]] ?? '#0A101A');
          r += c[0];
          g += c[1];
          b += c[2];
          n += 1;
        }
      }
      colors[cy * GRID + cx] = [r / n, g / n, b / n];
    }
  }
  return colors;
}

/* 每个区块到出生点（玩家起点）的归一化距离：加载由内向外扩散 */
function buildRings() {
  const scx = Math.floor(LANDMARKS[0].x / CHUNK_TILES) + 0.5;
  const scy = Math.floor(LANDMARKS[0].y / CHUNK_TILES) + 0.5;
  let max = 0;
  const rings = new Float32Array(GRID * GRID);
  for (let cy = 0; cy < GRID; cy += 1) {
    for (let cx = 0; cx < GRID; cx += 1) {
      const d = Math.hypot(cx + 0.5 - scx, cy + 0.5 - scy);
      rings[cy * GRID + cx] = d;
      if (d > max) max = d;
    }
  }
  for (let i = 0; i < rings.length; i += 1) rings[i] /= max;
  return rings;
}

/* 世界加载屏幕：颜色图（每像素 = 一个区块）+ 进度条 + 开机日志 */
export default function BootOverlay({ onComplete }) {
  const canvasRef = useRef(null);
  const barRef = useRef(null);
  const pctRef = useRef(null);
  const countRef = useRef(null);
  const doneRef = useRef(false);
  const [bootState, setBootState] = useState('loading'); // loading → flash → fade

  const world = useMemo(generateWorld, []);
  const chunkColors = useMemo(() => buildChunkColors(world), [world]);
  const rings = useMemo(buildRings, []);
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const totalMs = FIRST_DELAY + NAV_EXTRA;
  const flashAt = reducedMotion ? Infinity : totalMs;
  const fadeAt = reducedMotion ? 240 : totalMs + 320;
  const doneAt = fadeAt + 420;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const starts = new Float32Array(GRID * GRID).fill(-1);
    const t0 = performance.now();
    let raf = 0;
    let flashFired = false;
    let fadeFired = false;

    const drawFrame = (now) => {
      const elapsed = now - t0;
      const p = reducedMotion ? 1 : clamp01(easeInOutCubic(elapsed / totalMs));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let loaded = 0;
      for (let cy = 0; cy < GRID; cy += 1) {
        for (let cx = 0; cx < GRID; cx += 1) {
          const i = cy * GRID + cx;
          const px = cx * PX + 1;
          const py = cy * PX + 1;
          if (starts[i] < 0) {
            if (rings[i] <= p * WAVE) starts[i] = elapsed;
            else {
              ctx.fillStyle = C.empty;
              ctx.fillRect(px, py, CELL, CELL);
              continue;
            }
          }
          const lp = reducedMotion ? 1 : clamp01((elapsed - starts[i]) / LOAD_MS);
          if (lp >= 1) loaded += 1;
          const base = chunkColors[i];
          let col;
          if (lp >= 1) {
            col = base;
          } else {
            // 加载中持续变色：青蓝 ↔ 铜橙摆动 + 亮度脉动，随后落定为生物群系色
            const wob = 0.5 + 0.5 * Math.sin(elapsed * 0.007 + rings[i] * 9);
            const cycle = mix(C.cyan, C.amber, wob);
            let c = mix(cycle, base, easeOutCubic(lp));
            const pulse = 1 + 0.22 * Math.sin(elapsed * 0.011 + rings[i] * 13);
            c = [c[0] * pulse, c[1] * pulse, c[2] * pulse];
            if (lp > 0.82) {
              const k = ((lp - 0.82) / 0.18) * 0.55; // 完成前的白色高光“落定”闪光
              c = mix(c, C.white, k);
            }
            col = c.map((v) => Math.min(255, v));
          }
          ctx.fillStyle = rgb(col);
          ctx.fillRect(px, py, CELL, CELL);
        }
      }

      // 出生点（玩家位置）标尺
      const scx = Math.floor(LANDMARKS[0].x / CHUNK_TILES);
      const scy = Math.floor(LANDMARKS[0].y / CHUNK_TILES);
      const mx = (scx + 0.5) * PX;
      const my = (scy + 0.5) * PX;
      ctx.strokeStyle = C.spawn;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx - 8, my - 8, 16, 16);
      ctx.beginPath();
      ctx.moveTo(mx - 11, my); ctx.lineTo(mx - 8, my);
      ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 11, my);
      ctx.moveTo(mx, my - 11); ctx.lineTo(mx, my - 8);
      ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 11);
      ctx.stroke();

      // 进度条 / 百分比 / 区块计数与颜色图同一模拟源，天然同步
      const pct = Math.round((loaded / TOTAL_CHUNKS) * 100);
      if (barRef.current) barRef.current.style.width = `${pct}%`;
      if (pctRef.current) pctRef.current.textContent = `${pct}%`;
      if (countRef.current) countRef.current.textContent = `${loaded} / ${TOTAL_CHUNKS}`;

      if (!flashFired && elapsed >= flashAt) {
        flashFired = true;
        setBootState('flash');
      }
      if (!fadeFired && elapsed >= fadeAt) {
        fadeFired = true;
        setBootState('fade');
      }
      if (elapsed >= doneAt) {
        if (!doneRef.current) {
          doneRef.current = true;
          onComplete();
        }
        return;
      }
      raf = requestAnimationFrame(drawFrame);
    };

    raf = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkColors, onComplete, reducedMotion, rings, totalMs]);

  return (
    <div id="boot" className={`on${bootState === 'fade' ? ' fade' : ''}`}>
      <div className="boot-panel">
        <div className="boot-head">
          <span className="boot-title">世界区块加载</span>
          <span className="boot-meta">
            <span ref={countRef} className="boot-count">0 / {TOTAL_CHUNKS}</span>
            <span ref={pctRef} className="boot-pct">0%</span>
          </span>
        </div>
        <div className="boot-bar">
          <div ref={barRef} className="boot-bar-fill" />
        </div>
        <div className="boot-map-wrap">
          <canvas
            ref={canvasRef}
            id="chunkmap"
            width={GRID * PX}
            height={GRID * PX}
          />
          <span className="boot-map-label">CHUNK_MAP · SEED {WORLD.seed}</span>
          <div
            className={`boot-map-flash${bootState === 'flash' || bootState === 'fade' ? ' on' : ''}`}
          />
        </div>
      </div>
    </div>
  );
}

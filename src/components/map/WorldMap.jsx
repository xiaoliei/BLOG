import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BIOME_NAMES,
  LANDMARKS,
  WORLD,
  WORLD_COLORS,
  WORLD_STORAGE_KEY,
} from '../../config/world.js';
import { T, generateWorld, tileAt } from '../../lib/terrain.js';
import { drawSprite, spriteVariant } from '../../lib/sprites.js';
import { FLOWER_COLORS, ORE_COLORS, ROCK_COLORS } from '../../lib/sprites.js';
import { hash2 } from '../../lib/rand.js';
import Minimap from './Minimap.jsx';
import PixelSprite from './PixelSprite.jsx';

const TS = WORLD.tileSize;
const WORLD_W = WORLD.tilesX * TS;
const WORLD_H = WORLD.tilesY * TS;
const MIN_SCALE = 0.42;
const MAX_SCALE = 2.2;
const WALK_SPEED = 210; // px/s
const REVEAL_SPEED = 520; // px/s 迷雾展开速度

function loadVisited() {
  try {
    const raw = localStorage.getItem(WORLD_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.visited)) return new Set(data.visited);
    }
  } catch {
    /* 隐私模式等场景忽略 */
  }
  return new Set();
}

function saveVisited(visited) {
  try {
    localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify({ visited: [...visited] }));
  } catch {
    /* ignore */
  }
}

export default function WorldMap({ active = true, onEnterScene, onReboot }) {
  const world = useMemo(generateWorld, []);

  const viewportRef = useRef(null);
  const terrainRef = useRef(null);
  const fogRef = useRef(null);

  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [view, setView] = useState({ ox: 0, oy: 0, scale: 1 });
  const [visited, setVisited] = useState(loadVisited);
  const [playerPos, setPlayerPos] = useState(() => ({
    x: (46 + 0.5) * TS,
    y: (30 + 0.5) * TS,
  }));
  const [walking, setWalking] = useState(null); // { id, name }
  const [explored, setExplored] = useState(0);
  const [revealTick, setRevealTick] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [terrainReady, setTerrainReady] = useState(false);

  const stateRef = useRef({ view, visited, playerPos, walking });
  stateRef.current = { view, visited, playerPos, walking };

  const revealsRef = useRef([]); // { x, y, r, target, done }
  const animRef = useRef(null);
  const walkRef = useRef(null);
  const startWalkRef = useRef(null);
  const panRef = useRef(null);
  const initializedRef = useRef(false);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  /* ---------- 迷雾面积计算 ---------- */
  const computeExplored = useCallback(() => {
    const reveals = revealsRef.current.filter((r) => !r.done || r.r > 0);
    let count = 0;
    for (let y = 0; y < WORLD.tilesY; y += 1) {
      for (let x = 0; x < WORLD.tilesX; x += 1) {
        const px = (x + 0.5) * TS;
        const py = (y + 0.5) * TS;
        let inside = false;
        for (let i = 0; i < reveals.length; i += 1) {
          const dx = px - reveals[i].x;
          const dy = py - reveals[i].y;
          if (dx * dx + dy * dy <= reveals[i].r * reveals[i].r) {
            inside = true;
            break;
          }
        }
        if (inside) count += 1;
      }
    }
    setExplored(Math.round((count / (WORLD.tilesX * WORLD.tilesY)) * 100));
  }, []);

  /* ---------- 迷雾渲染 ---------- */
  const drawFog = useCallback(() => {
    const canvas = fogRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.globalAlpha = 0.965;
    ctx.fillStyle = WORLD_COLORS.fog;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    for (const rv of revealsRef.current) {
      const g = ctx.createRadialGradient(rv.x, rv.y, 0, rv.x, rv.y, Math.max(rv.r, 1));
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.72, 'rgba(0,0,0,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(rv.x, rv.y, Math.max(rv.r, 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  /* 迷雾展开动画循环 */
  const startFogLoop = useCallback(() => {
    if (animRef.current) return;
    let last = performance.now();
    let frame = 0;
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      let busy = false;
      for (const rv of revealsRef.current) {
        if (rv.r < rv.target) {
          rv.r = Math.min(rv.target, rv.r + REVEAL_SPEED * dt);
          busy = true;
        } else if (!rv.done) {
          rv.done = true;
          busy = true;
        }
      }
      if (busy) {
        drawFog();
        frame += 1;
        if (frame % 12 === 0) computeExplored();
        animRef.current = requestAnimationFrame(loop);
      } else {
        animRef.current = null;
        computeExplored();
        setRevealTick((t) => t + 1);
      }
    };
    animRef.current = requestAnimationFrame(loop);
  }, [computeExplored, drawFog]);

  const revealAt = useCallback(
    (x, y, target = 210) => {
      if (reducedMotion.current) {
        revealsRef.current.push({ x, y, r: target, target, done: true });
        drawFog();
        computeExplored();
        setRevealTick((t) => t + 1);
        return;
      }
      revealsRef.current.push({ x, y, r: 0, target, done: false });
      startFogLoop();
    },
    [computeExplored, drawFog, startFogLoop]
  );

  /* ---------- 地形画布 ---------- */
  useEffect(() => {
    const canvas = terrainRef.current;
    if (!canvas) return;
    setTerrainReady(false);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < WORLD.tilesY; y += 1) {
      for (let x = 0; x < WORLD.tilesX; x += 1) {
        const i = y * WORLD.tilesX + x;
        const tile = world.tiles[i];
        ctx.fillStyle = TILE_COLOR_CACHE[tile];
        ctx.fillRect(x * TS, y * TS, TS, TS);

        // 边缘阴影：右侧 / 下侧邻块更“低”时加深，形成微地形感
        const r = world.tiles[i + 1] ?? tile;
        const d = world.tiles[i + WORLD.tilesX] ?? tile;
        if (r !== tile) {
          ctx.fillStyle = 'rgba(10,16,26,0.16)';
          ctx.fillRect((x + 1) * TS - 4, y * TS, 4, TS);
        }
        if (d !== tile) {
          ctx.fillStyle = 'rgba(10,16,26,0.18)';
          ctx.fillRect(x * TS, (y + 1) * TS - 4, TS, 4);
        }

        // 颗粒噪点
        const h = hash2(x, y, WORLD.seed + 42);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        for (let k = 0; k < 3; k += 1) {
          const sx = x * TS + Math.floor(h * 97 * (k + 1)) % 26;
          const sy = y * TS + Math.floor(h * 53 * (k + 1)) % 26;
          ctx.fillRect(sx, sy, 3, 3);
        }
      }
    }

    // 装饰物
    for (const dec of world.decorations) {
      const jx = (hash2(dec.x, dec.y, WORLD.seed + 7) - 0.5) * 8;
      const jy = (hash2(dec.y, dec.x, WORLD.seed + 9) - 0.5) * 8;
      const px = dec.x * TS + jx;
      const py = dec.y * TS + jy;
      if (dec.kind === 'flower') {
        drawSprite(ctx, 'flower', px, py, 2.4, false, spriteVariant('flower', { Y: FLOWER_COLORS[dec.variant % FLOWER_COLORS.length] }));
      } else if (dec.kind === 'rock') {
        drawSprite(ctx, 'rock', px, py, 2.6, false, spriteVariant('rock', { G: ROCK_COLORS[dec.variant % ROCK_COLORS.length] }));
      } else if (dec.kind === 'ore') {
        drawSprite(ctx, 'ore', px, py, 2.6, false, spriteVariant('ore', { R: ORE_COLORS[dec.variant % ORE_COLORS.length] }));
      } else if (dec.kind === 'lily') {
        drawSprite(ctx, 'lily', px, py, 2.4);
      } else if (dec.kind === 'boat') {
        drawSprite(ctx, 'boat', px, py, 2.2);
      } else if (dec.kind === 'campfire') {
        drawSprite(ctx, 'campfire', px, py, 2.2);
      } else {
        drawSprite(ctx, dec.kind, px, py, 2.2);
      }
    }

    // 出生点平台
    const spawn = LANDMARKS[0];
    ctx.fillStyle = '#C9B47A';
    ctx.fillRect((spawn.x - 1.4) * TS, (spawn.y - 1.4) * TS, TS * 2.8, TS * 2.8);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect((spawn.x - 1.2) * TS + i * 18, (spawn.y - 1.2) * TS + 6, 10, 3);
    }
    setTerrainReady(true);
  }, [world]);

  /* ---------- 初始化：出生点迷雾 + 相机 ---------- */
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true; // StrictMode 双挂载保护：只初始化一次
      const spawn = LANDMARKS[0];
      const sx = (spawn.x + 0.5) * TS;
      const sy = (spawn.y + 0.5) * TS;
      // 出生点已探索
      revealsRef.current.push({
        x: sx,
        y: sy,
        r: reducedMotion.current ? 280 : 0,
        target: 280,
        done: reducedMotion.current,
      });
      drawFog();
      computeExplored();
      // 已访问地标直接点亮
      loadVisited().forEach((id) => {
        const lm = LANDMARKS.find((l) => l.id === id);
        if (lm) revealAt((lm.x + 0.5) * TS, (lm.y + 0.5) * TS, 230);
      });
      // 初始相机
      const scale = Math.min(Math.max(viewport.w / (WORLD.tilesX * TS), 0.72), 1.3);
      setView((v) =>
        clampView({ ...v, scale, ox: viewport.w / 2 - sx * scale, oy: viewport.h / 2 - sy * scale })
      );
    }
    // StrictMode 清理会取消动画帧；第二次挂载时确保迷雾循环重新启动
    if (!reducedMotion.current) startFogLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 视口 / 缩放边界 ---------- */
  const clampView = useCallback((v) => {
    const rect = viewportRef.current?.getBoundingClientRect?.();
    const w = rect && rect.width > 0 ? rect.width : viewport.w;
    const h = rect && rect.height > 0 ? rect.height : viewport.h;
    let { ox, oy, scale } = v;
    if (WORLD_W * scale <= w) ox = (w - WORLD_W * scale) / 2;
    else ox = Math.max(w - WORLD_W * scale, Math.min(0, ox));
    if (WORLD_H * scale <= h) oy = (h - WORLD_H * scale) / 2;
    else oy = Math.max(h - WORLD_H * scale, Math.min(0, oy));
    return { ox, oy, scale };
  }, [viewport]);

  const zoomAt = useCallback(
    (cx, cy, factor) => {
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const wx = (cx - v.ox) / v.scale;
        const wy = (cy - v.oy) / v.scale;
        return clampView({ ox: cx - wx * scale, oy: cy - wy * scale, scale });
      });
    },
    [clampView]
  );

  /* ---------- 平移（指针 / 触控） ---------- */
  const onPointerDown = useCallback(
    (e) => {
      if (!active) return;
      if (e.target.closest('button, a, [data-nopan]')) return;
      panRef.current = { startX: e.clientX, startY: e.clientY, ox: stateRef.current.view.ox, oy: stateRef.current.view.oy, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [active]
  );

  const onPointerMove = useCallback(
    (e) => {
      const pan = panRef.current;
      if (!pan) return;
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
      setView((v) => clampView({ ...v, ox: pan.ox + dx, oy: pan.oy + dy }));
    },
    [clampView]
  );

  const onPointerUp = useCallback((e) => {
    const pan = panRef.current;
    if (pan && e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    panRef.current = null;
    // 点击（非拖拽）空白区域 → 小人直行前往
    if (!pan || pan.moved || !stateRef.current.view) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const { ox, oy, scale } = stateRef.current.view;
    const x = Math.min(WORLD_W, Math.max(0, (e.clientX - rect.left - ox) / scale));
    const y = Math.min(WORLD_H, Math.max(0, (e.clientY - rect.top - oy) / scale));
    startWalkRef.current?.({ x, y });
  }, []);

  /* wheel 用原生监听，避免 React passive 限制 */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.14 : 1 / 1.14);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const finishArrival = useCallback(
    (landmark) => {
      revealAt((landmark.x + 0.5) * TS, (landmark.y + 0.5) * TS, 250);
      setVisited((prev) => {
        const next = new Set(prev);
        next.add(landmark.id);
        saveVisited(next);
        return next;
      });
      // 停顿一下，让玩家“到达”的感觉出来，再切换场景
      window.setTimeout(() => onEnterScene(landmark.id), 420);
    },
    [onEnterScene, revealAt]
  );

  const cancelWalk = useCallback(() => {
    if (walkRef.current) {
      cancelAnimationFrame(walkRef.current);
      walkRef.current = null;
    }
    setWalking(null);
  }, []);

  /* ---------- 键盘 ---------- */
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      const step = 56 / stateRef.current.view.scale;
      if (['ArrowUp', 'w', 'W'].includes(e.key)) {
        e.preventDefault();
        setView((v) => clampView({ ...v, oy: v.oy + step }));
      } else if (['ArrowDown', 's', 'S'].includes(e.key)) {
        e.preventDefault();
        setView((v) => clampView({ ...v, oy: v.oy - step }));
      } else if (['ArrowLeft', 'a', 'A'].includes(e.key)) {
        e.preventDefault();
        setView((v) => clampView({ ...v, ox: v.ox + step }));
      } else if (['ArrowRight', 'd', 'D'].includes(e.key)) {
        e.preventDefault();
        setView((v) => clampView({ ...v, ox: v.ox - step }));
      } else if (e.key === '+' || e.key === '=') {
        const r = viewportRef.current.getBoundingClientRect();
        zoomAt(r.width / 2, r.height / 2, 1.2);
      } else if (e.key === '-') {
        const r = viewportRef.current.getBoundingClientRect();
        zoomAt(r.width / 2, r.height / 2, 1 / 1.2);
      } else if (e.key === 'r' || e.key === 'R') {
        setView((v) => {
          const sx = (LANDMARKS[0].x + 0.5) * TS;
          const sy = (LANDMARKS[0].y + 0.5) * TS;
          const r = viewportRef.current.getBoundingClientRect();
          return clampView({ ...v, ox: r.width / 2 - sx * v.scale, oy: r.height / 2 - sy * v.scale });
        });
      } else if (e.key === 'l' || e.key === 'L') {
        setLegendOpen((o) => !o);
      } else if (e.key === 'Escape' && stateRef.current.walking) {
        cancelWalk();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, clampView, zoomAt, cancelWalk]);

  /* ---------- 玩家寻路 ---------- */
  const startWalk = useCallback(
    (target) => {
      if (stateRef.current.walking) return;
      const from = stateRef.current.playerPos;
      const to = target.id
        ? { x: (target.x + 0.5) * TS, y: (target.y + 0.5) * TS }
        : { x: target.x, y: target.y };
      setWalking({ id: target.id || null, name: target.name || '目标点' });

      if (reducedMotion.current) {
        setPlayerPos(to);
        setWalking(null);
        if (target.id) finishArrival(target);
        return;
      }

      // 直线路径
      const total = Math.hypot(to.x - from.x, to.y - from.y);
      if (total < 1) {
        if (target.id) finishArrival(target);
        return;
      }
      let dist = 0;
      let lastReveal = { x: from.x, y: from.y };
      let lastTime = performance.now();
      const vx = (to.x - from.x) / total;
      const vy = (to.y - from.y) / total;

      const step = (now) => {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        dist += WALK_SPEED * dt;
        if (dist >= total) {
          setPlayerPos(to);
          setWalking(null);
          if (target.id) finishArrival(target);
          return;
        }
        const pos = { x: from.x + vx * dist, y: from.y + vy * dist };
        setPlayerPos(pos);
        // 沿途点亮一小圈迷雾
        if (Math.hypot(pos.x - lastReveal.x, pos.y - lastReveal.y) > 70) {
          revealAt(pos.x, pos.y, 96);
          lastReveal = pos;
        }
        walkRef.current = requestAnimationFrame(step);
      };
      walkRef.current = requestAnimationFrame(step);
    },
    [finishArrival, revealAt]
  );
  startWalkRef.current = startWalk;

  /* ---------- 相机跟随玩家（行走时） ---------- */
  useEffect(() => {
    if (!walking) return undefined;
    let raf;
    const follow = () => {
      const { view: v, playerPos: p } = stateRef.current;
      const r = viewportRef.current.getBoundingClientRect();
      const targetOx = r.width / 2 - p.x * v.scale;
      const targetOy = r.height / 2 - p.y * v.scale;
      setView((cur) =>
        clampView({
          ...cur,
          ox: cur.ox + (targetOx - cur.ox) * 0.08,
          oy: cur.oy + (targetOy - cur.oy) * 0.08,
        })
      );
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [walking, clampView]);

  /* ---------- 窗口尺寸 ---------- */
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({ w, h });
      setView((v) => clampView({ ...v, ox: v.ox, oy: v.oy }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampView]);

  /* ---------- 清理 ---------- */
  useEffect(
    () => () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (walkRef.current) cancelAnimationFrame(walkRef.current);
      animRef.current = null;
      walkRef.current = null;
    },
    []
  );

  const resetProgress = useCallback(() => {
    if (!window.confirm('要重置迷雾探索进度吗？已访问的地标会重新被迷雾笼罩。')) return;
    try {
      localStorage.removeItem(WORLD_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    revealsRef.current = [];
    setVisited(new Set());
    const spawn = LANDMARKS[0];
    revealAt((spawn.x + 0.5) * TS, (spawn.y + 0.5) * TS, 280);
  }, [revealAt]);

  const tileX = Math.floor(playerPos.x / TS);
  const tileZ = Math.floor(playerPos.y / TS);
  const biome = BIOME_NAMES[tileAt(world, tileX, tileZ)] ?? '未知';

  return (
    <div
      ref={viewportRef}
      className={`world-root${active ? '' : ' world-root--idle'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ width: viewport.w, height: viewport.h }}
    >
      <div
        className="world-layer"
        style={{
          width: WORLD_W,
          height: WORLD_H,
          transform: `translate(${view.ox}px, ${view.oy}px) scale(${view.scale})`,
        }}
      >
        <canvas ref={terrainRef} width={WORLD_W} height={WORLD_H} className="world-terrain" />
        <canvas ref={fogRef} width={WORLD_W} height={WORLD_H} className="world-fog" />

        {/* 地标 */}
        {LANDMARKS.map((lm) => {
          const isVisited = visited.has(lm.id);
          const isWalking = walking?.id === lm.id;
          return (
            <button
              key={lm.id}
              type="button"
              data-nopan
              className={`landmark${isVisited ? ' landmark--visited' : ''}${isWalking ? ' landmark--active' : ''}`}
              style={{ left: lm.x * TS, top: lm.y * TS }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setHovered(lm.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(lm.id)}
              onBlur={() => setHovered(null)}
              onClick={() => startWalk(lm)}
              aria-label={`${lm.name}：${lm.module}${isVisited ? '，已探索' : '，未探索'}`}
            >
              <span className="landmark-icon">
                <PixelSprite name={lm.icon} size={40} />
                {!isVisited && <span className="landmark-unknown" aria-hidden="true">?</span>}
                {isVisited && <span className="landmark-check" aria-hidden="true">✓</span>}
              </span>
              <span className="landmark-name">{lm.name}</span>
              {(hovered === lm.id || isWalking) && (
                <span className="landmark-tip" data-nopan>
                  <b>{lm.name}</b>
                  <em>{lm.module} · {lm.posts.length} 篇</em>
                  <small>{lm.blurb}</small>
                  <small className="landmark-tip-action">{isWalking ? '正在前往…' : isVisited ? '点击进入场景' : '点击探索并进入'}</small>
                </span>
              )}
            </button>
          );
        })}

        {/* 玩家 */}
        <div
          className={`world-player${walking ? ' world-player--walking' : ''}`}
          style={{ left: playerPos.x, top: playerPos.y }}
        >
          <PixelSprite name="player" size={30} />
          <span className="world-player-name">{walking ? `→ ${walking.name}` : '你'}</span>
        </div>
      </div>

      {/* HUD */}
      <header className="world-hud-top">
        <div className="hud-title">
          <span className="hud-title-main">BLOG_OS</span>
          <span className="hud-title-sub">方块大陆 // OVERWORLD · seed {WORLD.seed}</span>
        </div>
        <div className="hud-coords">
          <span>X {tileX}</span>
          <span>Z {tileZ}</span>
          <span className="hud-biome">{biome}</span>
          <span className="hud-explored">探索 {explored}%</span>
        </div>
        <div className="hud-actions">
          <button type="button" className="hud-btn" onClick={() => setLegendOpen((o) => !o)} aria-pressed={legendOpen}>
            图例
          </button>
          <button type="button" className="hud-btn" onClick={resetProgress}>重置探索</button>
          <button type="button" className="hud-btn hud-btn--reboot" onClick={onReboot}>重启</button>
        </div>
      </header>

      <div className="world-hud-help">
        <span>拖拽平移</span><span>滚轮 / + - 缩放</span><span>WASD 移动视角</span><span>R 回出生点</span>
      </div>

      {walking && (
        <div className="world-walk-hint">
          <PixelSprite name="player" size={22} />
          正在前往 <b>{walking.name}</b>…（按 Esc 取消）
        </div>
      )}

      <Minimap
        world={world}
        view={view}
        viewport={viewport}
        visited={visited}
        playerPos={playerPos}
        revealTick={revealTick}
        fogCanvasRef={fogRef}
        terrainCanvasRef={terrainRef}
        terrainReady={terrainReady}
      />

      {legendOpen && (
        <aside className="world-legend" data-nopan>
          <h3>图例 // LEGEND</h3>
          <div className="legend-block">
            <h4>群系</h4>
            <ul>
              {[
                ['深海', WORLD_COLORS.deepWater],
                ['海洋', WORLD_COLORS.water],
                ['河流', WORLD_COLORS.shallow],
                ['沙滩', WORLD_COLORS.sand],
                ['平原', WORLD_COLORS.grass],
                ['森林', WORLD_COLORS.forest],
                ['山地', WORLD_COLORS.stone],
                ['雪原', WORLD_COLORS.snow],
                ['沙漠', WORLD_COLORS.desert],
              ].map(([n, c]) => (
                <li key={n}><i style={{ background: c }} />{n}</li>
              ))}
            </ul>
          </div>
          <div className="legend-block">
            <h4>地标</h4>
            <ul>
              {LANDMARKS.map((lm) => (
                <li key={lm.id}>
                  <i className="legend-icon" style={{ background: lm.accent }} />
                  {lm.name}
                  <em>{lm.module}</em>
                </li>
              ))}
            </ul>
          </div>
          <div className="legend-block legend-note">
            <h4>迷雾</h4>
            <p>未探索区域被迷雾笼罩，靠近后会点亮。<b>?</b> 标记为未探索地标。探索进度会保存在本地。</p>
          </div>
          <button type="button" className="hud-btn" onClick={() => setLegendOpen(false)}>关闭</button>
        </aside>
      )}

      <div className="world-scanlines" aria-hidden="true" />
    </div>
  );
}

/* 地形颜色缓存（避免每帧字符串） */
const TILE_COLOR_CACHE = {
  [T.deepWater]: '#1E4D8F',
  [T.water]: '#2E6FB2',
  [T.river]: '#4E9BC8',
  [T.sand]: '#E4D18A',
  [T.grass]: '#79B457',
  [T.forest]: '#3F7D3E',
  [T.mountain]: '#8D9299',
  [T.snow]: '#E9EEF4',
  [T.desert]: '#E4C878',
};

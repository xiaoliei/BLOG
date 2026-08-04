/* ============================================================
   Voronoi 迷雾区域
   每个地标拥有“更靠近自己”的区域：与邻近地标之间的边界
   恰好在两地标实际距离的一半处；靠近地图边缘且无更近地标时，
   区域一直延伸到边界（边界处仅有该地标 → 整段点亮）。
   ============================================================ */

import { LANDMARKS, WORLD } from '../config/world.js';

export function landmarkCenter(lm) {
  return { x: (lm.x + 0.5) * WORLD.tileSize, y: (lm.y + 0.5) * WORLD.tileSize };
}

/* 半平面裁剪：保留更靠近 a 的点（|p-a|² <= |p-b|²） */
function clipHalfPlane(poly, a, b) {
  const nx = b.x - a.x;
  const ny = b.y - a.y;
  const c = (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2;
  const inside = (p) => p.x * nx + p.y * ny <= c;
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const curIn = inside(cur);
    const nxtIn = inside(nxt);
    if (curIn) out.push(cur);
    if (curIn !== nxtIn) {
      const denom = (nxt.x - cur.x) * nx + (nxt.y - cur.y) * ny;
      if (denom !== 0) {
        const t = (c - (cur.x * nx + cur.y * ny)) / denom;
        out.push({ x: cur.x + (nxt.x - cur.x) * t, y: cur.y + (nxt.y - cur.y) * t });
      }
    }
  }
  return out;
}

/* 地标 L 的 Voronoi 单元：在所有地标中更靠近 L 的点集（裁剪到地图边界） */
export function voronoiCell(center, others, bounds) {
  let poly = [
    { x: bounds.x0, y: bounds.y0 },
    { x: bounds.x1, y: bounds.y0 },
    { x: bounds.x1, y: bounds.y1 },
    { x: bounds.x0, y: bounds.y1 },
  ];
  for (const o of others) {
    poly = clipHalfPlane(poly, center, o);
    if (poly.length === 0) break;
  }
  return poly;
}

/* 每个格所属的最近地标索引（用于探索率统计，与多边形边界一致） */
export function buildNearestGrid() {
  const { tilesX, tilesY, tileSize } = WORLD;
  const grid = new Uint8Array(tilesX * tilesY);
  const centers = LANDMARKS.map(landmarkCenter);
  for (let y = 0; y < tilesY; y += 1) {
    for (let x = 0; x < tilesX; x += 1) {
      const px = (x + 0.5) * tileSize;
      const py = (y + 0.5) * tileSize;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < centers.length; i += 1) {
        const dx = px - centers[i].x;
        const dy = py - centers[i].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      grid[y * tilesX + x] = best;
    }
  }
  return grid;
}

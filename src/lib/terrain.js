/* ============================================================
   地形生成：确定性 fBm 高度图 + 湿度图 → 生物群系 + 装饰
   ============================================================ */

import { WORLD, WORLD_COLORS, LANDMARKS } from '../config/world.js';
import { fbm, hash2, mulberry32 } from './rand.js';

export const T = {
  deepWater: 0,
  water: 1,
  river: 2,
  sand: 3,
  grass: 4,
  forest: 5,
  mountain: 6,
  snow: 7,
  desert: 8,
};

export function generateWorld() {
  const { tilesX, tilesY, seed } = WORLD;
  const tiles = new Uint8Array(tilesX * tilesY);
  const height = new Float32Array(tilesX * tilesY);
  const moisture = new Float32Array(tilesX * tilesY);
  const rng = mulberry32(seed);

  for (let y = 0; y < tilesY; y += 1) {
    for (let x = 0; x < tilesX; x += 1) {
      const i = y * tilesX + x;
      const nx = x / tilesX - 0.5;
      const ny = y / tilesY - 0.5;
      // 大陆形状：中心高、边缘沉入海洋
      const dist = Math.sqrt(nx * nx + ny * ny) * 2.4;
      const h =
        fbm(x * 0.055, y * 0.055, seed) * 0.85 +
        fbm(x * 0.14, y * 0.14, seed + 77) * 0.15 -
        dist * 0.5 +
        0.5;
      height[i] = h;
      moisture[i] = fbm(x * 0.05 + 40, y * 0.05 + 40, seed + 999, 3);

      let tile;
      if (h < 0.33) tile = T.deepWater;
      else if (h < 0.38) tile = T.water;
      else if (h < 0.43) tile = T.sand;
      else if (h > 0.8) tile = T.snow;
      else if (h > 0.71) tile = T.mountain;
      else if (h < 0.47 && moisture[i] < 0.42) tile = T.desert;
      else if (h > 0.6 && moisture[i] > 0.55) tile = T.forest;
      else if (h > 0.52 && moisture[i] > 0.45) tile = T.forest;
      else tile = T.grass;
      tiles[i] = tile;
    }
  }

  // 河流：一条蜿蜒的主河从北到南
  for (let y = 0; y < tilesY; y += 1) {
    const center = 46 + Math.sin((y / tilesY) * Math.PI * 2.2) * 13;
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = Math.round(center + dx);
      if (x < 0 || x >= tilesX) continue;
      const i = y * tilesX + x;
      const isLand = tiles[i] !== T.deepWater && tiles[i] !== T.water;
      if (isLand && height[i] < 0.58) tiles[i] = T.river;
    }
  }

  // 地标地形印记：把地标脚下的地块改成匹配的群系
  const stamp = (cx, cy, tile, radius) => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= tilesX || y >= tilesY) continue;
        const i = y * tilesX + x;
        tiles[i] = tile;
        height[i] = 0.6;
      }
    }
  };
  const lm = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
  stamp(lm['spawn-town'].x, lm['spawn-town'].y, T.grass, 3);
  stamp(lm.castle.x, lm.castle.y, T.mountain, 3);
  stamp(lm.library.x, lm.library.y, T.forest, 2);
  stamp(lm['forest-camp'].x, lm['forest-camp'].y, T.forest, 2);
  stamp(lm.cave.x, lm.cave.y, T.mountain, 3);
  stamp(lm.lighthouse.x, lm.lighthouse.y, T.sand, 2);
  stamp(lm.forge.x, lm.forge.y, T.desert, 2);
  stamp(lm.ruins.x, lm.ruins.y, T.desert, 2);

  // 装饰物：树、石头、花、仙人掌、船、营火
  const decorations = [];
  for (let y = 0; y < tilesY; y += 1) {
    for (let x = 0; x < tilesX; x += 1) {
      const i = y * tilesX + x;
      const tile = tiles[i];
      const r = hash2(x, y, seed + 314);
      if (tile === T.forest) {
        if (r < 0.5) {
          decorations.push({ x, y, kind: r < 0.32 ? 'tree-oak' : 'tree-pine', variant: Math.floor(r * 100) % 4 });
        } else if (r < 0.56) {
          decorations.push({ x, y, kind: 'flower', variant: Math.floor(r * 100) % 4 });
        }
      } else if (tile === T.grass) {
        if (r < 0.16) {
          decorations.push({ x, y, kind: 'tree-oak', variant: Math.floor(r * 100) % 4 });
        } else if (r < 0.24) {
          decorations.push({ x, y, kind: 'flower', variant: Math.floor(r * 100) % 4 });
        } else if (r < 0.28) {
          decorations.push({ x, y, kind: 'rock', variant: Math.floor(r * 100) % 3 });
        }
      } else if (tile === T.mountain) {
        if (r < 0.3) {
          decorations.push({ x, y, kind: 'rock', variant: Math.floor(r * 100) % 3 });
        } else if (r < 0.38) {
          decorations.push({ x, y, kind: 'ore', variant: Math.floor(r * 100) % 3 });
        }
      } else if (tile === T.snow) {
        if (r < 0.22) {
          decorations.push({ x, y, kind: 'tree-pine', variant: Math.floor(r * 100) % 4 });
        }
      } else if (tile === T.desert) {
        if (r < 0.2) {
          decorations.push({ x, y, kind: 'cactus', variant: Math.floor(r * 100) % 3 });
        } else if (r < 0.26) {
          decorations.push({ x, y, kind: 'rock', variant: 2 });
        }
      } else if (tile === T.deepWater || tile === T.water) {
        if (r < 0.12) {
          decorations.push({ x, y, kind: 'lily', variant: 0 });
        } else if (r < 0.15) {
          decorations.push({ x, y, kind: 'boat', variant: 0 });
        }
      }
    }
  }

  // 出生点营火
  decorations.push({ x: lm['spawn-town'].x - 2, y: lm['spawn-town'].y + 1, kind: 'campfire', variant: 0 });

  return { tiles, height, moisture, decorations };
}

export function tileAt(world, x, y) {
  const { tilesX } = WORLD;
  if (x < 0 || y < 0 || x >= tilesX || y >= WORLD.tilesY) return T.deepWater;
  return world.tiles[y * tilesX + x];
}

export const TILE_COLOR = {
  [T.deepWater]: WORLD_COLORS.deepWater,
  [T.water]: WORLD_COLORS.water,
  [T.river]: WORLD_COLORS.shallow,
  [T.sand]: WORLD_COLORS.sand,
  [T.grass]: WORLD_COLORS.grass,
  [T.forest]: WORLD_COLORS.forest,
  [T.mountain]: WORLD_COLORS.stone,
  [T.snow]: WORLD_COLORS.snow,
  [T.desert]: WORLD_COLORS.desert,
};

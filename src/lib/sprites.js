/* ============================================================
   像素精灵：字符串网格 + 调色板 → SVG（React）或 Canvas
   '.' 表示透明
   ============================================================ */

export const SPRITES = {
  /* ---- 地标图标 16×16 ---- */
  town: {
    rows: [
      '....GGGGGGGG....',
      '...GYYYYYYYYG...',
      '..GYYYYYYYYYYG..',
      '.GYYYYYYYYYYYYG.',
      'GYYYYYYYYYYYYYYG',
      'RRRRRRRRRRRRRRRR',
      'RWRWRWRWRWRWRWRW',
      'RWRWRWRWRWRWRWRW',
      'WWWWWWWWWWWWWWWW',
      'WWWWYYWWWWYYWWWW',
      'WWWWYYWWWWYYWWWW',
      'WWWDDWWWWWWDDWWW',
      'WWWDDWWWWWWDDWWW',
      'WWWDDWWWWWWDDWWW',
      'WWWWWWWWWWWWWWWW',
      'DDDDDDDDDDDDDDDD',
    ],
    palette: { G: '#F1C40F', Y: '#FDF3B5', R: '#C0392B', W: '#E8DCC0', D: '#6B4226' },
  },
  castle: {
    rows: [
      'F..F........F..F',
      'W..W........W..W',
      'WWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWW',
      'WWGGWWWWWWWWGGWW',
      'WWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWW',
      'WWWDDDDDDDDDWWWW',
      'WWWDDDDDDDDDWWWW',
      'WWWDDDDDDDDDWWWW',
      'WWWWWWWWWWWWWWWW',
      'BBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBB',
      '................',
      '................',
    ],
    palette: { F: '#E74C3C', W: '#B9BDC4', G: '#F1C40F', D: '#4A3B2A', B: '#6F747C' },
  },
  library: {
    rows: [
      '................',
      '....BBBBBBBB....',
      '..BBWWWWWWWWBB..',
      '.BWYYWWWWWWYYWB.',
      '.BWYYWWWWWWYYWB.',
      'BWWWYYYYYYYYWWWB',
      'BWWWYYYYYYYYWWWB',
      'BWWWWYYYYYYWWWWB',
      'BWWWWWWWWWWWWWWB',
      'BBWWWWWWWWWWWWBB',
      '.BBBBBBBBBBBBBB.',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    palette: { B: '#6D4C2E', W: '#F4E9D0', Y: '#C0392B' },
  },
  forest: {
    rows: [
      '................',
      '..G........G....',
      '.GGG......GGG...',
      '.GGG......GGG...',
      'GGGGG....GGGGG..',
      'GGGGG....GGGGG..',
      '.GGG......GGG...',
      '.GGG......GGG...',
      '..T.......GG....',
      '..T......GGGG...',
      '.........GGGG...',
      '........GGGGGG..',
      '........GGGGGG..',
      '........TTTTTT..',
      '................',
      '................',
    ],
    palette: { G: '#2E7D32', T: '#6D4C2E' },
  },
  cave: {
    rows: [
      '................',
      '.....GGGGGG.....',
      '....GGGRGGGG....',
      '...GGGGGGGGGG...',
      '..GGGGGGGGGGGG..',
      '.GGGGGGGGGGGGGG.',
      '.GGG00000000GGG.',
      '.GG0000000000GG.',
      'GGG00000000000GG',
      'GGG00000000000GG',
      'GGG00000000000GG',
      'GGG00000000000GG',
      '.GG0000000000GG.',
      '.GGGGGGGGGGGGGG.',
      '................',
      '................',
    ],
    palette: { G: '#8D9299', R: '#E74C3C', 0: '#0A101A' },
  },
  lighthouse: {
    rows: [
      '................',
      '......YYYY......',
      '......YYYY......',
      '......YYYY......',
      '.....YYYYYY.....',
      '......RRRR......',
      '.....RRWWWW.....',
      '.....RRWWWW.....',
      '.....RRWWWW.....',
      '.....RRWWWW.....',
      '.....RRWWWW.....',
      '.....RRWWWW.....',
      '.....RRWWWW.....',
      '.....WWWWWW.....',
      '....WWWWWWWW....',
      '................',
    ],
    palette: { Y: '#FDF3B5', R: '#C0392B', W: '#E8E8E8' },
  },
  forge: {
    rows: [
      '................',
      '.....FF.........',
      '..FFFFFFFF......',
      '..FFFFFFFF......',
      '...FFFFFF.......',
      '....FFF.........',
      '................',
      '................',
      '....AAAAAAAAA...',
      '...AAAAAAAAAAA..',
      '....AAAAAAAAA...',
      '.....AAAAAAA....',
      '......AAAAA.....',
      '.......AAA......',
      '................',
      '................',
    ],
    palette: { F: '#E67E22', A: '#5D6470' },
  },
  ruins: {
    rows: [
      '................',
      '................',
      '..G...G...G.....',
      '..G...G...G.....',
      '..GGG.GGG.GGG...',
      '..G...G...G.....',
      '..G...G...G.....',
      '..G...G...G.....',
      '..G...G...G.....',
      '..G...G...G.....',
      '..GGG.GGG.GGG...',
      '................',
      '..G...G...G.....',
      '..G...G...G.....',
      '..G...G...G.....',
      '................',
    ],
    palette: { G: '#B9BDC4' },
  },

  /* ---- 地形装饰 ---- */
  'tree-oak': {
    rows: [
      '....GGGG....',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '..GGGGGGGG..',
      '.GGGGGGGGGG.',
      '.GGGGGGGGGG.',
      '.GGGGGGGGGG.',
      '..GGGGGGGG..',
      '....TTTT....',
      '....TTTT....',
      '....TTTT....',
      '....TTTT....',
    ],
    palette: { G: '#3F8F3F', T: '#7B4B2A' },
  },
  'tree-pine': {
    rows: [
      '....GGGG....',
      '...GGGGGG...',
      '...GGGGGG...',
      '..GGGGGGGG..',
      '..GGGGGGGG..',
      '.GGGGGGGGGG.',
      '.GGGGGGGGGG.',
      '.GGGGGGGGGG.',
      '..GGGGGGGG..',
      '...TTTTTT...',
      '...TTTTTT...',
      '...TTTTTT...',
    ],
    palette: { G: '#2E7D32', T: '#6D4C2E' },
  },
  flower: {
    rows: [
      '........',
      '..Y.Y...',
      '.YYYYY..',
      '..YCY...',
      '........',
      '........',
      '........',
      '........',
    ],
    palette: { Y: '#F1C40F', C: '#E67E22' },
  },
  rock: {
    rows: [
      '........',
      '..GGGG..',
      '.GGGGGG.',
      'GGGGGGGG',
      'GGGGGGGG',
      '.GGGGGG.',
      '........',
      '........',
    ],
    palette: { G: '#8D9299' },
  },
  ore: {
    rows: [
      '.GGGGGG.',
      'GGGRGGGG',
      'GGGGGGGG',
      'GGGGGRGG',
      'GRGGGGGG',
      'GGGGGGGG',
      'GGGGRGGG',
      '........',
    ],
    palette: { G: '#8D9299', R: '#E74C3C' },
  },
  cactus: {
    rows: [
      '....G...',
      '...GG...',
      '...GG...',
      '...GG...',
      '..GGGG..',
      '...GG...',
      '...GG...',
      '...GG...',
      '..GGGG..',
      '...GG...',
      '...GG...',
      '........',
    ],
    palette: { G: '#2E8B57' },
  },
  lily: {
    rows: [
      '........',
      '..GGGG..',
      '.GGGGGG.',
      '.GGGGGG.',
      '..GGGG..',
      '....P...',
      '....P...',
      '........',
    ],
    palette: { G: '#2E7D32', P: '#F06292' },
  },
  boat: {
    rows: [
      '....WWWW....',
      '...WWWWWW...',
      '..WWWWWWWW..',
      '.BBBBBBBBBB.',
      '..BBBBBBBB..',
      '...BBBBBB...',
      '............',
    ],
    palette: { W: '#B08D57', B: '#6D4C2E' },
  },
  campfire: {
    rows: [
      '....FF......',
      '...FFFF.....',
      '...FFFF.....',
      '..FFFFFF....',
      '..FFFFFF....',
      '...FFFF.....',
      '....FF......',
      '............',
      '..LL.LL.....',
      '..LLLLLL....',
      '..LLLLLL....',
      '............',
    ],
    palette: { F: '#E67E22', L: '#7B4B2A' },
  },
  player: {
    rows: [
      '....HHHH....',
      '...HHHHHH...',
      '...HSSSSH...',
      '...HSSSSH...',
      '...SSSSSS...',
      '..SSSSSSSS..',
      '..SSSSSSSS..',
      '..BBBBBBBB..',
      '..BBBBBBBB..',
      '..BBBBBBBB..',
      '..BBBBBBBB..',
      '..BBBBBBBB..',
      '..BBBBBBBB..',
      '..LL..LL....',
      '..LL..LL....',
      '............',
    ],
    palette: { H: '#3B2A1E', S: '#EABE8C', B: '#2E6FB2', L: '#4A3B2A' },
  },
};

/* 小花 / 岩石 / 矿点的随机配色变体 */
export const FLOWER_COLORS = ['#F1C40F', '#E74C3C', '#9B59B6', '#FDF3B5', '#52BE80'];
export const ROCK_COLORS = ['#8D9299', '#9AA0A8', '#7C818A'];
export const ORE_COLORS = ['#E74C3C', '#F1C40F', '#3B3B3B'];

/* 变体：克隆精灵并替换某个字符的颜色 */
export function spriteVariant(name, overrides) {
  const src = SPRITES[name];
  if (!src) return null;
  return { rows: src.rows, palette: { ...src.palette, ...overrides } };
}

const canvasCache = new Map();

export function makeSpriteCanvas(sprite) {
  const key = `${sprite.rows.length}x${sprite.rows[0].length}:${sprite.rows.join('|')}`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const h = sprite.rows.length;
  const w = sprite.rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < h; y += 1) {
    const row = sprite.rows[y];
    for (let x = 0; x < w; x += 1) {
      const ch = row[x];
      if (ch === '.' || !sprite.palette[ch]) continue;
      ctx.fillStyle = sprite.palette[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  canvasCache.set(key, canvas);
  return canvas;
}

export function drawSprite(ctx, name, x, y, scale = 1, flip = false, variant = null) {
  const sprite = variant || SPRITES[name];
  if (!sprite) return;
  const src = makeSpriteCanvas(sprite);
  const w = src.width;
  const h = src.height;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(x + w * scale, y);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, w, h, 0, 0, w * scale, h * scale);
  } else {
    ctx.drawImage(src, 0, 0, w, h, x, y, w * scale, h * scale);
  }
  ctx.restore();
}

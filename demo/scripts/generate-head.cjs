#!/usr/bin/env node
/**
 * BLOG_OS Minecraft head generator
 * Pure-Node glTF 2.0 (binary .glb) writer — no npm dependencies.
 *
 * Builds a TWO-LAYER Minecraft head from the mcheads.ru skin texture
 * (mjha_head/skin.png, 64x64), matching skinview3d's head rendering:
 *   - base head cube  (8x8x8,    half=4.0)   ← 底层头
 *   - hat overlay cube (8.5x8.5x8.5, half=4.25) ← 帽子叠加层（云层/装饰）
 *
 * 标准 64x64 皮肤 UV 布局（hat 层区域 = 头层区域 x+32）：
 *   head: top 8-16x0-8 | bottom 16-24x0-8 | right 0-8x8-16 |
 *         front 8-16x8-16 | left 16-24x8-16 | back 24-32x8-16
 *   hat : top 40-48x0-8 | bottom 48-56x0-8 | right 32-40x8-16 |
 *         front 40-48x8-16 | left 48-56x8-16 | back 56-64x8-16
 *
 * 采样方式与 skinview3d 一致：NEAREST 最近邻过滤、不生成 mipmap，
 * 保持 64x64 皮肤贴图放大后的像素锐利（Minecraft 像素风），避免模糊。
 *
 * Output: assets/models/mc_head.glb
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIN = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'mjha_head', 'skin.png');
const OUT = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(ROOT, 'assets', 'models', 'mc_head.glb');

const S = 64;
const uv = (x, y) => [x / S, y / S];

/* 每个面的皮肤像素矩形 [x0, y0, x1, y1]（y 从贴图顶部计） */
const HEAD_RECTS = {
  front: [8, 8, 16, 16],
  back: [24, 8, 32, 16],
  right: [16, 8, 24, 16],
  left: [0, 8, 8, 16],
  top: [8, 0, 16, 8],
  bottom: [16, 0, 24, 8],
};
const HAT_RECTS = Object.fromEntries(
  Object.entries(HEAD_RECTS).map(([k, r]) => [k, [r[0] + 32, r[1], r[2] + 32, r[3]]])
);

/**
 * 构建一层头颅立方体。
 * 顶点按从外侧看 CCW 排列，UV 取矩形对应角（贴图顶部 v=0）。
 */
function buildLayer(half, R) {
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  const faces = [
    { n: [0, 0, 1], verts: [ // front (+z)
      [-half, -half, half, R.front[0], R.front[3]],
      [half, -half, half, R.front[2], R.front[3]],
      [half, half, half, R.front[2], R.front[1]],
      [-half, half, half, R.front[0], R.front[1]],
    ]},
    { n: [0, 0, -1], verts: [ // back (-z)
      [half, -half, -half, R.back[2], R.back[3]],
      [-half, -half, -half, R.back[0], R.back[3]],
      [-half, half, -half, R.back[0], R.back[1]],
      [half, half, -half, R.back[2], R.back[1]],
    ]},
    { n: [1, 0, 0], verts: [ // right (+x)
      [half, -half, half, R.right[0], R.right[3]],
      [half, -half, -half, R.right[2], R.right[3]],
      [half, half, -half, R.right[2], R.right[1]],
      [half, half, half, R.right[0], R.right[1]],
    ]},
    { n: [-1, 0, 0], verts: [ // left (-x)
      [-half, -half, -half, R.left[2], R.left[3]],
      [-half, -half, half, R.left[0], R.left[3]],
      [-half, half, half, R.left[0], R.left[1]],
      [-half, half, -half, R.left[2], R.left[1]],
    ]},
    { n: [0, 1, 0], verts: [ // top (+y)
      [-half, half, half, R.top[0], R.top[3]],
      [half, half, half, R.top[2], R.top[3]],
      [half, half, -half, R.top[2], R.top[1]],
      [-half, half, -half, R.top[0], R.top[1]],
    ]},
    { n: [0, -1, 0], verts: [ // bottom (-y)
      [-half, -half, -half, R.bottom[0], R.bottom[3]],
      [half, -half, -half, R.bottom[2], R.bottom[3]],
      [half, -half, half, R.bottom[2], R.bottom[1]],
      [-half, -half, half, R.bottom[0], R.bottom[1]],
    ]},
  ];

  for (const face of faces) {
    const base = positions.length / 3;
    for (const v of face.verts) {
      positions.push(v[0], v[1], v[2]);
      normals.push(...face.n);
      colors.push(1, 1, 1); // 白色顶点色：loadGLB 会开启 vertexColors，乘以贴图 = 贴图原色
      uvs.push(...uv(v[3], v[4]));
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, colors, uvs, indices };
}

const head = buildLayer(4, HEAD_RECTS);
const hat = buildLayer(4.25, HAT_RECTS);

const posBuf = Buffer.from(new Float32Array([...head.positions, ...hat.positions]).buffer);
const norBuf = Buffer.from(new Float32Array([...head.normals, ...hat.normals]).buffer);
const colBuf = Buffer.from(new Float32Array([...head.colors, ...hat.colors]).buffer);
const uvBuf = Buffer.from(new Float32Array([...head.uvs, ...hat.uvs]).buffer);
const idxHeadBuf = Buffer.from(new Uint32Array(head.indices).buffer);
const idxHatBuf = Buffer.from(new Uint32Array(hat.indices.map((i) => i + head.positions.length / 3)).buffer);
const skin = fs.readFileSync(SKIN);

const offN = posBuf.length;
const offCol = offN + norBuf.length;
const offUV = offCol + colBuf.length;
const offIdxHead = offUV + uvBuf.length;
const offIdxHat = offIdxHead + idxHeadBuf.length;
const offImg = offIdxHat + idxHatBuf.length;

const json = {
  asset: { version: '2.0', generator: 'BLOG_OS head generator' },
  scene: 0,
  scenes: [{ nodes: [0, 1] }],
  nodes: [
    { name: 'mc_head', mesh: 0 },
    { name: 'mc_head_hat', mesh: 1 },
  ],
  meshes: [
    {
      name: 'mc_head',
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, TEXCOORD_0: 3 },
        indices: 4,
        material: 0,
      }],
    },
    {
      name: 'mc_head_hat',
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, TEXCOORD_0: 3 },
        indices: 5,
        material: 1,
      }],
    },
  ],
  materials: [
    {
      name: 'MinecraftHead',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0.0,
        roughnessFactor: 1.0,
      },
      doubleSided: true,
    },
    {
      name: 'MinecraftHeadHat',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0.0,
        roughnessFactor: 1.0,
      },
      alphaMode: 'MASK',
      alphaCutoff: 0.1,
      doubleSided: true,
    },
  ],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{
    magFilter: 9728, // NEAREST — 与 skinview3d 的纹理采样一致
    minFilter: 9728, // NEAREST（无需 mipmap）
    wrapS: 33071,
    wrapT: 33071,
  }],
  images: [{ name: 'skin.png', bufferView: 6, mimeType: 'image/png' }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBuf.length },
    { buffer: 0, byteOffset: offN, byteLength: norBuf.length },
    { buffer: 0, byteOffset: offCol, byteLength: colBuf.length },
    { buffer: 0, byteOffset: offUV, byteLength: uvBuf.length },
    { buffer: 0, byteOffset: offIdxHead, byteLength: idxHeadBuf.length, target: 34963 },
    { buffer: 0, byteOffset: offIdxHat, byteLength: idxHatBuf.length, target: 34963 },
    { buffer: 0, byteOffset: offImg, byteLength: skin.length },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: (head.positions.length + hat.positions.length) / 3,
      type: 'VEC3',
      min: [-4.25, -4.25, -4.25],
      max: [4.25, 4.25, 4.25],
    },
    { bufferView: 1, componentType: 5126, count: (head.normals.length + hat.normals.length) / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: (head.colors.length + hat.colors.length) / 3, type: 'VEC3' },
    { bufferView: 3, componentType: 5126, count: (head.uvs.length + hat.uvs.length) / 2, type: 'VEC2' },
    { bufferView: 4, componentType: 5125, count: head.indices.length, type: 'SCALAR' },
    { bufferView: 5, componentType: 5125, count: hat.indices.length, type: 'SCALAR' },
  ],
  buffers: [{ byteLength: offImg + skin.length }],
};

const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const pad = (n) => (4 - (n % 4)) % 4;
const jsonPad = pad(jsonBuf.length);
const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + offImg + skin.length;
const out = Buffer.alloc(total);

out.writeUInt32LE(0x46546C67, 0); // glTF
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);

out.writeUInt32LE(jsonBuf.length + jsonPad, 12);
out.writeUInt32LE(0x4E4F534A, 16); // JSON
jsonBuf.copy(out, 20);
out.fill(0x20, 20 + jsonBuf.length, 20 + jsonBuf.length + jsonPad);

const binStart = 20 + jsonBuf.length + jsonPad;
out.writeUInt32LE(offImg + skin.length, binStart);
out.writeUInt32LE(0x004E4942, binStart + 4); // BIN
posBuf.copy(out, binStart + 8);
norBuf.copy(out, binStart + 8 + offN);
colBuf.copy(out, binStart + 8 + offCol);
uvBuf.copy(out, binStart + 8 + offUV);
idxHeadBuf.copy(out, binStart + 8 + offIdxHead);
idxHatBuf.copy(out, binStart + 8 + offIdxHat);
skin.copy(out, binStart + 8 + offImg);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`[OK] ${OUT}  (head ${head.positions.length / 3} + hat ${hat.positions.length / 3} verts, ${(out.length / 1024).toFixed(1)} KB, texture ${skin.length} B embedded)`);

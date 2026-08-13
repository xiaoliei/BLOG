#!/usr/bin/env node
/**
 * BLOG_OS voxel model generator
 * Pure-Node glTF 2.0 (binary .glb) writer — no npm dependencies.
 *
 * Models produced:
 *   assets/models/earth.glb     - voxelized Minecraft-style Earth (legacy; landing now uses mc_head.glb)
 *   assets/models/cluster.glb   - materials voxel cluster (archive page)
 *   assets/models/cu_block.glb  - oxidized copper block (detail)
 *   assets/models/iron_block.glb
 *   assets/models/deepslate_block.glb
 *   assets/models/netherite_block.glb
 *   assets/models/quartz_block.glb
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'models');

/* ------------------------------------------------------------------ *
 *  Tiny deterministic value noise (2D hash based)
 * ------------------------------------------------------------------ */
function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct) {
  let amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise2(x, y);
    norm += amp;
    amp *= 0.5;
    x = x * 2.03 + 17.7;
    y = y * 2.03 + 9.3;
  }
  return sum / norm;
}
const rng = (() => {
  let s = 1337;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
})();

/* ------------------------------------------------------------------ *
 *  Cube primitive
 * ------------------------------------------------------------------ */
const FACES = [
  { n: [0, 1, 0], c: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
  { n: [1, 0, 0], c: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];
const FACE_SHADE = [1.0, 0.66, 0.82, 0.82, 0.9, 0.9];

function pushCube(mesh, cx, cy, cz, size, color, jitter = 0.05, faceJitter = true) {
  const h = size / 2;
  const base = mesh.positions.length / 3;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const nx = face.n[0], ny = face.n[1], nz = face.n[2];
    const shade = FACE_SHADE[f] * (faceJitter ? 1 + (rng() - 0.5) * jitter * 2 : 1);
    const r = Math.min(1, Math.max(0, color[0] * shade + (rng() - 0.5) * jitter));
    const g = Math.min(1, Math.max(0, color[1] * shade + (rng() - 0.5) * jitter));
    const b = Math.min(1, Math.max(0, color[2] * shade + (rng() - 0.5) * jitter));
    for (const [dx, dy, dz] of face.c) {
      mesh.positions.push(cx + dx * h, cy + dy * h, cz + dz * h);
      mesh.normals.push(nx, ny, nz);
      mesh.colors.push(r, g, b);
    }
    mesh.indices.push(base + f * 4, base + f * 4 + 1, base + f * 4 + 2, base + f * 4, base + f * 4 + 2, base + f * 4 + 3);
  }
}

function newMesh() {
  return { positions: [], normals: [], colors: [], indices: [] };
}

/* ------------------------------------------------------------------ *
 *  GLB writer (glTF 2.0 binary)
 * ------------------------------------------------------------------ */
function writeGLB(filePath, mesh, name) {
  const posBuf = Buffer.from(new Float32Array(mesh.positions).buffer);
  const norBuf = Buffer.from(new Float32Array(mesh.normals).buffer);
  const colBuf = Buffer.from(new Float32Array(mesh.colors).buffer);
  const idxBuf = Buffer.from(new Uint32Array(mesh.indices).buffer);

  const pad = (n) => (4 - (n % 4)) % 4;
  const binPad = pad(posBuf.length + norBuf.length + colBuf.length);
  const idxOffset = posBuf.length + norBuf.length + colBuf.length + binPad;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }

  const json = {
    asset: { version: '2.0', generator: 'BLOG_OS voxel generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{
      name,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [{
      name: 'Voxel',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0.0,
        roughnessFactor: 1.0,
      },
      doubleSided: true,
    }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length },
      { buffer: 0, byteOffset: posBuf.length, byteLength: norBuf.length },
      { buffer: 0, byteOffset: posBuf.length + norBuf.length, byteLength: colBuf.length },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBuf.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: mesh.positions.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: mesh.normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: mesh.colors.length / 3, type: 'VEC3' },
      { bufferView: 3, componentType: 5125, count: mesh.indices.length, type: 'SCALAR' },
    ],
    buffers: [{ byteLength: idxOffset + idxBuf.length }],
  };

  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = pad(jsonBuf.length);
  const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + idxOffset + idxBuf.length;
  const out = Buffer.alloc(total);

  out.writeUInt32LE(0x46546C67, 0); // glTF
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);

  out.writeUInt32LE(jsonBuf.length + jsonPad, 12);
  out.writeUInt32LE(0x4E4F534A, 16); // JSON
  jsonBuf.copy(out, 20);
  out.fill(0x20, 20 + jsonBuf.length, 20 + jsonBuf.length + jsonPad); // pad with spaces

  const binStart = 20 + jsonBuf.length + jsonPad;
  out.writeUInt32LE(idxOffset + idxBuf.length, binStart);
  out.writeUInt32LE(0x004E4942, binStart + 4); // BIN
  posBuf.copy(out, binStart + 8);
  norBuf.copy(out, binStart + 8 + posBuf.length);
  colBuf.copy(out, binStart + 8 + posBuf.length + norBuf.length);
  idxBuf.copy(out, binStart + 8 + idxOffset);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, out);
  const kb = (out.length / 1024).toFixed(1);
  console.log(`[OK] ${filePath}  (${mesh.positions.length / 3} verts, ${mesh.indices.length / 3} tris, ${kb} KB)`);
}

/* ------------------------------------------------------------------ *
 *  Earth — procedural 64x32 land mask + voxel sphere shell
 * ------------------------------------------------------------------ */
function buildLandMask() {
  const W = 64, H = 32;
  const mask = new Float32Array(W * H);
  const blobs = [
    [14.2, 8.0, 7.0, 5.0],        // North America
    [7.5, 6.5, 2.2, 2.5],         // Alaska
    [24.9, 3.4, 1.8, 2.4],        // Greenland
    [21.3, 19.0, 2.8, 6.2],       // South America
    [20.5, 16.8, 2.1, 2.1],       // Peru / Andes bulge
    [34.7, 7.2, 3.2, 3.6],        // Europe
    [35.6, 15.3, 5.2, 6.2],       // Africa
    [40.5, 20.5, 0.8, 1.4],       // Madagascar
    [49.8, 9.0, 9.5, 5.5],        // Asia
    [45.5, 13.3, 1.7, 2.8],       // India
    [43.0, 13.0, 2.2, 2.0],       // Arabia
    [51.6, 15.5, 2.5, 1.8],       // SE Asia
    [56.9, 9.3, 0.7, 2.2],        // Japan
    [56.0, 20.5, 3.6, 2.6],       // Australia
    [60.5, 23.5, 0.5, 1.0],       // New Zealand
    [32.0, 30.2, 20.0, 1.5],      // Antarctica
  ];
  for (const [cx, cy, rx, ry] of blobs) {
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          const cov = 1 - d2;
          const i = y * W + x;
          if (cov > mask[i]) mask[i] = cov;
        }
      }
    }
  }
  return mask;
}

function landFactor(mask, lon, lat) {
  // lon in radians (0..2pi from +Z), lat in radians
  let x = ((lon / (Math.PI * 2)) + 0.5) * 64;
  let y = (0.5 - lat / Math.PI) * 32;
  x = ((x % 64) + 64) % 64;
  y = Math.min(31.999, Math.max(0, y));
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x1 = (xi + 1) % 64;
  const a = mask[yi * 64 + xi], b = mask[yi * 64 + x1];
  const c = mask[Math.min(31, yi + 1) * 64 + xi], d = mask[Math.min(31, yi + 1) * 64 + x1];
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

function earthColor(mask, lon, lat) {
  const absLat = Math.abs(lat);
  if (absLat > 1.34) return [0.83, 0.92, 0.97]; // polar ice
  const land = landFactor(mask, lon, lat);
  const n = fbm(lon * 2.4, lat * 4.2, 3);
  if (land > 0.52) {
    if (absLat > 0.95) {
      return lerpColor([0.42, 0.48, 0.40], [0.55, 0.6, 0.52], fbm(lon * 5, lat * 7, 2));
    }
    const grass = [0.24, 0.49, 0.24];
    const sand = [0.60, 0.46, 0.28];
    const forest = [0.14, 0.34, 0.16];
    const base = land > 0.82 ? lerpColor(grass, forest, n) : lerpColor(grass, sand, n);
    if (land < 0.62) return lerpColor(base, sand, 0.7); // coastline
    return base;
  }
  // ocean
  const deep = [0.045, 0.11, 0.24];
  const shallow = [0.07, 0.20, 0.36];
  return lerpColor(deep, shallow, fbm(lon * 6, lat * 10, 3) * 0.5 + 0.3);
}

function lerpColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function buildEarth() {
  const mask = buildLandMask();
  const R = 7;
  const mesh = newMesh();
  for (let x = -R; x <= R; x++) {
    for (let y = -R; y <= R; y++) {
      for (let z = -R; z <= R; z++) {
        const d = Math.sqrt(x * x + y * y + z * z);
        if (d <= R && d > R - 1) {
          const lon = Math.atan2(x, z);
          const lat = Math.asin(Math.max(-1, Math.min(1, y / d)));
          const base = earthColor(mask, lon, lat);
          const j = 0.5 + fbm(x * 0.7, y * 0.7 + z * 0.3, 2) * 0.5;
          const col = lerpColor(base, [base[0] * 0.85, base[1] * 0.85, base[2] * 0.9], j * 0.35);
          pushCube(mesh, x, y, z, 1, col, 0.04, false);
        }
      }
    }
  }
  return mesh;
}

/* ------------------------------------------------------------------ *
 *  Materials cluster (archive centerpiece)
 * ------------------------------------------------------------------ */
const HEX = (h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

const MATERIALS = {
  stone: HEX('#6F6F6F'),
  deepslate: HEX('#3A3A3E'),
  copper: HEX('#C87533'),
  iron: HEX('#CFCFCF'),
  gold: HEX('#F2CE4A'),
  diamond: HEX('#4ADBE0'),
  lapis: HEX('#2A55C0'),
  emerald: HEX('#1FC95A'),
  quartz: HEX('#EAE3D2'),
  amethyst: HEX('#A555C8'),
  netherite: HEX('#46343C'),
  grass: HEX('#5DA83C'),
  dirt: HEX('#7A5230'),
  cyan: HEX('#1ABC9C'),
  orange: HEX('#E67E22'),
};

function buildCluster() {
  const mesh = newMesh();
  const put = (x, y, z, mat, sx = 1, sy = 1, sz = 1, jitter = 0.06) => {
    const col = MATERIALS[mat] || MATERIALS.stone;
    for (let dx = 0; dx < sx; dx++) {
      for (let dy = 0; dy < sy; dy++) {
        for (let dz = 0; dz < sz; dz++) {
          pushCube(
            mesh,
            x - (sx - 1) / 2 + dx,
            y - (sy - 1) / 2 + dy,
            z - (sz - 1) / 2 + dz,
            1,
            col,
            jitter
          );
        }
      }
    }
  };

  // deepslate plinth (11 x 2)
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      if (Math.abs(x) + Math.abs(z) > 9) continue;
      put(x, -2.5, z, 'deepslate', 1, 1, 1, 0.05);
      put(x, -1.5, z, Math.random() < 0.12 ? 'stone' : 'deepslate', 1, 1, 1, 0.05);
    }
  }
  // grass/dirt rim on top of plinth
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      if (Math.abs(x) + Math.abs(z) === 9 || (Math.abs(x) === 5 && Math.abs(z) === 5)) {
        put(x, -0.5, z, Math.random() < 0.5 ? 'grass' : 'dirt', 1, 1, 1, 0.07);
      }
    }
  }

  // central copper obelisk
  put(0, 0.5, 0, 'copper', 1, 3, 1, 0.06);
  // satellite material blocks
  put(2.2, 0, 1.4, 'iron', 1, 1, 1, 0.05);
  put(-2.2, 0, 1.8, 'gold', 1, 1, 1, 0.05);
  put(1.3, 0, -2.1, 'diamond', 1, 1, 1, 0.06);
  put(-1.1, 0, -1.6, 'lapis', 1, 1, 1, 0.05);
  put(-3.2, 0, -2.9, 'netherite', 1, 1, 1, 0.06);
  put(3.4, 0, -1.1, 'emerald', 1, 1, 1, 0.05);
  put(-3.5, 0.5, 0.4, 'quartz', 2, 1, 1, 0.04);
  put(0.2, 1.8, 2.3, 'amethyst', 1, 1, 1, 0.08);
  put(0.4, 2.8, 2.1, 'amethyst', 0.7, 0.7, 0.7, 0.1);
  // floating accent cubes
  put(4.6, 2.6, 3.1, 'cyan', 0.45, 0.45, 0.45, 0.08);
  put(-4.4, 3.0, -3.2, 'orange', 0.4, 0.4, 0.4, 0.08);
  put(-4.7, 1.6, 3.5, 'orange', 0.32, 0.32, 0.32, 0.08);
  put(4.1, 3.6, -2.6, 'cyan', 0.3, 0.3, 0.3, 0.08);
  return mesh;
}

/* ------------------------------------------------------------------ *
 *  Single block models (3x3x3 micro-voxels, 1 unit total)
 * ------------------------------------------------------------------ */
function buildBlock(palette, seedJitter = 0.1) {
  const mesh = newMesh();
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const n = fbm(x * 3.1 + 11 + y * 0.7, z * 3.1 + 7 + y * 0.4, 2);
        const base = n < 0.38 ? palette[0] : n < 0.72 ? palette[1] : palette[2];
        pushCube(mesh, x / 3, y / 3, z / 3, 1 / 3, base, seedJitter, true);
      }
    }
  }
  return mesh;
}

const BLOCK_PALETTES = {
  cu_block: [HEX('#4DA29B'), HEX('#3E8C85'), HEX('#B4622A')],        // oxidized copper + rust
  iron_block: [HEX('#CFCFCF'), HEX('#AEB6C6'), HEX('#8F9AA8')],
  deepslate_block: [HEX('#3A3A3E'), HEX('#32323A'), HEX('#2A2A30')],
  netherite_block: [HEX('#46343C'), HEX('#382A33'), HEX('#5C4038')],
  quartz_block: [HEX('#EAE3D2'), HEX('#CFC4AA'), HEX('#B9AE96')],
};

/* ------------------------------------------------------------------ *
 *  Main
 * ------------------------------------------------------------------ */
function main() {
  writeGLB(path.join(OUT_DIR, 'earth.glb'), buildEarth(), 'earth_voxel');
  writeGLB(path.join(OUT_DIR, 'cluster.glb'), buildCluster(), 'materials_cluster');
  for (const [name, palette] of Object.entries(BLOCK_PALETTES)) {
    writeGLB(path.join(OUT_DIR, `${name}.glb`), buildBlock(palette), name);
  }
  console.log('done.');
}

main();

/* ============================================================
   SCHEME C 数据层（移植自 demo/js/tower-layers.js + tower-cubes.js）
   加载 stone_pickaxe_tower.glb → 按体素切层 / 拆独立方块，
   供场景过场动画（方块聚合 / 飞散）复用。
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export { THREE };

export const TOWER_URL = '/models/stone_pickaxe_tower.glb';
export const MAX_LAYERS = 48;

export const EASE = {
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inCubic: (x) => x * x * x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inQuad: (x) => x * x,
  smooth: (x) => x * x * (3 - 2 * x),
};

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从贴图图集采样颜色（glTF UV 原点在左下角）
 */
function makeAtlasSampler(mat) {
  const map = mat && mat.map;
  const img = map && map.image;
  if (!img || !img.width) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const w = canvas.width;
  const h = canvas.height;
  return (u, v) => {
    const x = Math.max(0, Math.min(w - 1, Math.floor(u * w)));
    const y = Math.max(0, Math.min(h - 1, Math.floor((1 - v) * h)));
    const i = (y * w + x) * 4;
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, data[i + 3] / 255];
  };
}

/**
 * 返回 Promise<{
 *   layers: [{ layer, geometry(局部y∈[0,1]), baseY, material }],
 *   points: { positions, colors },
 *   bbox: { min, max, center },
 *   meshes
 * }>
 */
export function loadTowerData(url = TOWER_URL) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        try {
          const model = gltf.scene;
          model.updateWorldMatrix(true, true);

          const meshes = [];
          model.traverse((o) => {
            if (o.isMesh && o.geometry && o.geometry.index) meshes.push(o);
          });
          if (!meshes.length) throw new Error('GLB 内没有可切分的索引网格');

          // 烘焙世界矩阵（该模型节点只含平移，可直接应用）
          meshes.forEach((m) => {
            m.geometry = m.geometry.clone();
            m.geometry.applyMatrix4(m.matrixWorld);
          });

          /* ---------- 1) 按体素行切层 ---------- */
          const groups = new Map(); // row -> [{src,i0,i1,i2}]
          const va = new THREE.Vector3();
          const vb = new THREE.Vector3();
          const vc = new THREE.Vector3();
          const ab = new THREE.Vector3();
          const ac = new THREE.Vector3();
          const nrm = new THREE.Vector3();

          meshes.forEach((mesh, src) => {
            const g = mesh.geometry;
            const pos = g.attributes.position;
            const idx = g.index;
            for (let t = 0; t < idx.count; t += 3) {
              const i0 = idx.getX(t);
              const i1 = idx.getX(t + 1);
              const i2 = idx.getX(t + 2);
              va.fromBufferAttribute(pos, i0);
              vb.fromBufferAttribute(pos, i1);
              vc.fromBufferAttribute(pos, i2);
              ab.subVectors(vb, va);
              ac.subVectors(vc, va);
              nrm.crossVectors(ab, ac).normalize();

              const solidY = (va.y + vb.y + vc.y) / 3 - 1e-4 * nrm.y;
              let layer = Math.round(solidY);
              layer = Math.max(0, Math.min(layer, MAX_LAYERS - 1));
              if (!groups.has(layer)) groups.set(layer, []);
              groups.get(layer).push({ src, i0, i1, i2 });
            }
          });

          /* ---------- 2) 逐层构建几何 + 材质 ---------- */
          const baseMat = meshes[0].material;
          const layers = [];
          const v = new THREE.Vector3();
          const n = new THREE.Vector3();
          const nm = new THREE.Matrix3();

          for (const layerIdx of [...groups.keys()].sort((a, b) => a - b)) {
            const tris = groups.get(layerIdx);
            const positions = [];
            const normals = [];
            const uvs = [];
            const colors = [];
            const indices = [];
            const seen = new Map();

            for (const { src, i0, i1, i2 } of tris) {
              for (const vi of [i0, i1, i2]) {
                const key = `${src}:${vi}`;
                let ni = seen.get(key);
                if (ni === undefined) {
                  ni = positions.length / 3;
                  seen.set(key, ni);
                  const g = meshes[src].geometry;
                  const p = g.attributes.position;
                  v.fromBufferAttribute(p, vi);
                  positions.push(v.x, v.y, v.z);

                  const nr = g.attributes.normal;
                  nm.getNormalMatrix(meshes[src].matrixWorld);
                  n.fromBufferAttribute(nr, vi).applyMatrix3(nm).normalize();
                  normals.push(n.x, n.y, n.z);

                  if (g.attributes.uv) {
                    uvs.push(g.attributes.uv.getX(vi), g.attributes.uv.getY(vi));
                  }
                  if (g.attributes.color) {
                    colors.push(
                      g.attributes.color.getX(vi),
                      g.attributes.color.getY(vi),
                      g.attributes.color.getZ(vi),
                      g.attributes.color.getW(vi)
                    );
                  }
                }
                indices.push(ni);
              }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            if (uvs.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            if (colors.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
            geo.setIndex(indices);
            geo.translate(0, -(layerIdx - 0.5), 0); // 层基点 = 方块行底部
            geo.computeBoundingSphere();

            const mat = baseMat.clone();
            mat.transparent = true;
            mat.alphaTest = 0.5;
            mat.opacity = 1;
            mat.vertexColors = true;
            mat.emissive = new THREE.Color(0x1abc9c);
            mat.emissiveIntensity = 0;
            mat.metalness = 0;
            mat.roughness = 0.92;

            layers.push({ layer: layerIdx, geometry: geo, baseY: layerIdx - 0.5, material: mat });
          }

          /* ---------- 3) 粒子数据：烘焙顶点 + 贴图像素色 ---------- */
          const positions = [];
          const colorsArr = [];
          const sampler = makeAtlasSampler(baseMat);
          meshes.forEach((m) => {
            const p = m.geometry.attributes.position;
            const uv = m.geometry.attributes.uv;
            for (let i = 0; i < p.count; i += 1) {
              positions.push(p.getX(i), p.getY(i), p.getZ(i));
              if (uv && sampler) {
                const [r, g, b, a] = sampler(uv.getX(i), uv.getY(i));
                colorsArr.push(r, g, b, Math.max(a, 0.35));
              } else {
                colorsArr.push(1, 1, 1, 1);
              }
            }
          });

          /* ---------- 4) 世界包围盒 ---------- */
          const posArr = positions;
          let minX = Infinity;
          let minY = Infinity;
          let minZ = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          let maxZ = -Infinity;
          for (let i = 0; i < posArr.length; i += 3) {
            if (posArr[i] < minX) minX = posArr[i];
            if (posArr[i + 1] < minY) minY = posArr[i + 1];
            if (posArr[i + 2] < minZ) minZ = posArr[i + 2];
            if (posArr[i] > maxX) maxX = posArr[i];
            if (posArr[i + 1] > maxY) maxY = posArr[i + 1];
            if (posArr[i + 2] > maxZ) maxZ = posArr[i + 2];
          }
          const bbox = {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ },
            center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
          };

          resolve({
            layers,
            points: { positions: new Float32Array(positions), colors: new Float32Array(colorsArr) },
            bbox,
            meshes,
          });
        } catch (err) {
          reject(err);
        }
      },
      undefined,
      reject
    );
  });
}

/**
 * 把烘焙好的体素网格按「体素方块」拆分：每个方块一个独立 Mesh，
 * 聚合时方块飞入、自旋、精确拼接回原模型。
 * @returns {{ pieces: [{geometry, center, scatter, quat, seed}], material, count }}
 */
export function buildVoxelCubes(data, { radius = 14, spread = 15, randomSeed = 20260804 } = {}) {
  const meshes = data.meshes || [];
  const c = data.bbox.center;
  const rng = mulberry32(randomSeed);
  const tmpQ = new THREE.Quaternion();
  const tmpAxis = new THREE.Vector3();

  /* ---------- 1) 三角形按体素归属 ---------- */
  const groups = new Map(); // "ix,iy,iz" -> [{src,i0,i1,i2}]
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const nrm = new THREE.Vector3();

  meshes.forEach((mesh, src) => {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const idx = g.index;
    for (let t = 0; t < idx.count; t += 3) {
      const i0 = idx.getX(t);
      const i1 = idx.getX(t + 1);
      const i2 = idx.getX(t + 2);
      va.fromBufferAttribute(pos, i0);
      vb.fromBufferAttribute(pos, i1);
      vc.fromBufferAttribute(pos, i2);
      ab.subVectors(vb, va);
      ac.subVectors(vc, va);
      nrm.crossVectors(ab, ac).normalize();
      // 面中心沿法线反方向极近处 → 所属体素（整数中心）
      const ix = Math.round((va.x + vb.x + vc.x) / 3 - 1e-4 * nrm.x);
      const iy = Math.round((va.y + vb.y + vc.y) / 3 - 1e-4 * nrm.y);
      const iz = Math.round((va.z + vb.z + vc.z) / 3 - 1e-4 * nrm.z);
      const key = `${ix},${iy},${iz}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ src, i0, i1, i2 });
    }
  });

  /* ---------- 2) 每个体素一个独立几何（局部原点 = 体素中心） ---------- */
  const baseMat = meshes[0].material;
  const pieces = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();

  for (const [key, tris] of groups) {
    const [ix, iy, iz] = key.split(',').map(Number);
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const seen = new Map();

    for (const { src, i0, i1, i2 } of tris) {
      for (const vi of [i0, i1, i2]) {
        const k = `${src}:${vi}`;
        let ni = seen.get(k);
        if (ni === undefined) {
          ni = positions.length / 3;
          seen.set(k, ni);
          const g = meshes[src].geometry;
          const p = g.attributes.position;
          v.fromBufferAttribute(p, vi);
          positions.push(v.x, v.y, v.z);

          const nr = g.attributes.normal;
          nm.getNormalMatrix(meshes[src].matrixWorld);
          n.fromBufferAttribute(nr, vi).applyMatrix3(nm).normalize();
          normals.push(n.x, n.y, n.z);

          if (g.attributes.uv) {
            uvs.push(g.attributes.uv.getX(vi), g.attributes.uv.getY(vi));
          }
          if (g.attributes.color) {
            colors.push(
              g.attributes.color.getX(vi),
              g.attributes.color.getY(vi),
              g.attributes.color.getZ(vi),
              g.attributes.color.getW(vi)
            );
          }
        }
        indices.push(ni);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (uvs.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colors.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geo.setIndex(indices);
    geo.translate(-ix, -iy, -iz); // 局部原点 = 体素中心
    geo.computeBoundingSphere();

    // 散射：随机方向偏移 + 随机旋转
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng() * 2 - 1);
    tmpAxis.set(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
    const rr = radius + rng() * spread;
    const scatter = [tmpAxis.x * rr, tmpAxis.y * rr * 0.7, tmpAxis.z * rr];
    tmpQ.setFromAxisAngle(tmpAxis, rng() * Math.PI * 2);

    pieces.push({
      geometry: geo,
      center: [ix - c.x, iy, iz - c.z],
      scatter,
      quat: tmpQ.clone(),
      seed: rng(),
    });
  }

  const mat = baseMat.clone();
  mat.transparent = true;
  mat.alphaTest = 0.5;
  mat.opacity = 1;
  mat.vertexColors = true;
  mat.emissive = new THREE.Color(0x1abc9c);
  mat.emissiveIntensity = 0;
  mat.metalness = 0;
  mat.roughness = 0.92;

  return { pieces, material: mat, count: pieces.length };
}

/* ---------- 场景 / 灯光 / 取景（移植自 transition-common.js） ---------- */

export function addStageLights(scene) {
  scene.add(new THREE.HemisphereLight(0x6d87a8, 0x0a0f18, 0.85));

  const key = new THREE.DirectionalLight(0xfff3e0, 1.9);
  key.position.set(9, 16, 7);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9fc7ff, 0.55);
  fill.position.set(-8, 7, -6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x1abc9c, 0.5);
  rim.position.set(-2, 5, -12);
  scene.add(rim);
}

export function addGrid(scene) {
  const grid = new THREE.GridHelper(30, 15, 0x1abc9c, 0x2a4a6a);
  grid.position.y = -1.1;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);
}

/**
 * 从 loadTowerData() 创建逐层网格（每层一个 pivot，供幽灵塔剪影使用），
 * 并把模型水平居中（世界包围盒中心移到原点）。
 */
export function createLayerMeshes(data, group) {
  const pivots = data.layers.map((L) => {
    const pivot = new THREE.Group();
    pivot.position.y = L.baseY;
    const mesh = new THREE.Mesh(L.geometry, L.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return { pivot, material: L.material, geometry: L.geometry, baseY: L.baseY, mesh };
  });
  group.position.set(-data.bbox.center.x, 0, -data.bbox.center.z);
  return pivots;
}

/**
 * 按模型包围球自动取景：保证塔完整进入画面（兼顾横/竖屏）。
 */
export function frameTower(camera, data, { padding = 1.18 } = {}) {
  const c = data.bbox.center;
  const sx = data.bbox.max.x - data.bbox.min.x;
  const sy = data.bbox.max.y - data.bbox.min.y;
  const sz = data.bbox.max.z - data.bbox.min.z;
  const radius = Math.sqrt(sx * sx + sy * sy + sz * sz) / 2;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = camera.aspect || 1.6;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distV = radius / Math.sin(vFov / 2);
  const distH = radius / Math.sin(hFov / 2);
  const dist = Math.max(distV, distH) * padding;

  const dir = new THREE.Vector3(1, 0.72, 1.35).normalize();
  camera.position.set(dir.x * dist, c.y + dir.y * dist, dir.z * dist);
  camera.lookAt(0, c.y, 0);
  camera.updateProjectionMatrix();
}

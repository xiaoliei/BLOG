/* ============================================================
 * 独立方块（SCHEME C 专用）
 * 预处理：把烘焙好的体素网格按「体素方块」拆分 —— 模型由 192 个
 * 闭合立方体组成，每个方块一个独立 Mesh（保留原始贴图面片），
 * 聚合时方块飞入、自旋、精确拼接回原模型。
 * ============================================================ */

import * as THREE from 'three';

function mulberry32(seed) {
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
 * @param {object} data loadTowerData() 结果（需含 meshes）
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

  console.log(`[CUBES] ${pieces.length} blocks`);
  return { pieces, material: mat, count: pieces.length };
}

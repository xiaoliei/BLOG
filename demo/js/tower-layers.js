/* ============================================================
 * 共享数据层：加载 stone_pickaxe_tower.glb，
 * 烘焙世界坐标 → 按体素行切层（每层 1 格方块）→ 生成粒子数据。
 * 供 pickaxe-tower.js 与各过场方案（transition-*.js）复用。
 * ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const TOWER_URL = 'assets/models/stone_pickaxe_tower.glb';
export const MAX_LAYERS = 48;

export function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
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
 *   layers:  [{ layer, geometry(局部y∈[0,1]), baseY, material }],
 *   points:  { positions: Float32Array(世界坐标), colors: Float32Array(贴图像素色) },
 *   bbox:    { min:{x,y,z}, max:{x,y,z}, center:{x,y,z} }
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

          /* ---------- 1) 按体素行切层 ----------
           * 本模型方块以整数 Y 为中心：第 k 行占 [k-0.5, k+0.5]。
           * 面中心沿法线反方向极近处取采样点，四舍五入得行号 k，
           * 半格方块也不会跨层。 */
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
            for (let i = 0; i < p.count; i++) {
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
          let minX = Infinity, minY = Infinity, minZ = Infinity;
          let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
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
            meshes, // 烘焙到世界坐标后的网格（含 position/uv/normal/index），供片状粒子预处理使用
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

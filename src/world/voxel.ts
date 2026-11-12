import * as THREE from 'three';

/** box 参数是实例化前的局部尺寸（w/h/d),flush 时按 matrix.compose 写入实例矩阵。 */
type BoxFn = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, texture?: boolean) => void;

export interface VoxelKit {
  /** Queue a voxel into per-material buckets; call flush() to emit InstancedMeshes. */
  batch: (parent: THREE.Object3D, id?: string) => { box: BoxFn; flush: () => void };
  material: (color: string, texture?: boolean) => THREE.MeshLambertMaterial;
  geometry: THREE.BoxGeometry;
  random: () => number;
  dispose: () => void;
}

export function createKit(): VoxelKit {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  let seed = 1729;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function material(color: string, texture = true): THREE.MeshLambertMaterial {
    const key = color + texture;
    const cached = materials.get(key);
    if (cached) return cached;
    let map: THREE.CanvasTexture | null = null;
    if (texture) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.fillStyle = color; ctx.fillRect(0, 0, 16, 16);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = random() > .5 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.055)';
        ctx.fillRect(Math.floor(random() * 4) * 4, Math.floor(random() * 4) * 4, 4, 4);
      }
      map = new THREE.CanvasTexture(canvas); map.magFilter = map.minFilter = THREE.NearestFilter;
      map.colorSpace = THREE.SRGBColorSpace; map.generateMipmaps = false;
    }
    const m = new THREE.MeshLambertMaterial({ color: texture ? '#ffffff' : color, map });
    materials.set(key, m); return m;
  }
  const box: BoxFn = function (this: { buckets: Map<THREE.MeshLambertMaterial, number[][]> }, x, y, z, w, h, d, color, texture = true) {
    const mat = material(color, texture);
    const list = this.buckets.get(mat);
    if (list) list.push([x, y, z, w, h, d]);
    else this.buckets.set(mat, [[x, y, z, w, h, d]]);
  };
  function batch(parent: THREE.Object3D, id?: string) {
    const buckets = new Map<THREE.MeshLambertMaterial, number[][]>();
    function boxLocal(x: number, y: number, z: number, w: number, h: number, d: number, color: string, texture = true): void {
      const mat = material(color, texture);
      const list = buckets.get(mat);
      if (list) list.push([x, y, z, w, h, d]);
      else buckets.set(mat, [[x, y, z, w, h, d]]);
    }
    function flush(): void {
      const matrix = new THREE.Matrix4(); const q = new THREE.Quaternion();
      for (const [mat, cubes] of buckets) {
        const mesh = new THREE.InstancedMesh(geometry, mat, cubes.length);
        cubes.forEach(([x, y, z, w, h, d], i) => mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d))));
        mesh.castShadow = true; mesh.receiveShadow = true;
        if (id) mesh.userData.place = id;
        mesh.computeBoundingSphere(); parent.add(mesh);
      }
      buckets.clear();
    }
    return { box: boxLocal, flush };
  }
  function dispose(): void { geometry.dispose(); materials.forEach(m => { m.map?.dispose(); m.dispose(); }); }
  return { batch, material, geometry, random, dispose };
}

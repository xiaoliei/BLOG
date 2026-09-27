import * as THREE from 'three';

export function createKit() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  let seed = 1729;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function material(color, texture = true) {
    const key = color + texture;
    if (materials.has(key)) return materials.get(key);
    let map = null;
    if (texture) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d');
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
  function batch(parent, id) {
    const buckets = new Map();
    function box(x, y, z, w, h, d, color, texture = true) {
      const mat = material(color, texture);
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push([x, y, z, w, h, d]);
    }
    function flush() {
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
    return { box, flush };
  }
  function dispose() { geometry.dispose(); materials.forEach(m => { m.map?.dispose(); m.dispose(); }); }
  return { batch, material, geometry, random, dispose };
}

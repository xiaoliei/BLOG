/* Shared Three.js scene helpers */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export { THREE };

export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

export function makeCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
  camera.position.set(0, 1.2, 18);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function addLights(scene, { cyan = true } = {}) {
  scene.add(new THREE.HemisphereLight(0x6484a8, 0x0a0f18, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(6, 9, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc7ff, 0.45);
  rim.position.set(-6, -2, -7);
  scene.add(rim);
  if (cyan) {
    const glow = new THREE.PointLight(0x1abc9c, 26, 30);
    glow.position.set(0, 0, 3.5);
    scene.add(glow);
  }
}

export function addFloorGrid(scene, { size = 40, divisions = 20, y = -4.2, opacity = 0.22 } = {}) {
  const grid = new THREE.GridHelper(size, divisions, 0x1abc9c, 0x2a4a6a);
  grid.position.y = y;
  grid.material.transparent = true;
  grid.material.opacity = opacity;
  scene.add(grid);

  // 坐标轴：X=cyan, Y=copper, Z=slate
  const axisLen = 4.4;
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, y, 0), new THREE.Vector3(axisLen, y, 0),
    new THREE.Vector3(0, y, 0), new THREE.Vector3(0, y + axisLen, 0),
    new THREE.Vector3(0, y, 0), new THREE.Vector3(0, y, axisLen),
  ]);
  const axisMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  const axis = new THREE.LineSegments(axisGeo, axisMat);
  scene.add(axis);
  return { grid, axis };
}

export function loadGLB(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.material.vertexColors = true;
            o.material.metalness = 0.0;
            o.material.roughness = 0.92;
          }
        });
        resolve(gltf.scene);
      },
      undefined,
      reject
    );
  });
}

export function frameAround(scene, object, { color = 0xe67e22, pad = 0.25, opacity = 0.9 } = {}) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3()).addScalar(pad * 2);
  const center = box.getCenter(new THREE.Vector3());
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const lines = new THREE.LineSegments(geo, mat);
  lines.position.copy(center);
  scene.add(lines);
  return lines;
}

export function measure(object) {
  let verts = 0;
  let tris = 0;
  object.traverse((o) => {
    if (o.isMesh) {
      verts += o.geometry.attributes.position.count;
      tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    }
  });
  return { verts, tris: Math.round(tris) };
}

export function resize(renderer, camera) {
  const canvas = renderer.domElement;
  const w = canvas.clientWidth || 1;
  const h = canvas.clientHeight || 1;
  if (canvas.width !== w * renderer.getPixelRatio() || canvas.height !== h * renderer.getPixelRatio()) {
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

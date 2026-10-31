import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smootherstep } from './entry-flight.js';

export const PLANET_SIZE = 360;
export const PLANET_TURN_DURATION = 2.65;
const BACK_TO_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const IDENTITY = new THREE.Quaternion();

export function planetCenter(seaLevel) {
  return new THREE.Vector3(0, seaLevel - .4 - PLANET_SIZE / 2, 0);
}

export function idlePlanetRotation(time = 0) {
  // Reproduce the old GLB's opening orientation, including its slight sway.
  const original = new THREE.Quaternion().setFromEuler(new THREE.Euler(.44 + Math.sin(time * .5) * .025, -.6, -.205));
  return original.multiply(BACK_TO_UP.clone().invert());
}

export function samplePlanetRotation(start, seconds) {
  return start.clone().slerp(IDENTITY, smootherstep(seconds / PLANET_TURN_DURATION));
}

// The cloud shell belongs to the landing globe. It fades out from 0.6 s to
// 1.6 s: the globe has turned by about a third and the camera is still far, so
// the blocks leave before the island becomes the close subject.
export const CLOUD_FADE = Object.freeze({ start: .6, end: 1.6 });

export function cloudOpacity(seconds) {
  return 1 - smootherstep((seconds - CLOUD_FADE.start) / (CLOUD_FADE.end - CLOUD_FADE.start));
}

// Indexed vertices only: both shells share one position buffer, so a bounding
// box reports the inflated cloud shell even for the opaque ground mesh.
export function indexedExtent(positions, indices) {
  let extent = 0;
  for(const index of indices){
    const offset = index * 3;
    extent = Math.max(extent, Math.abs(positions[offset]), Math.abs(positions[offset + 1]), Math.abs(positions[offset + 2]));
  }
  return extent;
}

function componentArray(attribute, width) {
  const values = new Float32Array(attribute.count * width);
  for(let i = 0; i < attribute.count; i++)for(let c = 0; c < width; c++)values[i * width + c] = attribute.getComponent(i, c);
  return values;
}

function indexArray(index) {
  const values = [];
  for(let i = 0; i < index.count; i++)values.push(index.getX(i));
  return values;
}

export function orbitalPose(aspect, seaLevel) {
  const distance = PLANET_SIZE / 2.5 * 18 / Math.min(1, aspect * 1.25);
  const target = planetCenter(seaLevel).add(new THREE.Vector3(0, -distance / 12, 0));
  return { position: target.clone().add(new THREE.Vector3(0, 0, distance)), target };
}

function disposeModel(model) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  model.traverse(object => {
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material) ? object.material : [object.material])if(material){
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  geometries.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
}

export async function buildEntryWorld(scene, town, { modelUrl, signal }) {
  const response = await fetch(modelUrl, { signal });
  if(!response.ok)throw new Error(`Earth HTTP ${response.status}`);
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  if(signal.aborted){disposeModel(gltf.scene);throw new Error('Earth load cancelled');}
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()));
  // mc_head is the opaque ground cube. mc_head_hat is the same cube inflated
  // into the cloud layer and shares its vertex buffer, so a bounding box
  // reports the cloud shell even for the ground mesh. Only the ground shell
  // sizes the model, which puts the island on the sea instead of on clouds.
  let groundRadius = 0, clouds = null;
  gltf.scene.traverse(object => {
    if(!object.isMesh)return;
    object.castShadow = object.receiveShadow = false;
    for(const material of Array.isArray(object.material) ? object.material : [object.material])if(material){
      material.metalness = 0; material.roughness = 1;
    }
    if(object.name === 'mc_head_hat'){clouds = object;return;}
    groundRadius = Math.max(groundRadius, indexedExtent(componentArray(object.geometry.getAttribute('position'), 3), indexArray(object.geometry.getIndex())));
  });
  if(!(groundRadius > 0))groundRadius = Math.max(bounds.getSize(new THREE.Vector3()).x, bounds.getSize(new THREE.Vector3()).y, bounds.getSize(new THREE.Vector3()).z) / 2;
  const scale = PLANET_SIZE / (groundRadius * 2);
  const center = planetCenter(town.world.environment.seaLevel);
  const root = new THREE.Group(), model = new THREE.Group();
  root.name = 'earth-with-backside-island';model.name = 'original-mc-head';
  root.position.copy(center);
  model.add(gltf.scene);model.scale.setScalar(scale);
  // The ground cube's local -Z face becomes the island's +Y sea surface at the
  // final pose, scaled from the ground shell so the island lands on the sea
  // rather than on the inflated cloud shell above it. The cloud shell is only
  // part of the landing globe: it fades out early in the flight and the whole
  // globe is gone once the sea takes over.
  model.quaternion.copy(BACK_TO_UP);root.add(model);
  const cloudMaterial = clouds?.material ?? null;
  let cloudAlpha = 1;
  function setCloudOpacity(value){
    if(!clouds || !cloudMaterial || value === cloudAlpha)return;
    cloudAlpha = value;clouds.visible = value > .001;
    cloudMaterial.transparent = value < 1;cloudMaterial.opacity = value;
    cloudMaterial.depthWrite = value >= 1;cloudMaterial.needsUpdate = true;
  }
  town.root.position.sub(center);root.add(town.root);scene.add(root);
  function updateMatrix(){root.updateWorldMatrix(true,true);}
  return {
    root, seaLevel:town.world.environment.seaLevel,
    setIdle(time){
      model.visible=true;setCloudOpacity(1);root.quaternion.copy(idlePlanetRotation(time));town.setOceanScale(.4);updateMatrix();
    },
    captureRotation(){return root.quaternion.clone();},
    setEntry(seconds,start){
      model.visible=true;setCloudOpacity(cloudOpacity(seconds));root.quaternion.copy(samplePlanetRotation(start,seconds));
      // Match the globe's back face first, then move the sea boundary beyond
      // the fog before the close approach can reveal a rectangular edge.
      town.setOceanScale(.4+.6*smootherstep((seconds-2.1)/.95));updateMatrix();
    },
    setWorld(){
      root.quaternion.identity();town.setOceanScale(1);updateMatrix();
      // At full sea size the original globe is entirely below the opaque sea.
      setCloudOpacity(0);model.visible=false;
    },
    worldPoint(point){return root.localToWorld(point.clone().sub(center));},
    dispose(){scene.remove(root);disposeModel(gltf.scene);root.clear();},
  };
}


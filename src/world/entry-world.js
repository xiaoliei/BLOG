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
  const size = bounds.getSize(new THREE.Vector3());
  gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()));
  gltf.scene.traverse(object => {
    if(object.isMesh){
      object.castShadow = object.receiveShadow = false;
      for(const material of Array.isArray(object.material) ? object.material : [object.material]){
        material.metalness = 0; material.roughness = 1;
      }
    }
  });
  const center = planetCenter(town.world.environment.seaLevel);
  const root = new THREE.Group(), model = new THREE.Group();
  root.name = 'earth-with-backside-island';model.name = 'original-mc-head';
  root.position.copy(center);
  model.add(gltf.scene);model.scale.setScalar(PLANET_SIZE / Math.max(size.x,size.y,size.z));
  // The original model's local -Z face becomes the island's +Y sea surface
  // at the final pose. Both model and real town rotate around the same center.
  model.quaternion.copy(BACK_TO_UP);root.add(model);
  town.root.position.sub(center);root.add(town.root);scene.add(root);
  function updateMatrix(){root.updateWorldMatrix(true,true);}
  return {
    root, seaLevel:town.world.environment.seaLevel,
    setIdle(time){
      model.visible=true;root.quaternion.copy(idlePlanetRotation(time));town.setOceanScale(.4);updateMatrix();
    },
    captureRotation(){return root.quaternion.clone();},
    setEntry(seconds,start){
      model.visible=true;root.quaternion.copy(samplePlanetRotation(start,seconds));
      // Match the globe's back face first, then move the sea boundary beyond
      // the fog before the close approach can reveal a rectangular edge.
      town.setOceanScale(.4+.6*smootherstep((seconds-2.1)/.95));updateMatrix();
    },
    setWorld(){
      root.quaternion.identity();town.setOceanScale(1);updateMatrix();
      // At full sea size the original globe is entirely below the opaque sea.
      model.visible=false;
    },
    worldPoint(point){return root.localToWorld(point.clone().sub(center));},
    dispose(){scene.remove(root);disposeModel(gltf.scene);root.clear();},
  };
}


import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smootherstep } from './entry-flight.ts';
import type { TownHandle } from './town.ts';

export const PLANET_SIZE = 360;
export const PLANET_TURN_DURATION = 2.65;
const BACK_TO_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const IDENTITY = new THREE.Quaternion();

export function planetCenter(seaLevel: number): THREE.Vector3 {
  return new THREE.Vector3(0, seaLevel - .4 - PLANET_SIZE / 2, 0);
}

export function idlePlanetRotation(time = 0): THREE.Quaternion {
  // Reproduce the old GLB's opening orientation, including its slight sway.
  const original = new THREE.Quaternion().setFromEuler(new THREE.Euler(.44 + Math.sin(time * .5) * .025, -.6, -.205));
  return original.multiply(BACK_TO_UP.clone().invert());
}

export function samplePlanetRotation(start: THREE.Quaternion, seconds: number): THREE.Quaternion {
  return start.clone().slerp(IDENTITY, smootherstep(seconds / PLANET_TURN_DURATION));
}

// The cloud shell belongs to the landing globe. It fades out from 0.6 s to
// 1.6 s: the globe has turned by about a third and the camera is still far, so
// the blocks leave before the island becomes the close subject.
export const CLOUD_FADE: Readonly<{ start: number; end: number }> = Object.freeze({ start: .6, end: 1.6 });

export function cloudOpacity(seconds: number): number {
  return 1 - smootherstep((seconds - CLOUD_FADE.start) / (CLOUD_FADE.end - CLOUD_FADE.start));
}

// Indexed vertices only: both shells share one position buffer, so a bounding
// box reports the inflated cloud shell even for the opaque ground mesh.
export function indexedExtent(positions: Float32Array, indices: number[]): number {
  let extent = 0;
  for(const index of indices){
    const offset = index * 3;
    extent = Math.max(extent, Math.abs(positions[offset]), Math.abs(positions[offset + 1]), Math.abs(positions[offset + 2]));
  }
  return extent;
}

function componentArray(attribute: THREE.BufferAttribute, width: number): Float32Array {
  const values = new Float32Array(attribute.count * width);
  for(let i = 0; i < attribute.count; i++)for(let c = 0; c < width; c++)values[i * width + c] = attribute.getComponent(i, c);
  return values;
}

function indexArray(index: THREE.BufferAttribute): number[] {
  const values: number[] = [];
  for(let i = 0; i < index.count; i++)values.push(index.getX(i));
  return values;
}

export interface OrbitalPose { position: THREE.Vector3; target: THREE.Vector3; }

export function orbitalPose(aspect: number, seaLevel: number): OrbitalPose {
  const distance = PLANET_SIZE / 2.5 * 18 / Math.min(1, aspect * 1.25);
  const target = planetCenter(seaLevel).add(new THREE.Vector3(0, -distance / 12, 0));
  return { position: target.clone().add(new THREE.Vector3(0, 0, distance)), target };
}

function disposeModel(model: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  model.traverse(object => {
    const mesh = object as THREE.Mesh;
    if(mesh.geometry)geometries.add(mesh.geometry);
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for(const material of mats)if(material){
      materials.add(material);
      for(const value of Object.values(material))if(value && (value as THREE.Texture).isTexture)textures.add(value as THREE.Texture);
    }
  });
  geometries.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
}

export interface EntryWorldHandle {
  root: THREE.Group;
  seaLevel: number;
  setIdle: (time: number) => void;
  captureRotation: () => THREE.Quaternion;
  setEntry: (seconds: number, start: THREE.Quaternion) => void;
  setWorld: () => void;
  worldPoint: (point: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
}

export async function buildEntryWorld(scene: THREE.Scene, town: TownHandle, { modelUrl, signal }: { modelUrl: string; signal: AbortSignal }): Promise<EntryWorldHandle> {
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
  let groundRadius = 0, clouds: THREE.Mesh | null = null;
  gltf.scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if(!mesh.isMesh)return;
    mesh.castShadow = mesh.receiveShadow = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for(const material of mats)if(material){
      const standard = material as THREE.MeshStandardMaterial;
      standard.metalness = 0; standard.roughness = 1;
    }
    if(mesh.name === 'mc_head_hat'){clouds = mesh;return;}
    const positionAttribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const indexAttribute = mesh.geometry.getIndex();
    groundRadius = Math.max(groundRadius, indexedExtent(componentArray(positionAttribute, 3), indexAttribute ? indexArray(indexAttribute) : []));
  });
  if(!(groundRadius > 0))groundRadius = Math.max(bounds.getSize(new THREE.Vector3()).x, bounds.getSize(new THREE.Vector3()).y, bounds.getSize(new THREE.Vector3()).z) / 2;
  // The cloud shell floats 0.25 units above the ground shell, and that rim
  // hangs past the globe's silhouette: its skin texels draw as intermittent
  // dashed fringes along the landing page edges. Keep the floating height and
  // clip only what projects outside the ground cube — each cloud fragment
  // casts the camera ray at the ground box and discards itself on a miss.
  const cloudMesh = clouds as THREE.Mesh | null;
  const cloudMaterial = cloudMesh ? (Array.isArray(cloudMesh.material) ? cloudMesh.material[0] : cloudMesh.material) as THREE.MeshStandardMaterial : null;
  if(cloudMesh && cloudMaterial){
    const groundHalf = (groundRadius - .01).toFixed(4);
    const groundBoxInverse: { value: THREE.Matrix4 } = { value: new THREE.Matrix4() };
    cloudMesh.onBeforeRender = () => { groundBoxInverse.value.copy(cloudMesh.matrixWorld).invert(); };
    cloudMaterial.onBeforeCompile = shader => {
      shader.uniforms.groundBoxInverse = groundBoxInverse;
      shader.vertexShader = 'varying vec3 vHeadLocal;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHeadLocal = position;');
      shader.fragmentShader = 'uniform mat4 groundBoxInverse;\nvarying vec3 vHeadLocal;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
	{
		vec3 headOrigin = (groundBoxInverse * vec4(cameraPosition, 1.0)).xyz;
		vec3 headSlope = 1.0 / (vHeadLocal - headOrigin);
		vec3 headA = (vec3(${groundHalf}) - headOrigin) * headSlope;
		vec3 headB = (-vec3(${groundHalf}) - headOrigin) * headSlope;
		float headEnter = max(max(min(headA.x, headB.x), min(headA.y, headB.y)), min(headA.z, headB.z));
		float headLeave = min(min(max(headA.x, headB.x), max(headA.y, headB.y)), max(headA.z, headB.z));
		if(max(headEnter, 0.0) > headLeave) discard;
	}`);
    };
  }
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
  let cloudAlpha = 1;
  function setCloudOpacity(value: number): void{
    if(!cloudMesh || !cloudMaterial || value === cloudAlpha)return;
    cloudAlpha = value;cloudMesh.visible = value > .001;
    cloudMaterial.transparent = value < 1;cloudMaterial.opacity = value;
    cloudMaterial.depthWrite = value >= 1;cloudMaterial.needsUpdate = true;
  }
  town.root.position.sub(center);root.add(town.root);scene.add(root);
  function updateMatrix(): void{root.updateWorldMatrix(true,true);}
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

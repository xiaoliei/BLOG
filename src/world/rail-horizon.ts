import * as THREE from 'three';
import { World } from './data.ts';
import type { World as WorldType } from './data.ts';
import { meshWorld } from './mesher.ts';
import { buildFaceGeometry } from './render-world.ts';
import type { WorldRenderer } from './render-world.ts';
import { smootherstep } from './entry-flight.ts';

// Render-only scenery continues the saved railway. Train travel and save
// boundaries stay independent of the distant visual horizon.
export const RAIL_HORIZON_LEFT = -800;
export const OCEAN_SIZE = 900;

export function railHorizonRange(oceanScale: number, left: number): [number, number] {
  const reveal = smootherstep((oceanScale - .4) / .6);
  // Finish inside the physical sea even on an ultra-wide view. At the globe
  // pose, hide the saved cutoff too, before its continuation can be revealed.
  const edge = OCEAN_SIZE * Math.max(.4, Math.min(1, oceanScale)) / 2 - 36;
  const initialEnd = Math.min(OCEAN_SIZE * .4 / 2 - 36, Math.abs(left) - 12);
  const end = edge + initialEnd - (OCEAN_SIZE * .4 / 2 - 36);
  return [end - 44 - 76 * reveal, end];
}

export const RAIL_REPEAT_LENGTH = 30;

export function railHorizonTile(world: WorldType): World {
  const tile = new World({id:'rail-horizon',cellSize:world.cellSize,bounds:world.bounds,environment:world.environment});
  const rail = world.environment.rail;
  if(!rail)return tile;
  const left = rail.left / world.cellSize, right = left + RAIL_REPEAT_LENGTH / world.cellSize;
  // Copy the authored western bridge cells, including rail lane shapes,
  // individual sleepers and stacked pillar details. Never mutate the save.
  for(const {cell,state} of world.blocks.values())
    if(cell[0]>=left&&cell[0]<right)tile.setBlock(cell,state,{checkSupport:false});
  return tile;
}

export interface RailHorizonHandle { root: THREE.Group; dispose: () => void; }

export function buildRailHorizon(world: WorldType, renderedWorld: WorldRenderer): RailHorizonHandle {
  const root = new THREE.Group(), resources: { dispose: () => void }[] = [];
  root.name = 'railway-horizon';
  const rail = world.environment.rail;
  if(rail){
    const facesByMaterial = new Map<THREE.Material, import('./mesher.ts').Face[]>();
    for(const chunk of meshWorld(railHorizonTile(world)))for(const face of chunk.faces){
      const material = renderedWorld.materialForFace(face);
      const list = facesByMaterial.get(material);
      if(list)list.push(face);
      else facesByMaterial.set(material,[face]);
    }
    // 30 units preserve the authored sleeper/pier rhythm and the original
    // two-unit texture repetition. Extension uses the exact town materials.
    const count = Math.ceil((rail.left - RAIL_HORIZON_LEFT) / RAIL_REPEAT_LENGTH);
    for(const [material,faces] of facesByMaterial){
      const {geometry} = buildFaceGeometry(faces,world.cellSize,renderedWorld.colorGain);
      const mesh = new THREE.InstancedMesh(geometry,material,count),matrix = new THREE.Matrix4();
      for(let i=0;i<count;i++)mesh.setMatrixAt(i,matrix.makeTranslation(-(i+1)*RAIL_REPEAT_LENGTH,0,0));
      mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);
      resources.push(mesh,geometry);
    }
  }
  return { root, dispose(){
    resources.forEach(resource=>resource.dispose());root.clear();
  }};
}

export interface RailHorizonFade {
  setScale: (scale: number, left: number) => void;
  update: () => void;
  dispose: () => void;
}

export function createRailHorizonFade(townRoot: THREE.Object3D, scenery: THREE.Object3D[], trainIds: string[] = []): RailHorizonFade {
  const range = { value: new THREE.Vector2() };
  const inverse = { value: new THREE.Matrix4() };
  const materials = new Map<THREE.Material, THREE.Material>();
  const meshes: THREE.Mesh[] = [];
  for(const group of scenery)group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if(!mesh.isMesh)return;
    // Keep the town's normal opaque materials and render ordering. Only the
    // distant bridge regions and its moving train need smooth transparency.
    const bounds = new THREE.Box3().setFromObject(mesh);
    if(bounds.max.x > -80 && !trainIds.includes(mesh.userData.entity))return;
    meshes.push(mesh);
    const clone = (material: THREE.Material): THREE.Material => {
      const cached = materials.get(material);
      if(cached)return cached;
      materials.set(material,material.clone());
      return materials.get(material) as THREE.Material;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
  });
  function attach(material: THREE.Material & { alphaHash?: boolean; onBeforeCompile: THREE.Material['onBeforeCompile']; customProgramCacheKey?: () => string }, shadow = false): void {
    material.alphaHash = shadow;
    material.transparent = !shadow;
    material.onBeforeCompile = shader => {
      shader.uniforms.railHorizonRange = range;
      shader.uniforms.townWorldInverse = inverse;
      shader.vertexShader = 'uniform mat4 townWorldInverse;\nvarying float railHorizonX;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        vec4 railHorizonPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          railHorizonPosition = instanceMatrix * railHorizonPosition;
        #endif
        railHorizonX = (townWorldInverse * modelMatrix * railHorizonPosition).x;
      `);
      shader.fragmentShader = 'uniform vec2 railHorizonRange;\nvarying float railHorizonX;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphahash_fragment>', `
        diffuseColor.a *= 1.0 - smoothstep(railHorizonRange.x, railHorizonRange.y, -railHorizonX);
        if(diffuseColor.a < 0.001)discard;
        #include <alphahash_fragment>
      `);
    };
    material.customProgramCacheKey = () => 'rail-horizon-v1';
    material.needsUpdate = true;
  }
  materials.forEach(material => attach(material as Parameters<typeof attach>[0]));
  // Shadows must lose the same distant detail, including an off-screen train.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  attach(depth as unknown as Parameters<typeof attach>[0], true);
  meshes.forEach(mesh => {if(mesh.castShadow)mesh.customDepthMaterial = depth;});
  return {
    setScale(scale, left){range.value.set(...railHorizonRange(scale, left));},
    update(){townRoot.updateWorldMatrix(true, false);inverse.value.copy(townRoot.matrixWorld).invert();},
    dispose(){depth.dispose();materials.forEach(material => material.dispose());},
  };
}

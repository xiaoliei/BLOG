import * as THREE from 'three';
import { World } from './data.js';
import { meshWorld } from './mesher.js';
import { buildFaceGeometry } from './render-world.js';
import { smootherstep } from './entry-flight.js';

// Render-only scenery continues the saved railway. Train travel and save
// boundaries stay independent of the distant visual horizon.
export const RAIL_HORIZON_LEFT = -800;
export const OCEAN_SIZE = 900;

export function railHorizonRange(oceanScale, left) {
  const reveal = smootherstep((oceanScale - .4) / .6);
  // Finish inside the physical sea even on an ultra-wide view. At the globe
  // pose, hide the saved cutoff too, before its continuation can be revealed.
  const edge = OCEAN_SIZE * Math.max(.4, Math.min(1, oceanScale)) / 2 - 36;
  const initialEnd = Math.min(OCEAN_SIZE * .4 / 2 - 36, Math.abs(left) - 12);
  const end = edge + initialEnd - (OCEAN_SIZE * .4 / 2 - 36);
  return [end - 44 - 76 * reveal, end];
}

export const RAIL_REPEAT_LENGTH = 30;

export function railHorizonTile(world) {
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

export function buildRailHorizon(world, renderedWorld) {
  const root = new THREE.Group(), resources = [];
  root.name = 'railway-horizon';
  const rail = world.environment.rail;
  if(rail){
    const surfaces = new Map();
    for(const chunk of meshWorld(railHorizonTile(world)))for(const face of chunk.faces){
      const material = renderedWorld.materialForFace(face);
      if(!surfaces.has(material))surfaces.set(material,[]);
      surfaces.get(material).push(face);
    }
    // 30 units preserve the authored sleeper/pier rhythm and the original
    // two-unit texture repetition. Extension uses the exact town materials.
    const count = Math.ceil((rail.left - RAIL_HORIZON_LEFT) / RAIL_REPEAT_LENGTH);
    for(const [material,faces] of surfaces){
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

export function createRailHorizonFade(townRoot, scenery, trainIds = []) {
  const range = { value: new THREE.Vector2() };
  const inverse = { value: new THREE.Matrix4() };
  const materials = new Map(), meshes = [];
  for(const group of scenery)group.traverse(object => {
    if(!object.isMesh)return;
    // Keep the town's normal opaque materials and render ordering. Only the
    // distant bridge regions and its moving train need smooth transparency.
    const bounds = new THREE.Box3().setFromObject(object);
    if(bounds.max.x > -80 && !trainIds.includes(object.userData.entity))return;
    meshes.push(object);
    const clone = material => {
      if(!materials.has(material))materials.set(material,material.clone());
      return materials.get(material);
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  function attach(material, shadow = false) {
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
  materials.forEach(material => attach(material));
  // Shadows must lose the same distant detail, including an off-screen train.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  attach(depth, true);
  meshes.forEach(mesh => {if(mesh.castShadow)mesh.customDepthMaterial = depth;});
  return {
    setScale(scale, left){range.value.set(...railHorizonRange(scale, left));},
    update(){townRoot.updateWorldMatrix(true, false);inverse.value.copy(townRoot.matrixWorld).invert();},
    dispose(){depth.dispose();materials.forEach(material => material.dispose());},
  };
}

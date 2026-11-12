import * as THREE from 'three';
import { renderWorld } from './render-world.ts';
import type { WorldRenderer, PickHit, WorldPickResult } from './render-world.ts';
import { renderEntities } from './entities.ts';
import type { EntitiesRenderer } from './entities.ts';
import { buildRailHorizon, createRailHorizonFade, OCEAN_SIZE } from './rail-horizon.ts';
import type { RailHorizonHandle } from './rail-horizon.ts';
import type { World, PlaceSpec, Vec3 } from './data.ts';
import type { MeshChunk } from './mesher.ts';

export interface TownPickResult {
  place: string | null;
  instance: string | null;
  /** 实体拾取没有体素单元格，占位零向量，调用方只消费 instance/place。 */
  cell: Vec3;
}

export interface TownHandle {
  root: THREE.Group;
  world: World;
  placeMap: Record<string, PlaceSpec>;
  pickables: THREE.Object3D[];
  setOceanScale: (value: number) => void;
  pick: (hit: PickHit | null | undefined) => TownPickResult | null;
  update: (t: number, trainTime?: number) => void;
  dispose: () => void;
}

export function buildTown(scene: THREE.Scene,world: World,{compact=false,preparedMesh=null}:{compact?: boolean;preparedMesh?: MeshChunk[]|null}={}): TownHandle{
 const staticWorld=renderWorld(world,preparedMesh),entities=renderEntities(world),root=new THREE.Group();
 const horizon=buildRailHorizon(world,staticWorld);
 root.add(staticWorld.root,entities.root,horizon.root);scene.add(root);
 const trainIds=world.entities.filter(entity=>entity.type==='train').map(entity=>entity.id);
 const horizonFade=createRailHorizonFade(root,[staticWorld.root,entities.root,horizon.root],trainIds);
 horizonFade.setScale(1,world.environment.rail?.left??-156);
 const waterGeometry=new THREE.PlaneGeometry(OCEAN_SIZE,OCEAN_SIZE),waterMaterial=new THREE.MeshLambertMaterial({color:world.environment.color});
 const water=new THREE.Mesh(waterGeometry,waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=world.environment.seaLevel;water.receiveShadow=true;root.add(water);
 const rippleGeometry=new THREE.BoxGeometry(1,.02,.14),rippleMaterial=new THREE.MeshLambertMaterial({color:'#69cce9'});
 const ripples=new THREE.InstancedMesh(rippleGeometry,rippleMaterial,compact?180:480),matrix=new THREE.Matrix4();
 let seed=world.seed;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<ripples.count;i++){matrix.compose(new THREE.Vector3(random()*240-130,world.environment.seaLevel+.03,random()*170-80),new THREE.Quaternion(),new THREE.Vector3(random()*2+.4,1,1));ripples.setMatrixAt(i,matrix);}
 ripples.computeBoundingSphere();root.add(ripples);
 const placeMap=Object.fromEntries(world.places.map(p=>[p.id,p])) as Record<string, PlaceSpec>;
 return {root,world,placeMap,pickables:[...staticWorld.pickables,...entities.pickables],
  setOceanScale(value){water.scale.set(value,value,1);horizonFade.setScale(value,world.environment.rail?.left??-156);},
  pick(hit){if(!hit)return null;const entity=hit.object.userData.entity as string|undefined;return entity?{instance:entity,place:(hit.object.userData.place as string|undefined)??null,cell:[0,0,0]}:staticWorld.pick(hit);},
  update(t,trainTime=t){entities.update(t,trainTime);ripples.position.x=Math.sin(t*.3)*.12;horizonFade.update();},
  dispose(){root.removeFromParent();horizonFade.dispose();horizon.dispose();staticWorld.dispose();entities.dispose();waterGeometry.dispose();waterMaterial.dispose();ripples.dispose();rippleGeometry.dispose();rippleMaterial.dispose();root.clear();},
 };
}

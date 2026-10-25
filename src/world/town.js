import * as THREE from 'three';
import { renderWorld } from './render-world.js';
import { renderEntities } from './entities.js';
import { buildRailHorizon, createRailHorizonFade, OCEAN_SIZE } from './rail-horizon.js';

export function buildTown(scene,world,{compact=false,preparedMesh=null}={}){
 const staticWorld=renderWorld(world,preparedMesh),entities=renderEntities(world),root=new THREE.Group();
 const horizon=buildRailHorizon(world,staticWorld);
 root.add(staticWorld.root,entities.root,horizon.root);scene.add(root);
 const horizonFade=createRailHorizonFade(root,[staticWorld.root,entities.root,horizon.root],world.entities.filter(entity=>entity.type==='train').map(entity=>entity.id));
 horizonFade.setScale(1,world.environment.rail?.left??-156);
 const waterGeometry=new THREE.PlaneGeometry(OCEAN_SIZE,OCEAN_SIZE),waterMaterial=new THREE.MeshLambertMaterial({color:world.environment.color});
 const water=new THREE.Mesh(waterGeometry,waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=world.environment.seaLevel;water.receiveShadow=true;root.add(water);
 const rippleGeometry=new THREE.BoxGeometry(1,.02,.14),rippleMaterial=new THREE.MeshLambertMaterial({color:'#69cce9'});
 const ripples=new THREE.InstancedMesh(rippleGeometry,rippleMaterial,compact?180:480),matrix=new THREE.Matrix4();
 let seed=world.seed;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<ripples.count;i++){matrix.compose(new THREE.Vector3(random()*240-130,world.environment.seaLevel+.03,random()*170-80),new THREE.Quaternion(),new THREE.Vector3(random()*2+.4,1,1));ripples.setMatrixAt(i,matrix);}
 ripples.computeBoundingSphere();root.add(ripples);
 const placeMap=Object.fromEntries(world.places.map(p=>[p.id,p]));
 return {root,world,placeMap,pickables:[...staticWorld.pickables,...entities.pickables],
  setOceanScale(value){water.scale.set(value,value,1);horizonFade.setScale(value,world.environment.rail?.left??-156);},
  pick(hit){if(!hit)return null;return hit.object.userData.entity?{instance:hit.object.userData.entity,place:hit.object.userData.place??null}:staticWorld.pick(hit);},
  update(t,trainTime=t){entities.update(t,trainTime);ripples.position.x=Math.sin(t*.3)*.12;horizonFade.update();},
  dispose(){root.removeFromParent();horizonFade.dispose();horizon.dispose();staticWorld.dispose();entities.dispose();waterGeometry.dispose();waterMaterial.dispose();ripples.dispose();rippleGeometry.dispose();rippleMaterial.dispose();root.clear();},
 };
}

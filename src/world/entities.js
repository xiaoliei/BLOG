import * as THREE from 'three';
import { createKit } from './voxel.js';
import { C } from './palette.js';

export function trainPose(time,rail){
 const leg=rail.travel+rail.dwell,cycle=((time%(leg*2))+leg*2)%(leg*2),west=cycle<leg;
 const u=Math.max(0,Math.min(1,((west?cycle:cycle-leg)-rail.dwell)/rail.travel)),s=u*u*(3-2*u);
 return {x:west?rail.centerMax+(rail.centerMin-rail.centerMax)*s:rail.centerMin+(rail.centerMax-rail.centerMin)*s,direction:west?-1:1,stopped:u===0||u===1};
}
// Dynamic geometry uses entity-local coordinates, not the static cell index.
export function renderEntities(world){
 const root=new THREE.Group(),kit=createKit(),updates=[],pickables=[];
 for(const e of world.entities){
  const g=new THREE.Group();g.position.set(...e.position);root.add(g);const b=kit.batch(g,e.place),box=b.box;
  if(e.type==='train'){
   const r=e.rail;
   for(let i=0;i<r.cars;i++){
    const x=(i-(r.cars-1)/2)*r.spacing;
    box(x,1.27,0,r.carLength,1.7,1.5,'#eec031');box(x,2.18,0,r.carLength+.1,.2,1.58,'#e5e8df');box(x,.57,0,r.carLength,.16,1.55,'#847954');
    for(const dx of [-1,0,1])for(const z of [-.765,.765]){box(x+dx,1.48,z,.63,.75,.06,C.glass);box(x+dx,1.02,z,.7,.07,.07,'#f8e3a0');}
    for(const dx of [-1.05,1.05])for(const z of [-.65,.65])box(x+dx,.24,z,.48,.48,.22,C.dark);
    if(i<r.cars-1)box(x+r.carLength/2+.16,.65,0,.35,.16,.18,C.dark);
   }
   for(const x of [-5.3,5.3]){box(x,1.48,0,.06,.72,1.05,C.glass);for(const z of [-.5,.5])box(x,1,z,.07,.18,.18,'#fff2b7',false);}
   updates.push((t,trainTime)=>{g.position.x=trainPose(trainTime,r).x;});
  }else if(e.type==='boat'){
   g.rotation.y=-.55;
   box(0,.05,0,2.8,.6,4.8,C.wood);box(0,.4,0,2.85,.2,4.9,C.cream);box(0,.58,0,2.3,.18,4.4,C.wood);
   for(const x of [-1.35,1.35])box(x,.7,0,.2,.6,4.6,C.wood);for(const z of [-2.3,2.3])box(0,.7,z,2.8,.6,.2,C.wood);
   box(0,2.9,0,.14,5.2,.14,C.trim);for(let i=0;i<7;i++)box(.2+i*.23,4.4-i*.2,0,.25,1.5+i*.4,.08,C.white);box(0,1.4,1.5,2, .13,.5,C.wood);
   updates.push(t=>{g.position.y=e.position[1]+Math.sin(t*1.1)*.08;g.rotation.z=Math.sin(t*.8)*.02;});
  }else if(e.type==='cat'){
   box(0,.15,0,.4,.45,.8,'#858f94');box(0,.48,.36,.48,.46,.4,C.white);
   for(const x of [-.17,.17]){box(x,.78,.35,.13,.19,.13,'#858f94');box(x,.53,.58,.06,.08,.03,C.dark);for(const z of [-.25,.25])box(x,-.08,z,.13,.25,.13,C.white);}
   box(0,.4,-.65,.12,.12,.6,'#858f94');updates.push(t=>{g.rotation.y=Math.sin(t*.3)*.3;});
  }else if(e.type==='gear'){
   g.scale.setScalar(1.4);box(0,0,0,1.5,1.5,.25,'#bac6cd');box(0,0,.15,.5,.5,.12,C.trim);
   for(const [x,y] of [[0,1],[0,-1],[1,0],[-1,0]])box(x,y,0,.55,.55,.3,'#bac6cd');updates.push(t=>{g.rotation.z=t*.18;});
  }else if(e.type==='smoke'){
   for(let i=0;i<3;i++)box(i*.2,i*.9,0,.45+i*.18,.45+i*.15,.45+i*.18,'#e5f0ec',false);
   updates.push(t=>{g.position.y=e.position[1]+(t*.25)%1;g.position.x=e.position[0]+Math.sin(t*.5)*.2;});
  }
  b.flush();g.traverse(o=>{if(o.isMesh){o.userData.entity=e.id;pickables.push(o);}});
 }
 return {root,pickables,update(t,trainTime=t){for(const fn of updates)fn(t,trainTime);},dispose(){root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});kit.dispose();root.clear();}};
}

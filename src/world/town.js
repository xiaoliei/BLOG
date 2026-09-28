import * as THREE from 'three';
import { createKit } from './voxel.js';
import { createLayout, GRID, RAIL, DOCK, trainAt, buildingAt } from './layout.js';
import { buildBuildings } from './buildings.js';
import { C } from './palette.js';

export function buildTown(scene, { compact = false } = {}) {
  const kit=createKit(), layout=createLayout();
  const root=new THREE.Group(); scene.add(root);
  const b=kit.batch(root), box=b.box, animated=[], pickables=[], extraResources=[];
  const water=new THREE.Mesh(new THREE.PlaneGeometry(900,900),kit.material('#25ade1',false));
  water.rotation.x=-Math.PI/2;water.position.y=-.18;water.receiveShadow=true;root.add(water);
  // A connected stepped landmass; rock, soil and grass have independent strata.
  for(const cell of layout.cells) {
    const {x,z,height:h,kind}=cell;
    if(kind==='sand'){box(x,h/2-.1,z,GRID,h+.2,GRID,C.sand);continue;}
    const vein=(Math.sin(Math.floor(x/2)*1.7+Math.floor(z/2)*2.3)+1)/2;
    const stoneH=h*(.46+vein*.3);
    box(x,stoneH/2-.16,z,GRID,stoneH+.3,GRID,C.stone);
    box(x,(h+stoneH)/2-.12,z,GRID,Math.max(.12,h-stoneH),GRID,C.dirt);
    const paving=kind==='path'||kind==='paving';
    box(x,h-.12,z,GRID,.24,GRID,paving?(kit.random()>.7?'#a9b6ac':C.path):(kit.random()>.8?C.grass2:C.grass));
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const next=layout.at(x+dx*GRID,z+dz*GRID),low=next?.height??0;
      if(h-low<.7)continue;
      // Broad, grounded rock ribs and shelves instead of a flat brown extrusion.
      if(h-low>1.5){
        const ribH=Math.min(h-.55,low+.8+(h-low)*(.3+vein*.45));
        box(x+dx*.2,ribH/2-.08,z+dz*.2,dx?GRID+.35:GRID,ribH+.16,dz?GRID+.35:GRID,vein>.5?'#a1aaa6':'#879593');
        if(vein>.6)box(x+dx*.24,ribH+.08,z+dz*.24,GRID+.12,.16,GRID+.12,C.grass2);
      }
      // Grass edges and exposed stone inclusions break up cliff walls without tall random stripes.
      box(x+dx*.38,h-.29,z+dz*.38,dx?.05:GRID,.2,dz?.05:GRID,paving?C.path:C.grass2);
      if(kit.random()>.55) {
        const y=low+.35+(h-low-.8)*kit.random();
        box(x+dx*.38,y,z+dz*.38,dx?.09:.38,.35,dz?.09:.38,kit.random()>.5?'#c5c5ad':'#a9aa98');
      }
    }
  }
  // Projecting buttresses: broad low shelves, offset middle blocks and broken tops.
  // Each block reaches below sea level, so side views never expose floating rocks.
  layout.rockClusters.forEach((c,i)=>{
    const tangent=[-c.dz,c.dx],stone=i%2?'#929f9f':'#a6b0aa';
    const pieces=[{out:.7,along:0,w:3.4,d:2.8,h:c.height*.3},
      {out:.55,along:-.65,w:2.3,d:2.35,h:c.height*.66},
      {out:.45,along:.95,w:1.65,d:1.7,h:c.height*.46},
      {out:.2,along:-.85,w:1.45,d:1.45,h:c.height*.92}];
    pieces.forEach((p,j)=>{
      const x=c.x+c.dx*p.out+tangent[0]*p.along,z=c.z+c.dz*p.out+tangent[1]*p.along;
      box(x,p.h/2-.18,z,c.dx?p.d:p.w,p.h+.36,c.dz?p.d:p.w,j%2?stone:'#b1bab3');
      if(j===2)box(x,p.h+.06,z,c.dx?p.d:p.w,.12,c.dz?p.d:p.w,C.grass2);
    });
  });
  // Every trunk base is sampled from the exact column that is rendered.
  function tree({x,z,y,type,scale:s}) {
    const shrub=type==='shrub',pink=type==='cherry',birch=type==='birch';
    const trunk=(shrub?.6:3.7)*s;
    box(x,y+trunk/2,z,(shrub?.25:.55)*s,trunk,(shrub?.25:.55)*s,birch?'#eee8d4':C.wood);
    if(birch)for(let i=0;i<4;i++)box(x+.08,y+.4+i*.7*s,z+.285*s,.3*s,.12*s,.03,'#585c49');
    const step=(shrub?.65:1)*s,base=y+trunk-(shrub?0:.5*s);
    const palette=pink?['#f291c8','#f7acda','#e97eba']:['#5baa36','#74bd40','#499d32'];
    for(let ix=-2;ix<=2;ix++)for(let iz=-2;iz<=2;iz++)for(let iy=0;iy<3;iy++){
      if(Math.abs(ix)+Math.abs(iz)>(iy===2?2:3)||iy===0&&Math.abs(ix)+Math.abs(iz)>2)continue;
      box(x+ix*step,base+(iy+.5)*step,z+iz*step,step,step,step,palette[(ix+iz+iy+9)%3]);
    }
    if(!shrub){box(x+.7*s,y+trunk*.75,z,.9*s,.25*s,.25*s,C.wood);box(x-.55*s,y+trunk*.6,z,.8*s,.25*s,.25*s,C.wood);}
  }
  layout.trees.forEach(tree);
  function ground(x,z){return layout.at(x,z)?.height??null;}
  function fence(x,z,length,axis='x') {
    for(let t=0;t<=length;t+=1.5) {
      const px=x+(axis==='x'?t:0),pz=z+(axis==='z'?t:0),y=ground(px,pz);
      if(y===null||layout.nearestPath(px,pz).distance<1.35)continue;
      box(px,y+.7,pz,.18,1.4,.18,C.wood);
      if(t+1.5<=length)for(const dy of [.4,.98])box(px+(axis==='x'?.75:0),y+dy,pz+(axis==='z'?.75:0),axis==='x'?1.5:.12,.14,axis==='z'?1.5:.12,C.wood);
    }
  }
  [[-25,-14,9],[-27,1,8,'z'],[-22,23,10],[23,-16,6],[7,-13,7,'z'],[24,10,5,'z'],[-22,-16,4],[12,-18,3],[19,-18,5]].forEach(args=>fence(...args));
  function lantern(x,z) {
    const y=ground(x,z);if(y===null)return;
    box(x,y+1.75,z,.19,3.5,.19,C.trim);box(x+.4,y+3.5,z,1,.17,.2,C.trim);
    box(x+.75,y+3,z,.5,.7,.5,'#ffd15d',false);
    box(x+.75,y+3.4,z,.7,.16,.7,C.trim);box(x+.75,y+2.6,z,.7,.16,.7,C.trim);
  }
  [[-22,19],[-10,17],[-7,6],[6,10],[15,11],[24,10],[-21,-16],[17,-18],[8,-3]].forEach(([x,z])=>lantern(x,z));
  function flower(x,y,z,color) {
    box(x,y+.2,z,.08,.4,.08,'#3c9c36');box(x,y+.43,z,.28,.16,.28,color);
    box(x-.11,y+.18,z,.18,.1,.1,C.leaf);box(x+.11,y+.1,z,.18,.1,.1,C.leaf);
  }
  // Gardens follow the reference's west slope, east slope and bookshop headland.
  for(const c of layout.cells) {
    if(c.kind!=='grass'||c.islet||buildingAt(c.x,c.z,1.3)||Math.abs(c.z-RAIL.z)<2.5&&c.x<RAIL.right+1)continue;
    if(layout.nearestPath(c.x,c.z).distance<1.25)continue;
    if(compact&&(Math.round(c.x/GRID)+Math.round(c.z/GRID))%2!==0)continue;
    if(kit.random()<.105)flower(c.x,c.height,c.z,['#f4d33b','#faf5d7','#f16861'][Math.floor(kit.random()*3)]);
    else if(kit.random()<.15){for(let i=0;i<3;i++)box(c.x+(i-1)*.15,c.height+.18+i*.04,c.z,.08,.36+i*.08,.16,i%2?'#58a832':'#81c941');}
    else if(kit.random()<.016)box(c.x,c.height+.18,c.z,.5,.36,.45,'#a2aba0');
  }
  function crate(x,z,s=.8) {
    const y=ground(x,z);if(y===null)return;
    box(x,y+s/2,z,s,s,s,C.wood);
    for(const dy of [.12,s-.12])box(x,y+dy,z+s/2+.02,s+.02,.1,.06,C.trim);
    for(const dx of [-s/2+.1,s/2-.1])box(x+dx,y+s/2,z+s/2+.03,.1,s,.06,C.trim);
  }
  function planter(x,z) {
    const y=ground(x,z);if(y===null)return;
    box(x,y+.3,z,.9,.6,.65,C.wood);box(x,y+.64,z,.83,.12,.58,'#645239');
    for(let i=0;i<3;i++)flower(x-.25+i*.25,y+.66,z,i%2?'#f1d94f':'#ee7979');
  }
  [[-21,17.5],[-12.5,17.5],[16,9.5],[24,9.5],[-3,6.5],[4.8,6.5],[-22,-16.5]].forEach(([x,z])=>planter(x,z));
  [[-12,18],[15.5,9.5],[24.7,8],[-22,-18]].forEach(([x,z])=>crate(x,z));
  function bench(x,z) {
    const y=ground(x,z);if(y===null)return;
    box(x,y+.8,z,2.1,.16,.65,C.wood);box(x,y+1.3,z-.3,2.1,.65,.14,C.wood);
    for(const dx of [-.8,.8])box(x+dx,y+.4,z,.17,.8,.5,C.trim);
  }
  bench(-10,20);bench(-22,-16);bench(21,-17.5);
  // Layered vegetable beds, rather than empty lawns between distant landmarks.
  for(const [x,z] of [[-24,-5],[-11,-7],[23,-9],[-16,25]])for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const px=x+col*.6,pz=z+row*.7,c=layout.at(px,pz);
    if(!c||c.kind!=='grass'||layout.nearestPath(px,pz).distance<1.6||buildingAt(px,pz,1))continue;
    box(px,c.height+.06,pz,.58,.12,.65,'#816237');box(px,c.height+.3,pz,.28,.45,.28,row%2?'#73b23d':'#549b35');
  }
  buildBuildings(root,kit,pickables,animated,extraResources);

  // Cottage laundry and cat sit on its own garden terrace.
  for(const x of [5,8]){const y=ground(x,5);box(x,y+1.2,5,.14,2.4,.14,C.wood);}
  box(6.5,7.35,5,3,.04,.04,C.trim);
  for(let i=0;i<3;i++)box(5.55+i*.85,6.9,5,.65,.9,.06,i%2?'#78b4e5':C.white);
  const cat=new THREE.Group();cat.position.set(-2,ground(-2,6.5)+.24,6.5);root.add(cat);const cb=kit.batch(cat);
  cb.box(0,.15,0,.4,.45,.8,'#858f94');cb.box(0,.48,.36,.48,.46,.4,C.white);
  for(const x of [-.17,.17]){cb.box(x,.78,.35,.13,.19,.13,'#858f94');cb.box(x,.53,.58,.06,.08,.03,C.dark);for(const z of [-.25,.25])cb.box(x,-.08,z,.13,.25,.13,C.white);}
  cb.box(0,.4,-.65,.12,.12,.6,'#858f94');cb.flush();animated.push(t=>{cat.rotation.y=Math.sin(t*.3)*.3;});

  // Continuous westward trestle railway, physically separated from all five buildings.
  const railDeck=RAIL.top-.38;
  box((RAIL.left+RAIL.right)/2,railDeck-.2,RAIL.z,RAIL.right-RAIL.left,.4,2.3,C.wood);
  for(let x=RAIL.left;x<=RAIL.right;x+=.7)box(x,RAIL.top-.18,RAIL.z,.24,.2,2.05,'#72543a');
  for(const z of [RAIL.z-.63,RAIL.z+.63])box((RAIL.left+RAIL.right)/2,RAIL.top-.05,z,RAIL.right-RAIL.left,.1,.12,'#72858b');
  for(let x=RAIL.left+1;x<RAIL.right;x+=5){
    for(const z of [RAIL.z-.83,RAIL.z+.83]){
      const base=Math.min(layout.at(x,z)?.height??-.6,railDeck-.6);
      box(x,(railDeck+base)/2,z,.35,railDeck-base,.35,C.trim);
    }
    box(x,railDeck-1.1,RAIL.z,.5,.2,2.7,C.wood);
  }
  // Buffer is beyond the nose of the entire three-car consist.
  for(const z of [RAIL.z-.65,RAIL.z+.65])box(5.75,RAIL.top+.5,z,.3,1,.3,'#943f31');
  box(5.75,RAIL.top+.8,RAIL.z,.25,.22,1.65,'#deaa45');
  // Platform north of station hall, clear of the rail loading gauge.
  box(-17,7.25,-24.3,10,.5,1.3,C.path);
  for(let x=-21.5;x<-12;x+=.6)box(x,7.55,-24.85,.3,.04,.12,'#f2d253');
  const train=new THREE.Group();root.add(train);train.position.z=RAIL.z;train.position.y=RAIL.top;
  const tb=kit.batch(train);
  for(let i=0;i<RAIL.cars;i++){
    const x=(i-(RAIL.cars-1)/2)*RAIL.spacing;
    tb.box(x,1.27,0,RAIL.carLength,1.7,1.5,'#eec031');
    tb.box(x,2.18,0,RAIL.carLength+.1,.2,1.58,'#e5e8df');
    tb.box(x,.57,0,RAIL.carLength,.16,1.55,'#847954');
    for(const dx of [-1,0,1])for(const z of [-.765,.765]){
      tb.box(x+dx,1.48,z,.63,.75,.06,C.glass);tb.box(x+dx,1.02,z,.7,.07,.07,'#f8e3a0');
    }
    for(const dx of [-1.05,1.05])for(const z of [-.65,.65])tb.box(x+dx,.24,z,.48,.48,.22,C.dark);
    if(i<RAIL.cars-1)tb.box(x+RAIL.carLength/2+.16,.65,0,.35,.16,.18,C.dark);
  }
  for(const x of [-5.3,5.3]){tb.box(x,1.48,0,.06,.72,1.05,C.glass);for(const z of [-.5,.5])tb.box(x,1,z,.07,.18,.18,'#fff2b7',false);}
  tb.flush();const updateTrain=t=>{const pose=trainAt(t);train.position.x=pose.x;train.userData.motion=pose;};

  // West-bank approach turns east, then opens into the broad south landing.
  for(const p of [DOCK.neck,DOCK.landing]){
    const planks=Math.ceil(p.width/.4),pw=p.width/planks;
    for(let i=0;i<planks;i++)box(p.x-p.width/2+(i+.5)*pw,DOCK.height-.12,p.z,pw-.025,.24,p.depth,i%2?'#c69453':'#b57d3d');
  }
  for(const [x,z] of [[-3.5,19.8],[-3.5,22.2],[-1,19.8],[1,20.8],[-.5,24],[-.5,27],[6.5,21],[6.5,24],[6.5,27],[3,27]]){
    box(x,1,z,.45,3.8,.45,C.wood);box(x,2.95,z,.58,.2,.58,C.trim);
  }
  const boat=new THREE.Group();boat.position.set(DOCK.boat[0],.55,DOCK.boat[1]);boat.rotation.y=-.55;root.add(boat);const boatB=kit.batch(boat);
  boatB.box(0,.05,0,2.8,.6,4.8,C.wood);boatB.box(0,.4,0,2.85,.2,4.9,C.cream);
  boatB.box(0,.58,0,2.3,.18,4.4,C.wood);
  for(const x of [-1.35,1.35])boatB.box(x,.7,0,.2,.6,4.6,C.wood);
  for(const z of [-2.3,2.3])boatB.box(0,.7,z,2.8,.6,.2,C.wood);
  boatB.box(0,2.9,0,.14,5.2,.14,C.trim);
  for(let i=0;i<7;i++)boatB.box(.2+i*.23,4.4-i*.2,0,.25,1.5+i*.4,.08,C.white);
  boatB.box(0,1.4,1.5,2,.13,.5,C.wood);boatB.flush();
  animated.push(t=>{boat.position.y=.55+Math.sin(t*1.1)*.08;boat.rotation.z=Math.sin(t*.8)*.02;});
  // Nearby surf accents follow the actual coast and the satellite islets.
  for(const cell of layout.cells)if(cell.kind==='sand'&&kit.random()>.6){
    for(const [dx,dz] of [[1,0],[0,1]])if(!layout.at(cell.x+dx*GRID,cell.z+dz*GRID))box(cell.x+dx*.55,-.09,cell.z+dz*.55,dx?.13:.6,.03,dz?.13:.6,'#a0e0ec',false);
  }
  const ripples=new THREE.Group();root.add(ripples);const rb=kit.batch(ripples);
  for(let i=0;i<(compact?180:480);i++){const x=kit.random()*240-130,z=kit.random()*170-80;if(layout.at(x,z))continue;rb.box(x,-.13,z,kit.random()*2+.4,.02,.14,i%2?'#69cce9':'#46bde3',false);}
  rb.flush();animated.push(t=>{ripples.position.x=Math.sin(t*.3)*.12;});
  b.flush();
  const smoke=new THREE.Group();smoke.position.set(22.43,15.9,4.2);root.add(smoke);const sm=kit.batch(smoke);
  for(let i=0;i<3;i++)sm.box(i*.2,i*.9,0,.45+i*.18,.45+i*.15,.45+i*.18,'#e5f0ec',false);
  sm.flush();animated.push(t=>{smoke.position.y=15.9+(t*.25)%1;smoke.position.x=22.43+Math.sin(t*.5)*.2;});
  return {
    root,pickables,layout,
    update(t,trainTime=t){animated.forEach(fn=>fn(t));updateTrain(trainTime);},
    dispose(){water.geometry.dispose();extraResources.forEach(r=>r.dispose());kit.dispose();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});scene.remove(root);},
  };
}

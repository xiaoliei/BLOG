import { World } from './data.js';
import { createLayout, RAIL, DOCK, buildingAt } from './layout.js';
import { HARBOR_PLACES } from './harbor-layout.js';
import { C } from './palette.js';
import { hasClearance, validateHarbor } from './harbor-validation.js';

// This is an offline authoring module. The browser loads its output, not this file.
export function generateHarbor() {
 const places=HARBOR_PLACES.map(p=>({...p,entry:[p.position[0],p.position[1],Math.round((p.position[2]+p.size[2]/2+.5)*2)/2],label:[p.position[0],p.position[1]+p.size[1]+.6,p.position[2]],camera:{desktopOffset:p.id==='workshop'?[6,17,32]:[15,17,29],desktopTarget:[6,4,0],mobileOffset:[17,23,49],mobileTarget:[0,1,0]}}));
 const world=new World({places,environment:{seaLevel:-.18,color:'#25ade1',rail:RAIL,dock:{...DOCK,height:2.5}}});
 const layout=createLayout(),columns=new Map();let randomSeed=1729,serial=0;
 const random=()=>{randomSeed=(randomSeed*1664525+1013904223)>>>0;return randomSeed/4294967296;};
 const state=(model,color,props={},place)=>({model,color,props,...(place?{place}:{})});
 const put=(p,color,model='cube',props={},place)=>world.setBlock(p,state(model,color,props,place),{replace:true,checkSupport:false});
 // Authored volumes are snapped once at their edges, then expanded to real cells.
 function volume(x,y,z,w,h,d,color,{model='cube',props={},place,emptyOnly=false}={}) {
  const min=[x-w/2,y,z-d/2].map(v=>Math.round(v*2)),max=[x+w/2,y+h,z+d/2].map(v=>Math.round(v*2));
  for(let iy=min[1];iy<Math.max(min[1]+1,max[1]);iy++)for(let iz=min[2];iz<Math.max(min[2]+1,max[2]);iz++)for(let ix=min[0];ix<Math.max(min[0]+1,max[0]);ix++)if(!emptyOnly||!world.getOccupant([ix,iy,iz]))put([ix,iy,iz],color,model,props,place);
 }
 const clear=(min,max)=>{for(let y=min[1];y<max[1];y++)for(let z=min[2];z<max[2];z++)for(let x=min[0];x<max[0];x++)world.removeAt([x,y,z]);};
 function instance(model,anchor,color,props={},place,required=false){
  const spec={id:`${model}-${String(serial++).padStart(5,'0')}`,anchor,state:world.intern(state(model,color,props,place))};
  const furniture=!required&&['planter','lamp','crate','bench','chalkboard'].includes(model);
  // Keep optional furniture beside the existing pavement, never across its aisle.
  for(const [dx,dz] of furniture?[[0,0],[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]]:[[0,0]]){
   const candidate={...spec,anchor:[anchor[0]+dx,anchor[1],anchor[2]+dz]};
   if(furniture&&world.instanceCells(candidate).some(([x,,z])=>['path','paving'].includes(columns.get(`${x},${z}`)?.kind)))continue;
   try{return world.placeInstance(candidate);}catch(e){if(required)throw e;}
  }return null;
 }
 const columnAt=(x,z)=>columns.get(`${Math.floor(x*2)},${Math.floor(z*2)}`);
 const ground=(x,z)=>columnAt(x,z)?.height??null;
 for(let x=-70;x<=70;x++)for(let z=-70;z<=74;z++){
  const c=layout.at((x+.5)/2,(z+.5)/2);if(!c)continue;
  columns.set(`${x},${z}`,{...c,x,z,height:Math.round(c.height*4)/4});
 }
 // A quarter-world-unit riser is half a cell. Smooth only the existing road network.
 const roads=[...columns.values()].filter(c=>['path','paving'].includes(c.kind));
 for(let pass=0;pass<300;pass++){let changed=false;for(const c of roads)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const n=columns.get(`${c.x+dx},${c.z+dz}`);if(n&&['path','paving'].includes(n.kind)&&c.height<n.height-.25){c.height=n.height-.25;changed=true;}
 }if(!changed)break;}
 for(const c of columns.values()){
  const h=c.height*2,paved=['path','paving'].includes(c.kind),vein=(Math.sin(c.x*.43+c.z*.62)+1)/2;
  for(let y=-1;y<Math.ceil(h);y++){
   const top=y===Math.ceil(h)-1,color=c.kind==='sand'?C.sand:top?(paved?(random()>.7?'#a9b6ac':C.path):(random()>.8?C.grass2:C.grass)):y<h*(.46+vein*.3)?C.stone:C.dirt;
   put([c.x,y,c.z],color,top&&h%1?'slab':'cube',top&&h%1?{half:'bottom'}:{});
  }
 }
 // Retain the original projecting coastal rock groups, now made of solid cells.
 for(const [i,c] of layout.rockClusters.entries()){
  for(const p of [{out:.7,along:0,w:3.4,d:2.8,h:c.height*.3},{out:.55,along:-.65,w:2.3,d:2.35,h:c.height*.66},{out:.45,along:.95,w:1.65,d:1.7,h:c.height*.46}]){
   const x=c.x+c.dx*p.out-c.dz*p.along,z=c.z+c.dz*p.out+c.dx*p.along;
   volume(x,-.5,z,c.dx?p.d:p.w,p.h+.5,c.dz?p.d:p.w,i%2?'#929f9f':'#a6b0aa',{emptyOnly:true});
  }
 }
 // Buildings retain their old anchors, palettes and gabled profiles, with hollow interiors.
 for(const p of places){
  const [x,y,z]=p.position,[w,,d]=p.size,id=p.id,wallH=id==='bookshop'?7:id==='workshop'?5.5:4;
  const wall=id==='workshop'?'#bd7552':id==='bookshop'?C.cream:C.white;
  const roof={bookshop:'#2e914b',workshop:'#ed852e',cottage:'#e45d60',station:'#327bb6',observatory:'#2f84c1'}[id];
  const x0=Math.round((x-w/2)*2),x1=Math.round((x+w/2)*2),z0=Math.round((z-d/2)*2),z1=Math.round((z+d/2)*2),base=y*2,top=base+wallH*2;
  // Flatten/support the original foundation footprint, including a front doorstep.
  for(let ix=x0-1;ix<=x1;ix++)for(let iz=z0-1;iz<=z1+1;iz++){
   for(let iy=-1;iy<base;iy++)if(!world.getBlock([ix,iy,iz])||iy===base-1)put([ix,iy,iz],iy===base-1?C.path:C.stone);
   clear([ix,base,iz],[ix+1,base+1,iz+1]);
  }
  for(let iy=base;iy<top;iy++)for(let ix=x0;ix<x1;ix++)for(let iz=z0;iz<z1;iz++){
   if(ix!==x0&&ix!==x1-1&&iz!==z0&&iz!==z1-1)continue;
   const timber=(ix===x0||ix===x1-1)&&(iz===z0||iz===z1-1)||iy===top-1||id==='bookshop'&&iy===base+6;
   put([ix,iy,iz],timber?C.wood:wall,'cube',{},id);
  }
  // Window blocks replace wall cells, so the openings are not painted over solid walls.
  const window=(cx,by,iz)=>{clear([cx,base+by,iz],[cx+2,base+by+3,iz+1]);instance('window',[cx,base+by,iz],C.cream,{width:2,height:3},id,true);};
  window(x0+2,2,z1-1);window(x1-4,2,z1-1);
  clear([Math.round(x*2)-1,base+3,z0],[Math.round(x*2)+1,base+6,z0+1]);
  instance('window',[Math.round(x*2),base+3,z0],C.cream,{width:2,height:3,facing:'north'},id,true);
  if(id==='bookshop'){window(x0+2,9,z1-1);window(x1-4,9,z1-1);}
  for(let iy=base+2;iy<base+5;iy++)for(let iz=Math.round(z*2)-1;iz<=Math.round(z*2);iz++)put([x1-1,iy,iz],C.cream,'window',{facing:'east'},id);
  const doorX=Math.round(x*2)-1;
  clear([doorX,base,z1-1],[doorX+2,base+5,z1]);
  if(id!=='workshop')instance('door',[doorX,base,z1-1],C.wood,{},id,true);
  else clear([doorX-2,base,z1-1],[doorX+4,base+7,z1]);
  if(id==='observatory'){
   for(let level=0;level<8;level++){
    const r=Math.sqrt(Math.max(0,3.75**2-(level*.46)**2));
    for(let ix=-8;ix<=7;ix++)for(let iz=-8;iz<=7;iz++){
     const distance=Math.hypot((ix+.5)/2,(iz+.5)/2);
     if(distance<r&&distance>r-.65)put([x*2+ix,top+level,z*2+iz],Math.abs(ix)<1?C.white:roof,'cube',{},id);
    }
   }
   volume(x,wallH+y+3.5,z,2.5,.5,2.5,roof,{place:id});
   instance('telescope',[x*2-1,top+8,z*2-1],'#e2eceb',{},id,true);
  }else{
   const left=x0-1,right=x1,layers=Math.ceil((right-left+1)/2);
   for(let k=0;k<layers;k++){
    const ix0=left+k,ix1=right-k,iy=top+k;
    for(let iz=z0-1;iz<=z1;iz++){
     put([ix0,iy,iz],roof,id==='workshop'?'roof-tile':'stairs',id==='workshop'?{}:{facing:'east'},id);
     if(ix1>ix0)put([ix1,iy,iz],roof,id==='workshop'?'roof-tile':'stairs',id==='workshop'?{}:{facing:'west'},id);
    }
    for(let ix=ix0+1;ix<ix1;ix++){
     for(const iz of [z0,z1-1])put([ix,iy,iz],wall,'cube',{},id);
     // Stepped coloured end tiles preserve the original roof silhouette and fascia.
     for(const iz of [z0-1,z1])put([ix,iy,iz],roof,'cube',{},id);
    }
   }
   // A continuous ridge hides the meeting edge of opposing stair treads.
   for(let iz=z0-1;iz<=z1;iz++)put([Math.floor((left+right)/2),top+layers-1,iz],roof,'slab',{half:'bottom'},id);
  }
  if(id==='bookshop'){
   for(let ix=x0;ix<x1;ix++)for(let iz=z1;iz<z1+3;iz++)put([ix,base+6,iz],Math.floor((ix-x0)/2)%2?C.white:'#56ad66','slab',{half:'bottom'},id);
   for(const ix of [x0,x1-1])for(let iy=base;iy<base+6;iy++)put([ix,iy,z1+2],C.wood,'pillar',{width:.25},id);
   for(const cx of [x0+2,x1-5])for(let ix=cx;ix<cx+3;ix++)for(let iy=base;iy<base+5;iy++)put([ix,iy,z1],C.wood,'bookshelf',{},id);
   for(let ix=doorX-1;ix<=doorX+2;ix++)for(let iy=base+8;iy<base+12;iy++)put([ix,iy,z1],C.wood,'bookshelf',{},id);
   instance('sign',[x1+1,base+5,z1],C.wood,{},id,true);
   for(let ix=x1-1;ix<x1+3;ix++)put([ix,base+7,z1],C.trim,'pillar',{axis:'x',width:.25},id);
  }
  if(id==='workshop'){
   // Preserve the original green tool bay and anvil bench, recessed off the pavement.
   clear([x*2-4,base,z1-5],[x*2+4,base+8,z1]);
   instance('workshop-bay',[x*2-4,base,z1-5],C.wood,{},id,true);
   instance('anvil-bench',[x*2-3,base,z1-3],C.wood,{},id,true);
   for(let ix=x*2-4;ix<x*2+4;ix++)put([ix,base+8,z1-1],C.wood,'cube',{},id);
   for(const ix of [x*2-5,x*2+4])for(let iy=base;iy<base+8;iy++)put([ix,iy,z1-1],C.wood,'cube',{},id);
   for(const ix of [x0,x1-1])for(const iy of [base+1,base+3,base+5,base+7])put([ix,iy,z1],'#d39063','brick-accent',{},id);
   world.entities.push({id:'workshop-gear',type:'gear',position:[x,y+7.2,z+d/2+.7],place:id});
  }
  if(id==='cottage'||id==='workshop'){
   const chimneyAnchor=[Math.round((x+w*.27)*2)-1,top+2,Math.round((z-.8)*2)-1];
   clear(chimneyAnchor,[chimneyAnchor[0]+2,chimneyAnchor[1]+6,chimneyAnchor[2]+2]);
   instance('chimney',chimneyAnchor,C.stone,{},id,true);
  }
  // Facade furniture belongs to the same saved place; the centre doorway stays clear.
  for(const lx of id==='workshop'?[x0+1,x1-2]:[doorX-1,doorX+2])
   instance('wall-lantern',[lx,base+3,z1],C.trim,{},id,true);
  for(let ix=doorX;ix<doorX+2;ix++)put([ix,base-1,z1],C.wood,'cube',{},id);
  if(id==='bookshop'){
   instance('planter',[x0-1,base,z1],'#ee7979',{},id,true);
   instance('planter',[x1-2,base,z1],'#f4d33b',{},id,true);
   instance('chalkboard',[x0-3,base,z1+2],C.wood,{},id);
  }else if(id==='workshop'){
   // Three hanging tools are part of the recessed bay.
   for(const [cx,cy,cz] of [[x1-2,base,z1],[x1-1,base,z1],[x1-2,base+1,z1]])instance('crate',[cx,cy,cz],C.wood,{},id,true);
   instance('planter',[x0-1,base,z1+1],'#f4d33b',{},id,true);
  }else{
   for(const cx of [x0+2,x1-4])instance('planter',[cx,base,z1],'#ee7979',{},id,true);
   if(id==='station')instance('station-clock',[doorX,base+5,z1],C.wood,{},id,true);
   if(id==='observatory')instance('plaque',[doorX,base+6,z1],'#327bb6',{},id,true);
  }
 }
 // Preserve existing tree locations and species; expand crowns into individual cubes.
 for(const t of layout.trees){
  const x=Math.floor(t.x*2),z=Math.floor(t.z*2),h=ground(t.x,t.z);if(h===null)continue;
  const base=Math.ceil(h*2),shrub=t.type==='shrub',trunk=Math.max(1,Math.round((shrub?.6:3.7)*t.scale*2));
  // A full soil cap provides a precise root surface on former half-height terrain.
  if(h*2!==base)put([x,base-1,z],C.grass);
  for(let i=0;i<trunk;i++)if(!world.getOccupant([x,base+i,z])){
   if(t.type==='birch')put([x,base+i,z],'#eee8d4','birch-log',{variant:((i+x-z)%4+4)%4});
   else put([x,base+i,z],C.wood,'pillar',{width:shrub?.5:1});
  }
  const step=Math.max(1,Math.round((shrub?.65:1)*t.scale*2)),palette=t.type==='cherry'?['#f291c8','#f7acda','#e97eba']:['#5baa36','#74bd40','#499d32'];
  for(let ix=-2;ix<=2;ix++)for(let iz=-2;iz<=2;iz++)for(let iy=0;iy<3;iy++){
   if(Math.abs(ix)+Math.abs(iz)>(iy===2?2:3)||iy===0&&Math.abs(ix)+Math.abs(iz)>2)continue;
   for(let dx=0;dx<step;dx++)for(let dz=0;dz<step;dz++)for(let dy=0;dy<step;dy++){
    const p=[x+ix*step+dx,base+trunk-1+iy*step+dy,z+iz*step+dz];
    // Reserve the observatory's fence and bench sightline, including adjacent
    // cells: occupancy alone cannot prevent foliage from swallowing furniture.
    const px=(p[0]+.5)/2,pz=(p[2]+.5)/2;
    const gardenClearance=px>=18.5&&px<=24.5&&pz>=-19&&pz<=-15.75&&p[1]/2<(ground(px,pz)??0)+3;
    if(!gardenClearance&&!world.getOccupant(p))put(p,palette[(ix+iz+iy+9)%3]);
   }
  }
 }
 // Connected fence segments retain the old garden boundaries.
 for(const [x,z,len,axis] of [[-25,-14,9,'x'],[-27,1,8,'z'],[-22,23,10,'x'],[23,-16,6,'x'],[7,-13,7,'z'],[24,10,5,'z'],[-22,-16,4,'x'],[12,-18,3,'x'],[19,-18,5,'x']]){
  for(let t=0;t<=len;t+=.5){const px=x+(axis==='x'?t:0),pz=z+(axis==='z'?t:0),h=ground(px,pz);if(h===null||h*2%1||layout.nearestPath(px,pz).distance<1.35)continue;
   for(let dy=0;dy<2;dy++){const p=[Math.floor(px*2),h*2+dy,Math.floor(pz*2)];if(!world.getOccupant(p))try{world.setBlock(p,state('fence',C.wood));}catch{/* Uneven shore segments intentionally stop at a gap. */}}
  }
 }
 function placeLampNear(x,z){
  // Re-read the height after every lateral probe. Reusing the requested
  // position's height made most lamps fail support checks on sloped ground.
  const offsets=[[0,0],[.5,0],[-.5,0],[0,.5],[0,-.5],[1,0],[-1,0],[0,1],[0,-1],[1,.5],[-1,.5],[1,-.5],[-1,-.5]];
  for(const [dx,dz] of offsets){
   const px=x+dx,pz=z+dz,c=columnAt(px,pz);if(!c||['path','paving'].includes(c.kind)||c.height*2%1)continue;
   const anchor=[Math.floor(px*2),c.height*2,Math.floor(pz*2)],spec={id:`lamp-${String(serial++).padStart(5,'0')}`,anchor,state:world.intern(state('lamp',C.trim))};
   try{world.placeInstance(spec);return true;}catch{/* Try the next supported verge cell. */}
  }return false;
 }
 // Sparse landmark lighting: entrances and major bends only.
 for(const [x,z] of [[-22,19],[-10,17],[-7,6],[15,11],[24,10],[-21,-16],[8,-3],[18,-14]])placeLampNear(x,z);
 for(const [x,z] of [[-12,18],[15.5,9.5],[24.7,8],[-22,-18]]){const h=ground(x,z);if(h!==null&&h*2%1===0)instance('crate',[Math.floor(x*2),h*2,Math.floor(z*2)],C.wood);}
 for(const [x,z] of [[-10,20],[-22,-16],[21,-17.5]]){const h=ground(x,z);if(h!==null&&h*2%1===0)instance('bench',[Math.floor(x*2),h*2,Math.floor(z*2)],C.wood);}
 for(const [x,z] of [[-21,17.5],[-12.5,17.5],[16,9.5],[24,9.5],[-3,6.5],[4.8,6.5],[-22,-16.5]]){
  const h=ground(x,z);if(h!==null&&h*2%1===0)instance('planter',[Math.floor(x*2),h*2,Math.floor(z*2)],'#ee7979');
 }
 for(const [x,z] of [[-24,-5],[-11,-7],[23,-9],[-16,25]])for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  const px=x+col*.5,pz=z+row*.5,c=columnAt(px,pz);if(!c||c.kind!=='grass'||c.height*2%1||buildingAt(px,pz,1)||layout.nearestPath(px,pz).distance<1.6)continue;
  const p=[Math.floor(px*2),c.height*2,Math.floor(pz*2)];if(!world.getOccupant(p))world.setBlock(p,state('crop',row%2?'#73b23d':'#549b35'));
 }
 for(const c of columns.values()){
  const x=(c.x+.5)/2,z=(c.z+.5)/2;if(c.kind!=='grass'||c.height*2%1||buildingAt(x,z,1.3)||layout.nearestPath(x,z).distance<1.25||Math.abs(z-RAIL.z)<2.5&&x<RAIL.right+1)continue;
  const p=[c.x,c.height*2,c.z];if(world.getOccupant(p))continue;
  if(random()<.035)world.setBlock(p,state('flower',['#f4d33b','#faf5d7','#f16861'][Math.floor(random()*3)]));
  else if(random()<.055)world.setBlock(p,state('grass','#58a832'));
 }
 // Railway remains at the original western extent and clears all building envelopes.
 for(let x=RAIL.left*2;x<RAIL.right*2;x++)for(let z=-55;z<=-52;z++){
  put([x,15,z],C.wood);
  // Rail components share a single model, rather than overlapping unrelated objects.
  const lane=z===-55?'near':z===-52?'far':'none',tie=x%3!==0;
  if(lane!=='none'||tie)put([x,16,z],'#72858b','rail',{lane,tie});
 }
 for(let x=RAIL.left+1;x<RAIL.right;x+=5)for(const z of [-27.5,-26]){
  const h=ground(x,z)??-.5;for(let y=Math.ceil(h*2);y<15;y++)put([Math.floor(x*2),y,Math.floor(z*2)],C.trim,'pillar',{width:.75});
 }
 volume(-17,7,-24.3,10,.5,1.5,C.path);
 for(const z of [-27,-26])volume(5.5,8,z,.5,1,.5,'#943f31');
 // Dock's quarter-unit adjustment aligns with the existing stone quay.
 for(const p of [DOCK.neck,DOCK.landing])volume(p.x,2,p.z,p.width,.5,p.depth,C.wood);
 for(const [x,z] of [[-3.5,19.8],[-3.5,22.2],[-1,19.8],[1,20.8],[-.5,24],[-.5,27],[6.5,21],[6.5,24],[6.5,27],[3,27]]){
  volume(x,-.5,z,.5,3.5,.5,C.wood,{model:'pillar',props:{width:1}});
 }
 // One authored frame replaces two independently grounded poles. Keep it on
 // the upper terrace so both posts start at the same height.
 clear([13,12,10],[19,18,11]);
 instance('clothesline',[13,12,10],C.wood,{},undefined,true);
 world.entities.push({id:'harbor-train',type:'train',position:[RAIL.centerMax,8.19,RAIL.z],rail:{...RAIL,top:8.19}},
  {id:'harbor-boat',type:'boat',position:[...DOCK.boat.slice(0,1),.55,DOCK.boat[1]]},
  {id:'garden-cat',type:'cat',position:[-2,(ground(-2,6.5)??5)+.24,6.5]},
  {id:'workshop-smoke',type:'smoke',position:[22.5,16,4]});
 const walkways=new Map(roads.map(c=>[`${c.x},${c.z}`,[c.x,c.z,c.height*2]]));
 for(const p of [DOCK.neck,DOCK.landing])for(let x=Math.round((p.x-p.width/2)*2);x<Math.round((p.x+p.width/2)*2);x++)for(let z=Math.round((p.z-p.depth/2)*2);z<Math.round((p.z+p.depth/2)*2);z++)walkways.set(`${x},${z}`,[x,z,5]);
 world.environment.walkways=[...walkways.values()].filter(([x,z,h])=>hasClearance(world,x,z,h));
 const report=validateHarbor(world);if(!report.valid)throw new Error(report.errors.slice(0,30).join('\n'));
 return world;
}

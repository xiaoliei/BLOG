import { normalizeState, modelDefinition, modelBoxes, occupiedCells, rotateBox, rotatePoint, DIRECTIONS, REGISTRY_VERSION } from './models.js';

export const CELL_SIZE=.5, CHUNK_SIZE=16, FORMAT_VERSION=1;
export const keyOf=p=>p.join(',');
export const worldToCell=(p,size=CELL_SIZE)=>p.map(v=>Math.floor(v/size));
export const cellToWorld=(p,size=CELL_SIZE)=>p.map(v=>v*size);
export const chunkOf=p=>p.map(v=>Math.floor(v/CHUNK_SIZE));
export function stable(value){return JSON.stringify(canonical(value));}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const vec=(p,ints=false)=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&(!ints||Number.isInteger(v)));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const neighbours=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export class World {
 constructor({id='harbor',cellSize=CELL_SIZE,bounds={min:[-320,-8,-96],max:[96,96,96]},seed=1729,environment={seaLevel:-.18},places=[],entities=[]}={}) {
  if(typeof id!=='string'||!id.length||id.length>100||!Number.isSafeInteger(seed)||!environment||typeof environment!=='object'||!Number.isFinite(environment.seaLevel)||!Array.isArray(places)||!Array.isArray(entities))throw new Error('Invalid world metadata');
  if(!Number.isFinite(cellSize)||cellSize<=0||cellSize>16||!vec(bounds?.min,true)||!vec(bounds?.max,true)||bounds.min.some((v,i)=>v>=bounds.max[i]||Math.abs(v)>4096||Math.abs(bounds.max[i])>4096))throw new Error('Invalid world bounds/scale');
  this.id=id;this.cellSize=cellSize;this.bounds=structuredClone(bounds);this.seed=seed;this.environment=structuredClone(environment);this.places=structuredClone(places);this.entities=structuredClone(entities);
  this.blocks=new Map();this.instances=new Map();this.occupancy=new Map();this.dirtyChunks=new Set();this.states=new Map();
 }
 checkCell(p){if(!vec(p,true)||p.some((v,i)=>v<this.bounds.min[i]||v>=this.bounds.max[i]))throw new Error(`Cell outside world: ${p}`);}
 intern(input){const s=normalizeState(input),k=stable(s);if(!this.states.has(k))this.states.set(k,Object.freeze({...s,props:Object.freeze(s.props)}));return this.states.get(k);}
 getBlock(p){return this.blocks.get(keyOf(p))?.state??null;}
 getOccupant(p){const k=keyOf(p),id=this.occupancy.get(k);return id?{kind:'instance',instance:this.instances.get(id)}:this.blocks.has(k)?{kind:'block',...this.blocks.get(k)}:null;}
 mark(p){for(const d of [[0,0,0],...neighbours])this.dirtyChunks.add(keyOf(chunkOf(add(p,d))));}
 setBlock(p,input,{replace=false,checkSupport=true}={}){
  this.checkCell(p);const state=this.intern(input),cells=occupiedCells(state);
  if(cells.length!==1||keyOf(cells[0])!=='0,0,0')throw new Error(`Use placeInstance for ${state.model}`);
  const old=this.getOccupant(p);
  if(old?.kind==='instance')throw new Error(`Instance collision at ${p}`);
  if(old&&!replace){
   if(old.state.model==='slab'&&state.model==='slab'&&old.state.color===state.color&&old.state.place===state.place&&old.state.props.half!==state.props.half)return this.setBlock(p,{model:'cube',color:state.color,...(state.place?{place:state.place}:{})},{replace:true});
   throw new Error(`Occupied cell: ${p}`);
  }
  if(checkSupport)this.checkSupport(p,state);
  this.blocks.set(keyOf(p),{cell:[...p],state});this.mark(p);return state;
 }
 connections(p){return [[0,0,1],[-1,0,0],[0,0,-1],[1,0,0]].flatMap((d,i)=>{const o=this.getOccupant(add(p,d));const s=o?.state??o?.instance.state;return s&&modelDefinition(s.model).connects?[DIRECTIONS[i]]:[];});}
 boxesAt(p){const o=this.getOccupant(p);if(!o)return [];
  const state=o.state??o.instance.state,anchor=o.cell??o.instance.anchor;
  return modelBoxes(state,state.model==='fence'?this.connections(anchor):[]).map(b=>({...b,min:add(b.min,anchor),max:add(b.max,anchor),state}));
 }
 querySupport({x,z,below=Infinity}){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Invalid support query');
  const ix=Math.floor(x),iz=Math.floor(z);let best=null;
  for(let y=Math.min(this.bounds.max[1]-1,Number.isFinite(below)?Math.floor(below):this.bounds.max[1]-1);y>=this.bounds.min[1];y--){
   for(const b of this.boxesAt([ix,y,iz]))if(x>=b.min[0]-1e-8&&x<b.max[0]-1e-8&&z>=b.min[2]-1e-8&&z<b.max[2]-1e-8&&b.max[1]<=below+1e-8&&(!best||b.max[1]>best.height))best={height:b.max[1],state:b.state};
   if(best&&best.height>=y)return best;
  }return best;
 }
 checkSupport(anchor,state){
  const def=modelDefinition(state.model);
  if(def.support==='back'){
   const turn=DIRECTIONS.indexOf(state.props.facing??'south'),mount=add(anchor,rotatePoint(def.mount??[.5,.5,0],turn));
   const outward=[[0,0,1],[-1,0,0],[0,0,-1],[1,0,0]][turn];
   const point=mount.map((v,i)=>v-outward[i]*.00001);
   if(!this.boxesAt(point.map(Math.floor)).some(b=>point.every((v,i)=>v>=b.min[i]&&v<=b.max[i])))throw new Error(`Unsupported wall attachment ${state.model} at ${anchor}`);
   return;
  }
  if(modelDefinition(state.model).support!=='bottom')return;
  const boxes=modelBoxes(state),bottom=Math.min(...boxes.map(b=>b.min[1]));
  for(const b of boxes.filter(b=>Math.abs(b.min[1]-bottom)<1e-8)){
   const y=anchor[1]+bottom;
   for(const dx of [.2,.8])for(const dz of [.2,.8]){
    const x=anchor[0]+b.min[0]+(b.max[0]-b.min[0])*dx,z=anchor[2]+b.min[2]+(b.max[2]-b.min[2])*dz;
    if(Math.abs((this.querySupport({x,z,below:y})?.height??-Infinity)-y)>1e-7)throw new Error(`Unsupported ${state.model} at ${anchor}`);
   }
  }
 }
 instanceCells(spec){return occupiedCells(spec.state).map(p=>add(p,spec.anchor));}
 prepareInstance(input,ignoreId=null,{checkSupport=true}={}){
  if(!input||typeof input.id!=='string'||!/^[\w.-]{1,100}$/.test(input.id))throw new Error('Invalid instance ID');
  if(this.instances.has(input.id)&&input.id!==ignoreId)throw new Error(`Duplicate instance: ${input.id}`);
  this.checkCell(input.anchor);const spec={id:input.id,anchor:[...input.anchor],state:this.intern(input.state)};
  const cells=this.instanceCells(spec);if(!cells.length||cells.length>4096)throw new Error('Invalid instance occupancy size');
  for(const p of cells){this.checkCell(p);const o=this.getOccupant(p);if(o&&!(o.kind==='instance'&&o.instance.id===ignoreId))throw new Error(`Instance collision ${spec.id} at ${p}`);}
  if(checkSupport)this.checkSupport(spec.anchor,spec.state);
  return Object.freeze({...spec,anchor:Object.freeze(spec.anchor)});
 }
 placeInstance(input,options){const spec=this.prepareInstance(input,null,options);this.instances.set(spec.id,spec);for(const p of this.instanceCells(spec)){this.occupancy.set(keyOf(p),spec.id);this.mark(p);}return spec;}
 updateInstance(id,patch){
  const old=this.instances.get(id);if(!old)throw new Error(`Missing instance: ${id}`);
  const input={...old,...patch,id};const spec=this.prepareInstance(input,id);
  if(old.state.model==='door'&&spec.state.model==='door'&&old.state.props.open!==spec.state.props.open){
   const p=spec.state.props,w=p.width;const turn=DIRECTIONS.indexOf(p.facing);
   const sweep=rotateBox({min:[p.hinge==='left'?0:-.2,0,.8],max:[w,p.height,w+1]},turn);
   for(let y=0;y<p.height;y++)for(let z=Math.floor(sweep.min[2]);z<Math.ceil(sweep.max[2]);z++)for(let x=Math.floor(sweep.min[0]);x<Math.ceil(sweep.max[0]);x++){
    const cell=add(spec.anchor,[x,y,z]);this.checkCell(cell);const o=this.getOccupant(cell);if(o&&!(o.kind==='instance'&&o.instance.id===id))throw new Error(`Door sweep blocked at ${cell}`);
   }
  }
  for(const p of this.instanceCells(old)){this.occupancy.delete(keyOf(p));this.mark(p);}
  this.instances.set(id,spec);for(const p of this.instanceCells(spec)){this.occupancy.set(keyOf(p),id);this.mark(p);}return spec;
 }
 removeAt(p){const o=this.getOccupant(p);if(!o)return false;
  if(o.kind==='instance'){for(const c of this.instanceCells(o.instance)){this.occupancy.delete(keyOf(c));this.mark(c);}this.instances.delete(o.instance.id);}
  else{this.blocks.delete(keyOf(p));this.mark(p);}return true;
 }
}
export function validateWorld(world){
 const errors=[],placeIds=new Set();
 for(const p of world.places){if(typeof p.id!=='string'||placeIds.has(p.id)||!vec(p.position)||!vec(p.size)||!vec(p.entry)||!vec(p.label)||p.camera&&['desktopOffset','desktopTarget','mobileOffset','mobileTarget'].some(k=>!vec(p.camera[k])))errors.push(`Invalid place: ${p.id}`);placeIds.add(p.id);}
 const entityIds=new Set();for(const e of world.entities){
  if(!['train','boat','cat','gear','smoke'].includes(e.type)||!vec(e.position)||entityIds.has(e.id)||typeof e.id!=='string'||e.place&&!placeIds.has(e.place))errors.push(`Invalid entity: ${e.id}`);entityIds.add(e.id);
  if(e.type==='train'){
   const r=e.rail,fields=['left','right','centerMin','centerMax','travel','dwell','cars','spacing','carLength','z','top'];
   if(!r||fields.some(k=>!Number.isFinite(r[k]))||r.left>=r.right||r.centerMin>=r.centerMax||r.travel<=0||r.dwell<0||!Number.isInteger(r.cars)||r.cars<1||r.cars>16||r.spacing<r.carLength||r.carLength<=0)errors.push(`Invalid train route: ${e.id}`);
  }
 }
 for(const {cell,state} of world.blocks.values()){
  if(state.place&&!placeIds.has(state.place))errors.push(`Unknown place at ${cell}`);
  try{world.checkSupport(cell,state);}catch(e){errors.push(e.message);}
 }
 for(const spec of world.instances.values()){
  if(spec.state.place&&!placeIds.has(spec.state.place))errors.push(`Unknown place on ${spec.id}`);
  try{world.checkSupport(spec.anchor,spec.state);}catch(e){errors.push(`${spec.id}: ${e.message}`);}
 }
 return {valid:!errors.length,errors,blocks:world.blocks.size,instances:world.instances.size};
}
export function serializeWorld(world){
 const report=validateWorld(world);if(!report.valid)throw new Error(report.errors.slice(0,20).join('\n'));
 const states=[...new Map([...world.blocks.values()].map(b=>[stable(b.state),b.state])).entries()].sort(([a],[b])=>a.localeCompare(b,'en'));
 const palette=[null,...states.map(([,s])=>s)],indices=new Map(states.map(([k],i)=>[k,i+1])),chunks=new Map();
 for(const {cell,state} of world.blocks.values()){
  const c=chunkOf(cell),key=keyOf(c);if(!chunks.has(key))chunks.set(key,{position:c,data:new Uint32Array(4096)});
  const [x,y,z]=cell.map((v,i)=>v-c[i]*16);chunks.get(key).data[x+z*16+y*256]=indices.get(stable(state));
 }
 const encoded=[...chunks.values()].sort((a,b)=>a.position[0]-b.position[0]||a.position[1]-b.position[1]||a.position[2]-b.position[2]).map(({position,data})=>{
  const runs=[];let last=data[0],n=0;for(const v of data){if(v!==last){runs.push(n,last);last=v;n=0;}n++;}runs.push(n,last);return {position,runs};
 });
 return stable({formatVersion:FORMAT_VERSION,registryVersion:REGISTRY_VERSION,id:world.id,cellSize:world.cellSize,bounds:world.bounds,seed:world.seed,environment:world.environment,places:world.places,entities:world.entities,palette,chunks:encoded,instances:[...world.instances.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'))})+'\n';
}
export function parseWorld(text){
 if(typeof text!=='string'||text.length>32_000_000)throw new Error('World file exceeds 32 MB');
 const data=JSON.parse(text);
 if(data.formatVersion!==FORMAT_VERSION||data.registryVersion!==REGISTRY_VERSION)throw new Error('Unsupported world/registry version');
 if(!Array.isArray(data.palette)||data.palette[0]!==null||data.palette.length>16384||!Array.isArray(data.chunks)||data.chunks.length>4096||!Array.isArray(data.instances)||data.instances.length>20000||!Array.isArray(data.places)||data.places.length>100||!Array.isArray(data.entities)||data.entities.length>1000)throw new Error('Invalid world collections');
 const world=new World(data),palette=data.palette.map((s,i)=>i?world.intern(s):null),seen=new Set();let count=0;
 for(const s of palette.slice(1)){const cells=occupiedCells(s);if(cells.length!==1||keyOf(cells[0])!=='0,0,0')throw new Error('Multi-cell model in block palette');}
 for(const c of data.chunks){
  if(!vec(c.position,true)||!Array.isArray(c.runs)||!c.runs.length||c.runs.length%2||c.runs.length>8192||seen.has(keyOf(c.position)))throw new Error('Invalid/duplicate chunk');
  seen.add(keyOf(c.position));let offset=0;
  for(let i=0;i<c.runs.length;i+=2){const n=c.runs[i],v=c.runs[i+1];if(!Number.isInteger(n)||n<1||offset+n>4096||!Number.isInteger(v)||v<0||v>=palette.length)throw new Error('Invalid RLE');
   for(let j=0;j<n;j++,offset++)if(v){if(++count>2_000_000)throw new Error('Too many blocks');const p=[offset%16,Math.floor(offset/256),Math.floor(offset/16)%16].map((v,a)=>v+c.position[a]*16);world.checkCell(p);world.blocks.set(keyOf(p),{cell:p,state:palette[v]});}
  }if(offset!==4096)throw new Error('Incomplete chunk');
 }
 for(const spec of data.instances)world.placeInstance(spec,{checkSupport:false});
 const report=validateWorld(world);if(!report.valid)throw new Error(report.errors.slice(0,20).join('\n'));world.dirtyChunks.clear();return world;
}

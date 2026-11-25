import { normalizeState, modelDefinition, modelBoxes, occupiedCells, rotateBox, rotatePoint, DIRECTIONS, REGISTRY_VERSION } from './models.ts';
import type { BlockState, Box, Direction, StateInput, Vec3 } from './models.ts';

export type { Vec3, Box, BlockState, StateInput, Direction, Props, PropValue } from './models.ts';

export const CELL_SIZE=.5, CHUNK_SIZE=16, FORMAT_VERSION=1;
/* 铁路总长上限（格；rail.left/right 是世界单位，比较时除以 cellSize）。现有存档约 324 格；
   渲染层按每 60 格一个实例向西延伸，封顶后最多约 94 个实例。超出即判定存档无效，整张世界不会加载。 */
export const MAX_RAIL_LENGTH=4000;
export const keyOf=(p: readonly number[]): string=>p.join(',');
export const worldToCell=(p: readonly number[],size: number=CELL_SIZE): Vec3=>p.map(v=>Math.floor(v/size)) as Vec3;
export const cellToWorld=(p: readonly number[],size: number=CELL_SIZE): number[]=>p.map(v=>v*size);
export const chunkOf=(p: readonly number[]): Vec3=>p.map(v=>Math.floor(v/CHUNK_SIZE)) as Vec3;
export function stable(value: unknown): string{return JSON.stringify(canonical(value));}
function canonical(value: unknown): unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical((value as Record<string,unknown>)[k])]));return value;}
const vec=(p: unknown,ints=false): boolean=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&(!ints||Number.isInteger(v)));
const add=(a: readonly number[],b: readonly number[]): Vec3=>a.map((v,i)=>v+b[i]) as Vec3;
const neighbours: Vec3[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

export interface WorldBounds { min: Vec3; max: Vec3; }
export interface RailRoute { z: number; top: number; halfWidth: number; left: number; right: number; carLength: number; spacing: number; cars: number; centerMin: number; centerMax: number; dwell: number; travel: number; }
export interface DockRegion { x: number; z: number; width: number; depth: number; }
export interface DockSpec { height: number; entrance: [number, number]; neck: DockRegion; landing: DockRegion; boat: [number, number]; }
export interface Environment { seaLevel: number; color?: string; rail?: RailRoute; dock?: DockSpec; walkways?: Vec3[]; }

export interface PlaceCamera { desktopOffset: Vec3; desktopTarget: Vec3; mobileOffset: Vec3; mobileTarget: Vec3; }
export interface PlaceSpec {
  id: string;
  position: Vec3;
  size: Vec3;
  entry: Vec3;
  label: Vec3;
  camera?: PlaceCamera;
}

export type EntityType = 'train' | 'boat' | 'cat' | 'gear' | 'smoke';
export interface EntityBase { id: string; type: EntityType; position: Vec3; place?: string; }
export interface TrainEntity extends EntityBase { type: 'train'; rail: RailRoute; }
export interface BoatEntity extends EntityBase { type: 'boat'; }
export interface CatEntity extends EntityBase { type: 'cat'; }
export interface GearEntity extends EntityBase { type: 'gear'; }
export interface SmokeEntity extends EntityBase { type: 'smoke'; }
export type EntitySpec = TrainEntity | BoatEntity | CatEntity | GearEntity | SmokeEntity;

export interface InstanceInput { id: string; anchor: Vec3; state: StateInput; }
export interface InstanceSpec { id: string; anchor: Vec3; state: BlockState; }
export interface BlockEntry { cell: Vec3; state: BlockState; }
export type Occupant = { kind: 'instance'; instance: InstanceSpec } | { kind: 'block'; cell: Vec3; state: BlockState };
export interface SupportHit { height: number; state: BlockState; }

export interface WorldOptions {
  id?: string;
  cellSize?: number;
  bounds?: WorldBounds;
  seed?: number;
  environment?: Environment;
  places?: PlaceSpec[];
  entities?: EntitySpec[];
}

interface SaveFile extends WorldOptions {
  formatVersion: number;
  registryVersion: number;
  palette: unknown[];
  chunks: { position: unknown; runs: unknown }[];
  instances: InstanceInput[];
}

function isSaveCollection(data: SaveFile): boolean {
  return Array.isArray(data.palette) && (data.palette as unknown[])[0] === null && data.palette.length <= 16384
    && Array.isArray(data.chunks) && data.chunks.length <= 4096
    && Array.isArray(data.instances) && data.instances.length <= 20000
    && Array.isArray(data.places) && data.places.length <= 100
    && Array.isArray(data.entities) && data.entities.length <= 1000;
}

export class World {
  /* 这些字段声明带初始化器，会先于构造函数体执行（useDefineForClassFields）。
     初始化器里不要引用构造函数参数（如 this.cellSize），那时它们还是 undefined。 */
  id: string;
  cellSize: number;
  bounds: WorldBounds;
  seed: number;
  environment: Environment;
  places: PlaceSpec[];
  entities: EntitySpec[];
  blocks = new Map<string, BlockEntry>();
  instances = new Map<string, InstanceSpec>();
  occupancy = new Map<string, string>();
  dirtyChunks = new Set<string>();
  states = new Map<string, BlockState>();

  constructor({id='harbor',cellSize=CELL_SIZE,bounds={min:[-320,-8,-96],max:[96,96,96]},seed=1729,environment={seaLevel:-.18},places=[],entities=[]}: WorldOptions={}) {
   if(typeof id!=='string'||!id.length||id.length>100||!Number.isSafeInteger(seed)||!environment||typeof environment!=='object'||!Number.isFinite(environment.seaLevel)||!Array.isArray(places)||!Array.isArray(entities))throw new Error('Invalid world metadata');
   if(!Number.isFinite(cellSize)||cellSize<=0||cellSize>16||!vec(bounds?.min,true)||!vec(bounds?.max,true))throw new Error('Invalid world bounds/scale');
   const safe=bounds as WorldBounds;
   if(safe.min.some((v,i)=>v>=safe.max[i]||Math.abs(v)>4096||Math.abs(safe.max[i])>4096))throw new Error('Invalid world bounds/scale');
   this.id=id;this.cellSize=cellSize;this.bounds=structuredClone(safe);this.seed=seed;this.environment=structuredClone(environment);this.places=structuredClone(places);this.entities=structuredClone(entities);
  }
  checkCell(p: Vec3): void{if(!vec(p,true)||p.some((v,i)=>v<this.bounds.min[i]||v>=this.bounds.max[i]))throw new Error(`Cell outside world: ${p}`);}
  intern(input: unknown): BlockState{const s=normalizeState(input),k=stable(s);if(!this.states.has(k))this.states.set(k,Object.freeze({...s,props:Object.freeze(s.props)}));return this.states.get(k) as BlockState;}
  getBlock(p: Vec3): BlockState|null{return this.blocks.get(keyOf(p))?.state??null;}
  getOccupant(p: Vec3): Occupant|null{const k=keyOf(p),id=this.occupancy.get(k);return id?{kind:'instance',instance:this.instances.get(id) as InstanceSpec}:this.blocks.has(k)?{kind:'block',...(this.blocks.get(k) as BlockEntry)}:null;}
  mark(p: Vec3): void{for(const d of [[0,0,0] as Vec3,...neighbours])this.dirtyChunks.add(keyOf(chunkOf(add(p,d))));}
  setBlock(p: Vec3,input: StateInput,{replace=false,checkSupport=true}: {replace?: boolean;checkSupport?: boolean}={}): BlockState{
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
  connections(p: Vec3): Direction[]{return [[0,0,1],[-1,0,0],[0,0,-1],[1,0,0]].flatMap((d,i)=>{const o=this.getOccupant(add(p,d));const s=o?(o.kind==='block'?o.state:o.instance.state):null;return s&&modelDefinition(s.model).connects?[DIRECTIONS[i]]:[];});}
  boxesAt(p: Vec3): (Box&{state: BlockState})[]{const o=this.getOccupant(p);if(!o)return [];
   const state=o.kind==='block'?o.state:o.instance.state,anchor=o.kind==='block'?o.cell:o.instance.anchor;
   return modelBoxes(state,state.model==='fence'?this.connections(anchor):[]).map(b=>({...b,min:add(b.min,anchor),max:add(b.max,anchor),state}));
  }
  querySupport({x,z,below=Infinity}: {x: number;z: number;below?: number}): SupportHit|null{
   if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Invalid support query');
   const ix=Math.floor(x),iz=Math.floor(z);let best: SupportHit|null=null;
   for(let y=Math.min(this.bounds.max[1]-1,Number.isFinite(below)?Math.floor(below):this.bounds.max[1]-1);y>=this.bounds.min[1];y--){
    for(const b of this.boxesAt([ix,y,iz]))if(x>=b.min[0]-1e-8&&x<b.max[0]-1e-8&&z>=b.min[2]-1e-8&&z<b.max[2]-1e-8&&b.max[1]<=below+1e-8&&(!best||b.max[1]>best.height))best={height:b.max[1],state:b.state};
    if(best&&best.height>=y)return best;
   }return best;
  }
  checkSupport(anchor: Vec3,state: BlockState): void{
   const def=modelDefinition(state.model);
   if(def.support==='back'){
    const turn=DIRECTIONS.indexOf((state.props.facing??'south') as Direction),mount=add(anchor,rotatePoint(def.mount??[.5,.5,0],turn));
    const outward=[[0,0,1],[-1,0,0],[0,0,-1],[1,0,0]][turn];
    const point=mount.map((v,i)=>v-outward[i]*.00001);
    if(!this.boxesAt(point.map(Math.floor) as Vec3).some(b=>point.every((v,i)=>v>=b.min[i]&&v<=b.max[i])))throw new Error(`Unsupported wall attachment ${state.model} at ${anchor}`);
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
  instanceCells(spec: InstanceSpec): Vec3[]{return occupiedCells(spec.state).map(p=>add(p,spec.anchor));}
  prepareInstance(input: InstanceInput,ignoreId: string|null=null,{checkSupport=true}: {checkSupport?: boolean}={}): InstanceSpec{
   if(!input||typeof input.id!=='string'||!/^[\w.-]{1,100}$/.test(input.id))throw new Error('Invalid instance ID');
   if(this.instances.has(input.id)&&input.id!==ignoreId)throw new Error(`Duplicate instance: ${input.id}`);
   this.checkCell(input.anchor);const spec: InstanceSpec={id:input.id,anchor:[...input.anchor],state:this.intern(input.state)};
   const cells=this.instanceCells(spec);if(!cells.length||cells.length>4096)throw new Error('Invalid instance occupancy size');
   for(const p of cells){this.checkCell(p);const o=this.getOccupant(p);if(o&&!(o.kind==='instance'&&o.instance.id===ignoreId))throw new Error(`Instance collision ${spec.id} at ${p}`);}
   if(checkSupport)this.checkSupport(spec.anchor,spec.state);
   return Object.freeze({...spec,anchor:Object.freeze(spec.anchor)}) as InstanceSpec;
  }
  placeInstance(input: InstanceInput,options: {checkSupport?: boolean}={}){const spec=this.prepareInstance(input,null,options);this.instances.set(spec.id,spec);for(const p of this.instanceCells(spec)){this.occupancy.set(keyOf(p),spec.id);this.mark(p);}return spec;}
  updateInstance(id: string,patch: Partial<InstanceInput>): InstanceSpec{
   const old=this.instances.get(id);if(!old)throw new Error(`Missing instance: ${id}`);
   const input={...old,...patch,id};const spec=this.prepareInstance(input,id);
   if(old.state.model==='door'&&spec.state.model==='door'&&old.state.props.open!==spec.state.props.open){
    const p=spec.state.props,w=p.width as number;const turn=DIRECTIONS.indexOf((p.facing??'south') as Direction);
    const sweep=rotateBox({min:[p.hinge==='left'?0:-.2,0,.8],max:[w,p.height as number,w+1]},turn);
    for(let y=0;y<(p.height as number);y++)for(let z=Math.floor(sweep.min[2]);z<Math.ceil(sweep.max[2]);z++)for(let x=Math.floor(sweep.min[0]);x<Math.ceil(sweep.max[0]);x++){
     const cell=add(spec.anchor,[x,y,z]);this.checkCell(cell);const o=this.getOccupant(cell);if(o&&!(o.kind==='instance'&&o.instance.id===id))throw new Error(`Door sweep blocked at ${cell}`);
    }
   }
   for(const p of this.instanceCells(old)){this.occupancy.delete(keyOf(p));this.mark(p);}
   this.instances.set(id,spec);for(const p of this.instanceCells(spec)){this.occupancy.set(keyOf(p),id);this.mark(p);}return spec;
  }
  removeAt(p: Vec3): boolean{const o=this.getOccupant(p);if(!o)return false;
   if(o.kind==='instance'){for(const c of this.instanceCells(o.instance)){this.occupancy.delete(keyOf(c));this.mark(c);}this.instances.delete(o.instance.id);}
   else{this.blocks.delete(keyOf(p));this.mark(p);}return true;
  }
}
export interface ValidationReport { valid: boolean; errors: string[]; blocks: number; instances: number; }
export function validateWorld(world: World): ValidationReport{
 const errors: string[]=[],placeIds=new Set<string>();
 for(const p of world.places){const cam=p.camera;if(typeof p.id!=='string'||placeIds.has(p.id)||!vec(p.position)||!vec(p.size)||!vec(p.entry)||!vec(p.label)||cam&&(['desktopOffset','desktopTarget','mobileOffset','mobileTarget'] as const).some(k=>!vec(cam[k])))errors.push(`Invalid place: ${p.id}`);placeIds.add(p.id);}
 const entityIds=new Set<string>();for(const e of world.entities){
  if(!['train','boat','cat','gear','smoke'].includes(e.type)||!vec(e.position)||entityIds.has(e.id)||typeof e.id!=='string'||e.place&&!placeIds.has(e.place))errors.push(`Invalid entity: ${e.id}`);entityIds.add(e.id);
  if(e.type==='train'){
   const r=e.rail,fields: (keyof RailRoute)[]=['left','right','centerMin','centerMax','travel','dwell','cars','spacing','carLength','z','top'];
   /* 路线长度封顶：rail-horizon 按长度实例化延伸段，不封顶时一个离谱的 left 就能拖垮页面 */
   if(!r||fields.some(k=>!Number.isFinite(r[k]))||r.left>=r.right||(r.right-r.left)/world.cellSize>MAX_RAIL_LENGTH||r.centerMin>=r.centerMax||r.travel<=0||r.dwell<0||!Number.isInteger(r.cars)||r.cars<1||r.cars>16||r.spacing<r.carLength||r.carLength<=0)errors.push(`Invalid train route: ${e.id}`);
  }
 }
 for(const {cell,state} of world.blocks.values()){
  if(state.place&&!placeIds.has(state.place))errors.push(`Unknown place at ${cell}`);
  try{world.checkSupport(cell,state);}catch(e){errors.push(e instanceof Error?e.message:String(e));}
 }
 for(const spec of world.instances.values()){
  if(spec.state.place&&!placeIds.has(spec.state.place))errors.push(`Unknown place on ${spec.id}`);
  try{world.checkSupport(spec.anchor,spec.state);}catch(e){errors.push(`${spec.id}: ${e instanceof Error?e.message:String(e)}`);}
 }
 return {valid:!errors.length,errors,blocks:world.blocks.size,instances:world.instances.size};
}
export function serializeWorld(world: World): string{
 const report=validateWorld(world);if(!report.valid)throw new Error(report.errors.slice(0,20).join('\n'));
 const states=[...new Map([...world.blocks.values()].map(b=>[stable(b.state),b.state] as const)).entries()].sort(([a],[b])=>a.localeCompare(b,'en'));
 const palette: (BlockState|null)[]=[null,...states.map(([,s])=>s)],indices=new Map(states.map(([k],i)=>[k,i+1] as [string, number])),chunks=new Map<string,{position: Vec3;data: Uint32Array}>();
 for(const {cell,state} of world.blocks.values()){
  const c=chunkOf(cell),key=keyOf(c);if(!chunks.has(key))chunks.set(key,{position:c,data:new Uint32Array(4096)});
  const [x,y,z]=cell.map((v,i)=>v-c[i]*16);chunks.get(key)!.data[x+z*16+y*256]=indices.get(stable(state)) as number;
 }
 const encoded=[...chunks.values()].sort((a,b)=>a.position[0]-b.position[0]||a.position[1]-b.position[1]||a.position[2]-b.position[2]).map(({position,data})=>{
  const runs: number[]=[];let last=data[0],n=0;for(const v of data){if(v!==last){runs.push(n,last);last=v;n=0;}n++;}runs.push(n,last);return {position,runs};
 });
 return stable({formatVersion:FORMAT_VERSION,registryVersion:REGISTRY_VERSION,id:world.id,cellSize:world.cellSize,bounds:world.bounds,seed:world.seed,environment:world.environment,places:world.places,entities:world.entities,palette,chunks:encoded,instances:[...world.instances.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'))})+'\n';
}
export function parseWorld(text: string): World{
 if(typeof text!=='string'||text.length>32_000_000)throw new Error('World file exceeds 32 MB');
 const data: unknown=JSON.parse(text);
 if(typeof data!=='object'||data===null)throw new Error('Unsupported world/registry version');
 const d=data as SaveFile;
 if(d.formatVersion!==FORMAT_VERSION||d.registryVersion!==REGISTRY_VERSION)throw new Error('Unsupported world/registry version');
 if(!isSaveCollection(d))throw new Error('Invalid world collections');
 const world=new World(d),palette: (BlockState|null)[]=d.palette.map((s,i)=>i?world.intern(s):null),seen=new Set<string>();let count=0;
 for(const s of palette.slice(1)){const cells=occupiedCells(s as BlockState);if(cells.length!==1||keyOf(cells[0])!=='0,0,0')throw new Error('Multi-cell model in block palette');}
 for(const c of d.chunks){
  const position=c.position as Vec3,runs=c.runs as number[];
  if(!vec(position,true)||!Array.isArray(c.runs)||!runs.length||runs.length%2||runs.length>8192||seen.has(keyOf(position)))throw new Error('Invalid/duplicate chunk');
  seen.add(keyOf(position));let offset=0;
  for(let i=0;i<runs.length;i+=2){const n=runs[i],v=runs[i+1];if(!Number.isInteger(n)||n<1||offset+n>4096||!Number.isInteger(v)||v<0||v>=palette.length)throw new Error('Invalid RLE');
   for(let j=0;j<n;j++,offset++)if(v){if(++count>2_000_000)throw new Error('Too many blocks');const p=[offset%16,Math.floor(offset/256),Math.floor(offset/16)%16].map((v,a)=>v+position[a]*16) as Vec3;world.checkCell(p);world.blocks.set(keyOf(p),{cell:p,state:palette[v] as BlockState});}
  }if(offset!==4096)throw new Error('Incomplete chunk');
 }
 for(const spec of d.instances)world.placeInstance(spec,{checkSupport:false});
 const report=validateWorld(world);if(!report.valid)throw new Error(report.errors.slice(0,20).join('\n'));world.dirtyChunks.clear();return world;
}

import { chunkOf, keyOf } from './data.ts';
import type { World } from './data.ts';
import { modelBoxes, modelDefinition } from './models.ts';
import type { BlockState, Box, Direction, Vec3 } from './models.ts';

const EPS=1e-7;

/** Flattened rectangle in a face plane: [u0, v0, u1, v1]. */
export type Rect = [number, number, number, number];
export interface Face {
  axis: 0 | 1 | 2;
  sign: -1 | 1;
  plane: number;
  rect: Rect;
  color: string;
  place: string | null;
  instance: string | null;
  /** Present on faces produced in memory; the cache stores it per chunk. */
  transparent?: boolean;
}
export interface MeshChunk {
  chunk: string;
  transparent: boolean;
  faces: Face[];
}

// Subtract the actual covered rectangle, not the entire neighbour cell.
export function subtractRect(a: Rect,b: Rect): Rect[]{
 const x0=Math.max(a[0],b[0]),y0=Math.max(a[1],b[1]),x1=Math.min(a[2],b[2]),y1=Math.min(a[3],b[3]);
 if(x1-x0<EPS||y1-y0<EPS)return [a];
 const parts: Rect[]=[[a[0],a[1],x0,a[3]],[x1,a[1],a[2],a[3]],[x0,a[1],x1,y0],[x0,y1,x1,a[3]]];
 return parts.filter(r=>r[2]-r[0]>EPS&&r[3]-r[1]>EPS);
}
function mergeRects(rects: Rect[]): Rect[]{
 let current=rects;
 // Preserve material/owner boundaries. Two passes combine adjacent coplanar strips.
 for(const axis of [0,1] as const){
  const other=1-axis,groups=new Map<string, Rect[]>();
  for(const r of current){const k=`${r[other]},${r[other+2]}`;const row=groups.get(k);if(row)row.push(r);else groups.set(k,[r]);}
  current=[];
  for(const row of groups.values()){
   row.sort((a,b)=>a[axis]-b[axis]);let prev: Rect|null=null;
   for(const r of row){if(prev&&Math.abs(prev[axis+2]-r[axis])<EPS)prev[axis+2]=r[axis+2];else{prev=[...r];current.push(prev);}}
  }
 }return current;
}
export function meshWorld(world: World): MeshChunk[]{
 const chunks=new Map<string, MeshChunk>(),shapeCache=new Map<BlockState, Box[]>();
 const shapes=(state: BlockState): Box[]=>{if(!shapeCache.has(state))shapeCache.set(state,modelBoxes(state));return shapeCache.get(state) as Box[];};
 const faceGroups=new Map<string, FaceGroup>();
 function emit(anchor: Vec3,state: BlockState,owner: string): void{
  if(modelDefinition(state.model).positions)return;
  const local=state.model==='fence'?modelBoxes(state,world.connections(anchor)):shapes(state);
  const boxes: Box[]=local.map(b=>({...b,min:b.min.map((v,i)=>v+anchor[i]) as Vec3,max:b.max.map((v,i)=>v+anchor[i]) as Vec3}));
  for(const b of boxes)for(const axis of [0,1,2] as const)for(const sign of [-1,1] as const){
   if(state.model==='cube'){
    const neighbour=[...anchor] as Vec3;neighbour[axis]+=sign;
    const adjacent=world.getBlock(neighbour);if(adjacent?.model==='cube'&&adjacent.color!=='#7cbfd1')continue;
   }
   const u=(axis+1)%3,v=(axis+2)%3,plane=sign===1?b.max[axis]:b.min[axis];
   let rects: Rect[]=[[b.min[u],b.min[v],b.max[u],b.max[v]]];
   const covers: Box[]=[];
   for(const c of boxes)if(c!==b&&c.min[axis]<plane+EPS&&c.max[axis]>plane-EPS&&(sign===1?c.max[axis]>plane+EPS:c.min[axis]<plane-EPS))covers.push(c);
   const seen=new Set<string>();
   for(let iu=Math.floor(b.min[u]+EPS);iu<Math.ceil(b.max[u]-EPS);iu++)for(let iv=Math.floor(b.min[v]+EPS);iv<Math.ceil(b.max[v]-EPS);iv++){
    const p: Vec3=[0,0,0];p[axis]=Math.floor(plane+sign*EPS);p[u]=iu;p[v]=iv;
    const o=world.getOccupant(p);if(!o)continue;
    const otherOwner=o.kind==='instance'?o.instance.id:keyOf(o.cell);if(otherOwner===owner||seen.has(otherOwner))continue;seen.add(otherOwner);
    const otherState=o.kind==='block'?o.state:o.instance.state;
    if(!modelDefinition(otherState.model).occludes||otherState.color==='#7cbfd1')continue;
    for(const c of world.boxesAt(p))if(c.color!=='#7cbfd1'&&c.min[axis]<=plane+EPS&&c.max[axis]>=plane-EPS&&(sign===1?c.max[axis]>plane+EPS:c.min[axis]<plane-EPS))covers.push(c);
   }
   for(const c of covers){rects=rects.flatMap(r=>subtractRect(r,[c.min[u],c.min[v],c.max[u],c.max[v]] as Rect));if(!rects.length)break;}
   if(!rects.length)continue;
   const color=b.color??state.color,place=state.place??null,chunk=keyOf(chunkOf(anchor));
   // Unique instance identity is retained for picking; block cells come from the hit point.
   const instance=world.instances.has(owner)?owner:null;
   const transparent=color==='#7cbfd1';
   const groupKey=JSON.stringify([chunk,axis,sign,plane,color,place,instance,transparent]);
   const group=faceGroups.get(groupKey);
   if(group)group.rects.push(...rects);
   else faceGroups.set(groupKey,{chunk,axis,sign,plane,color,place,instance,transparent,rects:[...rects]});
  }
 }
 for(const {cell,state} of world.blocks.values())emit(cell,state,keyOf(cell));
 for(const spec of world.instances.values())emit(spec.anchor,spec.state,spec.id);
 for(const group of faceGroups.values()){
  const key=`${group.chunk}/${group.transparent}`;const bucket=chunks.get(key);
  if(bucket)bucket.faces.push(...mergeRects(group.rects).map(rect=>toFace(group,rect)));
  else chunks.set(key,{chunk:group.chunk,transparent:group.transparent,faces:mergeRects(group.rects).map(rect=>toFace(group,rect))});
 }
 return [...chunks.values()];
}
interface FaceGroup {
  chunk: string;
  axis: 0 | 1 | 2;
  sign: -1 | 1;
  plane: number;
  color: string;
  place: string | null;
  instance: string | null;
  transparent: boolean;
  rects: Rect[];
}
function toFace(group: FaceGroup,rect: Rect): Face {
  const {rects: _rects,...meta}=group;
  return {...meta,rect};
}

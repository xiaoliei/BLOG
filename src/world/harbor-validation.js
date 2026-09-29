import { validateWorld } from './data.js';

export function hasClearance(world,x,z,h,height=3){
 for(let y=Math.floor(h);y<h+height;y++)for(const b of world.boxesAt([x,y,z]))
  if(b.max[1]>h+1e-6&&b.min[1]<h+height&&b.min[0]<x+.6&&b.max[0]>x+.4&&b.min[2]<z+.6&&b.max[2]>z+.4)return false;
 return true;
}
export function validateHarbor(world){
 const report=validateWorld(world),errors=[...report.errors],walkways=world.environment.walkways;
 if(!Array.isArray(walkways)||!walkways.length)return {...report,valid:false,errors:[...errors,'Missing walkways']};
 const map=new Map(walkways.map(([x,z,h])=>[`${x},${z}`,h]));
 for(const [x,z,h] of walkways){
  const support=world.querySupport({x:x+.5,z:z+.5,below:h+1e-6});
  if(!support||Math.abs(support.height-h)>1e-6)errors.push(`Road lacks support: ${x},${z}`);
  if(!hasClearance(world,x,z,h))errors.push(`Blocked road: ${x},${z}`);
  for(const [dx,dz] of [[1,0],[0,1]]){const other=map.get(`${x+dx},${z+dz}`);if(other!==undefined&&Math.abs(h-other)>.5)errors.push(`Road riser exceeds half cell: ${x},${z}`);}
 }
 const seen=new Set(),queue=[walkways[0].slice(0,2)];
 while(queue.length){const [x,z]=queue.pop(),key=`${x},${z}`;if(seen.has(key))continue;seen.add(key);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=`${x+dx},${z+dz}`;if(map.has(k)&&!seen.has(k))queue.push([x+dx,z+dz]);}
 }
 if(seen.size!==map.size)errors.push(`Disconnected walkways: ${map.size-seen.size} (${[...map.keys()].filter(k=>!seen.has(k)).slice(0,8).join('; ')})`);
 for(const p of world.places){
  const [x,y,z]=p.entry.map(v=>v/world.cellSize);
  if(!seen.has(`${Math.floor(x)},${Math.floor(z)}`))errors.push(`Unreachable entrance: ${p.id}`);
  const [px,py,pz]=p.position,[w,,d]=p.size;
  for(let ix=Math.round((px-w/2)/world.cellSize);ix<Math.round((px+w/2)/world.cellSize);ix++)for(let iz=Math.round((pz-d/2)/world.cellSize);iz<Math.round((pz+d/2)/world.cellSize);iz++){
   const support=world.querySupport({x:ix+.5,z:iz+.5,below:py/world.cellSize});if(!support||Math.abs(support.height-py/world.cellSize)>1e-6)errors.push(`Unsupported ${p.id} foundation: ${ix},${iz}`);
  }
 }
 if(!seen.has('6,48'))errors.push('Dock landing is unreachable');
 const train=world.entities.find(e=>e.type==='train');
 if(!train)errors.push('Missing train');else{
  const r=train.rail,half=(r.cars-1)*r.spacing/2+r.carLength/2;
  if(r.centerMin-half<r.left||r.centerMax+half>r.right)errors.push('Train extends beyond rails');
  for(let x=Math.ceil((r.centerMin-half)/world.cellSize);x<Math.ceil((r.centerMax+half)/world.cellSize);x++)for(let z=Math.floor((r.z-.75)/world.cellSize);z<=Math.floor((r.z+.75)/world.cellSize);z++){
   if(!hasClearance(world,x,z,(r.top+.45)/world.cellSize,3.7))errors.push(`Train clearance: ${x},${z}`);
  }
 }
 return {...report,valid:!errors.length,errors,walkableCells:map.size};
}

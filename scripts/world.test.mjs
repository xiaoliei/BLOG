import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, placeForModule, readWorldRoute, smooth, ease } from '../src/world/places.js';
import { MODULES } from '../src/config/blog.js';
import { createLayout, GRID, RAIL, DOCK, TRAIN_HALF_LENGTH, trainAt } from '../src/world/layout.js';

const layout=createLayout();

test('all five places have distinct routes, stable spatial positions and existing content categories',()=>{
  assert.equal(PLACES.length,5);
  assert.equal(new Set(PLACES.map(p=>p.id)).size,5);
  for(const p of PLACES){
    assert.deepEqual(readWorldRoute(`#home/${p.id}`),{home:true,place:p.id});
    assert.equal(p.position.length,3);assert.ok(p.position.every(Number.isFinite));
    for(const module of p.modules)assert.ok(MODULES.some(m=>m.id===module),`missing category: ${module}`);
  }
});
test('landing, direct home, unknown destination and malformed routes are deterministic',()=>{
  assert.deepEqual(readWorldRoute(''),{home:false,place:null});
  assert.deepEqual(readWorldRoute('#home'),{home:true,place:null});
  assert.deepEqual(readWorldRoute('#home/unknown'),{home:true,place:null});
  assert.deepEqual(readWorldRoute('#home/a/b'),{home:false,place:null});
  assert.deepEqual(readWorldRoute('#homepage'),{home:false,place:null});
  assert.deepEqual(readWorldRoute('#post/hello-world'),{home:true,place:null,post:'hello-world'});
  assert.deepEqual(readWorldRoute('#post/a/b'),{home:false,place:null});
  for(const place of PLACES)for(const module of place.modules)assert.equal(placeForModule(module)?.id,place.id);
  assert.equal(placeForModule('unknown'),null);
});
test('camera interpolation stays bounded and monotonic for frame delays and endpoints',()=>{
  for(const fn of [smooth,ease]){
    assert.equal(fn(-1),0);assert.equal(fn(0),0);assert.equal(fn(1),1);assert.equal(fn(2),1);
    let previous=0;
    for(let i=0;i<=100;i++){const value=fn(i/100);assert.ok(value>=previous&&value<=1);previous=value;}
  }
});

test('trees root on rendered land, and never in the track loading gauge or building footprint',()=>{
  assert.ok(layout.trees.length>=50);
  for(const tree of layout.trees){
    const cell=layout.at(tree.x,tree.z);
    assert.ok(cell,JSON.stringify(tree));assert.equal(cell.kind,'grass');assert.equal(tree.y,cell.height);
    if(tree.x<RAIL.right+2)assert.ok(Math.abs(tree.z-RAIL.z)>RAIL.halfWidth+2*tree.scale, 'tree canopy enters railway');
    for(const place of PLACES)assert.ok(Math.abs(tree.x-place.position[0])>place.size[0]/2||Math.abs(tree.z-place.position[2])>place.size[2]/2,'tree intersects building');
  }
});
test('all building foundations are supported by level land across their complete footprints',()=>{
  for(const place of PLACES){
    for(let x=place.position[0]-place.size[0]/2;x<=place.position[0]+place.size[0]/2;x+=GRID/2)
      for(let z=place.position[2]-place.size[2]/2;z<=place.position[2]+place.size[2]/2;z+=GRID/2){
        const cell=layout.at(x,z);assert.ok(cell,place.id+' hangs over water');assert.equal(cell.height,place.position[1],place.id+' foundation is uneven');
      }
  }
});
test('entire three-car train remains on rails, clears terrain and buildings, stops and reverses at endpoints',()=>{
  for(let t=0;t<2*(RAIL.travel+RAIL.dwell);t+=.25){
    const pose=trainAt(t),left=pose.x-TRAIN_HALF_LENGTH,right=pose.x+TRAIN_HALF_LENGTH;
    assert.ok(left>=RAIL.left+.5&&right<=RAIL.right-.5,'a carriage overhangs a rail endpoint');
    for(let x=left;x<right;x+=.5)for(const z of [RAIL.z-RAIL.halfWidth,RAIL.z,RAIL.z+RAIL.halfWidth]){
      const cell=layout.at(x,z);assert.ok(!cell||cell.height<RAIL.top-.3,'train intersects terrain');
    }
    for(const place of PLACES){
      // Extra half unit includes roof overhangs, not just wall footprints.
      assert.ok(right<place.position[0]-place.size[0]/2-.5||left>place.position[0]+place.size[0]/2+.5||Math.abs(RAIL.z-place.position[2])>place.size[2]/2+.5+RAIL.halfWidth,'train intersects '+place.id);
    }
  }
  assert.equal(trainAt(0).x,trainAt(RAIL.dwell-1).x);
  assert.equal(trainAt(RAIL.travel+RAIL.dwell).x,RAIL.centerMin);
  assert.equal(trainAt(RAIL.travel+RAIL.dwell).direction,1);
  assert.equal(trainAt(2*(RAIL.travel+RAIL.dwell)).x,RAIL.centerMax);
});
test('reference has two northern banks, an inlet, a southern harbour and satellite islets',()=>{
  assert.ok(layout.at(-17,-20));assert.ok(layout.at(17,-23));
  assert.equal(layout.at(-1,-20),null);assert.equal(layout.at(10,25),null);
  assert.ok(layout.at(28.5,26)?.islet);assert.ok(layout.at(0,31)?.islet);
  const xs=layout.cells.map(c=>c.x),zs=layout.cells.map(c=>c.z);
  assert.ok(Math.max(...xs)-Math.min(...xs)>60);assert.ok(Math.max(...zs)-Math.min(...zs)>60);
});

test('every road sample has land and all paved neighbours meet in walkable steps',()=>{
  for(const sample of layout.samples)assert.ok(layout.at(sample.x,sample.z),`${sample.id} crosses open water`);
  const paved=c=>c&&['path','paving'].includes(c.kind);
  const roads=layout.cells.filter(paved),seen=new Set(),queue=[roads[0]],key=c=>`${c.x},${c.z}`;
  while(queue.length){const c=queue.pop();if(seen.has(key(c)))continue;seen.add(key(c));
    for(const [dx,dz] of [[GRID,0],[-GRID,0],[0,GRID],[0,-GRID]]){
      const n=layout.at(c.x+dx,c.z+dz);if(!paved(n))continue;
      assert.ok(Math.abs(c.height-n.height)<=.5,`cliff in road at ${key(c)} (${c.height} -> ${n.height})`);
      if(!seen.has(key(n)))queue.push(n);
    }
  }
  assert.equal(seen.size,roads.length,'disconnected road or patio');
});
test('dock is reached from west bank, turns east and keeps boat clear of landing',()=>{
  const bank=layout.at(...DOCK.entrance);assert.ok(bank);assert.ok(Math.abs(bank.height-DOCK.height)<=.25);
  assert.ok(DOCK.neck.x<DOCK.landing.x);assert.ok(DOCK.neck.z<DOCK.landing.z);
  assert.ok(DOCK.neck.x+DOCK.neck.width/2>=DOCK.landing.x-DOCK.landing.width/2);
  assert.ok(DOCK.neck.z+DOCK.neck.depth/2>=DOCK.landing.z-DOCK.landing.depth/2);
  assert.ok(DOCK.boat[0]-2.5>DOCK.landing.x+DOCK.landing.width/2);
  assert.equal(layout.at(...DOCK.boat),null);
});

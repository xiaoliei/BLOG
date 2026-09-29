import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { World, worldToCell, cellToWorld, chunkOf, parseWorld, serializeWorld, validateWorld } from '../src/world/data.js';
import { modelBoxes, normalizeState, registerBoxModel, registerMeshModel, occupiedCells, DIRECTIONS } from '../src/world/models.js';
import { meshWorld } from '../src/world/mesher.js';
import { generateHarbor } from '../src/world/generate.js';
import { trainPose } from '../src/world/entities.js';
import { validateHarbor } from '../src/world/harbor-validation.js';
import { encodeMesh,decodeMesh,sourceDigest } from '../src/world/mesh-cache.js';
const s=(model='cube',props={})=>({model,color:'#abcdef',props});
const w=()=>new World({bounds:{min:[-32,-8,-32],max:[32,32,32]}});
const floor=(world,x0=-5,x1=20,z0=-5,z1=20)=>{for(let x=x0;x<x1;x++)for(let z=z0;z<z1;z++)world.setBlock([x,-1,z],s());};
test('negative coordinates and chunk boundaries use floor, not truncation',()=>{
 assert.deepEqual(worldToCell([-.01,-.5,.5]),[-1,-1,1]);assert.deepEqual(chunkOf([-1,-16,-17]),[-1,-1,-2]);assert.deepEqual(cellToWorld([-1,0,1]),[-.5,0,.5]);
 const world=w();world.setBlock([-17,0,15],s());assert.deepEqual(parseWorld(serializeWorld(world)).getBlock([-17,0,15]),normalizeState(s()));
});
test('slabs merge, collisions reject, and only one occupant owns a cell',()=>{
 const world=w();world.setBlock([0,0,0],s('slab'));assert.throws(()=>world.setBlock([0,0,0],s()),/Occupied/);
 world.setBlock([0,0,0],s('slab',{half:'top'}));assert.equal(world.getBlock([0,0,0]).model,'cube');
 assert.throws(()=>world.setBlock([1,0,0],s('stairs',{facing:'up'})),/Invalid/);
 assert.throws(()=>world.setBlock([1,0,0],s('door')),/placeInstance/);
});
test('all stair shapes/rotations have bounded geometry and correct volume',()=>{
 const volume=boxes=>boxes.reduce((n,b)=>n+b.max.reduce((v,end,i)=>v*(end-b.min[i]),1),0);
 for(const facing of DIRECTIONS)for(const half of ['top','bottom'])for(const shape of ['straight','inner-left','inner-right','outer-left','outer-right']){
  const boxes=modelBoxes(normalizeState(s('stairs',{facing,half,shape})));
  assert.equal(volume(boxes),shape.startsWith('inner')?.875:shape.startsWith('outer')?.625:.75);
  assert.ok(boxes.every(b=>b.min.every(v=>v>=0)&&b.max.every(v=>v<=1)));
 }
 for(const facing of DIRECTIONS)assert.equal(volume(modelBoxes(normalizeState(s('vertical-slab',{facing})))),.5);
 for(const axis of ['x','y','z'])assert.equal(volume(modelBoxes(normalizeState(s('pillar',{axis,width:.5})))),.25);
});
test('clothesline posts share one baseline and remain exactly parallel',()=>{
 const boxes=modelBoxes(normalizeState(s('clothesline'))),posts=boxes.filter(b=>b.color==='#744c2c');
 assert.equal(posts.length,2);
 for(const post of posts){assert.equal(post.min[1],0);assert.equal(post.max[1],5);assert.ok(Math.abs(post.max[0]-post.min[0]-.3)<1e-9);assert.ok(Math.abs(post.max[2]-post.min[2]-.3)<1e-9);}
 assert.equal(posts[0].min[2],posts[1].min[2]);
});
test('support uses real slab and stair surfaces, not the full cell',()=>{
 const world=w();world.setBlock([0,0,0],s('slab'));assert.equal(world.querySupport({x:.3,z:.3}).height,.5);
 assert.throws(()=>world.setBlock([0,1,0],s('flower')),/Unsupported/);
 world.setBlock([1,0,0],s('stairs'));
 assert.equal(world.querySupport({x:1.5,z:.25}).height,.5);assert.equal(world.querySupport({x:1.5,z:.75}).height,1);
});
test('wall attachments require backing, and crate stacks rest on actual top surfaces',()=>{
 const world=w();floor(world);
 assert.throws(()=>world.placeInstance({id:'light',anchor:[0,1,1],state:s('wall-lantern')}),/Unsupported wall/);
 world.setBlock([0,2,0],s());world.placeInstance({id:'light',anchor:[0,1,1],state:s('wall-lantern')});
 world.placeInstance({id:'crate-bottom',anchor:[3,0,0],state:s('crate')});world.placeInstance({id:'crate-top',anchor:[3,1,0],state:s('crate')});
 assert.equal(validateWorld(world).valid,true);world.removeAt([0,2,0]);assert.equal(validateWorld(world).valid,false);
});
test('multi-cell placement, rotation, state and deletion are atomic across chunks',()=>{
 const world=w();floor(world);world.placeInstance({id:'door',anchor:[15,0,0],state:s('door')});
 assert.equal(world.getOccupant([16,4,0]).instance.id,'door');
 const before=serializeWorld(world);assert.throws(()=>world.updateInstance('door',{anchor:[31,0,0]}),/outside/);assert.equal(serializeWorld(world),before);
 world.setBlock([15,0,2],s());assert.throws(()=>world.updateInstance('door',{state:s('door',{open:true})}),/collision|blocked/);assert.equal(world.instances.get('door').state.props.open,false);
 world.removeAt([15,0,2]);world.updateInstance('door',{state:s('door',{open:true})});assert.equal(world.getOccupant([16,4,0]),null);
 world.updateInstance('door',{state:s('door',{facing:'north'})});assert.ok(world.dirtyChunks.has('0,0,-1'));
 world.removeAt([14,4,0]);assert.equal(world.instances.size,0);assert.equal(world.occupancy.size,0);
});
test('fence connections derive from neighbours and custom models reserve every touched cell',()=>{
 const world=w();floor(world);world.setBlock([0,0,0],s('fence'));world.setBlock([1,0,0],s());assert.deepEqual(world.connections([0,0,0]),['east']);
 world.removeAt([1,0,0]);assert.deepEqual(world.connections([0,0,0]),[]);
 registerBoxModel('test-custom',[{min:[0,0,0],max:[2.25,1,.3]}]);
 world.placeInstance({id:'custom',anchor:[15,1,0],state:s('test-custom')});assert.equal(world.getOccupant([17,1,0]).instance.id,'custom');
 assert.throws(()=>world.setBlock([17,1,0],s()),/collision/);
});
test('partial neighbour coverage removes only the covered part of a face',()=>{
 const world=w();world.setBlock([15,0,0],s());world.setBlock([16,0,0],s('slab'));
 const faces=meshWorld(world).flatMap(c=>c.faces).filter(f=>f.axis===0&&f.sign===1&&f.plane===16);
 assert.equal(faces.reduce((n,f)=>n+(f.rect[2]-f.rect[0])*(f.rect[3]-f.rect[1]),0),.5);
 world.setBlock([16,0,0],s(),{replace:true});assert.equal(meshWorld(world).flatMap(c=>c.faces).filter(f=>f.axis===0&&f.sign===1&&f.plane===16).length,0);
});
test('arbitrary triangle models reserve visual bounds, without claiming opaque box faces',()=>{
 registerMeshModel('test-triangle',{positions:[0,0,0,2.5,0,0,0,2,1],collisionBoxes:[{min:[0,0,0],max:[.5,1,.5]}]});
 const state=normalizeState(s('test-triangle'));assert.ok(occupiedCells(state).some(p=>p[0]===2));
 const world=w();world.placeInstance({id:'triangle',anchor:[0,0,0],state});assert.equal(meshWorld(world).length,0);
});
test('mesh cache binds to the exact source file and rejects malformed faces',async()=>{
 const world=w();world.setBlock([0,0,0],s());const hash=await sourceDigest(serializeWorld(world)),encoded=encodeMesh(meshWorld(world),hash);
 assert.ok(decodeMesh(encoded,hash).length);assert.throws(()=>decodeMesh(encoded,'stale'),/Stale/);
 const malformed=JSON.parse(encoded);malformed.chunks[0].faces[0][0]=7;assert.throws(()=>decodeMesh(JSON.stringify(malformed),hash),/Invalid/);
});
test('unknown versions, states, invalid RLE and duplicate chunks are rejected',()=>{
 const world=w();world.setBlock([0,0,0],s());const data=JSON.parse(serializeWorld(world));
 for(const edit of [d=>{d.formatVersion=99;},d=>{d.palette[1].model='unknown';},d=>{d.chunks[0].runs=[4097,1];},d=>{d.chunks.push(d.chunks[0]);},d=>{d.palette[1].props={bad:true};}]){
  const copy=structuredClone(data);edit(copy);assert.throws(()=>parseWorld(JSON.stringify(copy)));
 }
});
const saved=readFileSync(new URL('../public/world/harbor.world.json',import.meta.url),'utf8'),harbor=parseWorld(saved);
test('checked-in harbor is deterministic and round-trips without losing instances',()=>{
 const digest=text=>createHash('sha256').update(text).digest('hex');
 assert.equal(digest(serializeWorld(harbor)),digest(saved));assert.equal(digest(serializeWorld(generateHarbor())),digest(saved));assert.equal(validateWorld(harbor).valid,true);
});
test('saved road surfaces form a supported, clear network to five entrances and the dock',()=>{
 const report=validateHarbor(harbor);assert.deepEqual(report.errors,[]);assert.ok(report.walkableCells>1000);
});
test('saved facade details remain place-owned and include the authored shop furniture',()=>{
 const items=[...harbor.instances.values()];
 for(const place of harbor.places){assert.equal(items.filter(i=>i.state.place===place.id&&i.state.model==='wall-lantern').length,2);assert.ok(items.some(i=>i.state.place===place.id&&i.state.model==='planter'));}
 for(const [place,model] of [['bookshop','chalkboard'],['workshop','workshop-bay'],['workshop','anvil-bench'],['workshop','crate'],['station','station-clock'],['observatory','plaque']])assert.ok(items.some(i=>i.state.place===place&&i.state.model===model),`${place}: ${model}`);
});
test('all five blog locations retain original anchors and have supported entrances',()=>{
 assert.equal(harbor.places.length,5);
 for(const p of harbor.places){const [x,y,z]=p.entry.map(v=>v/harbor.cellSize);const ground=harbor.querySupport({x:x+.01,z:z+.01,below:y+.5});assert.ok(ground,`${p.id} unsupported entrance`);assert.ok(Math.abs(ground.height-y)<=.5,`${p.id} entrance height`);}
});
test('saved train stays inside its track and clears the saved terrain',()=>{
 const train=harbor.entities.find(e=>e.type==='train'),r=train.rail,half=(r.cars-1)*r.spacing/2+r.carLength/2;
 for(let t=0;t<2*(r.travel+r.dwell);t+=1){const pose=trainPose(t,r);assert.ok(pose.x-half>=r.left&&pose.x+half<=r.right);}
 for(let x=Math.ceil(r.left*2);x<r.right*2-2;x++)for(let z=-54;z<=-53;z++)for(let y=17;y<22;y++)assert.equal(harbor.getOccupant([x,y,z]),null,`train collision ${x},${y},${z}`);
});

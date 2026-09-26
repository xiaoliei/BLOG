import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, readWorldRoute, smooth, ease } from '../src/world/places.js';
import { MODULES } from '../src/config/blog.js';

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
});
test('camera interpolation stays bounded and monotonic for frame delays and endpoints',()=>{
  for(const fn of [smooth,ease]){
    assert.equal(fn(-1),0);assert.equal(fn(0),0);assert.equal(fn(1),1);assert.equal(fn(2),1);
    let previous=0;
    for(let i=0;i<=100;i++){const value=fn(i/100);assert.ok(value>=previous&&value<=1);previous=value;}
  }
});

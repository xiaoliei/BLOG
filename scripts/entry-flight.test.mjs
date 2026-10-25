import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, PerspectiveCamera, Quaternion, Euler } from 'three';
import { ENTRY_DURATION, ENTRY_ORIENTATION_DURATION, smootherstep, createEntryFlight, sampleEntryFlight, entryVisuals } from '../src/world/entry-flight.js';
import { orbitalPose, planetCenter, idlePlanetRotation, samplePlanetRotation, PLANET_TURN_DURATION } from '../src/world/entry-world.js';
import { railHorizonRange, railHorizonTile, RAIL_REPEAT_LENGTH, RAIL_HORIZON_LEFT, OCEAN_SIZE } from '../src/world/rail-horizon.js';
import { readFile } from 'node:fs/promises';
import { parseWorld } from '../src/world/data.js';

function flightFor(aspect) {
  const start = orbitalPose(aspect, -.18);
  const distance = aspect < .85 ? 85 / aspect : 82;
  const end = new Vector3(Math.sin(.28) * distance, aspect < .85 ? distance * .63 : 51, Math.cos(.28) * distance);
  return createEntryFlight(start.position, start.target, end, new Vector3(0, 6, 0));
}
const near = (a,b,tolerance=1e-8) => assert.ok(a.distanceTo(b)<tolerance, `${a.toArray()} != ${b.toArray()}`);

test('rail horizon copies the authored bridge cells and preserves texture, sleeper and pier repetition', async () => {
  const world=parseWorld(await readFile(new URL('../public/world/harbor.world.json',import.meta.url),'utf8'));
  const sourceCount=world.blocks.size,tile=railHorizonTile(world);
  const left=world.environment.rail.left/world.cellSize,right=left+RAIL_REPEAT_LENGTH/world.cellSize;
  const source=[...world.blocks.values()].filter(({cell})=>cell[0]>=left&&cell[0]<right);
  assert.equal(tile.blocks.size,source.length);
  assert.ok(source.some(({state})=>state.model==='rail'));
  assert.ok(source.some(({state})=>state.model==='pillar'));
  for(const {cell,state} of source)assert.deepEqual(tile.getBlock(cell),state);
  assert.equal(world.blocks.size,sourceCount,'render-only continuation must not alter the save');
  assert.equal((RAIL_REPEAT_LENGTH/world.cellSize)%3,0,'sleeper spacing');
  assert.equal(RAIL_REPEAT_LENGTH%5,0,'pier spacing');
  assert.equal((RAIL_REPEAT_LENGTH/world.cellSize)%4,0,'pixel texture phase');
});

test('railway endpoints stay beyond the fade horizon throughout the ocean reveal', () => {
  const savedLeft=-156;
  const initial=railHorizonRange(.4,savedLeft);
  assert.ok(initial[1]<Math.abs(savedLeft),'the old saved end must disappear before the extension is revealed');
  let previous=initial;
  for(let scale=.4;scale<=1.001;scale+=.005){
    const range=railHorizonRange(scale,savedLeft);
    assert.ok(range[0]>80,'near railway and station stay opaque');
    assert.ok(range[1]>range[0]);
    assert.ok(range[1]<Math.abs(RAIL_HORIZON_LEFT),'the new physical endpoint must always be invisible');
    assert.ok(range[1]<OCEAN_SIZE*scale/2,'railway disappears before the physical sea boundary, including ultra-wide screens');
    assert.ok(range[0]>=previous[0]&&range[1]>=previous[1],'horizon reveals continuously outward');
    previous=range;
  }
});

test('capture preserves the real start pose and lands exactly at the responsive overview', () => {
  for(const aspect of [1440/900,390/844,844/390,.3,3]) {
    const flight=flightFor(aspect),start=sampleEntryFlight(flight,0),end=sampleEntryFlight(flight,ENTRY_DURATION);
    near(start.position,flight.position);near(start.target,flight.target);
    near(end.position,flight.destination);near(end.target,flight.destinationTarget);
    const oriented=sampleEntryFlight(flight,ENTRY_ORIENTATION_DURATION);
    near(oriented.direction,end.direction);
    assert.ok(oriented.distance>end.distance,'the final approach continues after the viewing angle settles');
    near(sampleEntryFlight(flight,-1).position,flight.position);
    near(sampleEntryFlight(flight,10).position,flight.destination);
    assert.equal(flight.distance,flight.position.distanceTo(flight.target));
  }
});

test('focus moves once to the town, while distance decreases and the lens stays below 25 degrees/second', () => {
  for(const aspect of [1440/900,390/844,844/390])for(const frameRate of [30,60,144]) {
    const flight=flightFor(aspect),camera=new PerspectiveCamera(40,aspect,.08,30000);
    let previousDistance=Infinity,previousRotation=null;
    for(let time=0;time<=ENTRY_DURATION;time+=1/frameRate) {
      const pose=sampleEntryFlight(flight,time);
      assert.ok(pose.position.toArray().every(Number.isFinite));
      assert.ok(pose.distance<=previousDistance+1e-8);previousDistance=pose.distance;
      assert.ok(Math.abs(pose.direction.y)<.9,'up-vector singularity');
      if(time<.35)near(pose.target,flight.target);
      if(time>=2.45)near(pose.target,flight.destinationTarget);
      camera.position.copy(pose.position);camera.lookAt(pose.target);
      if(previousRotation)assert.ok(previousRotation.angleTo(camera.quaternion)*frameRate*180/Math.PI<=25);
      previousRotation=camera.quaternion.clone();
    }
  }
});

test('position, velocity and acceleration are continuous at every storyboard boundary', () => {
  const flight=flightFor(1440/900),h=1e-4;
  for(const time of [.35,.45,1.9,2.45,PLANET_TURN_DURATION,3.15,ENTRY_ORIENTATION_DURATION,4.15]) {
    for(const key of ['position','target']) {
      const f=t=>sampleEntryFlight(flight,t)[key];
      const middle=f(time),left=f(time-h),right=f(time+h);
      const leftVelocity=middle.clone().sub(left).divideScalar(h);
      const rightVelocity=right.clone().sub(middle).divideScalar(h);
      assert.ok(leftVelocity.distanceTo(rightVelocity)<2,'velocity jump');
      const leftAcceleration=middle.clone().add(f(time-2*h)).addScaledVector(left,-2).divideScalar(h*h);
      const rightAcceleration=right.clone().multiplyScalar(-2).add(middle).add(f(time+2*h)).divideScalar(h*h);
      assert.ok(leftAcceleration.distanceTo(rightAcceleration)<10,'acceleration jump');
    }
  }
});

test('environment and chrome use deterministic preview progress, with no unfinished exit at completion', () => {
  assert.equal(smootherstep(-1),0);assert.equal(smootherstep(2),1);
  const first=entryVisuals(0),last=entryVisuals(ENTRY_DURATION);
  assert.equal(first.ui,1);assert.equal(first.atmosphere,0);assert.equal(first.header,0);
  assert.equal(last.ui,0);assert.equal(last.atmosphere,1);
  assert.equal(last.header,1);assert.equal(last.labels,1);assert.equal(last.navigation,1);
  assert.equal(entryVisuals(.45).ui,0);
  assert.equal(entryVisuals(2.55).atmosphere,1);
  assert.deepEqual(entryVisuals(2.45),entryVisuals(2.45));
});

test('original GLB starts at its old rotation and the island back face turns into the upright world', () => {
  const backToUp=new Quaternion().setFromEuler(new Euler(Math.PI/2,0,0));
  for(const time of [0,1,5]) {
    const start=idlePlanetRotation(time);
    const original=new Quaternion().setFromEuler(new Euler(.44+Math.sin(time*.5)*.025,-.6,-.205));
    assert.ok(start.clone().multiply(backToUp).angleTo(original)<1e-7);
    const normal=new Vector3(0,1,0).applyQuaternion(start);
    assert.ok(normal.z<0,'island starts on the hidden back face');
    near(new Vector3(0,1,0).applyQuaternion(samplePlanetRotation(start,PLANET_TURN_DURATION)),new Vector3(0,1,0));
    assert.ok(samplePlanetRotation(start,ENTRY_DURATION).angleTo(new Quaternion())<1e-7);
  }
});

test('rotating island focus is continuous and finishes at the existing world coordinates', () => {
  const flight=flightFor(1440/900),center=planetCenter(-.18),rotation=idlePlanetRotation(0);
  const destination=t=>flight.destinationTarget.clone().sub(center).applyQuaternion(samplePlanetRotation(rotation,t)).add(center);
  let previous=null;
  for(let t=0;t<=ENTRY_DURATION+.001;t+=1/120) {
    const movingTarget=destination(t),movingCamera=flight.destination.clone().sub(flight.destinationTarget).add(movingTarget);
    const pose=sampleEntryFlight(flight,t,movingCamera,movingTarget);
    if(previous)assert.ok(pose.target.distanceTo(previous)<8,'rotating focus jumps');
    if(t>=2.45)near(pose.target,movingTarget);
    previous=pose.target;
  }
  near(destination(ENTRY_DURATION),flight.destinationTarget);
});

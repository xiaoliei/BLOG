import * as THREE from 'three';
import { buildTown } from './town.js';
import { PLACES, clamp, ease } from './places.js';
import { parseWorld } from './data.js';
import { decodeMesh, sourceDigest } from './mesh-cache.js';
import { localDateAtMinutes, localWorldTime } from '../lib/local-time.js';
import { ENTRY_DURATION, createEntryFlight, sampleEntryFlight, entryVisuals, smootherstep } from './entry-flight.js';
import { buildEntryWorld, orbitalPose } from './entry-world.js';

export function createWorldEngine(canvas, { onReady, onPhase, onSelect, onError, onStats, onLabels, onEntryProgress = () => {}, initialRoute, reducedMotion, islandNameRef }) {
  const bootAt=performance.now();let readyMs=null;
  // Development-only fault injection exercises the same public recovery paths.
  const diagnostics=import.meta.env.DEV&&new URLSearchParams(location.search).has('worldDebug')?new URLSearchParams(location.search):new URLSearchParams();
  if(diagnostics.get('renderer')==='off')throw new Error('WebGL disabled for recovery verification');
  if(diagnostics.get('motion')==='reduce')reducedMotion=true;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.35 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = innerWidth >= 700;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();scene.fog=new THREE.Fog('#82dafa',140,300);
  const ambient=new THREE.HemisphereLight('#f0fcff','#83a263',2.25);scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff2d3',2.4);sun.position.set(-40,75,45);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:1,far:180});sun.shadow.normalBias=.055;scene.add(sun);
  const frozenLightingDate=diagnostics.has('entryFrame')&&Number.isFinite(Number(diagnostics.get('entryFrame')))?new Date():null;
  let lastLightingUpdate=0, timeOverrideMinutes=null, lighting;
  const skyColor=new THREE.Color(),spaceLightColor=new THREE.Color('#ffffff'),spaceAmbientColor=new THREE.Color('#c6eeff');
  const localAmbientColor=new THREE.Color('#f0fcff'),spaceSunPosition=new THREE.Vector3(-40,70,90);
  const localSunColor=new THREE.Color(),localSunPosition=new THREE.Vector3();
  function updateLocalLighting(force=false){
    const now=Date.now();
    if(!force&&now-lastLightingUpdate<15000)return;
    lastLightingUpdate=now;
    const current=frozenLightingDate||new Date(now);
    lighting=localWorldTime(timeOverrideMinutes===null?current:localDateAtMinutes(timeOverrideMinutes,current));
    skyColor.set(lighting.sky);scene.fog.color.copy(skyColor);
    localSunColor.set(lighting.light);localSunPosition.set(lighting.sunX,lighting.elevation,lighting.sunZ);
  }
  updateLocalLighting(true);
  let town = null, entryWorld = null;
  const inspectionView=diagnostics.get('view');
  const camera = inspectionView?new THREE.OrthographicCamera(-50,50,43,-43,.08,30000):new THREE.PerspectiveCamera(40,1,.08,30000);
  let disposed=false, ready=false, phase=initialRoute.home?'world':'loading', selected=initialRoute.place;
  let aspect=1, width=1,height=1, raf, start=0, clock=0, timeBase=null, fly=null, yaw=0, zoom=1, orbitDistance=8640;
  let visibility=document.visibilityState, entryFlight=null, entrySeconds=0, retarget=null, entryRotation=null;
  let stats={frames:0,seconds:0,last:0}, labelsAt=0, pointer=null;
  const debugParams=diagnostics;
  const requestedFrame=Number(debugParams.get('entryFrame'));
  const previewFrame=debugParams.has('worldDebug')&&debugParams.has('entryFrame')&&Number.isFinite(requestedFrame)?clamp(requestedFrame):null;
  const target=new THREE.Vector3(), moveFrom=new THREE.Vector3(), targetFrom=new THREE.Vector3();
  const desired=new THREE.Vector3(),desiredTarget=new THREE.Vector3();
  const entryDestination=new THREE.Vector3(),entryTarget=new THREE.Vector3();
  function homePose() {
    if(inspectionView){
      const poses={top:[0,130,.001],front:[0,55,100],east:[100,55,0],back:[0,55,-100],west:[-100,55,0]};
      desired.set(...(poses[inspectionView]||poses.front));desiredTarget.set(0,5,0);return;
    }
    const mobile=aspect<.85;
    const distance=(mobile?85/aspect:82)*zoom;
    const angle=.28+yaw;
    desired.set(Math.sin(angle)*distance, mobile?distance*.63:51,Math.cos(angle)*distance);
    desiredTarget.set(0,6,0);
  }
  function placePose(id) {
    const p=town?.placeMap[id]; if(!p){homePose();return;}
    const [x,y,z]=p.position; const mobile=aspect<.85;
    const offset=mobile?p.camera?.mobileOffset:p.camera?.desktopOffset;
    const focus=mobile?p.camera?.mobileTarget:p.camera?.desktopTarget;
    desired.set(x+(offset?.[0]??(mobile?17:15)),y+(offset?.[1]??(mobile?23:17)),z+(offset?.[2]??(mobile?49:29)));
    // Leave the right third (desktop) or bottom third (phone) for real DOM content.
    desiredTarget.set(x+(focus?.[0]??(mobile?0:6)),y+(focus?.[1]??(mobile?1:4)),z+(focus?.[2]??0));
  }
  function applyPose(){if(selected)placePose(selected);else homePose();}
  function moveTo(id,instant=false) {
    selected=id;applyPose();
    if(instant||reducedMotion){camera.position.copy(desired);target.copy(desiredTarget);fly=null;}
    else{moveFrom.copy(camera.position);targetFrom.copy(target);fly={at:clock,duration:1.15,to:desired.clone(),target:desiredTarget.clone()};}
  }
  function idlePose(time=clock) {
    const pose=orbitalPose(aspect,entryWorld?.seaLevel??-.18,reducedMotion?0:time);
    camera.position.copy(pose.position);target.copy(pose.target);camera.lookAt(target);
    entryWorld?.setIdle(reducedMotion?0:time);
  }
  function progress(seconds) {
    const visuals=entryVisuals(seconds);onEntryProgress(visuals);
    return visuals;
  }
  function flightDestination() {
    if(retarget){
      const a=smootherstep((clock-retarget.at)/.7);
      entryDestination.lerpVectors(retarget.position,retarget.to,a);
      entryTarget.lerpVectors(retarget.target,retarget.toTarget,a);
      if(a>=1)retarget=null;
    }
  }
  function finishEntry() {
    entryFlight=null;retarget=null;fly=null;selected=null;
    entryWorld?.setWorld();
    homePose();camera.position.copy(desired);target.copy(desiredTarget);camera.lookAt(target);
    entrySeconds=ENTRY_DURATION;progress(ENTRY_DURATION);emitPhase('world');
  }
  function resize() {
    width=canvas.clientWidth||1;height=canvas.clientHeight||1;aspect=width/height;
    const orbit=orbitalPose(aspect,entryWorld?.seaLevel??-.18,0);orbitDistance=orbit.position.distanceTo(orbit.target);
    renderer.setSize(width,height,false);camera.aspect=aspect;
    if(camera.isOrthographicCamera){const half=Math.max(39,36/aspect);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;}
    camera.updateProjectionMatrix();
    if(phase==='world'||phase==='focused')moveTo(selected,true);
    else if(phase==='entering'&&entryFlight){
      flightDestination();homePose();
      retarget={at:clock,position:entryDestination.clone(),target:entryTarget.clone(),to:desired.clone(),toTarget:desiredTarget.clone()};
    }else idlePose();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function emitPhase(next){phase=next;onPhase(next);}
  function enter(){
    if(!ready||!['idle','loading'].includes(phase))return;
    if(reducedMotion){finishEntry();return;}
    homePose();entryDestination.copy(desired);entryTarget.copy(desiredTarget);
    entryFlight=createEntryFlight(camera.position,target,desired,desiredTarget);
    entryRotation=entryWorld?.captureRotation();
    start=clock;entrySeconds=0;fly=null;retarget=null;progress(0);emitPhase('entering');
  }
  function navigate(route){
    if(route.home){
      // The hash written by entry completion echoes back here. Do not launch
      // another 1.15-second flight at the already settled overview.
      if((phase==='world'||phase==='focused')&&selected===route.place)return;
      const instant=['loading','idle','entering'].includes(phase);
      entryWorld?.setWorld();
      entryFlight=null;retarget=null;progress(ENTRY_DURATION);moveTo(route.place,instant);emitPhase(route.place?'focused':'world');
    }else {
      selected=null;entryFlight=null;retarget=null;fly=null;yaw=0;zoom=1;entrySeconds=0;progress(0);
      idlePose();
      emitPhase(ready?'idle':'loading');
    }
  }
  function rotate(delta){if(phase!=='world')return;yaw=clamp(yaw+delta,-1.1,1.1);moveTo(null);}
  function wheel(event){if(phase==='idle'){if(Math.abs(event.deltaY)>4)enter();return;}if(phase!=='world')return;event.preventDefault();zoom=clamp(zoom+event.deltaY*.0006,.75,1.3);moveTo(null);}
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function intersect(e){if(!town)return null;const rect=canvas.getBoundingClientRect();ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);return town.pick(ray.intersectObjects(town.pickables,false)[0])?.place;}
  function down(e){if(e.button!==0)return;pointer={x:e.clientX,y:e.clientY,last:e.clientX,moved:false};canvas.setPointerCapture(e.pointerId);}
  function move(e){
    if(pointer){if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.moved=true;if(pointer.moved&&phase==='world'){yaw=clamp(yaw-(e.clientX-pointer.last)*.004,-1.1,1.1);moveTo(null,true);}pointer.last=e.clientX;}
    else if(phase==='world'||phase==='focused')canvas.style.cursor=intersect(e)?'pointer':'grab';
  }
  function up(e){if(!pointer)return;const moved=pointer.moved;pointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(moved)return;if(phase==='idle')enter();else if(phase==='world'||phase==='focused'){const id=intersect(e);if(id)onSelect(id);}}
  const cancel=()=>{pointer=null;};
  const lost=e=>{e.preventDefault();onError('三维画面已中断，可以继续使用地点目录，或重新载入。');};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('webglcontextlost',lost);
  const onVisibility=()=>{visibility=document.visibilityState;timeBase=null;if(visibility==='visible')updateLocalLighting(true);};document.addEventListener('visibilitychange',onVisibility);
  const loadAbort=new AbortController();const timeout=setTimeout(()=>loadAbort.abort(),12000);
  async function prepare(){
    try{
      const meshRequest=fetch(`${import.meta.env.BASE_URL}world/harbor.mesh.json`,{signal:loadAbort.signal}).then(r=>r.ok?r.text():null).catch(()=>null);
      const path=diagnostics.get('world')==='missing'?'missing.world.json':'harbor.world.json';
      const response=await fetch(`${import.meta.env.BASE_URL}world/${path}`,{signal:loadAbort.signal});
      if(!response.ok)throw new Error(`World HTTP ${response.status}`);
      const text=await response.text();if(disposed)return;
      const world=parseWorld(text);if(disposed)return;
      if(world.places.length!==PLACES.length||PLACES.some(p=>!world.places.some(s=>s.id===p.id)))throw new Error('World/blog place mismatch');
      let preparedMesh=null;
      try{const meshText=await meshRequest;if(meshText)preparedMesh=decodeMesh(meshText,await sourceDigest(text));}catch{/* A stale/missing derived cache is rebuilt from the validated save. */}
      if(disposed)return;
      town=buildTown(scene,world,{compact:innerWidth<700,preparedMesh});
      if(phase==='world'||phase==='focused')moveTo(selected,true);
    }catch(error){clearTimeout(timeout);if(!disposed)onError(`${islandNameRef.current}的存档未能载入，已切换为静态预览。地点目录仍可使用。`);return;}
    try{
      if(diagnostics.get('loadDelay'))await new Promise(resolve=>setTimeout(resolve,clamp(Number(diagnostics.get('loadDelay')),0,5000)));
      if(disposed)return;
      const modelFile=diagnostics.get('earth')==='missing'?'missing-earth.glb':'mc_head.glb';
      entryWorld=await buildEntryWorld(scene,town,{modelUrl:`${import.meta.env.BASE_URL}models/${modelFile}`,signal:loadAbort.signal});
      if(disposed){entryWorld.dispose();return;}
      // Upload town textures and shaders before the user can launch the flight.
      const savedPosition=camera.position.clone(),savedTarget=target.clone();
      const rt=new THREE.WebGLRenderTarget(32,32);homePose();camera.position.copy(desired);camera.lookAt(desiredTarget);
      entryWorld.setWorld();renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);rt.dispose();
      if(phase==='world'||phase==='focused')entryWorld.setWorld();else entryWorld.setIdle(reducedMotion?0:clock);
      camera.position.copy(savedPosition);target.copy(savedTarget);camera.lookAt(target);
      readyMs=Math.round(performance.now()-bootAt);ready=true;if(phase==='loading')emitPhase('idle');else if(phase==='world'||phase==='focused'){moveTo(selected,true);onPhase(phase);}onReady();
      if(previewFrame!==null){idlePose(0);enter();}
    }catch(error){if(!disposed)onError(`地球资源未能载入。可以直接浏览${islandNameRef.current}，或重新载入。`,true);}
    finally{clearTimeout(timeout);}
  }
  function tick(now){
    if(disposed)return;raf=requestAnimationFrame(tick);
    if(visibility==='hidden')return;
    const elapsed=timeBase===null?0:(now-timeBase)/1000;const dt=Math.min(elapsed,.06);timeBase=now;clock+=dt;
    updateLocalLighting();
    let visuals;
    if(phase==='loading'||phase==='idle'){
      idlePose();visuals=progress(0);
    }else if(phase==='entering'){
      entrySeconds=previewFrame!==null?previewFrame*ENTRY_DURATION:Math.min(ENTRY_DURATION,clock-start);
      flightDestination();
      entryWorld?.setEntry(entrySeconds,entryRotation);
      // Track the real island while its parent rotates, preserving the same
      // spherical view direction and zoom distance rather than aiming at air.
      const movingTarget=entryWorld?entryWorld.worldPoint(entryTarget):entryTarget;
      const movingDestination=entryDestination.clone().sub(entryTarget).add(movingTarget);
      const pose=sampleEntryFlight(entryFlight,entrySeconds,movingDestination,movingTarget);
      camera.position.copy(pose.position);target.copy(pose.target);visuals=progress(entrySeconds);
      camera.lookAt(target);
      if(entrySeconds>=ENTRY_DURATION&&previewFrame===null&&!retarget)finishEntry();
    }else{
      if(fly){const a=ease((clock-fly.at)/fly.duration);camera.position.lerpVectors(moveFrom,fly.to,a);target.lerpVectors(targetFrom,fly.target,a);if(a>=1)fly=null;}
      camera.lookAt(target);
      entryWorld?.setWorld();
      visuals=progress(ENTRY_DURATION);
    }
    const atmosphere=visuals.atmosphere;
    const fogOffset=aspect<.85?85/aspect-82:0;
    scene.fog.near=Math.exp(Math.log(orbitDistance*1.4)*(1-atmosphere)+Math.log(140+fogOffset)*atmosphere);
    scene.fog.far=Math.exp(Math.log(orbitDistance*2.8)*(1-atmosphere)+Math.log(300+fogOffset)*atmosphere);
    if(phase==='entering'){
      // A portrait flight starts further out. Keep its actual focus outside
      // the fog ramp too, rather than letting the harbor dissolve mid-flight.
      const visibility=1-smootherstep((entrySeconds-3.15)/.8);
      const focusDistance=camera.position.distanceTo(target);
      const clearNear=Math.max(scene.fog.near,focusDistance*1.05);
      const clearFar=Math.max(scene.fog.far,clearNear+350);
      scene.fog.near=THREE.MathUtils.lerp(scene.fog.near,clearNear,visibility);
      scene.fog.far=THREE.MathUtils.lerp(scene.fog.far,clearFar,visibility);
    }
    ambient.intensity=THREE.MathUtils.lerp(2.1,lighting.ambient,atmosphere);
    ambient.color.copy(spaceAmbientColor).lerp(localAmbientColor,atmosphere);
    sun.intensity=THREE.MathUtils.lerp(3,lighting.sun,atmosphere);
    sun.color.copy(spaceLightColor).lerp(localSunColor,atmosphere);
    sun.position.copy(spaceSunPosition).lerp(localSunPosition,atmosphere);
    // The flight's focus-aware fog can extend beyond the ordinary home range.
    // Never clip the sea/planet before it has completely merged into the sky.
    const far=Math.max(600,scene.fog.far+50,orbitDistance*3*(1-atmosphere));
    const near=THREE.MathUtils.lerp(5,.08,atmosphere);
    if(camera.far!==far||camera.near!==near){camera.far=far;camera.near=near;camera.updateProjectionMatrix();}
    const animationTime=reducedMotion?0:previewFrame!==null?entrySeconds:clock;
    town?.update(animationTime,diagnostics.has('trainTime')?Number(diagnostics.get('trainTime')):undefined);
    renderer.setClearColor(skyColor,atmosphere);renderer.render(scene,camera);
    if(town&&(phase==='world'||phase==='focused'||phase==='entering'&&visuals.labels>0)&&clock-labelsAt>.08){labelsAt=clock;onLabels(Object.values(town.placeMap).map(p=>{const point=new THREE.Vector3(...p.label);const v=(entryWorld?entryWorld.worldPoint(point):point).project(camera);return {id:p.id,x:(v.x+1)*width/2,y:(1-v.y)*height/2,visible:v.z<1&&v.x>-1&&v.x<1&&v.y>-1&&v.y<1};}));}
    const cameraState=fly||phase==='entering'?'moving':'settled';
    if(canvas.dataset.cameraState!==cameraState)canvas.dataset.cameraState=cameraState;
    if(diagnostics.has('worldDebug')){
      canvas.dataset.frameTime=String(now);
      canvas.dataset.planetRotation=entryWorld?.root.quaternion.toArray().join(',')||'';
      canvas.dataset.cameraFar=String(camera.far);canvas.dataset.fogFar=String(scene.fog.far);
      canvas.dataset.entrySeconds=String(entrySeconds);canvas.dataset.cameraPosition=camera.position.toArray().join(',');
      canvas.dataset.cameraTarget=target.toArray().join(',');canvas.dataset.cameraQuaternion=camera.quaternion.toArray().join(',');
      canvas.dataset.atmosphere=String(atmosphere);canvas.dataset.overlayCalls='0';canvas.dataset.drawCalls=String(renderer.info.render.calls);
    }
    stats.frames++;stats.seconds+=elapsed;
    if(stats.seconds>2){onStats({fps:Math.round(stats.frames/stats.seconds),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,readyMs});stats.frames=0;stats.seconds=0;}
  }
  if(initialRoute.home){moveTo(selected,true);phase=selected?'focused':'world';progress(ENTRY_DURATION);}else idlePose();raf=requestAnimationFrame(tick);prepare();
  return {enter,navigate,rotate,reset(){yaw=0;zoom=1;moveTo(null);},setTimeOverride(minutes){
    if(!import.meta.env.DEV)return;
    timeOverrideMinutes=Number.isInteger(minutes)&&minutes>=0&&minutes<1440?minutes:null;
    updateLocalLighting(true);
  },setReducedMotion(value){reducedMotion=value;if(value&&phase==='entering')finishEntry();},dispose(){
    disposed=true;clearTimeout(timeout);loadAbort.abort();cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);
    canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('webglcontextlost',lost);
    town?.dispose();entryWorld?.dispose();sun.shadow.map?.dispose();renderer.dispose();
  }};
}

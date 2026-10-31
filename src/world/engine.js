import * as THREE from 'three';
import { buildTown } from './town.js';
import { PLACES, clamp, ease } from './places.js';
import { parseWorld } from './data.js';
import { decodeMesh, sourceDigest } from './mesh-cache.js';
import { ENTRY_DURATION, createEntryFlight, sampleEntryFlight, entryVisuals, smootherstep } from './entry-flight.js';
import { buildEntryWorld, idlePlanetRotation, orbitalPose } from './entry-world.js';
import { computeHomePose, computePlacePose, trackedFlightTargets, projectLabels } from './engine-camera.js';
import { createLightingRig } from './engine-lighting.js';

const YAW_LIMIT=1.1,ZOOM_MIN=.75,ZOOM_MAX=1.3,ROTATE_MARGIN=.12;
const GLIDE_STALE_MS=120,GLIDE_CLAMP=.8,GLIDE_NUDGE=.45,GLIDE_DECAY=9,GLIDE_STOP=.05;
// 太空中的太阳方位：入场飞行（atmosphere≈0）时的光照起点，随大气混合过渡到地表位置。
const SPACE_SUN_POSITION=new THREE.Vector3(-40,70,90);

export function createWorldEngine(canvas, { onReady, onPhase, onSelect, onError, onStats, onLabels, onEntryProgress = () => {}, onRotateBounds = () => {}, initialRoute, reducedMotion, islandNameRef }) {
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
  // 时刻→天空/太阳参数的换算与 15 秒节流收敛到 engine-lighting.js。
  const lighting=createLightingRig({scene,frozenDate:diagnostics.has('entryFrame')&&Number.isFinite(Number(diagnostics.get('entryFrame')))?new Date():null});
  let town = null, entryWorld = null;
  const inspectionView=diagnostics.get('view');
  const camera = inspectionView?new THREE.OrthographicCamera(-50,50,43,-43,.08,30000):new THREE.PerspectiveCamera(40,1,.08,30000);
  let disposed=false, ready=false, phase=initialRoute.home?'world':'loading', selected=initialRoute.place;
  let aspect=1, width=1,height=1, raf, start=0, clock=0, timeBase=null, fly=null, yaw=0, zoom=1, orbitDistance=8640;
  let visibility=document.visibilityState, entryFlight=null, entrySeconds=0, retarget=null, entryRotation=null;
  let stats={frames:0,seconds:0,last:0}, labelsAt=0, yawVelocity=0, rotateBounds='';
  const pointers=new Map();let pointer=null,pinch=null;
  const debugParams=diagnostics;
  const requestedFrame=Number(debugParams.get('entryFrame'));
  const previewFrame=debugParams.has('worldDebug')&&debugParams.has('entryFrame')&&Number.isFinite(requestedFrame)?clamp(requestedFrame):null;
  const target=new THREE.Vector3(), moveFrom=new THREE.Vector3(), targetFrom=new THREE.Vector3();
  const entryDestination=new THREE.Vector3(),entryTarget=new THREE.Vector3();
  const desired=new THREE.Vector3(),desiredTarget=new THREE.Vector3();
  function homePose() {
    const pose=computeHomePose({ inspectionView, aspect, zoom, yaw });
    desired.set(...pose.position);desiredTarget.set(...pose.target);
  }
  function placePose(id) {
    const p=town?.placeMap[id]; if(!p){homePose();return;}
    const pose=computePlacePose(p,aspect);
    desired.set(...pose.position);desiredTarget.set(...pose.target);
  }
  function applyPose(){if(selected)placePose(selected);else homePose();}
  function moveTo(id,instant=false) {
    selected=id;applyPose();
    if(id)yawVelocity=0;
    if(instant||reducedMotion){camera.position.copy(desired);target.copy(desiredTarget);fly=null;}
    else{moveFrom.copy(camera.position);targetFrom.copy(target);fly={at:clock,duration:1.15,to:desired.clone(),target:desiredTarget.clone()};}
    emitRotateBounds();
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
      // retarget.position/target 是本地坐标快照；世界追踪统一在 tick 的
      // trackedFlightTargets 一处做，这里只做本地空间的插值。
      entryDestination.lerpVectors(retarget.position,retarget.to,a);
      entryTarget.lerpVectors(retarget.target,retarget.toTarget,a);
      if(a>=1)retarget=null;
    }
  }
  function finishEntry() {
    entryFlight=null;retarget=null;fly=null;selected=null;
    entryWorld?.setWorld();
    homePose();camera.position.copy(desired);target.copy(desiredTarget);camera.lookAt(target);
    emitRotateBounds();
    entrySeconds=ENTRY_DURATION;progress(ENTRY_DURATION);emitPhase('world');
  }
  // Leaving replays the entry flight mirrored: the flight is built from the
  // orbital rest pose to the current view, then sampled on a reversed clock,
  // so planet spin, ocean, fog and UI all unwind through the same formulas.
  function leave(){
    if(!ready||!entryWorld||reducedMotion||!['world','focused'].includes(phase))return false;
    if(phase==='leaving')return true;
    entryDestination.copy(camera.position);entryTarget.copy(target);
    const orbit=orbitalPose(aspect,entryWorld.seaLevel);
    entryFlight=createEntryFlight(orbit.position,orbit.target,entryDestination,entryTarget);
    entryRotation=idlePlanetRotation(clock);
    selected=null;fly=null;retarget=null;yawVelocity=0;pointers.clear();pinch=null;
    start=clock;entrySeconds=ENTRY_DURATION;progress(ENTRY_DURATION);emitPhase('leaving');
    return true;
  }
  function finishLeave(){
    entryFlight=null;retarget=null;fly=null;selected=null;yaw=0;zoom=1;yawVelocity=0;
    idlePose();emitPhase('idle');
  }
  function resize() {
    width=canvas.clientWidth||1;height=canvas.clientHeight||1;aspect=width/height;
    const orbit=orbitalPose(aspect,entryWorld?.seaLevel??-.18,0);orbitDistance=orbit.position.distanceTo(orbit.target);
    renderer.setSize(width,height,false);camera.aspect=aspect;
    if(camera.isOrthographicCamera){const half=Math.max(39,36/aspect);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;}
    camera.updateProjectionMatrix();
    if(phase==='world'||phase==='focused')moveTo(selected,true);
    else if((phase==='entering'||phase==='leaving')&&entryFlight){
      flightDestination();
      const orbit=orbitalPose(aspect,entryWorld?.seaLevel??-.18);
      if(phase==='entering')homePose();else idlePose();
      retarget={at:clock,position:entryDestination.clone(),target:entryTarget.clone(),to:desired.clone(),toTarget:desiredTarget.clone()};
      if(phase==='leaving'){retarget.to.set(orbit.position.x,orbit.position.y,orbit.position.z);retarget.toTarget.copy(orbit.target);}
    }else idlePose();
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function emitPhase(next){phase=next;onPhase(next);}
  function enter(){
    if(!ready||!['idle','loading','leaving'].includes(phase))return;
    if(reducedMotion){finishEntry();return;}
    // Cutting a leave short starts from wherever the unwind has reached, so
    // the planet simply turns back around instead of snapping to its rest.
    entryRotation=entryWorld?.captureRotation();
    homePose();entryDestination.copy(desired);entryTarget.copy(desiredTarget);
    entryFlight=createEntryFlight(camera.position,target,desired,desiredTarget);
    start=clock;entrySeconds=0;fly=null;retarget=null;progress(0);emitPhase('entering');
  }
  function navigate(route){
    if(route.home){
      // The hash written by entry completion echoes back here. Do not launch
      // another 1.15-second flight at the already settled overview.
      if((phase==='world'||phase==='focused')&&selected===route.place)return;
      const instant=['loading','idle','entering','leaving'].includes(phase);
      entryWorld?.setWorld();
      entryFlight=null;retarget=null;progress(ENTRY_DURATION);moveTo(route.place,instant);emitPhase(route.place?'focused':'world');
    }else if(leave()){
      // The world camera is unwinding back to the planet; only the hash echo
      // is left to settle, and re-entering must be able to cut it short.
    }else {
      selected=null;entryFlight=null;retarget=null;fly=null;yaw=0;zoom=1;yawVelocity=0;pointers.clear();pinch=null;entrySeconds=0;progress(0);
      idlePose();
      emitRotateBounds();
      emitPhase(ready?'idle':'loading');
    }
  }
  function emitRotateBounds(){
    const left=yaw>-YAW_LIMIT+ROTATE_MARGIN,right=yaw<YAW_LIMIT-ROTATE_MARGIN,zoomAtBound=zoom<ZOOM_MIN+ROTATE_MARGIN||zoom>ZOOM_MAX-ROTATE_MARGIN;
    // Encode exactly what the buttons consume, or every side-disabled state
    // collapses into the same cached string and the change never propagates.
    const next=`${left?'l':''}${right?'r':''}`;
    if(next!==rotateBounds){rotateBounds=next;onRotateBounds({canRotateLeft:left,canRotateRight:right,zoomAtBound});}
  }
  function rotate(delta){if(phase!=='world')return;yawVelocity=0;yaw=clamp(yaw+delta,-YAW_LIMIT,YAW_LIMIT);moveTo(null);emitRotateBounds();}
  function wheel(event){
    if(phase==='idle'){if(Math.abs(event.deltaY)>4)enter();return;}
    if(phase!=='world')return;event.preventDefault();
    zoom=clamp(zoom+event.deltaY*.0006,ZOOM_MIN,ZOOM_MAX);moveTo(null);emitRotateBounds();
  }
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function intersect(e){if(!town)return null;const rect=canvas.getBoundingClientRect();ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);return town.pick(ray.intersectObjects(town.pickables,false)[0])?.place;}
  // 指针记录存的是 x/y；两指间距必须读同一组字段，
  // 读 clientX 会得到 NaN，NaN 让 move 里的 span>0 守卫恒假，捏合就静默失效。
  function pinchSpan(){const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);}
  function down(e){
    if(e.pointerType==='mouse'&&e.button!==0)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){pointer=null;yawVelocity=0;canvas.setPointerCapture(e.pointerId);pinch={span:pinchSpan(),zoom};return;}
    if(pointers.size>2||e.button!==0)return;
    pointer={x:e.clientX,y:e.clientY,last:e.clientX,lastT:e.timeStamp,moved:false,velocity:0,direction:0};
    canvas.setPointerCapture(e.pointerId);
  }
  function move(e){
    const record=pointers.get(e.pointerId);
    if(record){record.x=e.clientX;record.y=e.clientY;}
    if(pinch){
      if(pointers.size<2){pinch=null;return;}
      if(phase!=='world')return;
      const span=pinchSpan();if(span>0&&pinch.span>0)zoom=clamp(pinch.zoom*pinch.span/span,ZOOM_MIN,ZOOM_MAX);
      moveTo(null,true);emitRotateBounds();return;
    }
    if(pointer){
      if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.moved=true;
      if(pointer.moved&&phase==='world'){
        const step=e.clientX-pointer.last;
        yaw=clamp(yaw-step*.004,-YAW_LIMIT,YAW_LIMIT);
        // Track angular velocity (rad/s) for the release inertia glide.
        const dt=(e.timeStamp-pointer.lastT)/1000;
        if(dt>0){const instant=-step*.004/dt;pointer.velocity=pointer.velocity*.7+instant*.3;}
        pointer.direction=step<0?1:step>0?-1:0;
        if(yaw===-YAW_LIMIT||yaw===YAW_LIMIT)pointer.velocity=0;
        moveTo(null,true);
      }
      pointer.last=e.clientX;pointer.lastT=e.timeStamp;
    }
    else if(phase==='world'||phase==='focused')canvas.style.cursor=intersect(e)?'pointer':'grab';
  }
  function up(e){
    if(pointers.has(e.pointerId)){
      pointers.delete(e.pointerId);
      if(pointers.size<2)pinch=null;
      // Pinch dissolves into a fresh single-finger drag; return before the
      // lift handling below would treat the lifted finger as this pointer.
      if(pointers.size===1){const [rest]=pointers.values();pointer={x:rest.x,y:rest.y,last:rest.x,lastT:e.timeStamp,moved:true,velocity:0,direction:0};return;}
    }
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(!pointer)return;
    const moved=pointer.moved;
    // Launch the inertia glide in the direction the drag ended with, unless
    // the finger paused before lifting (stale velocity) or pushes a wall.
    const stale=(e.timeStamp-pointer.lastT)>GLIDE_STALE_MS;
    if(moved&&phase==='world'&&!stale&&!reducedMotion){
      if(pointer.velocity)yawVelocity=clamp(pointer.velocity,-GLIDE_CLAMP,GLIDE_CLAMP);
      else if(pointer.direction&&!rotateBounds.includes(pointer.direction===1?'r':'l'))yawVelocity=pointer.direction*GLIDE_NUDGE;
    }
    pointer=null;
    if(moved)return;
    if(phase==='leaving')enter();
    else if(phase==='idle')enter();else if(phase==='world'||phase==='focused'){const id=intersect(e);if(id)onSelect(id);}
  }
  const cancel=e=>{pointers.delete(e.pointerId);pinch=null;pointer=null;yawVelocity=0;};
  // Capture can be lost without pointercancel/up; drop just that stale entry.
  const captureLost=e=>{if(pointers.has(e.pointerId)){pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!pointers.size){pointer=null;yawVelocity=0;}}};
  const lost=e=>{e.preventDefault();onError('三维画面已中断，可以继续使用地点目录，或重新载入。');};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',captureLost);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('webglcontextlost',lost);
  const onVisibility=()=>{visibility=document.visibilityState;timeBase=null;if(visibility==='visible')lighting.update(true);};document.addEventListener('visibilitychange',onVisibility);
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
    lighting.update();
    let visuals;
    if(phase==='loading'||phase==='idle'){
      idlePose();visuals=progress(0);
    }else if(phase==='entering'){
      entrySeconds=previewFrame!==null?previewFrame*ENTRY_DURATION:Math.min(ENTRY_DURATION,clock-start);
      flightDestination();
      entryWorld?.setEntry(entrySeconds,entryRotation);
      const {movingTarget,movingDestination}=trackedFlightTargets(entryWorld,entryDestination,entryTarget);
      const pose=sampleEntryFlight(entryFlight,entrySeconds,movingDestination,movingTarget);
      camera.position.copy(pose.position);target.copy(pose.target);visuals=progress(entrySeconds);
      camera.lookAt(target);
      if(entrySeconds>=ENTRY_DURATION&&previewFrame===null&&!retarget)finishEntry();
    }else if(phase==='leaving'){
      // Reverse of the entry: seconds count down to zero while the flight is
      // mirrored (orbital rest -> current view), so visuals unwind unchanged.
      entrySeconds=Math.max(0,ENTRY_DURATION-(clock-start));
      flightDestination();
      const {movingTarget,movingDestination}=trackedFlightTargets(entryWorld,entryDestination,entryTarget);
      const pose=sampleEntryFlight(entryFlight,entrySeconds,movingDestination,movingTarget);
      entryWorld?.setEntry(entrySeconds,entryRotation);
      camera.position.copy(pose.position);target.copy(pose.target);visuals=progress(entrySeconds);
      camera.lookAt(target);
      if(entrySeconds<=0&&previewFrame===null&&!retarget)finishLeave();
    }else{
      if(fly){const a=ease((clock-fly.at)/fly.duration);camera.position.lerpVectors(moveFrom,fly.to,a);target.lerpVectors(targetFrom,fly.target,a);if(a>=1)fly=null;}
      // Drag-inertia glide: a short damped coast, stopping dead at a yaw limit.
      if(yawVelocity&&phase==='world'&&!selected&&!fly){
        yaw=clamp(yaw+yawVelocity*dt,-YAW_LIMIT,YAW_LIMIT);
        yawVelocity*=Math.exp(-dt*GLIDE_DECAY);
        if(yaw===-YAW_LIMIT||yaw===YAW_LIMIT||Math.abs(yawVelocity)<GLIDE_STOP)yawVelocity=0;
        moveTo(null,true);
      }
      camera.lookAt(target);
      entryWorld?.setWorld();
      visuals=progress(ENTRY_DURATION);
    }
    const atmosphere=visuals.atmosphere;
    const fogOffset=aspect<.85?85/aspect-82:0;
    scene.fog.near=Math.exp(Math.log(orbitDistance*1.4)*(1-atmosphere)+Math.log(140+fogOffset)*atmosphere);
    scene.fog.far=Math.exp(Math.log(orbitDistance*2.8)*(1-atmosphere)+Math.log(300+fogOffset)*atmosphere);
    if(phase==='entering'||phase==='leaving'){
      // A portrait flight starts further out. Keep its actual focus outside
      // the fog ramp too, rather than letting the harbor dissolve mid-flight.
      const visibility=1-smootherstep((entrySeconds-3.15)/.8);
      const focusDistance=camera.position.distanceTo(target);
      const clearNear=Math.max(scene.fog.near,focusDistance*1.05);
      const clearFar=Math.max(scene.fog.far,clearNear+350);
      scene.fog.near=THREE.MathUtils.lerp(scene.fog.near,clearNear,visibility);
      scene.fog.far=THREE.MathUtils.lerp(scene.fog.far,clearFar,visibility);
    }
    ambient.intensity=THREE.MathUtils.lerp(2.1,lighting.current.ambient,atmosphere);
    ambient.color.copy(lighting.spaceAmbientColor).lerp(lighting.localAmbientColor,atmosphere);
    sun.intensity=THREE.MathUtils.lerp(3,lighting.current.sun,atmosphere);
    sun.color.copy(lighting.spaceLightColor).lerp(lighting.sunColor,atmosphere);
    sun.position.copy(SPACE_SUN_POSITION).lerp(lighting.sunPosition,atmosphere);
    // The flight's focus-aware fog can extend beyond the ordinary home range.
    // Never clip the sea/planet before it has completely merged into the sky.
    const far=Math.max(600,scene.fog.far+50,orbitDistance*3*(1-atmosphere));
    const near=THREE.MathUtils.lerp(5,.08,atmosphere);
    if(camera.far!==far||camera.near!==near){camera.far=far;camera.near=near;camera.updateProjectionMatrix();}
    const animationTime=reducedMotion?0:previewFrame!==null?entrySeconds:clock;
    town?.update(animationTime,diagnostics.has('trainTime')?Number(diagnostics.get('trainTime')):undefined);
    // 岛屿先于地球模型进场景。启动页的轨道相机会把它缩成一条横线，
    // 这一帧不能画到画布上，否则星空中间会闪出缩放版岛屿。
    const revealScene=!!entryWorld||(phase!=='loading'&&phase!=='idle');
    if(revealScene){renderer.setClearColor(lighting.sky,atmosphere);renderer.render(scene,camera);}
    else{renderer.setClearColor(0x000000,0);renderer.clear(true,true,true);}
    if(town&&(phase==='world'||phase==='focused'||(phase==='entering'||phase==='leaving')&&visuals.labels>0)&&clock-labelsAt>.08){labelsAt=clock;onLabels(projectLabels(town,entryWorld,camera,width,height));}
    const cameraState=fly||phase==='entering'||phase==='leaving'?'moving':'settled';
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
  return {enter,navigate,rotate,reset(){yaw=0;zoom=1;yawVelocity=0;moveTo(null);},setTimeOverride(minutes){
    if(!import.meta.env.DEV)return;
    lighting.setOverride(minutes);
  },setReducedMotion(value){reducedMotion=value;yawVelocity=0;if(value&&phase==='entering')finishEntry();if(value&&phase==='leaving')finishLeave();},dispose(){
    disposed=true;clearTimeout(timeout);loadAbort.abort();cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);
    canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',captureLost);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('webglcontextlost',lost);
    town?.dispose();entryWorld?.dispose();sun.shadow.map?.dispose();renderer.dispose();
  }};
}

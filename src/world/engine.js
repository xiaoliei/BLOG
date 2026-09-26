import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildTown } from './town.js';
import { PLACE_MAP, clamp, smooth, ease } from './places.js';

export function createWorldEngine(canvas, { onReady, onPhase, onSelect, onError, onStats, onLabels, initialRoute, reducedMotion }) {
  // Development-only fault injection exercises the same public recovery paths.
  const diagnostics=import.meta.env.DEV&&new URLSearchParams(location.search).has('worldDebug')?new URLSearchParams(location.search):new URLSearchParams();
  if(diagnostics.get('renderer')==='off')throw new Error('WebGL disabled for recovery verification');
  if(diagnostics.get('motion')==='reduce')reducedMotion=true;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.35 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = innerWidth >= 700;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();scene.background=new THREE.Color('#82dafa');scene.fog=new THREE.Fog('#82dafa',75,180);
  scene.add(new THREE.HemisphereLight('#f0fcff','#83a263',2.25));
  const sun = new THREE.DirectionalLight('#fff2d3',2.4);sun.position.set(-24,45,30);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-31,right:31,top:31,bottom:-31,near:1,far:100});sun.shadow.normalBias=.055;scene.add(sun);
  const town = buildTown(scene);
  const space = new THREE.Scene();
  space.add(new THREE.HemisphereLight('#c6eeff','#23354d',2.1));
  const earthLight=new THREE.DirectionalLight('#ffffff',3);earthLight.position.set(-4,7,9);space.add(earthLight);
  const earth=new THREE.Group();space.add(earth);earth.position.set(0,1.5,0);
  const camera = new THREE.PerspectiveCamera(40,1,.08,600);
  const curtainScene=new THREE.Scene(), curtainCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);
  curtainCamera.position.z=3;
  const cloudMaterial=new THREE.MeshBasicMaterial({color:'#e7f7ff'}), cloudGeometry=new THREE.BoxGeometry(1,1,1);
  const curtainLeft=new THREE.Group(),curtainRight=new THREE.Group();curtainScene.add(curtainLeft,curtainRight);
  // Interlocking voxel edges close the entire frustum only at the scale handoff.
  for(let i=0;i<8;i++) {
    for(const [side,sign] of [[curtainLeft,-1],[curtainRight,1]]) {
      const m=new THREE.Mesh(cloudGeometry,cloudMaterial);m.position.set(sign*(.9+(i%3)*.09),-.99+i*.29,0);m.scale.set(2.2,.32,.2);side.add(m);
    }
  }
  let disposed=false, ready=false, phase=initialRoute.home?'world':'loading', selected=initialRoute.place;
  let aspect=1, width=1,height=1, raf, start=0, clock=0, timeBase=null, fly=null, yaw=0, zoom=1;
  let activeScene=phase==='world'?scene:space, visibility=document.visibilityState;
  let stats={frames:0,seconds:0,last:0}, labelsAt=0, pointer=null;
  const debugParams=new URLSearchParams(location.search);
  const previewFrame=debugParams.has('worldDebug')&&debugParams.has('entryFrame')?clamp(Number(debugParams.get('entryFrame'))):null;
  const target=new THREE.Vector3(), moveFrom=new THREE.Vector3(), targetFrom=new THREE.Vector3();
  const desired=new THREE.Vector3(),desiredTarget=new THREE.Vector3();
  function homePose() {
    const mobile=aspect<.85;
    const distance=(mobile?50/aspect:51)*zoom;
    const angle=.28+yaw;
    desired.set(Math.sin(angle)*distance, mobile?distance*.63:29,Math.cos(angle)*distance);
    desiredTarget.set(0,3,mobile?0:0);
  }
  function placePose(id) {
    const p=PLACE_MAP[id]; if(!p){homePose();return;}
    const [x,y,z]=p.position; const mobile=aspect<.85;
    desired.set(x+(mobile?13:10),y+(mobile?17:11),z+(mobile?36:18));
    // Leave the right third (desktop) or bottom third (phone) for real DOM content.
    desiredTarget.set(x+(mobile?0:4),y+(mobile?.5:3),z);
  }
  function applyPose(){if(selected)placePose(selected);else homePose();}
  function moveTo(id,instant=false) {
    selected=id;applyPose();
    if(instant||reducedMotion){camera.position.copy(desired);target.copy(desiredTarget);fly=null;}
    else{moveFrom.copy(camera.position);targetFrom.copy(target);fly={at:clock,duration:1.15,to:desired.clone(),target:desiredTarget.clone()};}
  }
  function resize() {
    width=canvas.clientWidth||1;height=canvas.clientHeight||1;aspect=width/height;
    renderer.setSize(width,height,false);camera.aspect=aspect;camera.updateProjectionMatrix();
    if(phase==='world'||phase==='focused')moveTo(selected,true);
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function emitPhase(next){phase=next;onPhase(next);}
  function enter(){
    if(!ready||!['idle','loading'].includes(phase))return;
    if(reducedMotion){activeScene=scene;moveTo(null,true);emitPhase('world');return;}
    start=clock;emitPhase('entering');
  }
  function navigate(route){
    if(route.home){activeScene=scene;moveTo(route.place,phase==='loading'||phase==='idle');emitPhase(route.place?'focused':'world');}
    else {selected=null;fly=null;yaw=0;zoom=1;activeScene=space;emitPhase(ready?'idle':'loading');}
  }
  function rotate(delta){if(phase!=='world')return;yaw=clamp(yaw+delta,-1.1,1.1);moveTo(null);}
  function wheel(event){if(phase==='idle'){if(Math.abs(event.deltaY)>4)enter();return;}if(phase!=='world')return;event.preventDefault();zoom=clamp(zoom+event.deltaY*.0006,.75,1.3);moveTo(null);}
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function intersect(e){const rect=canvas.getBoundingClientRect();ndc.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,camera);return ray.intersectObjects(town.pickables,false)[0]?.object.userData.place;}
  function down(e){if(e.button!==0)return;pointer={x:e.clientX,y:e.clientY,last:e.clientX,moved:false};canvas.setPointerCapture(e.pointerId);}
  function move(e){
    if(pointer){if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.moved=true;if(pointer.moved&&phase==='world'){yaw=clamp(yaw-(e.clientX-pointer.last)*.004,-1.1,1.1);moveTo(null,true);}pointer.last=e.clientX;}
    else if(phase==='world'||phase==='focused')canvas.style.cursor=intersect(e)?'pointer':'grab';
  }
  function up(e){if(!pointer)return;const moved=pointer.moved;pointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(moved)return;if(phase==='idle')enter();else if(phase==='world'||phase==='focused'){const id=intersect(e);if(id)onSelect(id);}}
  const cancel=()=>{pointer=null;};
  const lost=e=>{e.preventDefault();onError('三维画面已中断，可以继续使用地点目录，或重新载入。');};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('webglcontextlost',lost);
  const onVisibility=()=>{visibility=document.visibilityState;timeBase=null;};document.addEventListener('visibilitychange',onVisibility);
  const loadAbort=new AbortController();const timeout=setTimeout(()=>loadAbort.abort(),12000);
  async function prepare(){
    try{
      if(diagnostics.get('loadDelay'))await new Promise(resolve=>setTimeout(resolve,clamp(Number(diagnostics.get('loadDelay')),0,5000)));
      if(disposed)return;
      const earthPath=diagnostics.get('earth')==='missing'?'missing-earth.glb':'mc_head.glb';
      const response=await fetch(`${import.meta.env.BASE_URL}models/${earthPath}`,{signal:loadAbort.signal});if(!response.ok)throw new Error('earth');
      const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'');
      if(disposed){gltf.scene.traverse(o=>{o.geometry?.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m?.map?.dispose();m?.dispose();});});return;}
      const bounds=new THREE.Box3().setFromObject(gltf.scene),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      gltf.scene.position.sub(center);const wrapper=new THREE.Group();wrapper.add(gltf.scene);wrapper.scale.setScalar(2.5/Math.max(size.x,size.y,size.z));earth.add(wrapper);
      gltf.scene.traverse(o=>{if(o.isMesh){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m.metalness=0;m.roughness=1;});}});
      // Upload town textures and shaders before the user can launch the flight.
      const rt=new THREE.WebGLRenderTarget(32,32);homePose();camera.position.copy(desired);camera.lookAt(desiredTarget);renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.setRenderTarget(null);rt.dispose();
      ready=true;if(phase==='loading')emitPhase('idle');else if(phase==='world'||phase==='focused'){moveTo(selected,true);onPhase(phase);}onReady();
      if(previewFrame!==null){start=clock;emitPhase('entering');}
    }catch(error){if(!disposed)onError('地球资源未能载入。可以直接浏览港镇，或重新载入。',true);}
    finally{clearTimeout(timeout);}
  }
  function tick(now){
    if(disposed)return;raf=requestAnimationFrame(tick);
    if(visibility==='hidden')return;
    const elapsed=timeBase===null?0:(now-timeBase)/1000;const dt=Math.min(elapsed,.06);timeBase=now;clock+=dt;
    let cover=0;
    if(phase==='loading'||phase==='idle'){
      camera.position.set(0,0,18);target.set(0,0,0);camera.lookAt(target);earth.scale.setScalar(Math.min(1,aspect*1.25));earth.position.set(0,1.5,0);earth.rotation.set(.44+(reducedMotion?0:Math.sin(clock*.5)*.025),-.6,-.205);
    }else if(phase==='entering'){
      const t=Number.isFinite(previewFrame)?previewFrame:clamp((clock-start)/4.2);
      // Zoom into the same front-facing coastal patch. Curtains mask the scale change.
      cover=smooth((t-.23)/.18)*(1-smooth((t-.57)/.2));
      if(t<.49){activeScene=space;const a=smooth(t/.49);camera.position.set(0,0,18-13*a);target.set(0,1.5*a,0);earth.rotation.set(.44*(1-a),-.6*(1-a),-.205*(1-a));earth.scale.setScalar(Math.min(1,aspect*1.25)*(1+a*.7));}
      else{activeScene=scene;homePose();const a=ease((t-.49)/.51);camera.position.lerpVectors(new THREE.Vector3(2,62,22),desired,a);target.lerpVectors(new THREE.Vector3(0,3,-3),desiredTarget,a);}
      camera.lookAt(target);
      if(t>=1){moveTo(null,true);emitPhase('world');}
    }else{
      if(fly){const a=ease((clock-fly.at)/fly.duration);camera.position.lerpVectors(moveFrom,fly.to,a);target.lerpVectors(targetFrom,fly.target,a);if(a>=1)fly=null;}
      camera.lookAt(target);
    }
    if(activeScene===scene)town.update(reducedMotion?0:clock);
    renderer.setClearColor(activeScene===space?0x000000:0x82dafa,activeScene===space?0:1);
    renderer.render(activeScene,camera);
    if(cover>0){curtainLeft.position.x=-2.5*(1-cover);curtainRight.position.x=2.5*(1-cover);renderer.autoClear=false;renderer.clearDepth();renderer.render(curtainScene,curtainCamera);renderer.autoClear=true;}
    if((phase==='world'||phase==='focused')&&clock-labelsAt>.08){labelsAt=clock;onLabels(Object.values(PLACE_MAP).map(p=>{const v=new THREE.Vector3(p.position[0],p.position[1]+p.size[1]+.6,p.position[2]).project(camera);return {id:p.id,x:(v.x+1)*width/2,y:(1-v.y)*height/2,visible:v.z<1&&v.x>-1&&v.x<1&&v.y>-1&&v.y<1};}));}
    const cameraState=fly||phase==='entering'?'moving':'settled';
    if(canvas.dataset.cameraState!==cameraState)canvas.dataset.cameraState=cameraState;
    stats.frames++;stats.seconds+=elapsed;
    if(stats.seconds>2){onStats({fps:Math.round(stats.frames/stats.seconds),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});stats.frames=0;stats.seconds=0;}
  }
  if(initialRoute.home){moveTo(selected,true);phase=selected?'focused':'world';}raf=requestAnimationFrame(tick);prepare();
  return {enter,navigate,rotate,reset(){yaw=0;zoom=1;moveTo(null);},setReducedMotion(value){reducedMotion=value;if(value&&phase==='entering'){activeScene=scene;moveTo(null,true);emitPhase('world');}},dispose(){
    disposed=true;clearTimeout(timeout);loadAbort.abort();cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);
    canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('webglcontextlost',lost);
    town.dispose();space.traverse(o=>{o.geometry?.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m?.map?.dispose();m?.dispose();});});cloudGeometry.dispose();cloudMaterial.dispose();sun.shadow.map?.dispose();renderer.dispose();
  }};
}

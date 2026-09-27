import * as THREE from 'three';
import { PLACES } from './places.js';
import { C } from './palette.js';

export function buildBuildings(root, kit, pickables, animated, extraResources) {
  function building(p) {
    const g = new THREE.Group(); g.position.set(...p.position); root.add(g);
    const bb = kit.batch(g,p.id), cube = bb.box;
    const [w,,d] = p.size; const wallH = p.id === 'bookshop' ? 7 : p.id === 'workshop' ? 5.4 : 3.8;
    const wall = p.id === 'workshop' ? '#bd7552' : p.id === 'bookshop' ? C.cream : C.white;
    const roofColor = {bookshop:'#2e914b',workshop:'#ed852e',cottage:'#e45d60',station:'#327bb6',observatory:'#2f84c1'}[p.id];
    cube(0,.15,0,w+.4,.3,d+.4,C.stone);
    if(p.id==='observatory'){
      cube(0,wallH/2+.25,0,w,wallH,d-2,wall);cube(0,wallH/2+.25,0,w-2,wallH,d,wall);cube(0,wallH/2+.25,0,w-1,wallH,d-1,wall);
    }else cube(0,wallH/2+.25,0,w,wallH,d,wall);
    for (const x of [-w/2+.15,w/2-.15]) for (const z of [-d/2+.15,d/2-.15]) cube(x,wallH/2+.3,z,.3,wallH,.3,p.id === 'observatory' ? '#c9d6d9' : C.wood);
    for (const y of [.55,wallH+.1,...(p.id==='bookshop'?[3]:[])]) cube(0,y,0,w+.18,.22,d+.18,C.wood);
    const front = d/2+.08;
    function window(x,y,z=front,side=false) {
      cube(x,y,z,side?.18:1.25,1.6,side?1.25:.18,C.trim);
      cube(x+(side?.11:0),y,z+(side?0:.11),side?.12:1.02,1.3,side?1.02:.12,C.glass);
      cube(x+(side?.2:0),y,z+(side?0:.2),side?.12:.08,1.4,side?.08:.12,C.cream);
      cube(x+(side?.2:0),y,z+(side?0:.2),side?.12:1.1,.08,side?1.1:.12,C.cream);
      cube(x,y-.87,z,side?.4:1.5,.17,side?1.5:.4,C.wood);
      if(!side)for(const dx of [-.77,.77])cube(x+dx,y,z+.14,.22,1.48,.14,C.wood);
    }
    if(p.id !== 'observatory') {
      window(-w*.29,1.85); window(w*.29,1.85);
      window(w/2+.04,1.85,0,true);
      if(p.id==='bookshop') {window(-2.5,5);window(2.5,5);window(w/2+.04,5,0,true);}
      // Doors and rear windows are actual geometry, not camera-facing sprites.
      if(p.id!=='workshop'){cube(0,1.4,front+.04,1.1,2.5,.16,C.wood);cube(.32,1.35,front+.16,.1,.12,.12,'#f8ce61');}
      cube(0,2, -d/2-.03,1.1,1.2,.12,C.glass);
      const layers = Math.ceil(w+1);
      for(let i=0;i<layers;i++) {
        const width=w+1-i;
        const tiles=Math.ceil(d+1),depth=(d+1)/tiles;
        for(let j=0;j<tiles;j++)cube(0,wallH+.5+i*.42,-(d+1)/2+(j+.5)*depth,width,.44,depth-.025,roofColor);
        if(i>0){cube(0,wallH+.28+i*.42,0,Math.max(.2,width-.18),.42,d-.1,wall);for(const x of [-width/2+.12,width/2-.12])cube(x,wallH+.32+i*.42,front,.25,.42,.18,C.wood);}
      }
      // Chimney stays square even on a sloped roof.
      if(p.id==='workshop'||p.id==='cottage') {cube(w*.27,wallH+1.9,-.8,.65,2.7,.65,C.stone);cube(w*.27,wallH+3.3,-.8,.85,.2,.85,C.trim);}
    } else {
      for (const x of [-2.4,2.4]) window(x,1.9);
      cube(0,1.5,front+.1,1,2.6,.2,C.wood);
      // Voxel hemisphere, with a white meridian rather than a second gabled roof.
      for(let level=0;level<8;level++) {
        const radius=Math.sqrt(3.75**2-(level*.46)**2);
        for(let x=-3.5;x<=3.5;x+=.5)for(let z=-3.5;z<=3.5;z+=.5){
          const distance=Math.hypot(x,z);
          if(distance<radius&&distance>radius-.8)cube(x,4.25+level*.46,z,.5,.48,.5,Math.abs(x)<.3?C.white:roofColor);
        }
      }
      cube(0,8,0,1,.45,1,roofColor);
      const scope = new THREE.Group(); scope.position.set(1.7,6.5,1.2); scope.rotation.set(-.42,.95,0);
      const sb=kit.batch(scope);sb.box(0,0,1.3,.7,.7,3,'#dce8e8');sb.box(0,0,2.85,1,1,.35,C.stone);sb.box(0,0,3.05,.65,.65,.1,C.dark);sb.flush();g.add(scope);
    }
    if(p.id==='bookshop') {
      cube(0,5.05,front+.13,2.15,2.4,.25,C.trim);
      for(const y of [4.1,4.8,5.5]){cube(0,y,front+.35,2.1,.14,.55,C.wood);for(let k=0;k<7;k++)cube(-.85+k*.28,y+.31,front+.4,.2,.52,.3,['#df6650','#ebc85a','#5186b6','#68a577'][k%4]);}
      for(let i=0;i<10;i++) {cube(-w/2+.425+i*.85,3.1,front+.9,.83,.16,1.8,i%2?C.white:'#56ad66');cube(-w/2+.425+i*.85,2.75,front+1.72,.83,.6,.14,i%2?C.white:'#56ad66');}
      for(const x of [-w/2+.15,w/2-.15])cube(x,1.5,front+1.6,.15,3,.15,C.wood);
      for (const x of [-w*.29,w*.29]) for(let i=0;i<5;i++) cube(x-.45+i*.23,1.6,front+.24,.17,.6,.2,['#f0c646','#d9554b','#56a78c','#457fb2'][i%4]);
      const sx=w/2+.85;
      cube(w/2+.4,4,front+.2,1.5,.14,.14,C.trim);cube(sx,3.3,front+.2,1.15,1.1,.18,C.wood);
      cube(sx,3.3,front+.32,.8,.65,.1,C.cream);cube(sx,3.3,front+.39,.05,.65,.04,C.trim);
      // Shelves, table and chalkboard are geometry visible when the camera approaches.
      for(const x of [-w*.29,w*.29])for(const y of [.65,1.35,2.05]){cube(x,y,front+.38,1.6,.13,.5,C.wood);for(let k=0;k<6;k++)cube(x-.63+k*.24,y+.32,front+.42,.17,.5,.25,['#dc6050','#e5c446','#5c9e74','#578bb7'][k%4]);}
      cube(-w/2-1,.8,front+1.4,.9,1.5,.15,C.wood);cube(-w/2-1,.9,front+1.5,.7,1.05,.08,C.dark);
      for(let row=0;row<3;row++)cube(-w/2-1,1.2-row*.22,front+1.56,.44,.05,.02,C.cream);
    }
    if(p.id==='workshop') {
      cube(0,2.1,front+.12,3.6,3.8,.12,'#40554a');
      for(const x of [-1.95,1.95])cube(x,2.1,front+.23,.25,3.9,.36,C.wood);
      cube(0,4.1,front+.25,4.2,.3,.42,C.wood);
      cube(-.15,1.2,front+.65,3,.22,1.1,C.wood);for(const x of [-1.25,1.05])cube(x,.7,front+.7,.18,1.2,.8,C.trim);
      cube(.2,1.58,front+.68,.7,.55,.5,'#72828c');cube(.2,1.94,front+.68,1.1,.18,.65,'#98a5a9');
      for(let i=0;i<3;i++){cube(-1.15+i*.85,3.1,front+.27,.12,.85,.15,C.wood);cube(-1.15+i*.85,3.55,front+.3,.5,.17,.22,C.stone);}
      for(let row=0;row<4;row++)for(const x of [-w/2+.65,w/2-.65])cube(x,1+row*.75,front+.04,.7,.15,.08,'#d39063');
      const gear=new THREE.Group();gear.position.set(0,7.2,front+.65);gear.scale.setScalar(1.4);
      const gb=kit.batch(gear);gb.box(0,0,0,1.5,1.5,.25,'#bac6cd');gb.box(0,0,.15,.5,.5,.12,C.trim);
      [[0,1],[0,-1],[1,0],[-1,0]].forEach(([x,y])=>gb.box(x,y,0,.55,.55,.3,'#bac6cd'));gb.flush();g.add(gear);animated.push(t=>{gear.rotation.z=t*.18;});
      cube(2, .8,front+1.2,1.6,.2,.8,C.wood);cube(2,.45,front+1.2,.15,.8,.6,C.trim);cube(2,1.08,front+1.2,.7,.35,.4,C.stone);
    }
    if(p.id==='station') {
      cube(0,.15,2.5,w+3,.3,3,C.path);
      cube(0,2.1,front+.15,1.2,.8,.15,C.cream);cube(0,2.1,front+.25,.08,.5,.1,C.dark);cube(.16,2,front+.25,.4,.08,.1,C.dark);
    }
    bb.flush();g.traverse(o=>{if(o.isMesh){o.userData.place=p.id;pickables.push(o);}});
  }
  PLACES.forEach(building);
}


import * as THREE from 'three';
import { createKit } from './voxel.js';
import { PLACES } from './places.js';

const C = { grass: '#78c837', grass2: '#6dba2c', dirt: '#be8c4c', sand: '#efd394', stone: '#87989d', path: '#b9c6c2', wood: '#9a6033', trim: '#70442a', cream: '#f5dfaa', white: '#f0eee0', glass: '#74bbcd', dark: '#244948', leaf: '#489b39' };
export function groundHeight(x, z) {
  if (z < -4) return x > 3 ? 8 : 5;
  if (x > 5) return 4;
  return 3;
}
function land(x, z) {
  const boundary = (x / 19) ** 2 + ((z + 1) / 18) ** 2;
  if (boundary > 1 + Math.sin(x * .65) * .055 + Math.cos(z * .8) * .045) return false;
  if (z > 9 && x > -5 && x < 7) return false;
  if (z < -3 && z > -12 && x > -4 && x < 3) return false;
  return true;
}

export function buildTown(scene) {
  const kit = createKit();
  const root = new THREE.Group(); scene.add(root);
  const b = kit.batch(root); const box = b.box;
  const pickables = []; const animated = [];
  const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), kit.material('#21a8dc', false));
  water.rotation.x = -Math.PI / 2; water.position.y = -.16; water.receiveShadow = true; root.add(water);
  // Contiguous columns, rather than overlapping flat islands, expose dirt and rock terraces.
  for (let x = -19; x <= 19; x++) for (let z = -18; z <= 17; z++) {
    if (!land(x, z)) continue;
    const h = groundHeight(x, z);
    box(x, .18, z, 1, .6, 1, C.sand);
    box(x, (h - .2) / 2, z, 1, h - .6, 1, kit.random() > .72 ? '#9b9d8e' : C.dirt);
    box(x, h - .16, z, 1, .32, 1, kit.random() > .65 ? C.grass2 : C.grass);
    if (!land(x, z + 1) && kit.random() > .5) box(x, h * .35, z + .06, .75, .6, 1, C.stone);
  }
  const paths = [[[-10, 12], [-1, 8]], [[-1, 8], [10, 8]], [[-10, 12], [-10, -5]], [[4, 8], [4, -3]], [[4, -3], [10, -5]], [[-1, 8], [-1, 12]]];
  const pathCells = new Set();
  for (const [[ax, az], [bx, bz]] of paths) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 3);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(ax + (bx - ax) * i / steps), z = Math.round(az + (bz - az) * i / steps);
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${x + dx},${z}`;
        if (pathCells.has(key) || !land(x + dx, z)) continue;
        pathCells.add(key); box(x + dx, groundHeight(x + dx, z) + .04, z, .96, .12, .96, kit.random() > .5 ? C.path : '#a3b3b0');
      }
    }
  }
  // Stair flights bridge the actual terrace heights.
  function stairs(x, z, from, to, n, width = 2.5) {
    for (let i = 0; i < n; i++) { const top = from + (to - from) * (i + 1) / n; box(x, top / 2, z - i * .55, width, top, .55, C.path); }
  }
  stairs(-10, -2, 3, 5, 6);
  stairs(6, -1, 4, 8, 10);
  stairs(-1, 12, 1.6, 3, 5);

  function fence(x, y, z, length, axis = 'x') {
    for (let i = 0; i <= length; i += 1.5) box(x + (axis === 'x' ? i : 0), y + .65, z + (axis === 'z' ? i : 0), .18, 1.3, .18, C.wood);
    for (const dy of [.45, .95]) box(x + (axis === 'x' ? length / 2 : 0), y + dy, z + (axis === 'z' ? length / 2 : 0), axis === 'x' ? length : .13, .13, axis === 'z' ? length : .13, C.wood);
  }
  function tree(x, z, pink = false, size = 1) {
    const y = groundHeight(x, z);
    box(x, y + 1.8 * size, z, .55 * size, 3.6 * size, .55 * size, C.wood);
    const leaf = pink ? '#f398c7' : C.leaf;
    const light = pink ? '#ffc1df' : '#66b83f';
    box(x, y + 4 * size, z, 3.2 * size, 1.8 * size, 3 * size, leaf);
    box(x - .5 * size, y + 5.15 * size, z, 2.2 * size, .65 * size, 2 * size, light);
    box(x + 1.35 * size, y + 3.4 * size, z + .5, 1.4 * size, 1.3 * size, 1.7 * size, light);
    box(x - 1.25 * size, y + 3.65 * size, z - .4, 1.2 * size, 1.1 * size, 1.9 * size, leaf);
  }
  [[-15, 8, true, 1.25], [-16, 1], [-16, -7], [-13, -13], [-5, -12], [15, -8], [15, -2], [16, 6], [4, -13], [8, -15], [-5, 1], [-15, 13]].forEach(([x,z,p,s]) => tree(x,z,p,s));
  // Flowers and grass use a tiny set of instanced colors.
  for (let i = 0; i < 180; i++) {
    const x = Math.round(kit.random() * 36 - 18), z = Math.round(kit.random() * 32 - 16);
    if (!land(x, z) || pathCells.has(`${x},${z}`) || PLACES.some(p => Math.abs(x-p.position[0]) < p.size[0]/2+1 && Math.abs(z-p.position[2]) < p.size[2]/2+1)) continue;
    const y = groundHeight(x,z);
    box(x, y + .22, z, .1, .44, .1, '#3b9734');
    box(x, y + .46, z, .3, .18, .3, ['#fff4cf','#f5d433','#ef6659'][i % 3]);
    box(x + .16, y + .13, z, .15, .2, .12, '#51aa31');
  }
  fence(6.5,8,-5,8); fence(-16,5,-11,12); fence(14,4,1,7,'z'); fence(-14,3,12,3);
  // Dock planks and bollards.
  for (let x = -3; x <= 3; x += .5) box(x, 1.55, 15, .46, .25, 6.5, x % 1 === 0 ? '#c99150' : '#b47a3e');
  for (const x of [-3,3]) for (const z of [12,15,18]) { box(x,.9,z,.4,3,.4,C.wood); box(x,2.45,z,.55,.2,.55,C.cream); }
  function lantern(x,y,z) {
    box(x,y+1.5,z,.17,3,.17,C.trim); box(x+.3,y+3,z,.8,.18,.2,C.trim);
    box(x+.6,y+2.55,z,.42,.6,.42,'#ffce62',false); box(x+.6,y+2.9,z,.6,.15,.6,C.trim); box(x+.6,y+2.2,z,.6,.15,.6,C.trim);
  }
  [[-7,3,12],[5,4,9],[13,4,8],[-13,5,-4],[8,8,-5],[-4,3,6]].forEach(a=>lantern(...a));

  function building(p) {
    const g = new THREE.Group(); g.position.set(...p.position); root.add(g);
    const bb = kit.batch(g,p.id), cube = bb.box;
    const [w,,d] = p.size; const wallH = p.id === 'bookshop' ? 5.8 : p.id === 'workshop' ? 4.6 : 3.2;
    const wall = p.id === 'workshop' ? '#bd7552' : p.id === 'bookshop' ? C.cream : C.white;
    const roofColor = {bookshop:'#2e914b',workshop:'#ed852e',cottage:'#e45d60',station:'#327bb6',observatory:'#2f84c1'}[p.id];
    cube(0,.15,0,w+.4,.3,d+.4,C.stone);
    cube(0,wallH/2+.25,0,w,wallH,d,wall);
    for (const x of [-w/2+.15,w/2-.15]) for (const z of [-d/2+.15,d/2-.15]) cube(x,wallH/2+.3,z,.3,wallH,.3,p.id === 'observatory' ? '#c9d6d9' : C.wood);
    for (const y of [.55,wallH+.1,...(p.id==='bookshop'?[3]:[])]) cube(0,y,0,w+.18,.22,d+.18,C.wood);
    const front = d/2+.08;
    function window(x,y,z=front,side=false) {
      cube(x,y,z,side?.18:1.25,1.6,side?1.25:.18,C.trim);
      cube(x+(side?.11:0),y,z+(side?0:.11),side?.12:1.02,1.3,side?1.02:.12,C.glass);
      cube(x+(side?.2:0),y,z+(side?0:.2),side?.12:.08,1.4,side?.08:.12,C.cream);
      cube(x+(side?.2:0),y,z+(side?0:.2),side?.12:1.1,.08,side?1.1:.12,C.cream);
      cube(x,y-.87,z,side?.4:1.5,.17,side?1.5:.4,C.wood);
    }
    if(p.id !== 'observatory') {
      window(-w*.29,1.85); window(w*.29,1.85);
      window(w/2+.04,1.85,0,true);
      if(p.id==='bookshop') {window(-1.7,4.35);window(1.7,4.35);window(w/2+.04,4.35,0,true);}
      // Doors and rear windows are actual geometry, not camera-facing sprites.
      cube(0,1.4,front+.04,1.1,2.5,.16,C.wood);cube(.32,1.35,front+.16,.1,.12,.12,'#f8ce61');
      cube(0,2, -d/2-.03,1.1,1.2,.12,C.glass);
      const layers = Math.ceil((w+1)/.8);
      for(let i=0;i<layers/2;i++) {
        const width=w+1-i*.8;
        cube(0,wallH+.55+i*.4,0,width,.42,d+1,roofColor);
        if(i>0) cube(0,wallH+.38+i*.4,0,Math.max(.2,width-.2),.35,d-.1,wall);
      }
      // Chimney stays square even on a sloped roof.
      if(p.id==='workshop'||p.id==='cottage') {cube(w*.27,wallH+1.9,-.8,.65,2.7,.65,C.stone);cube(w*.27,wallH+3.3,-.8,.85,.2,.85,C.trim);}
    } else {
      for (const x of [-1.7,1.7]) window(x,1.9);
      cube(0,1.5,front+.1,1,2.6,.2,C.wood);
      // Voxel hemisphere, with a white meridian rather than a second gabled roof.
      for(let level=0;level<6;level++) {
        const radius=Math.sqrt(2.9**2-(level*.46)**2);
        for(let x=-2.75;x<=2.75;x+=.5)for(let z=-2.75;z<=2.75;z+=.5){
          const distance=Math.hypot(x,z);
          if(distance<radius&&distance>radius-.8)cube(x,3.65+level*.46,z,.5,.48,.5,Math.abs(x)<.3?C.white:roofColor);
        }
      }
      cube(0,6.4,0,1,.45,1,roofColor);
      const scope = new THREE.Group(); scope.position.set(.5,5.2,1.4); scope.rotation.x=-.45;
      const sb=kit.batch(scope);sb.box(0,0,1.3,.7,.7,3,'#dce8e8');sb.box(0,0,2.85,1,1,.35,C.stone);sb.box(0,0,3.05,.65,.65,.1,C.dark);sb.flush();g.add(scope);
    }
    if(p.id==='bookshop') {
      for(let i=0;i<8;i++) {cube(-3.3+i*.85,2.9,front+.9,.83,.16,1.8,i%2?C.white:'#56ad66');cube(-3.3+i*.85,2.55,front+1.72,.83,.6,.14,i%2?C.white:'#56ad66');}
      for(const x of [-3.3,3])cube(x,1.4,front+1.6,.12,2.8,.12,C.wood);
      for (const x of [-1.8,1.8]) for(let i=0;i<5;i++) cube(x-.45+i*.23,1.6,front+.24,.17,.6,.2,['#f0c646','#d9554b','#56a78c','#457fb2'][i%4]);
      cube(3.6,3.9,front+.2,1.2,.14,.14,C.trim);cube(4,3.3,front+.2,.9,.85,.15,C.cream);
      cube(4,3.3,front+.3,.04,.6,.03,C.trim);cube(3.77,3.3,front+.3,.3,.45,.03,C.wood);cube(4.23,3.3,front+.3,.3,.45,.03,C.wood);
    }
    if(p.id==='workshop') {
      const gear=new THREE.Group();gear.position.set(0,5.3,front+.65);
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
  // Laundry beside the cottage.
  for(const x of [2,5])box(x,4.1,4,.13,2.2,.13,C.wood);
  box(3.5,5.15,4,3,.04,.04,C.trim);
  for(let i=0;i<3;i++)box(2.6+i*.85,4.75,4,.65,.8,.06,i%2?'#79bce1':C.white);
  // Raised continuous railway and sleepers across the north inlet.
  for(let x=-19;x<18;x+=.8)box(x,5.1,-5.8,.28,.2,1.9,C.wood);
  for(const z of [-6.4,-5.2])box(-.5,5.28,z,38,.12,.1,'#536e79');
  box(0,4.8,-5.8,7,.5,2.4,C.wood);
  for(const x of [-3,0,3])box(x,2.4,-5.8,.4,4.8,.5,C.trim);
  const train=new THREE.Group();root.add(train);
  const tb=kit.batch(train);
  for(let i=0;i<2;i++){
    const x=i*3.3;tb.box(x,6.35,-5.8,3,1.7,1.55,'#efbd32');tb.box(x,7.3,-5.8,3.1,.2,1.65,'#f3e3ac');
    for(const dx of [-.9,0,.9]){tb.box(x+dx,6.65,-4.99,.58,.7,.08,C.glass);tb.box(x+dx,6.65,-6.61,.58,.7,.08,C.glass);}
    for(const dx of [-1,1]) for(const z of [-5.05,-6.55])tb.box(x+dx,5.55,z,.48,.5,.22,C.dark);
  }tb.flush();animated.push(t=>{train.position.x=Math.sin(t*.11)*8-3;});
  const boat=new THREE.Group();boat.position.set(6,.5,17);root.add(boat);const boatB=kit.batch(boat);
  boatB.box(0,0,0,2.5,.6,4,C.wood);boatB.box(0,.4,0,2.4,.25,3.9,C.cream);boatB.box(0,.6,0,1.8,.2,3.2,C.wood);boatB.box(0,2.5,0,.12,4,.12,C.trim);
  for(let i=0;i<5;i++)boatB.box(.2+i*.2,3.7-i*.32,0,.22,1+i*.32,.08,C.white);
  boatB.flush();animated.push(t=>{boat.position.y=.5+Math.sin(t*1.1)*.1;boat.rotation.z=Math.sin(t*.8)*.025;});
  const cat=new THREE.Group();cat.position.set(-3.5,3.3,6);root.add(cat);const cb=kit.batch(cat);
  cb.box(0,0,0,.4,.45,.8,'#8b9299');cb.box(0,.3,.36,.48,.46,.4,C.white);for(const x of [-.17,.17]){cb.box(x,.6,.35,.13,.19,.13,'#8b9299');cb.box(x,.35,.58,.06,.08,.03,C.dark);}cb.box(0,.22,-.65,.12,.12,.6,'#8b9299');cb.flush();animated.push(t=>{cat.rotation.y=Math.sin(t*.3)*.3;});
  // Sparse water pixels are geometry, without expensive reflections.
  for(let i=0;i<350;i++) {const x=kit.random()*110-55,z=kit.random()*95-45;if(land(Math.round(x),Math.round(z)))continue;box(x,-.1,z,kit.random()*1.8+.3,.02,.13,i%2?'#6ccdea':'#40b8e0',false);}
  // Low-detail horizon islets.
  for(const [x,z,s] of [[-42,-40,6],[37,-45,8],[-49,7,4],[43,20,3]]){box(x,.7,z,s,1.5,s,C.sand);box(x,2,z,s-1,1.3,s-1,C.grass);box(x+1,4,z,1,3,1,C.wood);box(x+1,6,z,3,2,3,C.leaf);}
  b.flush();
  const clouds = new THREE.Group();root.add(clouds);const cl=kit.batch(clouds);
  for(const [x,y,z] of [[-28,23,-25],[1,26,-35],[30,24,-24],[-35,20,12],[30,27,20]]) {cl.box(x,y,z,8,1,3,'#f5ffff',false);cl.box(x+2,y+.65,z,4,.4,2,'#ffffff',false);}
  cl.flush();animated.push(t=>{clouds.position.x=Math.sin(t*.03)*2;});
  // Smoke drifts in small stepped puffs above the workshop.
  const smoke=new THREE.Group();root.add(smoke);const sm=kit.batch(smoke);for(let i=0;i<3;i++)sm.box(12+i*.15,12+i*.8,3,.4+i*.18,.4+i*.15,.4+i*.18,'#e2eeee',false);sm.flush();animated.push(t=>{smoke.position.y=(t*.25)%1;smoke.position.x=Math.sin(t*.5)*.2;});
  return { root, pickables, update(t){animated.forEach(fn=>fn(t));}, dispose(){water.geometry.dispose();kit.dispose();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});scene.remove(root);} };
}

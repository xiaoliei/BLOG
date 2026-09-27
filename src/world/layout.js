import { PLACES, clamp, smooth } from './places.js';

// Measured against harbor-top-layout-v1: north at -Z, harbour mouth at +Z.
// All renderers, vegetation and clearance tests consume this one terrain model.
export const GRID = .75;
export const COAST = [
  [-25,-29],[-18,-32],[-10,-30],[-6,-26],[-6,-18],[-8,-12],[-5,-7],[-1,-7],
  [2,-12],[3,-21],[6,-28],[14,-32],[23,-29],[28,-23],[29,-12],[27,-4],
  [29,4],[27,14],[23,18],[18,17],[14,15],[10.5,12],[7.5,12],[5,16],[4,17],
  [0,17],[-2,20],[-4,27],[-9,31],[-16,31],[-23,28],[-26,21],[-28,14],
  [-27,7],[-30,-1],[-28,-12],[-29,-21],
];
export const ISLETS = [
  {x:28.5,z:26,r:3.2,h:2.4,tree:true}, {x:-.5,z:31,r:1.55,h:1.65},
  {x:-4,z:34.5,r:1.1,h:1}, {x:-32,z:-29,r:1.8,h:1.5},
  {x:32,z:31,r:.9,h:.8}, {x:-33,z:9,r:1.4,h:1.3},
];
export const PATHS = [
  {id:'bookshop',width:2.1,points:[[-17,5,19],[-12,5,19],[-8,4.25,18],[-4.5,3.5,17]]},
  {id:'station',width:1.95,points:[[0,5,9],[-5,5,4],[-11,5.7,-1.5],[-17.5,6.4,-7.5],[-19,7,-12],[-17,7,-16.5]]},
  {id:'workshop',width:2.1,points:[[0,5,9],[6,5.7,9],[12.5,6,10.5],[20,6,10.5]]},
  {id:'observatory',width:1.95,points:[[10,6,10],[11,6.2,4],[12,8,-3],[13,9.5,-9],[15,11,-15],[17,12,-18.5]]},
  {id:'cottage',width:1.8,points:[[1,5,6.8],[1,5,8],[0,5,9]]},
  {id:'dock',width:1.8,points:[[0,5,9],[-2,4.5,13],[-4.5,3.5,17],[-6,2.4,21],[-3.5,2.4,21]]},
];
export const DOCK = {height:2.4, entrance:[-3.5,21], neck:{x:-1,z:21,width:5.5,depth:2.4}, landing:{x:3,z:24,width:7,depth:6}, boat:[11,26]};
export const RAIL = { z:-26.5, top:8.12, halfWidth:.86, left:-156, right:6, carLength:3.3, spacing:3.65, cars:3, centerMin:-146, centerMax:.1, dwell:3.5, travel:65 };
export const TRAIN_HALF_LENGTH = (RAIL.cars-1)*RAIL.spacing/2+RAIL.carLength/2;
export function trainAt(time) {
  const leg = RAIL.travel + RAIL.dwell;
  const cycle = ((time % (2*leg)) + 2*leg) % (2*leg);
  const westbound=cycle<leg;
  const elapsed=westbound?cycle:cycle-leg;
  const u=clamp((elapsed-RAIL.dwell)/RAIL.travel);
  // Ease acceleration and braking while preserving exact endpoint dwell.
  const a=smooth(u);
  return { x:westbound?RAIL.centerMax+(RAIL.centerMin-RAIL.centerMax)*a:RAIL.centerMin+(RAIL.centerMax-RAIL.centerMin)*a, direction:westbound?-1:1, stopped:u===0||u===1 };
}

export function insidePolygon(x,z,poly=COAST) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,zi]=poly[i],[xj,zj]=poly[j];
    if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi))inside=!inside;
  }
  return inside;
}
function segmentDistance(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
function coastDistance(x,z){let best=Infinity;for(let i=0;i<COAST.length;i++)best=Math.min(best,segmentDistance(x,z,COAST[i],COAST[(i+1)%COAST.length]));return best;}
const snap=n=>Math.round(n/GRID)*GRID;
const key=(x,z)=>`${Math.round(x/GRID)},${Math.round(z/GRID)}`;
function catmull(a,b,c,d,t){return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);}
export function samplePaths(){
  const samples=[];
  for(const path of PATHS){const pts=path.points;for(let i=0;i<pts.length-1;i++){
    const steps=Math.ceil(Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][2]-pts[i][2])*3);
    for(let j=0;j<=steps;j++){
      const t=j/steps;const position=[0,1,2].map(axis=>catmull(pts[Math.max(0,i-1)][axis],pts[i][axis],pts[i+1][axis],pts[Math.min(pts.length-1,i+2)][axis],t));
      samples.push({x:position[0],y:position[1],z:position[2],width:path.width,id:path.id});
    }
  }}return samples;
}
export function buildingAt(x,z,margin=0){return PLACES.find(p=>Math.abs(x-p.position[0])<=p.size[0]/2+margin&&Math.abs(z-p.position[2])<=p.size[2]/2+margin);}
export function createLayout(){
  const samples=samplePaths();
  function nearestPath(x,z){let distance=Infinity,result=null;for(const p of samples){const d=Math.hypot(x-p.x,z-p.z);if(d<distance){distance=d;result=p;}}return {...result,distance};}
  const cells=[]; const lookup=new Map();
  function naturalHeight(x,z){
    if(x<-4){if(z<-16)return 7; if(z<3)return 5+Math.floor(Math.max(0,-z)/4)*.5; if(z>22)return 4-Math.floor((z-22)/3)*.5;return 5;}
    if(x>6)return 6+Math.min(6,Math.floor(Math.max(0,-z)/3));
    return 5;
  }
  for(let ix=-46;ix<=46;ix++)for(let iz=-46;iz<=48;iz++){
    const x=ix*GRID,z=iz*GRID;const main=insidePolygon(x,z);let kind='grass',height=0,islet=false;
    if(main){
      height=naturalHeight(x,z);
      // Receding grass shelves over exposed rock, especially around the rail inlet.
      const shore=coastDistance(x,z);
      if(shore<3&&!buildingAt(x,z,1.8))height=Math.max(1.25,height-(shore<.8?2.25:shore<1.6?1.5:.75));
      const path=nearestPath(x,z);
      if(path.distance<path.width/2+1.2)height=Math.round((path.y+(height-path.y)*smooth((path.distance-path.width/2)/1.2))*4)/4;
      const pad=buildingAt(x,z,1.2);if(pad)height=pad.position[1];
      // An open railway corridor is carved independently of the natural hillside.
      if(x<RAIL.right+.6&&Math.abs(z-RAIL.z)<1.7)height=Math.min(height,7.5);
    }else if(coastDistance(x,z)<1.15){kind='sand';height=.45;}
    else {
      const island=ISLETS.find(p=>Math.hypot(x-p.x,z-p.z)<p.r+1);
      if(!island)continue;
      const d=Math.hypot(x-island.x,z-island.z);islet=true;
      if(d>island.r){kind='sand';height=.4;}else height=island.h;
    }
    const path=main?nearestPath(x,z):null;
    const patio=PLACES.find(p=>Math.abs(x-p.position[0])<p.size[0]/2+.5&&z>p.position[2]+p.size[2]/2&&z<p.position[2]+p.size[2]/2+1.7);
    if(patio){height=patio.position[1];kind='paving';}
    else if(path&&path.distance<path.width/2&&!buildingAt(x,z,.3)){kind='path';}
    // The timber neck meets a level stone quay; inland columns cannot bury it.
    if(main&&x>=-4.5&&x<=1&&Math.abs(z-DOCK.neck.z)<=DOCK.neck.depth/2+.4){height=2.5;kind='path';}
    const cell={x,z,height,kind,islet};cells.push(cell);lookup.set(key(x,z),cell);
  }
  const at=(x,z)=>lookup.get(key(x,z))??null;
  // Junctions are one paved surface, not independent overlapping spline heights.
  // Propagate a maximum half-unit riser through adjacent road cells, keeping patios fixed.
  const roadCells=cells.filter(c=>c.kind==='path');
  for(let pass=0;pass<roadCells.length;pass++){
    let changed=false;
    for(const c of roadCells)for(const [dx,dz] of [[GRID,0],[-GRID,0],[0,GRID],[0,-GRID]]){
      const n=at(c.x+dx,c.z+dz);
      if(n&&['path','paving'].includes(n.kind)&&n.height-c.height>.5){c.height=n.height-.5;changed=true;}
    }
    if(!changed)break;
  }
  const trees=[];
  function plant(x,z,type='oak',scale=1){
    x=snap(x);z=snap(z);const cell=at(x,z);if(!cell||cell.kind!=='grass')return false;
    if(buildingAt(x,z,2*scale)||nearestPath(x,z).distance<1.5+scale||Math.abs(z-RAIL.z)<2.5+scale&&x<RAIL.right+2)return false;
    if(trees.some(t=>Math.hypot(t.x-x,t.z-z)<2.5*scale))return false;
    trees.push({x,z,y:cell.height,type,scale});return true;
  }
  // Reference's three lush garden zones, with a large cherry tree west of the bookshop.
  plant(-25,13,'cherry',1.45);
  const authored=[[-23,-23],[-23,-15],[-24,-8],[-25,-1],[-22,3],[-15,-9],[-11,-13],[-9,-3],[-11,3],[-24,24],[-18,26],[-9,25],[-11,21],[-23,20],[6,-17],[8,-9],[7,-3],[17,-12],[22,-9],[24,-2],[24,13],[25,-22],[11,-30],[21,-30],[-24,-29],[-10,-30]];
  authored.forEach(([x,z],i)=>plant(x,z,i%6===2?'birch':'oak',.85+(i%3)*.12));
  // Small shrubs fill the gardens without hiding building silhouettes or paths.
  for(let i=0;i<105;i++){
    const x=-27+((i*17)%55),z=-28+((i*23)%57);
    plant(x,z,i%7===0?'birch':'shrub',.45+(i%3)*.1);
  }
  for(const isle of ISLETS)if(isle.tree){const cell=at(isle.x,isle.z);if(cell)trees.push({x:snap(isle.x),z:snap(isle.z),y:cell.height,type:'oak',scale:.9});}
  return {cells,at,trees,nearestPath,samples};
}

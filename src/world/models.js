// Pure model definitions. Coordinates are in cells; no renderer dependencies.
export const REGISTRY_VERSION = 1;
export const DIRECTIONS = ['south', 'west', 'north', 'east'];
const registry = new Map();
const box = (x,y,z,w,h,d,color) => ({min:[x,y,z],max:[x+w,y+h,z+d],...(color?{color}:{})});
const enumOf = (...values) => value => values.includes(value);
const integer = (a,b) => value => Number.isInteger(value)&&value>=a&&value<=b;
export function registerModel(id, definition) {
  if(registry.has(id))throw new Error(`Duplicate model: ${id}`);
  registry.set(id,{defaults:{},properties:{},support:'none',occludes:true,connects:false,...definition});
}
export function modelDefinition(id) {
  const def=registry.get(id);if(!def)throw new Error(`Unknown model: ${id}`);return def;
}
export function normalizeState(input) {
  if(!input||typeof input!=='object')throw new Error('Invalid block state');
  for(const key of Object.keys(input))if(!['model','color','props','place'].includes(key))throw new Error(`Unknown state field: ${key}`);
  const def=modelDefinition(input.model),props={...def.defaults,...input.props};
  if(input.props!==undefined&&(!input.props||typeof input.props!=='object'||Array.isArray(input.props)))throw new Error('Invalid properties');
  for(const [key,value] of Object.entries(props))if(!def.properties[key]?.(value))throw new Error(`Invalid ${input.model}.${key}: ${value}`);
  if(!/^#[\da-f]{6}$/i.test(input.color))throw new Error('Invalid material color');
  if(input.place!==undefined&&(typeof input.place!=='string'||!input.place))throw new Error('Invalid place');
  return {model:input.model,color:input.color.toLowerCase(),props,...(input.place?{place:input.place}:{})};
}
export function rotatePoint([x,y,z],turns) {
  for(let i=0;i<turns;i++)[x,z]=[1-z,x];return [x,y,z];
}
export function rotateBox(b,turns) {
  const corners=[];for(const x of [b.min[0],b.max[0]])for(const z of [b.min[2],b.max[2]])corners.push(rotatePoint([x,0,z],turns));
  return {...b,min:[Math.min(...corners.map(p=>p[0])),b.min[1],Math.min(...corners.map(p=>p[2]))],max:[Math.max(...corners.map(p=>p[0])),b.max[1],Math.max(...corners.map(p=>p[2]))]};
}
export function modelBoxes(state, connections=[]) {
  const def=modelDefinition(state.model),p=state.props;
  return def.boxes(p,connections).map(b=>rotateBox(b,DIRECTIONS.indexOf(p.facing??'south')));
}
export function occupiedCells(state) {
  const cells=new Map();
  const def=modelDefinition(state.model),boxes=def.occupancyBoxes?def.occupancyBoxes.map(b=>rotateBox(b,DIRECTIONS.indexOf(state.props.facing??'south'))):modelBoxes(state);
  for(const b of boxes)for(let y=Math.floor(b.min[1]+1e-8);y<Math.ceil(b.max[1]-1e-8);y++)for(let z=Math.floor(b.min[2]+1e-8);z<Math.ceil(b.max[2]-1e-8);z++)for(let x=Math.floor(b.min[0]+1e-8);x<Math.ceil(b.max[0]-1e-8);x++)cells.set(`${x},${y},${z}`,[x,y,z]);
  return [...cells.values()];
}
const facing={facing:enumOf(...DIRECTIONS)};
registerModel('cube',{connects:true,boxes:()=>[box(0,0,0,1,1,1)]});
registerModel('roof-tile',{boxes:()=>[box(0,0,.025,1,1,.95)]});
registerModel('workshop-bay',{support:'bottom',boxes:()=>{
 const out=[box(0,0,0,8,8,.2,'#40554a'),box(0,0,.2,.5,8,1.5,'#986334'),box(7.5,0,.2,.5,8,1.5,'#986334'),box(0,7.5,.2,8,.5,1.5,'#ad753d')];
 for(let i=0;i<3;i++){out.push(box(1.55+i*1.7,3.8,.3,.24,1.7,.3,'#ad753d'));out.push(box(1.17+i*1.7,5.3,.3,1,.34,.44,'#aab5b9'));}
 return out;
}});
registerModel('anvil-bench',{support:'bottom',boxes:()=>[
 box(0,2.2,0,6,.44,2.2,'#ad753d'),box(.5,0,.15,.36,2.2,1.6,'#744c2c'),box(5.1,0,.15,.36,2.2,1.6,'#744c2c'),
 box(2.4,2.64,.5,1.4,.3,1,'#596b76'),box(2.7,2.94,.6,.8,.65,.8,'#72828c'),box(2,3.59,.4,2.2,.36,1.3,'#98a5a9'),
]});
registerModel('chimney',{boxes:()=>[
 box(.25,0,.25,1.5,3.3,1.5,'#899694'),
 box(.08,3.3,.08,1.84,.42,1.84,'#657574'),
 box(.18,3.72,.18,1.64,1.45,1.64,'#899694'),
 box(0,5.17,0,2,.42,2,'#d6dfdc'),
 box(.25,5.59,.25,1.5,.14,1.5,'#354746'),
]});
registerModel('clothesline',{support:'bottom',boxes:()=>[
 // Both posts share the same local baseline and dimensions, which guarantees
 // parallel vertical axes even when the surrounding terrain is stepped.
 box(.18,0,.18,.3,5,.3,'#744c2c'),box(5.52,0,.18,.3,5,.3,'#744c2c'),
 box(.35,4.55,.38,5.3,.08,.08,'#e8dfc7'),box(.35,4.18,.62,5.3,.08,.08,'#e8dfc7'),
 box(.8,3.05,.34,1.15,1.45,.12,'#78b4e5'),box(2.25,3.35,.34,.9,1.15,.12,'#f4f1df'),
 box(3.5,3.1,.58,1.35,1.02,.12,'#e96f72'),
]});
registerModel('slab',{defaults:{half:'bottom'},properties:{half:enumOf('bottom','top')},boxes:p=>[box(0,p.half==='top'?.5:0,0,1,.5,1)]});
registerModel('brick-accent',{boxes:()=>[box(0,.4,0,1,.22,.12,'#d39063')]});
registerModel('vertical-slab',{defaults:{facing:'south'},properties:facing,boxes:()=>[box(0,0,.5,1,1,.5)]});
registerModel('stairs',{defaults:{facing:'south',half:'bottom',shape:'straight'},properties:{...facing,half:enumOf('bottom','top'),shape:enumOf('straight','inner-left','inner-right','outer-left','outer-right')},boxes:p=>{
  const upper=p.half==='top'?0:.5,lower=p.half==='top'?.5:0;
  const out=[box(0,lower,0,1,.5,1)];
  if(p.shape==='straight')out.push(box(0,upper,.5,1,.5,.5));
  else if(p.shape.startsWith('outer'))out.push(box(p.shape.endsWith('left')?0:.5,upper,.5,.5,.5,.5));
  else{out.push(box(0,upper,.5,1,.5,.5));out.push(box(p.shape.endsWith('left')?0:.5,upper,0,.5,.5,.5));}
  return out;
}});
registerModel('pillar',{defaults:{axis:'y',width:.375},properties:{axis:enumOf('x','y','z'),width:enumOf(.25,.375,.5,.75,1)},boxes:p=>{
  const a=(1-p.width)/2;return [p.axis==='y'?box(a,0,a,p.width,1,p.width):p.axis==='x'?box(0,a,a,1,p.width,p.width):box(a,a,0,p.width,p.width,1)];
}});
registerModel('fence',{support:'bottom',connects:true,defaults:{},boxes:(_,connections)=>{
 const out=[box(.35,0,.35,.3,1,.3)];
 for(const side of connections)for(const y of [.25,.7])out.push(rotateBox(box(.425,y,.5,.15,.15,.5),DIRECTIONS.indexOf(side)));
 return out;
}});
registerModel('door',{support:'bottom',defaults:{facing:'south',width:2,height:5,hinge:'left',open:false},properties:{...facing,width:integer(1,8),height:integer(2,12),hinge:enumOf('left','right'),open:v=>typeof v==='boolean'},boxes:p=>{
 const x=p.hinge==='left'?0:p.width-.2;
 if(p.open)return [box(x,0,.8,.2,p.height,p.width)];
 const out=[box(0,0,.72,p.width,p.height,.26,'#8b562f')];
 // Raised rails, two recessed panels and a visible brass handle keep the door
 // readable from the overview camera without turning it into a flat brown slab.
 for(const y of [.25,2.55]){
  out.push(box(.2,y,.99,p.width-.4,1.75,.08,'#663d25'));
  out.push(box(.35,y+.15,1.08,p.width-.7,1.45,.06,'#a96b39'));
 }
 out.push(box(.1,0,1.04,.16,p.height,.12,'#74401f'),box(p.width-.26,0,1.04,.16,p.height,.12,'#74401f'));
 out.push(box(p.hinge==='left'?p.width-.38:.22,2.35,1.16,.18,.18,.16,'#f0c45c'));
 return out;
}});
registerModel('flower',{support:'bottom',occludes:false,boxes:()=>[box(.44,0,.44,.12,.7,.12,'#3c9c36'),box(.22,.64,.22,.56,.22,.56),box(.2,.25,.42,.4,.1,.2,'#519c37')]});
registerModel('grass',{support:'bottom',occludes:false,boxes:()=>[box(.15,0,.4,.15,.6,.15),box(.45,0,.2,.15,.85,.15),box(.7,0,.6,.15,.5,.15)]});
registerModel('rail',{occludes:false,defaults:{lane:'none',tie:true},properties:{lane:enumOf('none','near','far'),tie:v=>typeof v==='boolean'},boxes:p=>[
 ...(p.tie?[box(.2,0,0,.6,.18,1,'#72543a')]:[]),
 ...(p.lane!=='none'?[box(0,.18,p.lane==='near'?.62:.22,1,.2,.16)]:[]),
]});
registerModel('planter',{support:'bottom',boxes:()=>{
 const out=[box(0,0,0,2,.8,1,'#ad753d'),box(.1,.8,.1,1.8,.1,.8,'#645239')];
 for(let i=0;i<3;i++){out.push(box(.25+i*.6,.9,.45,.1,.7,.1,'#3c9c36'));out.push(box(.1+i*.6,1.5,.3,.4,.2,.4));}return out;
}});
registerModel('crop',{support:'bottom',boxes:()=>[box(0,0,0,1,.12,1,'#816237'),box(.2,.12,.2,.6,.55,.6),box(.4,.67,.3,.2,.2,.4)]});
registerModel('window',{defaults:{facing:'south',width:1,height:1},properties:{...facing,width:integer(1,8),height:integer(1,8)},occludes:false,boxes:p=>[
 box(0,0,.55,.15,p.height,.35,'#744c2c'),box(p.width-.15,0,.55,.15,p.height,.35,'#744c2c'),
 box(0,0,.55,p.width,.15,.35,'#744c2c'),box(0,p.height-.15,.55,p.width,.15,.35,'#744c2c'),
 box(.15,.15,.7,p.width-.3,p.height-.3,.08,'#7cbfd1'),box(p.width/2-.07,.1,.8,.14,p.height-.2,.12),box(.1,p.height/2-.07,.8,p.width-.2,.14,.12)]});
registerModel('bookshelf',{defaults:{facing:'south'},properties:facing,boxes:()=>{
 const out=[box(0,0,0,1,1,.25,'#744c2c'),box(0,0,.25,1,.12,.75)];
 for(let i=0;i<4;i++)out.push(box(.08+i*.23,.12,.35,.18,.7,.5,['#df6650','#ebc85a','#5186b6','#68a577'][i]));return out;
}});
registerModel('crate',{support:'bottom',boxes:()=>[box(.05,0,.05,.9,1,.9),box(0,.05,0,1,.1,1,'#744c2c'),box(0,.85,0,1,.1,1,'#744c2c')]});
registerModel('lamp',{support:'bottom',boxes:()=>[
 box(.34,0,.34,.32,5,.32,'#744c2c'),box(.18,0,.18,.64,.18,.64,'#5a3825'),
 box(-.1,4.8,-.1,1.2,.22,1.2,'#5a3825'),box(.02,5.02,.02,.96,1.02,.96,'#ffd15d'),
 box(-.08,6.04,-.08,1.16,.2,1.16,'#5a3825'),box(.18,6.24,.18,.64,.28,.64,'#744c2c'),
 ...[.06,.84].flatMap(x=>[box(x,5.05,.84,.1,.96,.1,'#744c2c'),box(.84,5.05,x,.1,.96,.1,'#744c2c')]),
]});
registerModel('bench',{support:'bottom',defaults:{facing:'south'},properties:facing,boxes:()=>[box(0,1,0,4,.3,1.5),box(0,1.3,0,4,1,.25),box(.3,0,.2,.3,1,1),box(3.4,0,.2,.3,1,1)]});
registerModel('sign',{defaults:{facing:'south'},properties:facing,boxes:()=>[box(0,0,.4,2,2,.3),box(.2,.3,.71,1.6,1.3,.1,'#f1dbaa'),box(.94,.3,.82,.12,1.3,.08,'#744c2c')]});
registerModel('wall-lantern',{support:'back',mount:[.5,1.7,0],defaults:{facing:'south'},properties:facing,boxes:()=>[
 box(.4,1.6,0,.2,.2,.6,'#744c2c'),box(.15,.35,.2,.7,1,.65,'#ffd15d'),
 box(.05,.2,.1,.9,.15,.85),box(.05,1.35,.1,.9,.15,.85),box(.45,1.5,.4,.1,.25,.1),
 ...[.12,.8].map(x=>box(x,.35,.78,.08,1,.08)),
]});
registerModel('chalkboard',{support:'bottom',defaults:{facing:'south'},properties:facing,boxes:()=>{
 const out=[box(.1,0,.2,.2,3,.2),box(1.7,0,.2,.2,3,.2),box(.1,.6,.2,1.8,2.2,.2),box(.3,.85,.41,1.4,1.65,.1,'#2b4449')];
 for(let row=0;row<4;row++)out.push(box(.5,2.2-row*.3,.52,row===0?1:.7,.065,.03,'#f1dbaa'));return out;
}});
registerModel('tool-rack',{support:'back',mount:[1.5,1.5,0],defaults:{facing:'south'},properties:facing,boxes:()=>{
 const out=[box(0,0,0,3,3,.18,'#744c2c'),box(.1,2.5,.2,2.8,.18,.3)];
 for(let i=0;i<3;i++){out.push(box(.42+i, .4,.3,.16,1.9,.18));out.push(box(.18+i,2.1,.3,.65,.3,.35,'#aab5b9'));}return out;
}});
registerModel('station-clock',{support:'back',mount:[1,1,0],defaults:{facing:'south'},properties:facing,boxes:()=>[
 box(0,0,0,2,2,.25,'#744c2c'),box(.18,.18,.26,1.64,1.64,.15,'#f1dbaa'),
 box(.94,.94,.42,.12,.65,.07,'#2b4449'),box(.94,.86,.42,.65,.12,.07,'#2b4449'),
 ...[[.95,1.6],[.95,.25],[.25,.95],[1.6,.95]].map(([x,y])=>box(x,y,.42,.15,.15,.06,'#744c2c')),
]});
registerModel('plaque',{support:'back',mount:[1,.5,0],defaults:{facing:'south'},properties:facing,boxes:()=>[
 box(0,0,0,2,1,.15),box(.2,.15,.16,1.6,.7,.1,'#f1dbaa'),box(.94,.25,.27,.12,.5,.05,'#327bb6'),box(.75,.44,.27,.5,.12,.05,'#327bb6'),
]});
// Additional reusable shapes use bounded boxes, never executable save-file code.
export function registerBoxModel(id,boxes,{support='none',occludes=false}={}) {
 if(!Array.isArray(boxes)||!boxes.length)throw new Error('Empty model');
 for(const b of boxes)for(let a=0;a<3;a++)if(!Number.isFinite(b.min[a])||!Number.isFinite(b.max[a])||b.max[a]<=b.min[a]||Math.abs(b.min[a])>64||Math.abs(b.max[a])>64)throw new Error('Invalid model geometry');
 registerModel(id,{support,occludes,defaults:{facing:'south'},properties:facing,boxes:()=>boxes});
}
// Arbitrary triangle geometry is allowed. Collision/support are explicit proxies;
// occupancy conservatively includes the visual bounds as well as collision boxes.
export function registerMeshModel(id,{positions,colors,collisionBoxes,support='none'}) {
 if(!Array.isArray(positions)||!positions.length||positions.length%9||positions.length>900000||!positions.every(v=>Number.isFinite(v)&&Math.abs(v)<=64))throw new Error('Invalid triangle model');
 if(!Array.isArray(collisionBoxes)||!collisionBoxes.length)throw new Error('Missing collision proxies');
 for(const b of collisionBoxes)for(let a=0;a<3;a++)if(!Number.isFinite(b.min[a])||!Number.isFinite(b.max[a])||b.max[a]<=b.min[a]||Math.abs(b.min[a])>64||Math.abs(b.max[a])>64)throw new Error('Invalid collision proxy');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];positions.forEach((v,i)=>{min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v);});
 for(let a=0;a<3;a++)if(max[a]===min[a])max[a]+=.00001;
 if(colors&&(!Array.isArray(colors)||colors.length!==positions.length/3||!colors.every(c=>/^#[\da-f]{6}$/i.test(c))))throw new Error('Invalid vertex colors');
 registerModel(id,{support,occludes:false,defaults:{facing:'south'},properties:facing,positions:Object.freeze([...positions]),colors:colors&&Object.freeze([...colors]),occupancyBoxes:[{min,max},...collisionBoxes],boxes:()=>collisionBoxes});
}

// One multi-cell instrument, with a tilted square barrel and an open lens hood.
// Geometry is exact; individual component bounds are conservative collision proxies.
{
 const positions=[],colors=[],collisionBoxes=[];
 const add=(min,size,color,tilted=false)=>{
  const vertices=[];
  for(let i=0;i<8;i++){
   let [x,y,z]=min.map((v,a)=>v+((i>>a)&1)*size[a]);
   if(tilted){const yy=y*Math.cos(.38)+z*Math.sin(.38),zz=-y*Math.sin(.38)+z*Math.cos(.38);y=yy+2;x=x*Math.cos(1.25)+zz*Math.sin(1.25)+1;z=-(min[0]+(i&1)*size[0])*Math.sin(1.25)+zz*Math.cos(1.25)+1;}
   vertices.push([x,y,z]);
  }
  collisionBoxes.push({min:[0,1,2].map(a=>Math.min(...vertices.map(v=>v[a]))),max:[0,1,2].map(a=>Math.max(...vertices.map(v=>v[a])))});
  for(const face of [[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])for(const i of [0,1,2,0,2,3]){positions.push(...vertices[face[i]]);colors.push(color);}
 };
 add([0,0,0],[2,.35,2],'#abb9bf');add([.65,.35,.65],[.7,1.65,.7],'#687b89');
 add([-.8,-.8,-.5],[1.6,1.6,.65],'#637985',true);
 add([-.65,-.65,.15],[1.3,1.3,4.8],'#e2eceb',true);
 add([-.76,-.76,2],[1.52,1.52,.38],'#8799a3',true);
 // Four rim walls leave a recessed dark glass opening instead of a solid black cap.
 for(const [min,size] of [[[-1,-1,4.75],[.3,2,1]],[[.7,-1,4.75],[.3,2,1]],[[-.7,-1,4.75],[1.4,.3,1]],[[-.7,.7,4.75],[1.4,.3,1]]])add(min,size,'#e2eceb',true);
 add([-.7,-.7,4.96],[1.4,1.4,.08],'#263e4e',true);
 registerMeshModel('telescope',{positions,colors,collisionBoxes,support:'bottom'});
}

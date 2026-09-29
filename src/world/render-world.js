import * as THREE from 'three';
import { meshWorld } from './mesher.js';
import { worldToCell } from './data.js';
import { modelDefinition, DIRECTIONS, rotatePoint } from './models.js';

export function renderWorld(world,preparedMesh=null) {
 const root=new THREE.Group(),pickables=[],resources=[];
 // Independent seeded samples reproduce the old soft pixel mottling. A larger
 // tile prevents the same four correlated dots repeating as diagonal stripes.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#bcbcbc';ctx.fillRect(0,0,64,64);
 let textureSeed=1729;const random=()=>{textureSeed=(textureSeed*1664525+1013904223)>>>0;return textureSeed/4294967296;};
 for(let i=0;i<224;i++){
  ctx.fillStyle=random()>.5?'rgba(255,255,255,.035)':'rgba(0,0,0,.035)';
  ctx.fillRect(Math.floor(random()*16)*4,Math.floor(random()*16)*4,4,4);
 }
 // Neutral grey permits both light and dark flecks; undo its linear-space tint.
 const textureGain=1/new THREE.Color('#bcbcbc').r;
 const texture=new THREE.CanvasTexture(canvas);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
 const opaque=new THREE.MeshLambertMaterial({map:texture,vertexColors:true});
 const woodCanvas=document.createElement('canvas');woodCanvas.width=woodCanvas.height=64;
 const woodCtx=woodCanvas.getContext('2d');woodCtx.fillStyle='#bcbcbc';woodCtx.fillRect(0,0,64,64);
 // Four pixels equal one voxel eighth: irregular grain plus a clean board seam.
 for(let y=0;y<64;y+=16){woodCtx.fillStyle='rgba(0,0,0,.12)';woodCtx.fillRect(0,y,64,2);woodCtx.fillStyle='rgba(255,255,255,.055)';woodCtx.fillRect(0,y+2,64,2);}
 for(let i=0;i<48;i++){const y=Math.floor(random()*16)*4+4,x=Math.floor(random()*16)*4,w=(2+Math.floor(random()*5))*4;woodCtx.fillStyle=random()>.3?'rgba(75,39,18,.10)':'rgba(255,231,180,.07)';woodCtx.fillRect(x,y,Math.min(w,64-x),2);}
 const woodTexture=new THREE.CanvasTexture(woodCanvas);woodTexture.magFilter=woodTexture.minFilter=THREE.NearestFilter;woodTexture.wrapS=woodTexture.wrapT=THREE.RepeatWrapping;woodTexture.colorSpace=THREE.SRGBColorSpace;woodTexture.generateMipmaps=false;
 const wood=new THREE.MeshLambertMaterial({map:woodTexture,vertexColors:true});
 const glass=new THREE.MeshLambertMaterial({vertexColors:true,transparent:true,opacity:.78,depthWrite:false});
 resources.push(texture,woodTexture,opaque,wood,glass);
 // Batch adjacent data chunks into rendering regions without changing their cell identity.
 const regions=new Map(),woodColors=new Set(['#ad753d','#744c2c','#986334','#8b562f','#663d25','#a96b39','#74401f','#5a3825']);
 for(const chunk of preparedMesh??meshWorld(world)){
  for(const face of chunk.faces){
   const surface=chunk.transparent?'glass':woodColors.has(face.color)?'wood':'opaque';
   const key=chunk.chunk.split(',').map(v=>Math.floor(Number(v)/2)).join(',')+'/'+surface;
   if(!regions.has(key))regions.set(key,{surface,transparent:chunk.transparent,faces:[]});
   regions.get(key).faces.push(face);
  }
 }
 for(const chunk of regions.values()){
  const positions=[],normals=[],colors=[],uvs=[],owners=[];
  for(const face of chunk.faces){
   const {axis,sign,plane,rect,color,place,instance}=face,u=(axis+1)%3,v=(axis+2)%3;
   const c=new THREE.Color(color).multiplyScalar(chunk.transparent?1:textureGain),normal=[0,0,0];normal[axis]=sign;
   const corners=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[2],rect[3]],[rect[0],rect[3]]];
   for(const index of sign===1?[0,1,2,0,2,3]:[0,2,1,0,3,2]){
    const p=[];p[axis]=plane*world.cellSize;p[u]=corners[index][0]*world.cellSize;p[v]=corners[index][1]*world.cellSize;
    positions.push(...p);normals.push(...normal);colors.push(c.r,c.g,c.b);uvs.push(corners[index][0]/4,corners[index][1]/4);
   }
   owners.push({place,instance},{place,instance});
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,chunk.surface==='glass'?glass:chunk.surface==='wood'?wood:opaque);mesh.castShadow=!chunk.transparent;mesh.receiveShadow=true;
  mesh.userData.owners=owners;root.add(mesh);pickables.push(mesh);resources.push(geometry);
 }
 // Mesh-defined custom models share geometry across their instances. They never
 // participate in box face culling: their proxy bounds are not opaque geometry.
 const custom=new Map();
 function collect(anchor,state,instance=null){if(!modelDefinition(state.model).positions)return;const key=JSON.stringify(state);if(!custom.has(key))custom.set(key,{state,entries:[]});custom.get(key).entries.push({anchor,instance});}
 for(const {cell,state} of world.blocks.values())collect(cell,state);
 for(const spec of world.instances.values())collect(spec.anchor,spec.state,spec.id);
 for(const {state,entries} of custom.values()){
  const source=modelDefinition(state.model).positions,positions=[];
  for(let i=0;i<source.length;i+=3)positions.push(...rotatePoint(source.slice(i,i+3),DIRECTIONS.indexOf(state.props.facing)).map(v=>v*world.cellSize));
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
   const vertexColors=modelDefinition(state.model).colors;
   if(vertexColors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors.flatMap(c=>{const value=new THREE.Color(c);return [value.r,value.g,value.b];}),3));
   const material=new THREE.MeshLambertMaterial({color:vertexColors?'#ffffff':state.color,vertexColors:!!vertexColors});
  const mesh=new THREE.InstancedMesh(geometry,material,entries.length),matrix=new THREE.Matrix4();
  entries.forEach(({anchor},i)=>mesh.setMatrixAt(i,matrix.makeTranslation(...anchor.map(v=>v*world.cellSize))));
  mesh.userData.custom={state,entries};mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);pickables.push(mesh);resources.push(mesh,geometry,material);
 }
 return {root,pickables,pick(hit){
  if(!hit)return null;
  const custom=hit.object.userData.custom;if(custom){const entry=custom.entries[hit.instanceId];return {place:custom.state.place??null,instance:entry.instance,cell:[...entry.anchor]};}
  const owner=hit.object.userData.owners?.[hit.faceIndex];if(!owner)return null;
  const point=hit.point.clone().addScaledVector(hit.face.normal,-.00001);
  return {...owner,cell:worldToCell(point.toArray(),world.cellSize)};
 },dispose(){for(const r of resources)r.dispose();root.clear();}};
}

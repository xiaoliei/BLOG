import * as THREE from 'three';
import { meshWorld } from './mesher.ts';
import type { Face, MeshChunk } from './mesher.ts';
import { worldToCell } from './data.ts';
import type { World, Vec3, BlockState } from './data.ts';
import { modelDefinition, DIRECTIONS, rotatePoint } from './models.ts';

export interface FaceOwner { place: string | null; instance: string | null; }
export interface BuildFaceGeometryResult { geometry: THREE.BufferGeometry; owners: FaceOwner[]; }

export function buildFaceGeometry(faces: readonly Face[], cellSize: number, colorGain = 1): BuildFaceGeometryResult {
 const positions:number[]=[],normals:number[]=[],colors:number[]=[],uvs:number[]=[],owners:FaceOwner[]=[];
 for(const face of faces){
  const {axis,sign,plane,rect,color,place,instance}=face,u=(axis+1)%3,v=(axis+2)%3;
  const c=new THREE.Color(color).multiplyScalar(colorGain),normal=[0,0,0];normal[axis]=sign;
  const corners=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[2],rect[3]],[rect[0],rect[3]]];
  for(const index of sign===1?[0,1,2,0,2,3]:[0,2,1,0,3,2]){
   const p=[0,0,0];p[axis]=plane*cellSize;p[u]=corners[index][0]*cellSize;p[v]=corners[index][1]*cellSize;
   positions.push(...p);normals.push(...normal);colors.push(c.r,c.g,c.b);uvs.push(corners[index][0]/4,corners[index][1]/4);
  }
  owners.push({place,instance},{place,instance});
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeBoundingSphere();
 return {geometry,owners};
}

export type PickHit = THREE.Intersection & { instanceId?: number; faceIndex?: number };

export interface WorldPickResult {
  place: string | null;
  instance: string | null;
  cell: Vec3;
}

export interface WorldRenderer {
  root: THREE.Group;
  pickables: THREE.Object3D[];
  colorGain: number;
  materialForFace: (face: Face) => THREE.MeshLambertMaterial;
  pick: (hit: PickHit | null | undefined) => WorldPickResult | null;
  dispose: () => void;
}

interface CustomEntry { anchor: Vec3; instance: string | null; }
interface CustomModel { state: BlockState; entries: CustomEntry[]; }
interface MeshCustomData { state: BlockState; entries: CustomEntry[]; }

export function renderWorld(world: World,preparedMesh: MeshChunk[]|null=null): WorldRenderer {
 const root=new THREE.Group(),pickables: THREE.Object3D[]=[],resources:(THREE.BufferGeometry|THREE.Material|THREE.Texture|THREE.InstancedMesh)[]=[];
 // Independent seeded samples reproduce the old soft pixel mottling. A larger
 // tile prevents the same four correlated dots repeating as diagonal stripes.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
 const ctx=canvas.getContext('2d') as CanvasRenderingContext2D;ctx.fillStyle='#bcbcbc';ctx.fillRect(0,0,64,64);
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
 const woodCtx=woodCanvas.getContext('2d') as CanvasRenderingContext2D;woodCtx.fillStyle='#bcbcbc';woodCtx.fillRect(0,0,64,64);
 // Four pixels equal one voxel eighth: irregular grain plus a clean board seam.
 for(let y=0;y<64;y+=16){woodCtx.fillStyle='rgba(0,0,0,.12)';woodCtx.fillRect(0,y,64,2);woodCtx.fillStyle='rgba(255,255,255,.055)';woodCtx.fillRect(0,y+2,64,2);}
 for(let i=0;i<48;i++){const y=Math.floor(random()*16)*4+4,x=Math.floor(random()*16)*4,w=(2+Math.floor(random()*5))*4;woodCtx.fillStyle=random()>.3?'rgba(75,39,18,.10)':'rgba(255,231,180,.07)';woodCtx.fillRect(x,y,Math.min(w,64-x),2);}
 const woodTexture=new THREE.CanvasTexture(woodCanvas);woodTexture.magFilter=woodTexture.minFilter=THREE.NearestFilter;woodTexture.wrapS=woodTexture.wrapT=THREE.RepeatWrapping;woodTexture.colorSpace=THREE.SRGBColorSpace;woodTexture.generateMipmaps=false;
 const wood=new THREE.MeshLambertMaterial({map:woodTexture,vertexColors:true});
 const glass=new THREE.MeshLambertMaterial({vertexColors:true,transparent:true,opacity:.78,depthWrite:false});
 resources.push(texture,woodTexture,opaque,wood,glass);
 // Batch adjacent data chunks into rendering regions without changing their cell identity.
 const regions=new Map<string,{surface:'glass'|'wood'|'opaque';transparent:boolean;faces:Face[]}>();
 const woodColors=new Set(['#ad753d','#744c2c','#986334','#8b562f','#663d25','#a96b39','#74401f','#5a3825']);
 for(const chunk of preparedMesh??meshWorld(world)){
  for(const face of chunk.faces){
   const surface: 'glass'|'wood'|'opaque'=chunk.transparent?'glass':woodColors.has(face.color)?'wood':'opaque';
   const key=chunk.chunk.split(',').map(v=>Math.floor(Number(v)/2)).join(',')+'/'+surface;
   const region=regions.get(key);
   if(region)region.faces.push(face);
   else regions.set(key,{surface,transparent:chunk.transparent,faces:[face]});
  }
 }
 for(const chunk of regions.values()){
  const {geometry,owners}=buildFaceGeometry(chunk.faces,world.cellSize,chunk.transparent?1:textureGain);
  const mesh=new THREE.Mesh(geometry,chunk.surface==='glass'?glass:chunk.surface==='wood'?wood:opaque);mesh.castShadow=!chunk.transparent;mesh.receiveShadow=true;
  mesh.userData.owners=owners;root.add(mesh);pickables.push(mesh);resources.push(geometry);
 }
 // Mesh-defined custom models share geometry across their instances. They never
 // participate in box face culling: their proxy bounds are not opaque geometry.
 const custom=new Map<string, CustomModel>();
 function collect(anchor: Vec3,state: BlockState,instance: string|null=null): void{if(!modelDefinition(state.model).positions)return;const key=JSON.stringify(state);const existing=custom.get(key);if(existing)existing.entries.push({anchor,instance});else custom.set(key,{state,entries:[{anchor,instance}]});}
 for(const {cell,state} of world.blocks.values())collect(cell,state);
 for(const spec of world.instances.values())collect(spec.anchor,spec.state,spec.id);
 for(const {state,entries} of custom.values()){
  const source=modelDefinition(state.model).positions as readonly number[],positions:number[]=[];
  const facing=DIRECTIONS.indexOf((state.props.facing ?? 'south') as typeof DIRECTIONS[number]);
  for(let i=0;i<source.length;i+=3)positions.push(...rotatePoint([source[i],source[i+1],source[i+2]],facing).map(v=>v*world.cellSize));
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
   const vertexColors=modelDefinition(state.model).colors;
   if(vertexColors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors.flatMap(c=>{const value=new THREE.Color(c);return [value.r,value.g,value.b];}),3));
   const material=new THREE.MeshLambertMaterial({color:vertexColors?'#ffffff':state.color,vertexColors:!!vertexColors});
  const mesh=new THREE.InstancedMesh(geometry,material,entries.length),matrix=new THREE.Matrix4();
  entries.forEach(({anchor},i)=>mesh.setMatrixAt(i,matrix.makeTranslation(anchor[0]*world.cellSize,anchor[1]*world.cellSize,anchor[2]*world.cellSize)));
  mesh.userData.custom={state,entries} satisfies MeshCustomData;mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);pickables.push(mesh);resources.push(mesh,geometry,material);
 }
 return {root,pickables,colorGain:textureGain,materialForFace(face){return face.transparent?glass:woodColors.has(face.color)?wood:opaque;},pick(hit){
  if(!hit)return null;
  const customData=hit.object.userData.custom as MeshCustomData|undefined;
  if(customData){const entry=customData.entries[hit.instanceId as number];return {place:customData.state.place??null,instance:entry.instance,cell:[...entry.anchor]};}
  // mesh.userData.owners 直接就是 FaceOwner[]（见上方赋值），不要再套一层 .owners。
  const owners=hit.object.userData.owners as FaceOwner[]|undefined;
  const owner=owners?.[hit.faceIndex as number];if(!owner)return null;
  const point=hit.point.clone().addScaledVector(hit.face!.normal,-.00001);
  return {...owner,cell:worldToCell(point.toArray(),world.cellSize)};
 },dispose(){for(const r of resources)r.dispose();root.clear();}};
}

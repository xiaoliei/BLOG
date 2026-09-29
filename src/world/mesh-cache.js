// Optional derived mesh cache; the world save remains the only source of truth.
export const MESH_VERSION=1;
export function encodeMesh(chunks,sourceHash){
 const materials=[],materialIds=new Map(),owners=[],ownerIds=new Map();
 const index=(value,values,ids)=>{const k=JSON.stringify(value);if(!ids.has(k)){ids.set(k,values.length);values.push(value);}return ids.get(k);};
 return JSON.stringify({version:MESH_VERSION,sourceHash,materials,owners,chunks:chunks.map(c=>({chunk:c.chunk,transparent:c.transparent,faces:c.faces.map(f=>[f.axis,f.sign,f.plane,...f.rect,index(f.color,materials,materialIds),index([f.place,f.instance],owners,ownerIds)])}))})+'\n';
}
export function decodeMesh(text,sourceHash){
 if(text.length>24_000_000)throw new Error('Mesh cache too large');const data=JSON.parse(text);
 if(data.version!==MESH_VERSION||data.sourceHash!==sourceHash||!Array.isArray(data.chunks)||data.chunks.length>8192||!Array.isArray(data.materials)||!Array.isArray(data.owners))throw new Error('Stale mesh cache');
 if(!data.materials.every(c=>/^#[\da-f]{6}$/i.test(c))||!data.owners.every(o=>Array.isArray(o)&&o.length===2&&o.every(v=>v===null||typeof v==='string')))throw new Error('Invalid mesh palette');
 let count=0;
 return data.chunks.map(c=>{
  if(typeof c.chunk!=='string'||!Array.isArray(c.faces)||typeof c.transparent!=='boolean')throw new Error('Invalid mesh chunk');
  const faces=c.faces.map(f=>{
   if(++count>400000||!Array.isArray(f)||f.length!==9||!f.every(Number.isFinite)||![0,1,2].includes(f[0])||![-1,1].includes(f[1])||f[5]<=f[3]||f[6]<=f[4]||!data.materials[f[7]]||!data.owners[f[8]])throw new Error('Invalid cached face');
   return {axis:f[0],sign:f[1],plane:f[2],rect:f.slice(3,7),color:data.materials[f[7]],place:data.owners[f[8]][0],instance:data.owners[f[8]][1]};
  });return {...c,faces};
 });
}
export async function sourceDigest(text){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}

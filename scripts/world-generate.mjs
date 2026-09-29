import { mkdir, writeFile, rename, copyFile, unlink } from 'node:fs/promises';
import { generateHarbor } from '../src/world/generate.js';
import { serializeWorld, parseWorld } from '../src/world/data.js';
import { meshWorld } from '../src/world/mesher.js';
import { encodeMesh, sourceDigest } from '../src/world/mesh-cache.js';
// Windows asset watchers may briefly hold the destination open. Retry the atomic
// rename rather than deleting a known-good save or writing into it in place.
async function replaceFile(temp,target){
 for(let attempt=0;;attempt++)try{await rename(temp,target);return;}catch(error){
  if(!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;
  // Some Windows preview/watch processes retain a destination handle for the
  // whole session. The temp file is already fully written and validated, so a
  // final in-place copy is safer than leaving world and derived mesh mismatched.
  if(attempt===5){await copyFile(temp,target);await unlink(temp);return;}
  await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
 }
}
const target=new URL('../public/world/harbor.world.json',import.meta.url);
const start=performance.now(),world=generateHarbor(),text=serializeWorld(world);
parseWorld(text);
await mkdir(new URL('../public/world/',import.meta.url),{recursive:true});
const mesh=encodeMesh(meshWorld(world),await sourceDigest(text));
const meshTemp=new URL('../public/world/harbor.mesh.json.tmp',import.meta.url);
await writeFile(meshTemp,mesh);await replaceFile(meshTemp,new URL('../public/world/harbor.mesh.json',import.meta.url));
const temp=new URL('../public/world/harbor.world.json.tmp',import.meta.url);
await writeFile(temp,text);await replaceFile(temp,target);
console.log(`Saved ${world.blocks.size} blocks, ${world.instances.size} instances, ${text.length} bytes (${Math.round(performance.now()-start)} ms)`);

import { readFile } from 'node:fs/promises';
import { parseWorld } from '../src/world/data.js';
import { validateHarbor } from '../src/world/harbor-validation.js';
const world=parseWorld(await readFile(new URL('../public/world/harbor.world.json',import.meta.url),'utf8'));
const report=validateHarbor(world);console.log(JSON.stringify(report,null,2));if(!report.valid)process.exitCode=1;

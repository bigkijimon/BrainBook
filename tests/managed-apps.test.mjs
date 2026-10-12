import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';import path from 'node:path';
import {collectManagedApps,mergeInventory,INVENTORY_UNIVERSE} from '../managed-apps.mjs';
test('inventory collects every implemented catalog entry, canonical roots and nested apps; dedupes actual roots, excludes research/config',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'evidence/registry-fixture-'));
 const write=async(file,body)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),body);};
 await write('canonical/SYSTEMS.md','Public root ledger');await write('canonical/000_WHERE.md','| `9991` | One |');
 await write('catalog/One/package.json',JSON.stringify({scripts:{start:'node server.js'}}));await write('catalog/Two/web/index.html','<h1>Implemented site</h1>');await write('catalog/Research/README.md','Research only; no product');await write('catalog/Config/package.json',JSON.stringify({scripts:{test:'node --test'}}));await write('catalog/Secrets/server.py','private');await write('known/Three/app.py','public entrypoint');
 const universe={canonical:['canonical/SYSTEMS.md','canonical/000_WHERE.md'],catalogs:['catalog'],knownRoots:['catalog/One','known/Three'],excludedDirectories:INVENTORY_UNIVERSE.excludedDirectories};
 const inventory=await collectManagedApps({documents:root,universe,now:1000});assert.equal(inventory.count,3);assert.equal(new Set(inventory.apps.map(a=>a.root)).size,3);assert.ok(inventory.apps.some(a=>a.name==='One'));assert.ok(inventory.apps.some(a=>a.name==='Two'));assert.ok(inventory.apps.some(a=>a.name==='Three'));assert.ok(inventory.apps.every(a=>a.health==='Not checked'&&a.evidence.length>0));assert.ok(inventory.notApps.some(a=>a.root.endsWith('/Research')));assert.ok(!JSON.stringify(inventory).includes('/Secrets/server.py'));assert.equal(await readFile(path.join(root,'catalog/One/package.json'),'utf8'),JSON.stringify({scripts:{start:'node server.js'}}));
});
test('inventory deduplication retains all evidence and caller snapshot gives Igataya an app identity, no invented Pro',async()=>{
 assert.equal(mergeInventory([{root:'/a',name:'A',evidence:[{path:'/a/package'}]},{root:'/a',name:'A',evidence:[{path:'/a/README'}]}])[0].evidence.length,2);
 const inventory=JSON.parse(await readFile('evidence/managed-app-inventory.json','utf8'));assert.equal(inventory.count,inventory.apps.length);assert.equal(new Set(inventory.apps.map(a=>a.root)).size,inventory.count);const app=inventory.apps.find(a=>a.name==='Igataya');assert.ok(app);assert.match(app.root,/IgataCarRental\/igataya-rentacar$/);assert.ok(app.evidence.some(e=>e.kind==='package.json'));assert.ok(!inventory.apps.some(a=>a.name==='IgatayaPro'));assert.deepEqual(inventory.denied,[{path:'/Users/yuma/Documents/SystemAPPS/Applications/Obsidian.app',reason:'ENOENT'}]);assert.ok(inventory.universe.catalogs.some(p=>p.endsWith('/SystemAPPS')));assert.ok(!inventory.apps.some(a=>a.name==='Obsidian'),'Unavailable canonical app must not be invented');
});

test('shared documented port does not pretend to open a uniquely identified app',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'evidence/registry-port-fixture-'));
 for(const name of ['First','Second']){await mkdir(path.join(root,'catalog',name),{recursive:true});await writeFile(path.join(root,'catalog',name,'package.json'),JSON.stringify({scripts:{start:'next start -p 9999'}}));}
 const inventory=await collectManagedApps({documents:root,universe:{canonical:[],catalogs:['catalog'],knownRoots:[],excludedDirectories:[]}});assert.equal(inventory.count,2);assert.ok(inventory.apps.every(a=>a.documentedUrl===null&&a.addressBasis.includes('shared')));
});

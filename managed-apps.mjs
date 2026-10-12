// Read-only public implementation inventory. No services are launched, no runtime/customer stores read.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const INVENTORY_UNIVERSE={documents:'/Users/yuma/Documents',canonical:['ObsidianVault/Vault/SYSTEMS.md','ObsidianVault/Vault/000_WHERE.md'],catalogs:['SystemAPPS'],knownRoots:['Personal/task-system','Hermes/Hermes3D','ComfyUI/ComfyUI-H3-MacFast','School/HSAcademy/HS_App','School/HSAcademy/HS_Web','School/Upclass/Upclass_App/upclass-app','School/留学/StudyAbroadIntelligenceDNA','School/留学/ryugaku-hub-mvp','SystemAPPS/Applications/Obsidian.app'],excludedDirectories:['Applications','Developer-Settings','Secrets','_keys','_backups','node_modules','dist','build','data','output','logs','cache','venv','__pycache__','archive','archives','backup','backups','tests','test-results','docs','AGENTS','agents','Accounting','customers','secrets','models','assets','audio','papers','materials','fonts','vendor','content','books','inputs','verification','tools','knowledge','hosting','site','public']};
const MARKERS=['package.json','pyproject.toml','Package.swift','server.mjs','server.py','main.py','app.py','index.html','foundation/mcp_foundation.py','bin/llm-weekly','src/app.py','web/app.py','Contents/Info.plist'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const exists=async p=>fs.stat(p).then(s=>s.isFile()).catch(()=>false);
const human=value=>String(value||'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
export function mergeInventory(entries) {
 const map=new Map();for(const entry of entries){const old=map.get(entry.root);if(old){old.evidence=[...new Map([...old.evidence,...entry.evidence].map(e=>[e.path,e])).values()];}else map.set(entry.root,{...entry,evidence:[...entry.evidence]});}
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
export async function collectManagedApps({documents=INVENTORY_UNIVERSE.documents,now=Date.now(),universe=INVENTORY_UNIVERSE}={}) {
 const excluded=new Set(universe.excludedDirectories), entries=[], notApps=[], denied=[], roots=new Set(universe.knownRoots.map(r=>path.join(documents,r)));
 const canonical=[];let ledger='';
 for(const rel of universe.canonical){try{const bytes=await fs.readFile(path.join(documents,rel));
 // Application candidates come from the canonical table, not a handpicked UI menu.
 for(const line of bytes.toString().split('\n')){if(!line.startsWith('|')||/research|no product built|no deployed site|historical|models|credentials|config|Graphify|knowledge/i.test(line))continue;const fields=line.split('|');const description=(fields[1]||'')+' '+(fields[3]||'');if(!/application|website|\bapp\b|\bapps\b|workbench|weekly ledger|accounting ledger|desktop packaging|app and packaging|Lesson report OS|Study Abroad OS|Hermes3D|ComfyUI|MCP-Business/i.test(description))continue;for(const match of line.matchAll(/`(\/Users\/yuma\/Documents\/[^`]+)`/g)){const candidate=match[1];if(candidate.endsWith('.md')||candidate.endsWith('.json')||candidate.includes('/graphify-out')||candidate.includes('/Developer-Settings')||candidate===path.join(documents,'SystemAPPS')||candidate===path.join(documents,'School'))continue;roots.add(candidate);}}
 canonical.push({path:path.join(documents,rel),sha256:sha(bytes)});if(rel.endsWith('000_WHERE.md'))ledger=bytes.toString();}catch(e){denied.push({path:path.join(documents,rel),reason:e.code||'Read failed'});}}
 for(const rel of universe.catalogs){try{for(const d of await fs.readdir(path.join(documents,rel),{withFileTypes:true}))if(d.isDirectory()&&!d.name.startsWith('.')&&!excluded.has(d.name))roots.add(path.join(documents,rel,d.name));}catch(e){denied.push({path:path.join(documents,rel),reason:e.code||'Read failed'});}}
 const inspect=async(root,depth,owningRoot)=>{
 let real;try{real=await fs.realpath(root);if(!real.startsWith(path.resolve(documents)+path.sep)){notApps.push({root,reason:'External root excluded from bounded inventory'});return;}}catch(e){denied.push({path:root,reason:e.code||'Root unavailable'});return;}
 const markers=[];for(const f of MARKERS)if(await exists(path.join(root,f)))markers.push(f);
 let pkg={};if(markers.includes('package.json'))try{pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));}catch{/* Invalid public manifest cannot prove an app. */}
 // Test-only libraries or agent/research packs do not prove an implemented app.
 const appScript=Object.entries(pkg.scripts||{}).some(([k,v])=>/^(?:dev|start|serve|api|sa|preview)$/.test(k)&&typeof v==='string');
 const concrete=markers.filter(f=>!['package.json','pyproject.toml'].includes(f));
 const implemented=appScript || concrete.length>0 || markers.includes('pyproject.toml')&&await exists(path.join(root,'src','main.py'));
 if(implemented){
 const proof=appScript?['package.json']:concrete;
 const evidence=[];for(const f of proof){const full=path.join(root,f),stat=await fs.stat(full);let hash=null;if(['package.json','Package.swift'].includes(f))hash=sha(await fs.readFile(full));evidence.push({path:full,kind:f,mtime:stat.mtime.toISOString(),sha256:hash});}
 if(await exists(path.join(root,'README.md'))){const full=path.join(root,'README.md'),bytes=await fs.readFile(full);evidence.push({path:full,kind:'public README',sha256:sha(bytes)});}
 let name=human(path.basename(owningRoot).replace(/\.app$/,''));if(root!==owningRoot && path.basename(owningRoot)==='Stock')name=human(path.basename(root));
 if(owningRoot.endsWith('/HS_App'))name='H&S Academy app';if(root.endsWith('/HS_Web'))name='H&S Academy website';if(root.endsWith('/upclass-app'))name='UPCLASS';if(root.endsWith('/task-system'))name='BrainBook';if(path.basename(owningRoot)==='IgataCarRental')name='Igataya';
 const kind=markers.includes('Package.swift')||markers.includes('Contents/Info.plist')?'desktop app':markers.includes('index.html')&&!appScript?'site':markers.some(f=>/server|foundation|llm-weekly|main.py|app.py/.test(f))?'service':'app';
 const rootLine=ledger.split('\n').find(line=>line.includes('`'+root+'`'));
 const portLines=ledger.split('\n').filter(line=>/^\| `\d/.test(line));
 // Only a named canonical port or explicit port in package scripts. Never template README :3000.
 const localPort=Object.values(pkg.scripts||{}).filter(v=>typeof v==='string').map(v=>v.match(/(?:--port|\s-p)\s+(\d{4,5})\b/)).find(Boolean)?.[1];
 const aliases=name==='BrainBook'?['BrainBook']:name==='UPCLASS'?['UPCLASS app']:name==='Hermes3D'?['Hermes3D']:name==='ComfyUI H3 MacFast'?['ComfyUI']:name==='MorningApp'?['MorningApp']:name==='AccountingGroup'?['Accounting Agent Group']:name==='EikenPrep'?['EikenPrep']:name==='MCP Business'?['MCP-Business']:[];
 const portLine=portLines.find(line=>aliases.some(a=>line.includes(a))&&!line.includes('–'));
 const port=portLine?.match(/`(\d{4,5})`/)?.[1]||localPort;
 const address=port?`http://127.0.0.1:${port}`:null;
 entries.push({id:sha(real).slice(0,16),name,kind,root:real,documentedUrl:address,addressBasis:portLine?'Canonical location ledger port':localPort?'Explicit package script port':'No verified address recorded',health:'Not checked',evidence:[...evidence,...(rootLine?[{path:path.join(documents,'ObsidianVault/Vault/000_WHERE.md'),kind:'canonical root reference',sha256:canonical.find(c=>c.path.endsWith('000_WHERE.md'))?.sha256}]:[])]});return;
 }
 let children=[];if(depth>0)try{children=(await fs.readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()&&!d.name.startsWith('.')&&!d.name.startsWith('_')&&!excluded.has(d.name));}catch(e){denied.push({path:root,reason:e.code||'Read failed'});}
 const before=entries.length;for(const child of children)await inspect(path.join(root,child.name),depth-1,owningRoot);
 if(entries.length===before)notApps.push({root,reason:'No public application entrypoint verified; research, agent pack, support folder or unavailable implementation'});
 };
 for(const root of [...roots].sort())await inspect(root,2,root);
 const apps=mergeInventory(entries);
 const addresses=new Map();for(const app of apps)if(app.documentedUrl){if(!addresses.has(app.documentedUrl))addresses.set(app.documentedUrl,[]);addresses.get(app.documentedUrl).push(app);}
 for(const group of addresses.values())if(group.length>1){const canonicalCount=group.filter(a=>a.addressBasis.startsWith('Canonical')).length;for(const app of group)if(canonicalCount!==1||!app.addressBasis.startsWith('Canonical')){app.documentedUrl=null;app.addressBasis='Address shared by multiple implementations; app identity at that address is unverified';}}
 return {apps,count:apps.length,readAt:new Date(now).toISOString(),universe:{canonical,catalogs:universe.catalogs.map(r=>path.join(documents,r)),knownRoots:[...roots].sort(),depth:2,definition:'Implemented applications, sites and services in canonical table application roots and immediate SystemAPPS product catalog. Each app root needs an actual public entrypoint or app launch script. Child components stop at their application root; configurations, installed bundles, copies, research-only folders and private/runtime stores are excluded. This is not an inventory of all software installed on the Mac.'},notApps,denied};
}

// Independently reproducible inventory/seal checks. Never establishes product acceptance.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {scorePopulation} from './score.mjs';
const here=dirname(fileURLToPath(import.meta.url)),arch=resolve(here,'../..'),project=resolve(arch,'..');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(p,'utf8'));
const mode=process.argv[2]||'check', checkSource=process.argv.includes('--source');
const normativeReview=new Set(['reviews/independent-audit/PROTOCOL.md','reviews/independent-audit/score.mjs','reviews/independent-audit/score.test.mjs','reviews/independent-audit/validate.mjs','reviews/independent-audit/population.json','reviews/independent-audit/population-changes.json']);
async function inventory(root,filter){const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['node_modules','.git','__pycache__'].includes(e.name))continue;const p=resolve(dir,e.name),name=relative(root,p).replaceAll('\\','/');if(/^\.env(?:\.|$)/i.test(e.name))throw new Error('Secret path forbidden');if(e.isDirectory())await walk(p);else if(e.isFile()&&filter(name)){const b=await readFile(p);files.push({path:name,bytes:b.length,sha256:sha(b)});}else if(!e.isFile())throw new Error('Special file forbidden');}}await walk(root);return files.sort((a,b)=>a.path.localeCompare(b.path));}
async function design(){return inventory(arch,name=>name!=='package-manifest.json'&&!name.startsWith('evidence/')&&(!name.startsWith('reviews/')||normativeReview.has(name)));}
async function source(){const files=[];for(const dir of ['src','server','integrations/src','integrations/test','integrations/scripts','scripts']){for(const f of await inventory(resolve(project,dir),n=>/\.(mjs|mts|js|jsx|ts|tsx|css|py|json)$/.test(n)))files.push({...f,path:dir+'/'+f.path});}for(const path of ['package.json','package-lock.json','integrations/package.json','integrations/package-lock.json','tsconfig.json','vite.config.ts','index.html','public/gspec.svg','server/README.md']){const b=await readFile(resolve(project,path));files.push({path,bytes:b.length,sha256:sha(b)});}return files.sort((a,b)=>a.path.localeCompare(b.path));}
const registry=(await Promise.all(['core','ui'].map(k=>read(resolve(arch,`decomposition/${k}-modules.json`))))).flatMap(x=>x.modules);
const population=await read(resolve(here,'population.json'));
const registryQuestions=registry.flatMap(m=>m.acceptanceQuestions.map(q=>({...q,moduleId:m.id,moduleName:m.name,stepIds:m.stepIds})));
const simple=qs=>qs.map(({id,moduleId,question,stepIds})=>({id,moduleId,question,stepIds}));
if(JSON.stringify(simple(population.questions))!==JSON.stringify(simple(registryQuestions)))throw new Error('Population/registry mismatch');
const trace=await read(resolve(arch,'decomposition/source-trace.json'));
const snapshot=resolve(here,'current-inputs.json');
if(mode==='freeze'){
 const result={schemaVersion:1,frozenAt:new Date().toISOString(),scope:'Current normative package and nonsecret source/config/test inventory. Historical reviews/evidence and self-referential manifests excluded.',designFiles:await design(),sourceFiles:await source()};
 await writeFile(snapshot,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:'frozen',designFiles:result.designFiles.length,sourceFiles:result.sourceFiles.length,sha256:sha(await readFile(snapshot))}));
}else if(mode==='check'){
 const errors=[],saved=await read(snapshot);
 if(JSON.stringify(saved.designFiles)!==JSON.stringify(await design()))errors.push('Current design inputs changed since freeze');
 const sourceState=checkSource?await source():saved.sourceFiles;
 if(checkSource&&JSON.stringify(saved.sourceFiles)!==JSON.stringify(sourceState))errors.push('Source files added/deleted/changed since freeze');
 const slim=rows=>rows.map(x=>({path:x.path,sha256:x.sha256})).sort((a,b)=>a.path.localeCompare(b.path));
 if(JSON.stringify(slim(trace.entries))!==JSON.stringify(slim(sourceState)))errors.push('Source trace source set/hash mismatch');
 if(trace.denominator!==trace.entries.length||trace.classified!==trace.entries.length||new Set(trace.entries.map(e=>e.path)).size!==trace.entries.length)errors.push('Invalid source trace denominator');
 for(const e of trace.entries){if(!e.reason?.trim()||(!e.moduleIds?.length&&e.kind!=='unused'))errors.push('Unclassified source:'+e.path);for(const id of e.moduleIds||[])if(!registry.some(m=>m.id===id))errors.push('Unknown traced module:'+id);for(const id of e.questionIds||[])if(!registryQuestions.some(q=>q.id===id))errors.push('Unknown traced question:'+id);}
 const seal=await read(resolve(here,'evaluation-seal.json'));
 const snapshotHash=sha(await readFile(snapshot));if(seal.evaluatedInputsSha256!==snapshotHash)errors.push('Stale evaluation input hash');
 const reports=[];for(const ref of seal.reports){const p=resolve(arch,ref.path);if(!p.startsWith(arch+requireSep())||ref.path.split(/[\\/]/).includes('..'))throw new Error('Unsafe report path');const b=await readFile(p);if(sha(b)!==ref.sha256)errors.push('Report hash mismatch:'+ref.path);reports.push(JSON.parse(b));}
 const result=scorePopulation(population.questions,reports,{expectedSnapshotSha256:snapshotHash});
 if(!result.accepted)errors.push('Independent design review not accepted');
 const savedScores=await read(resolve(here,'round-02/scores-final.json'));
 for(const key of ['total','modules','steps','openIssueCount','accepted'])if(JSON.stringify(savedScores[key])!==JSON.stringify(result[key]))errors.push('Score recomputation mismatch:'+key);
 console.log(JSON.stringify({status:errors.length?'fail':'pass',designFiles:saved.designFiles.length,sourceFiles:sourceState.length,sourceFreshness:checkSource?'verified':'NOT_RUN-original-source-not-required-in-rebuild',modules:registry.length,questions:registryQuestions.length,clarity:result.total.clarity.score,accuracy:result.total.accuracy.score,completeProductAcceptance:false,errors},null,2));
 if(errors.length)process.exitCode=1;
}else throw new Error('Usage: validate.mjs freeze | check [--source]');
function requireSep(){return process.platform==='win32'?'\\':'/';}

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const cache=path.join(root,'.cache/rebuild');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export async function writeState(update){
 await fs.mkdir(cache,{recursive:true});
 const filename=path.join(cache,'state.json');
 let old={schemaVersion:1,objective:'Implement the complete GSPEC CURRENT_REPRODUCTION in this workspace root and verify G00–G14.',acceptanceProfile:'CURRENT_REPRODUCTION',status:'in_progress',milestone:'M0',completedMilestones:[],loop:1,assignments:[],lastGate:null,lastVerification:null,openIssues:[],ownedProcesses:[],evidenceIndex:'.cache/rebuild/evidence-index.json',budget:{provider:'Gemini 3.5 Flash Lite',currency:'KRW',exclusiveLimit:50000,knownProjectSpend:0,liveCallsEnabled:false}};
 try{old=JSON.parse(await fs.readFile(filename,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const state={...old,...update,packageManifestDigest:hash(await fs.readFile(path.join(root,'architecture/package-manifest.json'))),updatedAt:new Date().toISOString()};
 await fs.writeFile(filename+'.tmp',JSON.stringify(state,null,2)+'\n');
 await fs.rename(filename+'.tmp',filename);
 return state;
}
export async function logLoop(entry){await fs.mkdir(cache,{recursive:true});await fs.appendFile(path.join(cache,'loops.jsonl'),JSON.stringify({timestamp:new Date().toISOString(),...entry})+'\n');}
if(process.argv[2]==='init'){
 const report=JSON.parse(await fs.readFile(path.join(cache,'package-initial.json'),'utf8'));
 await writeState({nextCommand:'npm ci; npm --prefix integrations ci',lastVerification:{command:'node architecture/tools/verify-package.mjs',exitCode:1,artifact:'.cache/rebuild/package-initial.json'},openIssues:[{id:'PKG-001',severity:'blocking-final-gates',status:'open',scope:'supplied-package',description:report.errors[0]}]});
 await logLoop({loop:1,milestone:'M0',phase:'start',objective:'Verify supplied package, scaffold in place, install locked dependencies and establish module ports',packageStatus:report.status});
}

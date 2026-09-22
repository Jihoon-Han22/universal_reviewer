// Read-only guards for the exact installed forwarding implementation reviewed here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const BASE=path.relative(process.cwd(),path.dirname(fileURLToPath(import.meta.url))).split(path.sep).join('/');
const HOME='C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const PATHS=['playwright/package.json','playwright/index.mjs','playwright/index.js','playwright-core/package.json','playwright-core/index.mjs','playwright-core/index.js','playwright-core/lib/coreBundle.js'].map(p=>HOME+'/'+p);
const sha=b=>createHash('sha256').update(b).digest('hex');
const ref=p=>{const b=fs.readFileSync(p);return {path:p,sha256:sha(b),bytes:b.length};};
export function verifyNativeBinding(){const p=BASE+'/playwright-network-source.json',binding=JSON.parse(fs.readFileSync(p));assert.deepEqual(binding.refs.map(r=>r.path),PATHS);assert.equal(binding.version,'1.62.1');for(const r of binding.refs)assert.deepEqual(ref(r.path),r);assert.equal(JSON.parse(fs.readFileSync(PATHS[0])).version,binding.version);assert.equal(JSON.parse(fs.readFileSync(PATHS[3])).version,binding.version);return {sourceRef:ref(p),version:binding.version,refs:binding.refs};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv[2],'bind');assert.equal(process.argv.length,3);
 const version=JSON.parse(fs.readFileSync(PATHS[0])).version;assert.equal(version,'1.62.1');assert.equal(JSON.parse(fs.readFileSync(PATHS[3])).version,version);
 const bundle=fs.readFileSync(PATHS[6],'utf8').split(/\r?\n/),ranges=[[35933,35994],[36065,36073],[36163,36194],[22780,22805],[53925,53945],[61865,61885],[59137,59152],[59580,59596]];
 const binding={kind:'installed-native-request-forwarding-source',createdAt:new Date().toISOString(),version,refs:PATHS.map(ref),sourceOnly:true,excerpts:ranges.map(([first,last])=>({path:PATHS[6],first,last,text:bundle.slice(first-1,last).join('\n')})),findings:['Network.requestWillBeSent and Fetch.requestPaused are paired per native request ID before public requestStarted; public ordering alone does not prove native ordering.','Native loadingFailed sets failureText on that exact Request and forwards requestFailed using the same Request object.','A unique closed terminal-failure relation can join those streams with exact frame/type/URL/method/failureText; compatible duplicate failures remain ambiguous.','Public timing.startTime is0 before Response construction and can be shifted by requestTime on response; it is not used as a native identity.'],productImports:0,actuals:0};
 const out=BASE+'/playwright-network-source.json';fs.writeFileSync(out,JSON.stringify(binding,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ref:ref(out),refs:binding.refs.length,actuals:0}));
}

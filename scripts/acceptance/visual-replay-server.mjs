#!/usr/bin/env node
// TEST ONLY. Importing or --check does not listen on a port or launch a browser.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import express from 'express';
import { createApp } from '../../server/app.mjs';
import { createVisualReplay } from './visual-replay-data.mjs';
import { snapshotImplementation } from '../../architecture/validation/acceptance.mjs';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const REFERENCE=path.join(ROOT,'architecture/ui/reference');
export const PORT=5210;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['synthetic-fixture.json','mock-api.mjs','capture-flow.js','capture-required-viewports.js','synthetic-dashboard.html','synthetic-dashboard-dark.html'];
const SOURCE_POLICY='visual-replay-source-v1';
const additionalSourceFiles=[...sourceFiles.map(name=>`architecture/ui/reference/${name}`),'architecture/ui/reference/manifest.json','architecture/validation/acceptance.mjs'];

// The established acceptance inventory includes src/server/integrations/scripts/
// public and root package/lock/index/TS/Vite configuration, excluding dependency,
// Git, build and cache directories. Add the reference HTTP fixture/font inputs
// outside that inventory. Neither inventory reads .env files or oracle answers.
export async function snapshotReplaySources(root=ROOT) {
  const implementation=await snapshotImplementation(root),files=[...implementation.files];
  async function add(name){
    assert.ok(!path.isAbsolute(name)&&!name.split(/[\\/]/).some(part=>!part||part==='..'||part==='.'||/^\.env(?:\.|$)/.test(part)),'Unsafe replay source path.');
    const filename=path.join(root,name),info=await lstat(filename);
    assert.equal(info.isSymbolicLink(),false,'Replay source links are not allowed.');
    if(info.isDirectory()){for(const child of (await readdir(filename)).sort())await add(`${name}/${child}`);}
    else {assert.ok(info.isFile(),'Replay sources must be regular files.');files.push({path:name,sha256:hash(await readFile(filename))});}
  }
  // Check every parent as well, so a junction cannot bypass the source boundary.
  for(const name of [...additionalSourceFiles,'architecture/ui/fonts']){
    let current=root;for(const segment of name.split('/').slice(0,-1)){current=path.join(current,segment);const info=await lstat(current);assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Unsafe replay source parent.');}
    await add(name);
  }
  files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  assert.equal(new Set(files.map(file=>file.path)).size,files.length,'Duplicate replay source path.');
  return {schemaVersion:'1.0',policy:SOURCE_POLICY,capturedAt:new Date().toISOString(),implementationDigest:implementation.digest,scope:{implementation:implementation.scope,additionalFiles:additionalSourceFiles,additionalTrees:['architecture/ui/fonts']},files,digest:hash(JSON.stringify(files))};
}

export function assertReplaySourceParity(startup,current){
  for(const [label,snapshot] of [['startup',startup],['disk',current]]){
    assert.equal(snapshot?.schemaVersion,'1.0',`Missing ${label} source fingerprint; restart the replay server.`);
    assert.equal(snapshot.policy,SOURCE_POLICY,`Unsupported ${label} source fingerprint policy.`);
    assert.ok(Array.isArray(snapshot.files)&&snapshot.files.length>0,`Missing ${label} source inventory.`);
    for(const file of snapshot.files)assert.ok(typeof file.path==='string'&&!path.isAbsolute(file.path)&&!file.path.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'||/^\.env(?:\.|$)/.test(part))&&/^[a-f0-9]{64}$/.test(file.sha256),`Unsafe ${label} source inventory.`);
    assert.equal(hash(JSON.stringify(snapshot.files)),snapshot.digest,`Invalid ${label} source digest.`);
  }
  if(startup.digest!==current.digest||startup.implementationDigest!==current.implementationDigest||JSON.stringify(startup.scope)!==JSON.stringify(current.scope)){
    const before=new Map(startup.files.map(file=>[file.path,file.sha256])),after=new Map(current.files.map(file=>[file.path,file.sha256]));
    const changed=[...new Set([...before.keys(),...after.keys()])].filter(name=>before.get(name)!==after.get(name));
    throw new Error(`REPLAY_SOURCE_MISMATCH: restart the replay server after freezing all implementation inputs. Changed paths: ${changed.slice(0,30).join(', ')}${changed.length>30?` (+${changed.length-30})`:''}`);
  }
  return true;
}

export async function checkReplaySourceParity(){
  const snapshot=await snapshotReplaySources();assertReplaySourceParity(snapshot,structuredClone(snapshot));
  for(const mutation of ['changed','added','removed']){
    const altered=structuredClone(snapshot);
    if(mutation==='changed')altered.files[0].sha256='0'.repeat(64);
    if(mutation==='added')altered.files.push({path:'src/synthetic-preflight-negative-control.ts',sha256:'0'.repeat(64)});
    if(mutation==='removed')altered.files.pop();
    altered.digest=hash(JSON.stringify(altered.files));
    assert.throws(()=>assertReplaySourceParity(snapshot,altered),/REPLAY_SOURCE_MISMATCH/);
  }
  assert.throws(()=>assertReplaySourceParity(undefined,snapshot),/Missing startup source fingerprint/);
  return {kind:'offline-source-parity-preflight-check',files:snapshot.files.length,digest:snapshot.digest,implementationDigest:snapshot.implementationDigest,negativeControlsRejected:['changed','added','removed','missing-startup-fingerprint'],portsStarted:0,providersStarted:0,browserExecuted:false};
}

export function loadReplayInputs() {
  const manifest=JSON.parse(readFileSync(path.join(REFERENCE,'manifest.json'),'utf8'));
  assert.equal(manifest.synthetic,true);assert.equal(manifest.fixtureId,'architecture-visual-v1');assert.equal(manifest.captures.length,34);
  const contents={}, inputs=[];
  for (const name of sourceFiles) {
    const bytes=readFileSync(path.join(REFERENCE,name)), expected=manifest.inputs.find(input=>input.path===name);
    assert.ok(expected,`Missing manifest input ${name}`);assert.equal(hash(bytes),expected.sha256,`Changed reference input ${name}`);assert.equal(bytes.length,expected.bytes);
    contents[name]=bytes.toString('utf8');inputs.push({path:`architecture/ui/reference/${name}`,sha256:expected.sha256,bytes:bytes.length});
  }
  const fixture=JSON.parse(contents['synthetic-fixture.json']);
  assert.equal(fixture.synthetic,true);assert.equal(fixture.fixtureId,manifest.fixtureId);
  return {fixture,dashboardHtml:contents['synthetic-dashboard.html'],darkDashboardHtml:contents['synthetic-dashboard-dark.html'],manifest,inputs};
}

export function createReplayApp(inputs=loadReplayInputs(),{sourceProvenance=null}={}) {
  const replay=createVisualReplay(inputs), app=express();app.disable('x-powered-by');
  // Serialize once: this endpoint describes the startup bytes, never fresh disk
  // hashes relabelled as the bytes behind an existing Vite transform cache.
  const provenanceBody=sourceProvenance?JSON.stringify(sourceProvenance):null;
  const noDist=path.join(ROOT,'scripts/acceptance/__visual_replay_no_dist__');
  assert.equal(existsSync(path.join(noDist,'index.html')),false,'Replay must not fall back to an unrelated build.');
  app.use((req,res,next)=>{
    // Loopback-only and reject cross-origin mutations, including controller routes.
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).json({error:'Local replay only.'});
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin!==`http://${req.headers.host}`) return res.status(403).json({error:'Same-origin replay only.'});
    res.set('Cache-Control','no-store');
    if(req.path.startsWith('/api/')||req.path.startsWith('/__visual/'))replay.requests.push({path:req.path,method:req.method,timestamp:new Date().toISOString()});
    next();
  });
  app.get('/__visual/state',(req,res)=>res.json(replay.state()));
  app.get('/__visual/provenance',(req,res)=>provenanceBody?res.type('application/json').send(provenanceBody):res.status(503).json({error:'Server startup source fingerprint missing; restart the replay server.'}));
  app.get('/__visual/manifest',(req,res)=>res.json({synthetic:true,acceptanceProfile:'CURRENT_REPRODUCTION',inputs:inputs.inputs,captures:inputs.manifest.captures.map(({id,viewport,motion,settling})=>({id,viewport,motion,settling})),browserExecuted:false}));
  app.post('/__visual/control/:name',express.json({limit:'2kb'}),(req,res)=>{try{res.json(replay.command(req.params.name));}catch(error){res.status(error.status||400).json({error:error.message});}});
  app.get('/__visual/ledger-token.xlsx',(req,res)=>res.set({'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="synthetic-ledger-token.xlsx"'}).send('Synthetic upload token: local mock supplies parsed response; not a real workbook.'));
  app.use('/architecture/ui/reference',express.static(REFERENCE,{index:false}));
  app.use('/architecture/ui/fonts',express.static(path.join(ROOT,'architecture/ui/fonts'),{index:false}));
  // The replay has no reason to access samples, golden/v3, document bytes, or exports.
  const allowed=[/^GET \/api\/health$/,/^GET \/api\/activity(?:\/events)?$/,/^POST \/api\/documents$/,/^DELETE \/api\/documents\/visual-(?:criteria|target|ledger)$/,/^POST \/api\/runs$/,/^GET \/api\/runs\/visual-run(?:\/events)?$/,/^POST \/api\/runs\/visual-run\/(?:criteria\/confirm|documents|cancel)$/,/^POST \/api\/dashboards$/,/^GET \/api\/dashboards\/visual-dashboard$/,/^POST \/api\/ledgers\/analyze$/];
  app.use('/api',(req,res,next)=>allowed.some(pattern=>pattern.test(`${req.method} ${req.originalUrl.split('?')[0]}`))?next():res.status(501).json({error:'Operation outside synthetic visual replay.'}));
  const failProvider=()=>{throw new Error('Provider execution is forbidden in visual replay.');};
  const product=createApp({
    config:{geminiApiKey:'synthetic-not-a-key',e2bApiKey:'synthetic-not-a-key',modelExtract:'gemini-3.5-flash-lite',modelExplore:'gemini-3.5-flash-lite',e2bTemplate:'base'},
    documents:replay.documents,engine:replay.engine,activityStore:replay.activityStore,
    analyzer:failProvider,gemini:{generateText:failProvider,generateJson:failProvider,streamText:failProvider},withSandbox:failProvider,dist:noDist,
    registerExportRoutes(routes) {
      routes.post('/api/dashboards',(req,res)=>res.json(replay.dashboard.create(req.body)));
      routes.get('/api/dashboards/visual-dashboard',(req,res)=>res.json(replay.dashboard.get()));
      routes.post('/api/ledgers/analyze',(req,res)=>res.json(replay.ledger(req.body)));
      return {synthetic:true};
    },
  });
  app.use(product);
  return {app,replay,inputs};
}

export async function startReplay({port=PORT}={}) {
  assert.ok(Number.isSafeInteger(port)&&port>=1024&&port<=65535,'Use an explicit unprivileged local port.');
  assert.ok(![8787,5180].includes(port),'Ports 8787 and 5180 belong to the existing app.');
  const startedAt=new Date().toISOString(),startupSource=await snapshotReplaySources();
  const {createServer:createViteServer}=await import('vite');
  const {default:react}=await import('@vitejs/plugin-react');
  const runtime=createReplayApp(loadReplayInputs(),{sourceProvenance:{schemaVersion:'1.0',startedAt,processId:process.pid,node:process.version,snapshot:startupSource}});
  const localFonts={name:'visual-replay-local-fonts',enforce:'pre',transform(code,id){
    // Same font URL replacement allowed by VISUAL-CONTRACT section 5; no other CSS changes.
    if(!id.split('?')[0].endsWith('.css')||!code.includes('https://fonts.googleapis.com/'))return null;
    return code.replace(/@import\s+url\(['"]https:\/\/fonts\.googleapis\.com\/[^'"]+['"]\);?/g,"@import url('/architecture/ui/fonts/fonts.css');");
  }};
  const vite=await createViteServer({root:ROOT,configFile:false,envFile:false,plugins:[localFonts,react()],cacheDir:path.join(ROOT,'.cache/rebuild/visual-replay-vite'),server:{middlewareMode:true,hmr:false,watch:{ignored:['**/*']}},appType:'spa'});
  try{assertReplaySourceParity(startupSource,await snapshotReplaySources());}catch(error){await vite.close();throw error;}
  runtime.app.use(vite.middlewares);
  const server=createHttpServer(runtime.app);
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){await vite.close();throw error;}
  console.log(JSON.stringify({synthetic:true,origin:'actual-react-with-reference-synthetic-http',url:`http://127.0.0.1:${port}`,controller:`http://127.0.0.1:${port}/__visual/state`,sourceDigest:startupSource.digest,sourceFileCount:startupSource.files.length,startedAt,processId:process.pid,providers:'disabled',browserExecuted:false}));
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;server.closeAllConnections();await Promise.all([vite.close(),new Promise(resolve=>server.close(resolve))]);};
  return {...runtime,server,vite,close};
}

export async function checkReplay() {
  const inputs=loadReplayInputs(), replay=createVisualReplay(inputs), {engine,documents}=replay;
  // Run the supplied reference transport in an isolated Node context, solely to
  // check our fixture translation. No browser, app rendering, or provider call.
  const referenceWindow={fetch:()=>{throw Error('Unexpected reference network access.');}};
  runInNewContext(readFileSync(path.join(REFERENCE,'mock-api.mjs'),'utf8').replace('export function installVisualMock','function installVisualMock')+'\ninstallVisualMock(fixture,dashboardHtml,darkDashboardHtml);',{
    window:referenceWindow,fixture:inputs.fixture,dashboardHtml:inputs.dashboardHtml,darkDashboardHtml:inputs.darkDashboardHtml,
    location:{href:'http://127.0.0.1:5210/'},Response,URL,setTimeout:()=>{throw Error('Unexpected reference timer.');},
  },{timeout:1000});
  const ref=referenceWindow.__visual;
  const refRequest=async(url,body,method='POST')=>(await referenceWindow.fetch(url,{method,body:JSON.stringify(body)})).json();
  const comparable=value=>JSON.parse(JSON.stringify(value, (key,entry)=>{
    if(['timestamp','time','startedAt','updatedAt','approvedAt'].includes(key))return '<time>';
    return entry;
  }));
  const compareRun=()=>{
    const actual=engine.snapshot('visual-run');
    actual.events=actual.events.map(event=>Object.fromEntries(Object.entries(event).filter(([key])=>!['mode','status','stage','criterionVersion','runStatus'].includes(key))));
    assert.deepEqual(comparable(actual),comparable(ref.run()),'Fixture snapshots differ from reference mock.');
  };
  const step=name=>{replay.command(name);ref[name]();compareRun();};
  assert.throws(()=>replay.command('complete'),/reviewActive/);
  await documents.add({role:'criteria'});
  engine.start({mode:'criteria_first',criteriaDocumentIds:['visual-criteria'],documentIds:[]});
  assert.throws(()=>engine.attachDocuments('visual-run',{}),/approve criteria/);
  const delivered=[];const unsubscribe=engine.subscribe('visual-run',event=>delivered.push(event));
  step('startReading');step('context');step('confirmReady');
  assert.deepEqual(comparable(replay.activityStore.snapshot()),comparable(await refRequest('/api/activity',undefined,'GET')));
  engine.confirm('visual-run',{criteria:inputs.fixture.criteria,expectedCriterionVersion:1});
  await refRequest('/api/runs/visual-run/criteria/confirm',{});compareRun();
  await documents.add({role:'target'});
  engine.attachDocuments('visual-run',{documentIds:['visual-target'],expectedCriterionVersion:1});
  await refRequest('/api/runs/visual-run/documents',{});compareRun();
  step('reviewActive');step('complete');
  assert.deepEqual(engine.snapshot('visual-run').items,inputs.fixture.items);
  assert.deepEqual(engine.snapshot('visual-run').summary,{total:3,pass:1,fail:1,review:1,pending:0});
  assert.equal(delivered.at(-1).runStatus,'completed');assert.equal(delivered.length,11);
  assert.deepEqual(delivered.map(event=>event.sequence),Array.from({length:11},(_,index)=>index+1));
  for(const [instruction,theme,distribution,html] of [['라이트','light','doughnut',inputs.dashboardHtml],['다크','dark','bar',inputs.darkDashboardHtml]]){
    replay.dashboard.create({runId:'visual-run',instruction});assert.equal(replay.dashboard.get().html,undefined);
    replay.command('dashboardReady');const job=replay.dashboard.get();assert.equal(job.html,html);assert.equal(job.design.theme,theme);assert.equal(job.design.distribution,distribution);
    await refRequest('/api/dashboards',{runId:'visual-run',instruction});ref.dashboardReady();
    assert.deepEqual(comparable(job),comparable(await refRequest('/api/dashboards/visual-dashboard',undefined,'GET')));
  }
  await documents.add({role:'ledger'});
  assert.deepEqual(replay.ledger({runId:'visual-run',documentId:'visual-ledger',sourceDocumentId:'visual-target',key:'SYN-2026-001'}).mapping.targetCells,['C2','D2']);
  assert.deepEqual(replay.ledger({runId:'visual-run',documentId:'visual-ledger',sourceDocumentId:'visual-target',key:'SYN-2026-001'}),await refRequest('/api/ledgers/analyze',{}));
  assert.throws(()=>replay.command('reset'),/close the app tab/);unsubscribe();replay.command('reset');
  // Instantiate the actual routing with DI, without listening or creating Vite.
  const runtime=createReplayApp(inputs);assert.ok(runtime.app);assert.equal(runtime.replay.state().started,false);
  return {kind:'offline-replay-preparation-check',referenceStates:inputs.manifest.captures.length,referenceInputsVerified:inputs.inputs.length,fixtureParity:'reference-mock-compared-excluding-common-server-envelope-and-timestamps',eventSequenceCount:delivered.length,providersStarted:0,portsStarted:0,browserExecuted:false,visualAcceptance:'NOT_RUN'};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--check')console.log(JSON.stringify(await checkReplay(),null,2));
  else if(args.length===1&&args[0]==='--check-source-parity')console.log(JSON.stringify(await checkReplaySourceParity(),null,2));
  else if(args.length===1&&args[0]==='--help')console.log('TEST ONLY: node scripts/acceptance/visual-replay-server.mjs --port 5210\nOffline checks: --check | --check-source-parity');
  else {
    assert.ok(args.length===0||(args.length===2&&args[0]==='--port'),'Usage: --check | --port 5210');
    const runtime=await startReplay({port:args.length?Number(args[1]):PORT});
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void runtime.close().then(()=>process.exit(0));});
  }
}

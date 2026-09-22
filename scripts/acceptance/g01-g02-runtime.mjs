// Offline HTTP/state acceptance collector. Product imports are lazy.
// This collector never imports provider-runtime, reads .env, or starts a provider.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const PROFILE='CURRENT_REPRODUCTION';
const hash=value=>createHash('sha256').update(value).digest('hex');
const stamp=()=>new Date().toISOString();
const json=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function until(predicate,description){const deadline=Date.now()+4000;while(!predicate()){if(Date.now()>=deadline)throw new Error(`Probe deadline: ${description}`);await new Promise(resolve=>setTimeout(resolve,5));}}
const assertion=(name,pointer,expected,operator='deepEqual')=>({name,pointer,expected,operator});
const a=assertion;

// Every registry question is retained. Missing branches are not replaced with a
// suite success or a source-code grep; those cases remain not_run.
export const CASE_BLUEPRINTS={
  'G01:CORE-01-C01':{probes:['configuration','http'],assertions:[a('public health key allowlist','/http/health/keys',['e2bConfigured','geminiConfigured','model','modelExplore','modelExtract']),a('process value wins fixture file','/configuration/processWins',true),a('blank process value suppresses fixture key','/configuration/blankSuppresses',true),a('default model','/configuration/defaultModel','gemini-3.5-flash-lite'),a('public sentinel absent','/http/health/syntheticSecretPresent',false)],missing:[]},
  'G01:CORE-01-C02':{probes:['adapter'],assertions:[a('JSON data projection','/adapter/json/data',{answer:7}),a('text preserves whitespace','/adapter/text/text','  authored text  '),a('role model selection','/adapter/requestModels',['replay-explore','replay-extract']),a('request schema passed','/adapter/schemaPreserved',true),a('safe error codes','/adapter/errorCodes',['AUTH','AUTH','QUOTA','MODEL_UNAVAILABLE','TIMEOUT','TIMEOUT','REQUEST_FAILED'])],missing:['Capture generateJson validation callback rejection and the full prompt-versus-contents/systemInstruction precedence matrix.']},
  'G01:CORE-01-C03':{probes:['resource-order'],assertions:[a('slot retained after abort until work settles','/resource-order/heldAfterAbort',true),a('next request starts after settlement','/resource-order/order',['first-start','abort','first-settled','second-start']),a('sandbox cleanup called once','/resource-order/killCount',1),a('kill failure stays failure','/resource-order/cleanupFailureCode','CLEANUP_FAILED')],missing:['Run real createGemini queued abort and stream cancellation, real withSandbox late-create deadline, and own document deadline plus cleanup precedence probes with ordered events. Generic TaskPool order alone is not all provider lifecycle branches.']},
  'G01:CORE-01-C04':{probes:['adapter'],assertions:[a('token boundary codes','/adapter/tokenCodes',['CONFIG_INVALID','ok','ok','CONFIG_INVALID']),a('empty/invalid JSON responses fail','/adapter/invalidResponseCodes',['INVALID_RESPONSE','INVALID_RESPONSE'])],missing:['Observe exact documented response-byte, content/file-part, request timeout and output limits and CURRENT_REPRODUCTION absence of any unsupported cap; add accepted-boundary and one-over probes.']},
  'G01:CORE-01-C05':{probes:['configuration','adapter','resource-order'],assertions:[a('collector provider calls','/providerCalls',{gemini:0,e2b:0})],missing:['Execute integrations package test and config-only check with an explicit synthetic fixture path; capture exact command, exit, dates and TAP case identities. The collector probes do not stand in for the prescribed commands.']},
  'G01:CORE-20-C01':{probes:[],assertions:[a('fresh root install','/environment/rootInstall/exitCode',0),a('fresh integrations install','/environment/integrationsInstall/exitCode',0)],missing:['Root-owned isolated scaffold + both npm ci installations under pinned Node/npm; retain both lock hashes before/after, declaration/lock/installed versions and current-contract approved deviations. No in-place reinstall.']},
  'G01:CORE-20-C02':{probes:[],assertions:[a('build asset inventory verified','/environment/buildAssets/verified',true)],missing:['Root-owned build followed by actual dist worker, CMaps, fonts, wasm, iccs and offline chart artifact inventory/hashes; actual loading and target behavior, absence of runtime CDN dependencies.']},
  'G01:CORE-20-C03':{probes:[],assertions:[a('owned children','/process/devChildCount',2),a('strict port conflict','/process/strictPortConflictRejected',true),a('API loopback','/process/apiAddress','127.0.0.1')],missing:['Controlled independent process probe of scripts/dev.mjs and actual server/index.mjs: default/override port, Vite proxy/strictPort, dist existence at construction, only-owned-child shutdown. Never import the live runtime without an explicit synthetic config interception.']},
  'G01:CORE-20-C04':{probes:[],assertions:[a('offline provider calls','/providerCalls',{gemini:0,e2b:0})],missing:['Final-freeze named Node and Python regression commands with prerequisites, exact versions, exit/counts, separate config-only checks; bind live smoke only as separately labelled historical evidence, not offline acceptance.']},
  'G01:actual-test-and-build':{probes:[],assertions:[a('test command exit','/environment/test/exitCode',0),a('build command exit','/environment/build/exitCode',0)],missing:['Root-owned actual npm test and npm run build on frozen code with digest before/after, real output artifacts and strict command exit preservation.']},
  'G01:fresh-scaffold-and-both-lock-installs':{probes:[],assertions:[a('fresh root lock install','/environment/rootInstall/exitCode',0),a('fresh integrations lock install','/environment/integrationsInstall/exitCode',0)],missing:['Fresh disposable scaffold and both lock installs, independently observed. Existing LOOP-001 workspace logs do not meet this scope.']},
  'G01:runtime-versions-and-browser-secret-scan':{probes:[],assertions:[a('synthetic secret leak count','/environment/secretScan/matches',0)],missing:['Root-owned exact runtime inventory and browser build scan against injected synthetic sentinels plus forbidden server secret imports. Do not inspect actual secret values.']},
  'G02:CORE-02-C01':{probes:['http'],assertions:[a('export formats through composed app','/http/export/statuses',[200,200,200,400]),a('public upload allowlist','/http/upload/keys',['id','kind','mime','name','preview','role','size','url']),a('run public private field count','/http/terminal/privateFieldCount',0),a('dashboard route lifecycle','/http/dashboard/statuses',[202,200,204,404]),a('ledger errors through composed app','/http/ledger/statuses',[404,400])],missing:['Complete successful composed ledger analyze/export with authored XLSX and confirmation/fingerprint round trip; samples/golden validation/batch rollback; positive dashboard validated generated output branch. HTTP error-only ledger coverage is insufficient.']},
  'G02:CORE-02-C02':{probes:['http','restart'],assertions:[a('new process-equivalent app stores empty','/restart/newCounts',{documents:0,runs:0,dashboardJobs:0}),a('old identifiers absent','/restart/missingStatuses',[404,404,404])],missing:[]},
  'G02:CORE-02-C03':{probes:['http'],assertions:[a('failed upload rolls back exact prior set','/http/rollback/idsUnchanged',true),a('failed batch status','/http/rollback/status',400),a('retained source deletion conflict','/http/referencedDelete/status',409),a('unreferenced delete succeeds','/http/unreferencedDelete/status',200)],missing:[]},
  'G02:CORE-02-C04':{probes:['http','request-limits'],assertions:[a('loopback/nonlocal/malformed origins','/http/origin/statuses',[400,400,400,403,403]),a('JSON exact boundary and one over','/request-limits/json/statuses',[400,413]),a('parser contract statuses','/http/body/statuses',[500,500,400,400,400,400,400]),a('multipart accepted10/rejected11','/request-limits/fileCount/statuses',[201,400]),a('multipart fields3/4','/request-limits/fieldCount/statuses',[201,400]),a('multipart field bytes100/101','/request-limits/fieldBytes/statuses',[201,400]),a('file bytes20MiB/+1','/request-limits/fileBytes/statuses',[201,413])],missing:['Exercise parts13 accepted boundary and parts14 independently of files/fields caps, multipart field-name/wrong-file-field branches, exact safe messages and retained set after every failed variant.']},
  'G02:CORE-02-C05':{probes:[],assertions:[a('SIGINT cancellation/exit','/process/sigint/cancelledAndExited',true),a('SIGTERM cancellation/exit','/process/sigterm/cancelledAndExited',true)],missing:['Root-owned actual entry-process default/PORT override, dist mount timing, active-run cancellation and owned process termination. In-process app close is not a substitute.']},
  'G02:CORE-13-C01':{probes:['http','legacy'],assertions:[a('criteria-first states','/http/transitions',['awaiting_confirmation','awaiting_confirmation','awaiting_documents','completed']),a('legacy result','/legacy/status','completed'),a('SSE sequences monotonic','/http/events/sequenceValid',true),a('SSE ISO timestamps','/http/events/timestampsValid',true),a('document status distinct from runStatus','/http/events/documentCompletedRunStatus','running'),a('summary after human edit','/http/resolution/summary',{total:1,pass:0,fail:1,review:0,documents:1,completedDocuments:1,failedDocuments:0,incompleteDocuments:0,unreviewedRows:0,humanReviewed:1})],missing:[]},
  'G02:CORE-13-C02':{probes:['workers'],assertions:[a('analysis worker cap','/workers/analysisMaximum',2),a('review worker cap','/workers/reviewMaximum',2),a('isolated target result count','/workers/itemCount',2),a('out of order association','/workers/associationValid',true),a('partial terminal','/workers/status','partial')],missing:['Add an independent target-review failure variant: the drafted three-document matrix fails one reader and reverses completion in both phases; it must also show one model failure while another target review succeeds.']},
  'G02:CORE-13-C03':{probes:['cancellation'],assertions:[a('all open-state cancellations','/cancellation/statuses',['cancelled','cancelled','cancelled']),a('late-event suppression','/cancellation/lateEventsAdded',0),a('terminal cancel idempotence','/cancellation/terminalEventDelta',0)],missing:['Add running deferred-revision late success, ensureAnalyzed two-waiter cancellation/cache rejoin, and failed/partial/completed aggregation matrix. Draft includes running deferred-reader and both awaiting checkpoints.']},
  'G02:CORE-13-C04':{probes:['run-limits'],assertions:[a('three open accepted and fourth429','/run-limits/admission',[202,202,202,429]),a('terminal Map cap','/run-limits/prunedCount',40),a('new insertion removes oldest terminal','/run-limits/oldestRemoved',true),a('250 result cap','/run-limits/retainedItems',250)],missing:['Draft result-cap/coverage probe pending: 249/250/251 proposals, explicit false versus null/missing complete flags and exact current aggregation fields, plus non-guarded criteria quality fields.']},
  'G02:CORE-13-C05':{probes:['http'],assertions:[a('resolution error statuses','/http/resolution/rejectionStatuses',[409,400,400,404]),a('first machine verdict retained','/http/resolution/item/machineStatus','pass'),a('final human verdict','/http/resolution/item/status','fail'),a('audit before/after','/http/resolution/audit',{before:'pass',after:'fail',note:'Source reviewed offline'}),a('resolution event','/http/resolution/eventType','item.resolved')],missing:[]},
  'G02:CORE-19-C01':{probes:['restart'],assertions:[a('new store emptiness','/restart/newCounts',{documents:0,runs:0,dashboardJobs:0})],missing:['Full owner/key/lifetime/cap/invalidation inventory and actual analysisPromise cache, physical sandbox, criterion-cell map, activity retention, dashboard10 FIFO and UI cache probes. No LRU claim for Map FIFO.']},
  'G02:CORE-19-C03':{probes:['resource-order','workers'],assertions:[a('abort holds active resource','/resource-order/heldAfterAbort',true),a('workers at most two','/workers/analysisMaximum',2)],missing:['Global Gemini2/E2B2 queues, engine2 queue, local requery1+100 queue, nested-slot deadlock and same-session reuse probes with measured ordered timelines and exact queue-limit boundaries.']},
  'G02:CORE-19-C04':{probes:['http'],assertions:[a('run SSE cursor precedence','/http/sse/queryWins',true),a('disconnect only unsubscribes','/http/sse/statusAfterDisconnect','awaiting_confirmation'),a('run listeners removed','/http/sse/listenersAfterDisconnect',0),a('activity named event','/http/activity/namedEvent',true)],missing:['Actual UI request stale-response suppression, activity flood caps/fragment framing, visual ping-pong queue, PDF/iframe lifetime; record absent run history cap/backpressure/visibility pause as current limitations.']},
  'G02:UI-01-C02':{probes:['http'],assertions:[a('stale confirmation409','/http/confirmation/staleStatus',409)],missing:['Actual useReviewCommands/App deferred start A/B, late POST cancellation, stale GET behind SSE and stale error behavior. Reducer helper-only or HTTP version assertions do not prove hook wiring.']},
  'G02:UI-01-C05':{probes:[],assertions:[a('snapshot recovery lifecycle','/ui/recovery/verified',true)],missing:['Actual hook/DOM or browser replay for SSE-error GET recovery, terminal client-close, recovery failure message, original input-page restoration, stale error suppression.']}
};

async function loadProduct(root){
  const get=name=>import(pathToFileURL(path.join(root,name)).href);
  const modules=await Promise.all([get('server/app.mjs'),get('server/review.mjs'),get('server/documents.mjs'),get('integrations/src/index.mjs'),get('server/document-analyzer.mjs'),get('server/document-sandbox-resources.mjs')]);
  return Object.assign({root},...modules);
}
function privateFields(value){
  if(!value||typeof value!=='object')return [];
  return Object.entries(value).flatMap(([key,item])=>['buffer','modelParts','sandboxProfile','sandboxAnalysisResult','analysisPromise','geminiApiKey','e2bApiKey','controller','listeners'].includes(key)?[key]:privateFields(item));
}
const criterion=()=>({id:'authored-strength',label:'Strength',rule:'30 MPa 이상',comparison:{operator:'gte',value:30,unit:'MPa'},needsConfirmation:false,conditions:[],categoryPath:[],sourceDocumentId:'natural-language'});

// This is an input-authored transport replay. Model candidates are derived only
// from the synthetic source text at the request boundary, never from registry
// IDs, expected statuses, golden answers, or evaluator output. Product routes,
// pipeline schemas, validators, normalizers, engine and stores remain real.
function replayTransport(documents,{beforeReader,beforeModel,itemCount=1,reviewCoverage={complete:true,remainingWork:[]}}={}){
  const trace={readerSessions:[],modelRequests:[],providerCalls:{gemini:0,e2b:0}};
  const gemini={generateText:async()=>{throw new Error('Offline controlled dashboard design transport failure');},generateJson:async request=>{
    const source=(request.contents||[]).find(part=>part.text?.startsWith('DOCUMENT_ID: '))?.text;
    const embedded=(request.contents||[]).map(part=>part.text||'').join('\n');
    const id=(source||embedded).match(/DOCUMENT_ID: ([^\r\n]+)/)?.[1];
    const document=id?documents.get(id):undefined;
    trace.modelRequests.push({maxOutputTokens:request.maxOutputTokens,role:request.role,documentId:id??null,contentsSha256:hash(JSON.stringify(request.contents??request.prompt)),schemaSha256:hash(JSON.stringify(request.schema))});
    await beforeModel?.(request,document);
    if(request.maxOutputTokens===9000||request.maxOutputTokens===12000&&!source){
      const structure=document?.kind==='xlsx'?document.sourceSheets.map(sheet=>{const last=sheet.rows.at(-1),end=last?.cells.at(-1)?.address??'A1';return {name:sheet.name,kind:'table',sheet:sheet.name,range:`A1:${end}`,headers:(sheet.rows[0]?.cells||[]).map(cell=>`${cell.address} ${cell.text}`),description:'Authored ledger source',orientation:'horizontal',uncertain:false};}):[{name:'source',kind:'text',range:`L1:L${document?.buffer.toString('utf8').split(/\r?\n/).length??1}`,headers:[],description:'Authored source lines',orientation:'unknown',uncertain:false}];
      return {data:{summary:'Authored source',documentType:document?.kind??'text',structure,warnings:[],questions:[]}};
    }
    if(request.maxOutputTokens===6000)return {data:{checked:true,issues:[]}};
    if(request.maxOutputTokens===32768)return {data:{criteria:[criterion()]}};
    if(request.maxOutputTokens===16384)return {data:{changes:[],additions:[],removeIds:[],summary:'Authored confirmation wording retained',warnings:[]}};
    if(request.maxOutputTokens===12000&&document){
      const original=document.buffer.toString('utf8'),match=/Strength\s+([+-]?\d+(?:\.\d+)?)\s+MPa/.exec(original);
      if(!match)throw new Error('Replay source has no authored measurement');
      return {data:{items:Array.from({length:itemCount},()=>({label:'Strength',value:match[1],unit:'MPa',criterionId:'authored-strength',status:'pass',uncertain:false,explanation:'Authored model candidate; host compares source value',evidence:[{documentId:document.id,quote:match[0]}]})),...(reviewCoverage===undefined?{}:{reviewCoverage})}};
    }
    throw new Error('Unplanned replay model phase');
  }};
  const withSandbox=async(work,options={})=>{
    const document=documents.get(options.activity?.documentId),files=new Map(),session={documentId:document.id,inputSha256:hash(document.buffer),inputBytes:document.buffer.length,commands:[],writes:[],settled:false};
    trace.readerSessions.push(session);await beforeReader?.(document);
    const report=()=>{};report.taskId=`offline-reader-${trace.readerSessions.length}`;
    try{return await work({files:{write:async(first,data)=>{for(const entry of Array.isArray(first)?first:[{path:first,data}]){files.set(entry.path,entry.data);session.writes.push(entry.path);}},read:async name=>{
      if(name==='/home/user/document-profile.json')return JSON.stringify({kind:document.kind,sha256:hash(document.buffer),status:'ready',inventory:{},coverage:{complete:true,unitsTotal:1,unitsRead:1,textChars:document.kind==='xlsx'?0:document.buffer.toString('utf8').length},...(document.kind==='xlsx'?{sheets:document.sourceSheets.map(sheet=>({...sheet,rows:sheet.rows.map(row=>({...row,cells:row.cells.map(cell=>({cell:cell.address,value:cell.text}))}))}))}:{text:document.buffer.toString('utf8')}),warnings:[],images:[]});
      if(name==='/home/user/document-requery.json'){const requests=JSON.parse(files.get('/home/user/document-requests.json')).requests;return JSON.stringify({kind:'txt',sha256:hash(document.buffer),coverage:{complete:true},selections:requests.map(request=>({request,source:document.buffer.toString('utf8')}))});}
      throw new Error('Unplanned replay reader artifact');
    }},commands:{run:async command=>{session.commands.push(command);return {exitCode:0,stdout:'',stderr:''};}}},report);}finally{session.settled=true;}
  };
  return {gemini,withSandbox,trace};
}

async function serve(product,{transportOptions,config,...appOptions}={}){
  const documents=new product.DocumentStore(),activityStore=product.createActivityStore();
  const settings=config||{geminiApiKey:'SYNTHETIC_GEMINI_SENTINEL',e2bApiKey:'SYNTHETIC_E2B_SENTINEL',modelExtract:'replay-extract',modelExplore:'replay-explore',e2bTemplate:'base'};
  const replay=replayTransport(documents,transportOptions);
  const app=product.createApp({config:settings,documents,activityStore,gemini:replay.gemini,withSandbox:replay.withSandbox,geminiConfigured:true,...appOptions});
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base=`http://127.0.0.1:${server.address().port}`,engine=app.locals.engine;
  const request=(url,options={})=>fetch(base+url,{...options,signal:options.signal??AbortSignal.timeout(5000)});
  const result=async(url,options)=>{const response=await request(url,options);const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=null;}return {status:response.status,body,headers:Object.fromEntries(response.headers),bytes:Buffer.byteLength(text),text};};
  const upload=async(name,content,role='target')=>{const form=new FormData();form.append('role',role);form.append('files',new Blob([content]),name);return result('/api/documents',{method:'POST',body:form});};
  const start=async(mode='criteria_first',documentIds=[])=>{const response=await result('/api/runs',json({mode,documentIds,criteriaText:'Strength 30 MPa 이상'}));if(response.status!==202)throw new Error('Replay run admission failed');const run=engine.get(response.body.runId);await run.job;return run;};
  const close=async()=>{for(const run of engine.runs.values())engine.cancel(run);for(const job of app.locals.exports.dashboard.jobs.values())job.controller.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  return {app,engine,documents,activityStore,replay,request,result,upload,start,close};
}

async function observeHttp(product){
  const h=await serve(product),out={};
  try{
    const health=await h.result('/api/health');out.health={...health,keys:Object.keys(health.body).sort(),syntheticSecretPresent:/SYNTHETIC_(?:GEMINI|E2B)_SENTINEL/.test(health.text)};
    const bodyInputs=[{method:'POST'},{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'},{method:'POST',headers:{'Content-Type':'application/json'},body:''},json({}),json([]),json(null),{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'}];
    out.body={responses:await Promise.all(bodyInputs.map(value=>h.result('/api/runs',value)))};out.body.statuses=out.body.responses.map(value=>value.status);
    out.origin={responses:[]};for(const origin of ['http://localhost:1','http://127.0.0.1:2','http://[::1]:3','https://example.invalid','null'])out.origin.responses.push(await h.result('/api/runs',{...json({}),headers:{'Content-Type':'application/json',Origin:origin}}));out.origin.statuses=out.origin.responses.map(value=>value.status);
    const before=[...h.documents.documents.keys()].sort(),bad=new FormData();bad.append('role','target');bad.append('files',new Blob(['temporary']),'temporary.txt');bad.append('files',new Blob(['unsupported']),'bad.xls');const rolled=await h.result('/api/documents',{method:'POST',body:bad});
    out.rollback={...rolled,idsBefore:before,idsAfter:[...h.documents.documents.keys()].sort()};out.rollback.idsUnchanged=isDeepStrictEqual(out.rollback.idsBefore,out.rollback.idsAfter);
    const uploaded=await h.upload('authored-target.txt','Strength 31 MPa'),document=uploaded.body.documents[0];out.upload={...uploaded,keys:Object.keys(document).sort()};
    out.content=await h.result(document.url);const unused=await h.upload('unused.txt','unused');out.unreferencedDelete=await h.result(`/api/documents/${unused.body.documents[0].id}`,{method:'DELETE'});
    const run=await h.start();out.transitions=[run.status];
    out.confirmation={missing:await h.result(`/api/runs/${run.id}/criteria/confirm`,json({})),stale:await h.result(`/api/runs/${run.id}/criteria/confirm`,json({expectedCriterionVersion:0})),prematureAttach:await h.result(`/api/runs/${run.id}/documents`,json({expectedCriterionVersion:1,documentIds:[document.id]}))};out.confirmation.staleStatus=out.confirmation.stale.status;
    const earlyResolve=await h.result(`/api/runs/${run.id}/items/absent/resolve`,json({status:'fail',note:'Source reviewed offline'}));
    const controller=new AbortController(),response=await h.request(`/api/runs/${run.id}/events?after=1`,{headers:{'Last-Event-ID':'999'},signal:controller.signal}),reader=response.body.getReader();
    const frame=new TextDecoder().decode((await reader.read()).value);controller.abort();await reader.cancel().catch(()=>{});for(let n=0;n<20&&run.listeners.size;n++)await tick();
    out.sse={frame,headers:Object.fromEntries(response.headers),queryWins:/^id: 2$/m.test(frame),listenersAfterDisconnect:run.listeners.size,statusAfterDisconnect:run.status};
    const activityController=new AbortController(),activityResponse=await h.request('/api/activity/events',{signal:activityController.signal}),activityReader=activityResponse.body.getReader(),activityFrame=new TextDecoder().decode((await activityReader.read()).value);activityController.abort();await activityReader.cancel().catch(()=>{});out.activity={namedEvent:activityFrame.startsWith('event: activity\n'),snapshot:await h.result('/api/activity')};
    out.revision=await h.result(`/api/runs/${run.id}/criteria/revise`,json({expectedCriterionVersion:1,feedback:'Keep the authored rule unchanged'}));await run.job;out.transitions.push(run.status);
    out.confirmed=await h.result(`/api/runs/${run.id}/criteria/confirm`,json({expectedCriterionVersion:run.criterionVersion}));out.transitions.push(run.status);
    out.attached=await h.result(`/api/runs/${run.id}/documents`,json({expectedCriterionVersion:run.criterionVersion,documentIds:[document.id]}));await run.job;out.transitions.push(run.status);
    const snapshot=await h.result(`/api/runs/${run.id}`);out.terminal={...snapshot,privateFieldCount:privateFields(snapshot.body).length};out.referencedDelete=await h.result(`/api/documents/${document.id}`,{method:'DELETE'});
    const item=run.items[0],base=`/api/runs/${run.id}/items/`;
    const rejected=[earlyResolve,await h.result(base+item.id+'/resolve',json({status:'fail',note:' '})),await h.result(base+item.id+'/resolve',json({status:'unknown',note:'reason'})),await h.result(base+'absent/resolve',json({status:'fail',note:'reason'}))];
    const resolved=await h.result(base+item.id+'/resolve',json({status:'fail',note:'Source reviewed offline'}));const audit=run.audit.at(-1);out.resolution={...resolved.body,rejectionStatuses:rejected.map(r=>r.status),audit:{before:audit.before,after:audit.after,note:audit.note},eventType:run.events.at(-1).type};
    const exports=[];for(const format of ['json','csv','xlsx','unsupported']){const r=await h.request(`/api/runs/${run.id}/export?format=${format}`);const bytes=Buffer.from(await r.arrayBuffer());exports.push({format,status:r.status,headers:Object.fromEntries(r.headers),byteLength:bytes.length,sha256:hash(bytes),...(format==='json'?{body:JSON.parse(bytes.toString('utf8'))}:{})});}out.export={responses:exports,statuses:exports.map(r=>r.status)};
    const ledger=[await h.result('/api/ledgers/analyze',json({documentId:'absent'})),await h.result('/api/ledgers/export',json({confirmed:false}))];out.ledger={responses:ledger,statuses:ledger.map(r=>r.status)};
    const created=await h.result('/api/dashboards',json({runId:run.id})),jobId=created.body.id;await h.app.locals.exports.dashboard.jobs.get(jobId).work;const polled=await h.result('/api/dashboards/'+jobId);const deleted=await h.result('/api/dashboards/'+jobId,{method:'DELETE'});const missing=await h.result('/api/dashboards/'+jobId);out.dashboard={responses:[created,polled,deleted,missing].map(({text,...r})=>r),statuses:[created,polled,deleted,missing].map(r=>r.status)};
    out.events={raw:structuredClone(run.events),sequenceValid:run.events.every((event,index)=>event.sequence===index+1&&event.runId===run.id),timestampsValid:run.events.every(event=>/^\d{4}-\d\d-\d\dT/.test(event.timestamp)&&Number.isFinite(Date.parse(event.timestamp))),documentCompletedRunStatus:run.events.find(event=>event.type==='document.completed')?.runStatus};
    out.replay=h.replay.trace;return out;
  }finally{await h.close();}
}

async function observeRestart(product){
  const one=await serve(product),two=await serve(product);
  try{
    const upload=await one.upload('restart.txt','Strength 31 MPa'),document=upload.body.documents[0],run=await one.start();
    one.engine.confirm(run,{expectedCriterionVersion:1});one.engine.attachDocuments(run,{expectedCriterionVersion:1,documentIds:[document.id]});await run.job;
    const dashboard=await one.result('/api/dashboards',json({runId:run.id}));await one.app.locals.exports.dashboard.jobs.get(dashboard.body.id).work;
    const routes=[document.url,`/api/runs/${run.id}`,`/api/dashboards/${dashboard.body.id}`],responses=[];for(const route of routes)responses.push(await two.result(route));
    return {firstCounts:{documents:one.documents.size,runs:one.engine.runs.size,dashboardJobs:one.app.locals.exports.dashboard.jobs.size},newCounts:{documents:two.documents.size,runs:two.engine.runs.size,dashboardJobs:two.app.locals.exports.dashboard.jobs.size},missingStatuses:responses.map(r=>r.status),responses,scope:'Two separately constructed real app/store instances; actual OS restart is a separate process probe.'};
  }finally{await one.close();await two.close();}
}

async function observeLegacy(product){const h=await serve(product);try{const doc=await h.documents.add({name:'legacy.txt',role:'target',buffer:Buffer.from('Strength 31 MPa')});const run=await h.start('legacy',[doc.id]);if(run.status==='awaiting_confirmation'){h.engine.confirm(run,{});await run.job;}return {status:run.status,mode:run.mode,events:structuredClone(run.events),snapshot:h.engine.snapshot(run)};}finally{await h.close();}}
async function observeCancellation(product){
  const gate=deferred();let readerEntered=false;
  const h=await serve(product,{transportOptions:{beforeReader:async()=>{readerEntered=true;await gate.promise;}}});
  try{
    const statuses=[],doc=await h.documents.add({name:'cancel.txt',role:'target',buffer:Buffer.from('Strength 31 MPa')}),running=await h.start();h.engine.confirm(running,{expectedCriterionVersion:1});h.engine.attachDocuments(running,{expectedCriterionVersion:1,documentIds:[doc.id]});
    await until(()=>readerEntered,'reader started');h.engine.cancel(running);statuses.push(running.status);const afterCancel=running.events.length;gate.resolve();await running.job;const lateEventsAdded=running.events.length-afterCancel;
    for(const phase of ['awaiting_confirmation','awaiting_documents']){const run=await h.start();if(phase==='awaiting_documents')h.engine.confirm(run,{expectedCriterionVersion:1});h.engine.cancel(run);statuses.push(run.status);}
    const before=running.events.length;h.engine.cancel(running);return {statuses,terminalEventDelta:running.events.length-before,lateEventsAdded,events:structuredClone(running.events),replay:h.replay.trace};
  }finally{gate.resolve();await h.close();}
}
async function observeWorkers(product){
  const readGates=new Map(),reviewGates=new Map(),timeline=[];let readActive=0,reviewActive=0,analysisMaximum=0,reviewMaximum=0,failureId;
  const h=await serve(product,{transportOptions:{beforeReader:async document=>{
    readActive++;analysisMaximum=Math.max(analysisMaximum,readActive);timeline.push({phase:'analysis-start',documentId:document.id});
    try{if(document.id===failureId)throw new Error('Authored reader transport failure');await readGates.get(document.id).promise;timeline.push({phase:'analysis-release',documentId:document.id});}finally{readActive--;}
  },beforeModel:async(request,document)=>{
    if(request.maxOutputTokens!==12000||!document)return;
    reviewActive++;reviewMaximum=Math.max(reviewMaximum,reviewActive);timeline.push({phase:'review-start',documentId:document.id});
    try{await reviewGates.get(document.id).promise;timeline.push({phase:'review-release',documentId:document.id});}finally{reviewActive--;}
  }}});
  try{
    const documents=[];for(const value of [31,29,33]){const document=await h.documents.add({name:`measurement-${value}.txt`,role:'target',buffer:Buffer.from(`Strength ${value} MPa`)});documents.push(document);readGates.set(document.id,deferred());reviewGates.set(document.id,deferred());}failureId=documents[2].id;
    const run=await h.start();h.engine.confirm(run,{expectedCriterionVersion:1});h.engine.attachDocuments(run,{expectedCriterionVersion:1,documentIds:documents.map(document=>document.id)});
    await until(()=>readActive===2,'both analysis workers');readGates.get(documents[1].id).resolve();await until(()=>timeline.some(e=>e.phase==='analysis-start'&&e.documentId===failureId),'isolated third reader');readGates.get(documents[0].id).resolve();
    await until(()=>reviewActive===2,'both review workers');reviewGates.get(documents[1].id).resolve();await until(()=>run.items.some(item=>item.documentId===documents[1].id),'second target completes first');reviewGates.get(documents[0].id).resolve();await run.job;
    const associationValid=run.items.every(item=>item.value===documents.find(document=>document.id===item.documentId).buffer.toString('utf8').match(/Strength (\d+)/)[1]);
    return {analysisMaximum,reviewMaximum,itemCount:run.items.length,associationValid,status:run.status,timeline,snapshot:h.engine.snapshot(run),replay:h.replay.trace};
  }finally{for(const gate of [...readGates.values(),...reviewGates.values()])gate.resolve();await h.close();}
}
async function observeRunLimits(product){const h=await serve(product);try{const admission=[],runs=[];for(let n=0;n<4;n++){const r=await h.result('/api/runs',json({mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'}));admission.push(r.status);if(r.body.runId){const run=h.engine.get(r.body.runId);await run.job;runs.push(run);}}for(const run of runs)h.engine.cancel(run);const oldest=runs[0].id;for(let n=0;n<38;n++){const run=await h.start();h.engine.cancel(run);}return {admission,prunedCount:h.engine.runs.size,oldestRemoved:!h.engine.runs.has(oldest),retainedIds:[...h.engine.runs.keys()],retainedItems:null};}finally{await h.close();}}

async function observeRequestLimits(product){
  const h=await serve(product),out={};try{
    const statuses=[];for(const bytes of [2*1024*1024,2*1024*1024+1]){const body=JSON.stringify({padding:'x'.repeat(bytes-14)});if(Buffer.byteLength(body)!==bytes)throw new Error('Invalid authored boundary body');statuses.push((await h.result('/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body})).status);}out.json={statuses};
    async function multipart({files=1,fields=1,fieldBytes=1,fileBytes=1}){const form=new FormData();form.append('role','target');for(let n=1;n<fields;n++)form.append('ignored'+n,'x'.repeat(fieldBytes));for(let n=0;n<files;n++)form.append('files',new Blob(['x'.repeat(fileBytes)]),`boundary-${n}.txt`);const r=await h.result('/api/documents',{method:'POST',body:form});for(const d of r.body?.documents||[])h.documents.delete(d.id);return {status:r.status,body:r.body?.error?{error:r.body.error}:{documentCount:r.body?.documents?.length}};}
    for(const [key,variants]of Object.entries({fileCount:[{files:10},{files:11}],fieldCount:[{fields:3},{fields:4}],fieldBytes:[{fields:2,fieldBytes:100},{fields:2,fieldBytes:101}],fileBytes:[{fileBytes:20*1024*1024},{fileBytes:20*1024*1024+1}]})){const responses=[];for(const v of variants)responses.push(await multipart(v));out[key]={responses,statuses:responses.map(r=>r.status)};}
    return out;
  }finally{await h.close();}
}

async function observeConfiguration(product,outputDirectory){
  const fixture=path.join(outputDirectory,'settings.fixture');await writeFile(fixture,'GEMINI_API_KEY=FILE_SENTINEL\nMODEL_EXTRACT=file-model\nE2B_API_KEY=E2B_FILE_SENTINEL\n');
  const processConfig=product.loadConfig({env:{GEMINI_API_KEY:'PROCESS_SENTINEL'},envPath:fixture}),blank=product.loadConfig({env:{GEMINI_API_KEY:''},envPath:fixture}),defaults=product.loadConfig({env:{},envPath:path.join(outputDirectory,'absent.fixture')});
  return {processWins:processConfig.geminiApiKey==='PROCESS_SENTINEL',blankSuppresses:blank.geminiApiKey==='',defaultModel:defaults.modelExtract,publicProjection:product.publicConfig(processConfig),keys:Object.keys(processConfig).sort(),syntheticOnly:true};
}
async function observeAdapter(product){
  const requests=[],config={modelExtract:'replay-extract',modelExplore:'replay-explore'};
  const client={models:{generateContent:async request=>{requests.push(request);return {text:request.config.responseJsonSchema?' {"answer":7} ':'  authored text  ',modelVersion:request.model,usageMetadata:{promptTokenCount:2,candidatesTokenCount:3}};}}};
  const gemini=product.createGemini({config,client}),schema={type:'object',properties:{answer:{type:'number'}}};
  const parsed=await gemini.generateJson({role:'explore',contents:[{text:'authored input'}],systemInstruction:'authored instruction',schema,maxOutputTokens:5}),text=await gemini.generateText({role:'extract',prompt:'authored text prompt'});
  const requestModels=requests.map(r=>r.model),tokenCodes=[];for(const maxOutputTokens of [0,1,32768,32769])try{await gemini.generateText({prompt:'boundary',maxOutputTokens});tokenCodes.push('ok');}catch(e){tokenCodes.push(e.code);}
  const invalidResponseCodes=[];for(const response of ['', 'not-json'])try{const bad=product.createGemini({config,client:{models:{generateContent:async()=>({text:response})}}});await bad.generateJson({prompt:'invalid replay response',schema});invalidResponseCodes.push('ok');}catch(e){invalidResponseCodes.push(e.code);}
  const extraInvalidCodes=[];for(const options of [{},{prompt:'x',role:'unknown'},{prompt:'x',maxOutputTokens:1.5},{prompt:'x',maxOutputTokens:'1'},{prompt:'x',maxOutputTokens:true}])try{await gemini.generateText(options);extraInvalidCodes.push('ok');}catch(error){extraInvalidCodes.push(error.code);}
  let validateRejected;try{await gemini.generateJson({prompt:'x',schema,validate:()=>false});validateRejected='ok';}catch(error){validateRejected=error.code;}
  const signal=new AbortController().signal;await gemini.generateJson({contents:[{text:'contents win'}],prompt:'unused prompt',schema,signal,systemInstruction:'instruction'});const priority=requests.at(-1);
  const largeText='x'.repeat(1024*1024+1),largeParts=Array.from({length:65},()=>({text:'synthetic'})),filePart={inlineData:{mimeType:'application/x-authored',data:Buffer.alloc(8*1024*1024+1,65).toString('base64')}};
  let largeRequest;const unbounded=product.createGemini({config,client:{models:{generateContent:async request=>{largeRequest=request;return {text:largeText};}}}});const large=await unbounded.generateText({contents:[...largeParts,filePart]});
  const genericBoundary={acceptedInputParts:largeRequest.contents.length,acceptedInlineBytes:Buffer.from(largeRequest.contents.at(-1).inlineData.data,'base64').length,acceptedResponseBytes:Buffer.byteLength(large.text),scope:'Representative above phase-specific boundaries; adapter has no generic byte/part/file/depth cap in CURRENT_REPRODUCTION.'};
  const timeoutController=new AbortController(),timeoutSignal=timeoutController.signal,timeoutTimer=setTimeout(()=>timeoutController.abort(new DOMException('Synthetic timeout','TimeoutError')),5);let suppliedSignal=false;const timed=product.createGemini({config,client:{models:{generateContent:async request=>{suppliedSignal=request.config.abortSignal===timeoutSignal;await new Promise((_,reject)=>{if(timeoutSignal.aborted)reject(timeoutSignal.reason);else timeoutSignal.addEventListener('abort',()=>reject(timeoutSignal.reason),{once:true});});}}}});let timeoutCode;try{await timed.generateText({prompt:'synthetic timeout',signal:timeoutSignal});}catch(error){timeoutCode=error.code;}finally{clearTimeout(timeoutTimer);}
  return {json:parsed,text,requestModels,schemaPreserved:isDeepStrictEqual(requests[0].config.responseJsonSchema,schema),requests:requests.slice(0,2).map(r=>({model:r.model,contents:r.contents,config:{maxOutputTokens:r.config.maxOutputTokens,systemInstruction:r.config.systemInstruction,responseMimeType:r.config.responseMimeType,responseJsonSchema:r.config.responseJsonSchema}})),tokenCodes,extraInvalidCodes,invalidResponseCodes,validateRejected,contentsWin:isDeepStrictEqual(priority.contents,[{text:'contents win'}]),signalPreserved:priority.config.abortSignal===signal,genericBoundary,timeout:{code:timeoutCode,signalPassed:suppliedSignal},errorCodes:[401,403,429,404,408,504,500].map(status=>product.safeError({status,message:'SYNTHETIC_PRIVATE_ERROR'},'gemini').code)};
}
async function observeAdapterQueues(product){
  const config={geminiApiKey:'SYNTHETIC',e2bApiKey:'SYNTHETIC',modelExtract:'replay',modelExplore:'replay',e2bTemplate:'base'},out={};
  for(const runtime of ['gemini','e2b']){
    const gate=deferred(),controllers=Array.from({length:102},()=>new AbortController());let active=0,maximum=0,started=0,killed=0;
    const enter=async()=>{active++;started++;maximum=Math.max(maximum,active);try{await gate.promise;}finally{active--;}};
    const gemini=runtime==='gemini'?product.createGemini({config,client:{models:{generateContent:async()=>{await enter();return {text:'authored'};}}}}):null;
    const invoke=index=>runtime==='gemini'?gemini.generateText({prompt:'authored queue '+index,signal:controllers[index]?.signal}):product.withSandbox(enter,{config,signal:controllers[index]?.signal,sandboxFactory:{create:async()=>({kill:async()=>{killed++;}})}});
    const requests=controllers.map((_,index)=>invoke(index).then(()=>({state:'ok'}),error=>({state:'failed',code:error.code})));
    await until(()=>started===2,`${runtime} global slots`);const pool=runtime==='gemini'?product.geminiPool:product.sandboxPool,peak={active:pool.active,pending:pool.pending};let overflowCode;try{await invoke(102);}catch(error){overflowCode=error.code;}
    controllers[2].abort();await tick();const pendingAfterAbort=pool.pending;gate.resolve();const results=await Promise.all(requests);await until(()=>pool.active===0&&pool.pending===0,`${runtime} drained`);
    out[runtime]={peak,maximum,overflowCode,pendingAfterAbort,started,killed,results};
  }
  const creation=deferred(),aborted=new AbortController();let created=false,lateWork=0,lateKills=0;
  const late=product.withSandbox(()=>{lateWork++;},{config,signal:aborted.signal,sandboxFactory:{create:async()=>{created=true;await creation.promise;return {kill:async()=>{lateKills++;}};}}}).then(()=>({state:'ok'}),error=>({state:'failed',code:error.code}));
  await until(()=>created,'late sandbox create');aborted.abort();creation.resolve();out.lateCreate={result:await late,workCalls:lateWork,killCalls:lateKills};
  let streamFinally=false;const streamed=product.createGemini({config,client:{models:{generateContentStream:async()=>({async *[Symbol.asyncIterator](){try{yield {text:'one'};yield {text:'two'};}finally{streamFinally=true;}}})}}});
  const events=[];for await(const event of streamed.streamText({prompt:'authored stream'})){events.push(event);break;}await until(()=>product.geminiPool.active===0,'stream pool release');out.stream={events,iteratorFinally:streamFinally,slotsAfter:product.geminiPool.active};
  const timeoutCodes=[];for(const timeoutMs of [9999,10000,300000,300001])try{await product.withSandbox(()=>1,{config,timeoutMs,sandboxFactory:{create:async(_template,options)=>({kill:async killOptions=>{out.sandboxTimeoutOptions={create:options,kill:killOptions};}})}});timeoutCodes.push('ok');}catch(error){timeoutCodes.push(error.code);}out.sandboxTimeoutCodes=timeoutCodes;
  const commandCodes=[];for(const timeoutMs of [0,1,120000,120001])try{await product.runSandboxCommand({commands:{run:async(_command,options)=>{out.commandTimeoutOptions=options;return {exitCode:0};}}},'authored command',{timeoutMs});commandCodes.push('ok');}catch(error){commandCodes.push(error.code);}out.commandTimeoutCodes=commandCodes;
  return out;
}
async function observeLocalSessionQueue(product){
  const document={id:'authored-local',kind:'txt',buffer:Buffer.from('source')},sha256=hash(document.buffer),gate=deferred(),files=new Map();let held=false,released=false,active=0,maximum=0,requeryStarts=0,sourceWriteCount=0;
  const sandbox={files:{write:async(first,data)=>{for(const e of Array.isArray(first)?first:[{path:first,data}]){files.set(e.path,e.data);if(e.path.endsWith('document-input.bin'))sourceWriteCount++;}},read:async name=>name.endsWith('profile.json')?JSON.stringify({kind:'txt',sha256,inventory:{},coverage:{complete:true},warnings:[],text:'source'}):JSON.stringify({kind:'txt',sha256,coverage:{complete:true},selections:[{request:{kind:'text',start:1,end:1},source:'source'}]})},commands:{run:async command=>{active++;maximum=Math.max(maximum,active);try{if(command.includes('document-requery.py')){requeryStarts++;if(!held){held=true;await gate.promise;}}return {exitCode:0,stdout:'',stderr:''};}finally{active--;}}}};
  const resources=product.documentSandboxResources(sandbox,document);await resources.read();
  let rejectedBeforeRelease=0;const invoke=()=>resources.requery([{kind:'text',start:1,end:1}]).then(()=>({state:'ok'}),error=>{if(!released)rejectedBeforeRelease++;return {state:'failed',code:error.code};});
  const first=invoke();await until(()=>held,'local reread acquired');const pending=Array.from({length:101},invoke);await tick();const rejectedWhileHeld=rejectedBeforeRelease;released=true;gate.resolve();const results=await Promise.all([first,...pending]);
  const retainedSessionSourceWriteCount=sourceWriteCount;
  const abortGate=deferred(),controller=new AbortController();let firstHeld=false,queuedSettled=false,queuedExecuted=0;
  const abortSandbox={files:sandbox.files,commands:{run:async command=>{if(command.includes('document-requery.py')){queuedExecuted++;if(!firstHeld){firstHeld=true;await abortGate.promise;}}return {exitCode:0,stdout:'',stderr:''};}}};
  const owner=product.documentSandboxResources(abortSandbox,document),waiter=product.documentSandboxResources(abortSandbox,document,{signal:controller.signal});await owner.read();const owned=owner.requery([{kind:'text',start:1,end:1}]);await until(()=>firstHeld,'abort owner reread');const cancelled=waiter.requery([{kind:'text',start:1,end:1}]).then(()=>({state:'ok'}),error=>({state:'failed',name:error.name,code:error.code})).finally(()=>{queuedSettled=true;});controller.abort();await tick();const settledBeforeOwnerRelease=queuedSettled;abortGate.resolve();await owned;const cancellation=await cancelled;
  return {submitted:102,maximum,rejectedWhileHeld,requeryStarts,results,identityStable:resources.sha256===sha256,sourceWriteCount:retainedSessionSourceWriteCount,queuedAbort:{settledBeforeOwnerRelease,commandStarts:queuedExecuted,cancellation,sourceWriteCount:sourceWriteCount-retainedSessionSourceWriteCount}};
}
async function observeResourceOrder(product){
  const pool=new product.TaskPool(1),gate=deferred(),started=deferred(),controller=new AbortController(),order=[];
  const first=pool.submit(async()=>{order.push('first-start');started.resolve();await gate.promise;order.push('first-settled');},controller.signal);await started.promise;
  const second=pool.submit(async()=>{order.push('second-start');});controller.abort();order.push('abort');await tick();const heldAfterAbort=pool.active===1&&pool.pending===1;gate.resolve();await Promise.all([first,second]);
  let killCount=0,cleanupFailureCode;try{await product.withSandbox(async()=>({authored:true}),{config:{e2bApiKey:'SYNTHETIC_E2B_SENTINEL'},sandboxFactory:{create:async()=>({kill:async()=>{killCount++;throw new Error('synthetic cleanup failure');}})}});}catch(error){cleanupFailureCode=error.code;}
  return {order,heldAfterAbort,killCount,cleanupFailureCode};
}

export async function collectDraftRuntime({projectRoot,outputDirectory,allowLoopback=false,probes=[]}={}){
  if(!allowLoopback)throw new Error('EXPLICIT_LOOPBACK_EXECUTION_REQUIRED');
  if(process.version!=='v24.13.1')throw new Error('PINNED_NODE_24_13_1_REQUIRED');
  const root=path.resolve(projectRoot),output=path.resolve(outputDirectory);
  if(!output.startsWith(root+path.sep)||!path.relative(root,output).replaceAll('\\','/').startsWith('.cache/rebuild/'))throw new Error('OUTPUT_SCOPE');
  await mkdir(output,{recursive:true});const product=await loadProduct(root),actual={origin:'actual-app-offline-transport-replay',nodeVersion:process.version,nodeExecutable:process.execPath,providerCalls:{gemini:0,e2b:0},probes:{},limitations:['Physical trusted Python execution is not established by this reader-transport replay.','No browser, OS-process, installation or live-provider evidence is implied.']};
  const available={configuration:()=>observeConfiguration(product,output),adapter:()=>observeAdapter(product),'adapter-queues':()=>observeAdapterQueues(product),'local-session':()=>observeLocalSessionQueue(product),'resource-order':()=>observeResourceOrder(product),http:()=>observeHttp(product),restart:()=>observeRestart(product),legacy:()=>observeLegacy(product),cancellation:()=>observeCancellation(product),workers:()=>observeWorkers(product),'run-limits':()=>observeRunLimits(product),'request-limits':()=>observeRequestLimits(product)};
  for(const name of [...new Set(probes)]){const startedAt=stamp();if(!available[name]){actual.probes[name]={state:'not_run',reason:'DRAFT_FOCUSED_PROBE_MISSING'};continue;}try{actual[name]=await available[name]();actual.probes[name]={state:'completed',startedAt,endedAt:stamp()};}catch(error){actual.probes[name]={state:'failed',startedAt,endedAt:stamp(),error:{name:error.name,code:error.code??'COLLECTOR_PROBE_FAILED'}};}}
  await writeFile(path.join(output,'runtime-actual.json'),JSON.stringify(actual,null,2)+'\n',{flag:'wx'});return actual;
}

// Preparation/emission follows the existing reader without changing it. There
// is deliberately no CLI entry point in this held draft. After review/promotion,
// root may add explicit prepare/execute commands to this same owned file.
export async function prepareGatePlans({projectRoot,freeze,registry,registrySha256}={}){
  if(freeze.acceptanceProfile!==PROFILE||freeze.registrySha256!==registrySha256)throw new Error('FREEZE_SCOPE_MISMATCH');
  const result=[];
  for(const gateId of ['G01','G02']){
    const definitions=registry.cases.filter(definition=>definition.gateId===gateId),cases=[];
    for(const definition of definitions){const blueprint=CASE_BLUEPRINTS[definition.id];if(!blueprint)throw new Error('UNMAPPED_FROZEN_CASE');cases.push({caseId:definition.id,inputs:definition.inputs,baselineReferences:definition.baselineReferences,initialState:{freshInMemoryApp:true,providerCalls:{gemini:0,e2b:0},syntheticSourcesOnly:true},actions:[...blueprint.probes.map(probe=>({operation:'run actual offline probe',probe})),...blueprint.missing.map(reason=>({operation:'required focused probe not implemented',reason}))],assertions:blueprint.assertions,probes:blueprint.probes,missingFocusedProbes:blueprint.missing});}
    result.push({schemaVersion:'1.0',acceptanceProfile:PROFILE,gateId,codeDigest:freeze.codeDigest,registrySha256,preparedAt:stamp(),cases});
  }
  if(result[0].cases.length!==12||result[1].cases.length!==15)throw new Error('FROZEN_DENOMINATOR_CHANGED');return result;
}
export function evaluateDraftCases(plan,actual,helpers){
  return plan.cases.map(entry=>{
    const observations=[];for(const check of entry.assertions)try{const value=helpers.jsonPointer(actual,check.pointer);observations.push({...check,actual:value,passed:helpers.compare(value,check.expected,check.operator)});}catch(error){observations.push({...check,passed:false,error:error.message});}
    const failedProbe=entry.probes.some(probe=>actual.probes[probe]?.state==='failed');
    const notRun=entry.missingFocusedProbes.length>0||entry.probes.some(probe=>actual.probes[probe]?.state==='not_run');
    return {caseId:entry.caseId,state:failedProbe?'failed':notRun?'not_run':observations.every(value=>value.passed)?'passed':'failed',assertions:observations,missingFocusedProbes:entry.missingFocusedProbes};
  });
}

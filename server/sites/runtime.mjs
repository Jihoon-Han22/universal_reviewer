import { randomUUID } from 'node:crypto';
import { DocumentStore, DocumentError, MAX_FILE_BYTES } from '../documents.mjs';
import { ReviewEngine, ReviewError, OPEN_STATUSES, SAFE_MESSAGE, safeMessage } from '../review.mjs';
import { createDocumentAnalyzer } from '../document-analyzer.mjs';
import { registerRoutes as registerExportRoutes } from '../exports.mjs';
import { goldenCatalog, loadGolden } from '../golden-catalog.mjs';
import { loadSample } from '../samples.mjs';
import { createGemini, withSandbox, createActivityStore, publicConfig } from '../../integrations/src/index.mjs';
import { SitesStorage } from './storage.mjs';
import { createSitesProviderBudget } from './budget.mjs';
import { serializeRun, hydrateRun, restoreRunOriginals } from './engine-state.mjs';
import { SessionError, assertMutationOrigin, resolveSession } from './auth.mjs';
import { createRouter, createRequest, createResponse, readJson, HttpError } from './router.mjs';

const TERMINAL = new Set(['completed','partial','failed','cancelled']);
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const isMutation = method => !['GET','HEAD','OPTIONS'].includes(method);
const notFound = () => new HttpError('기록을 찾을 수 없습니다.',404);
const disposition = name => `inline; filename="${name.replace(/[^\x20-\x7e]|["\\]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;

export function configFromEnv(env) {
  const value = name => String(env[name]??'').trim();
  const config={geminiApiKey:value('GEMINI_API_KEY'),e2bApiKey:value('E2B_API_KEY'),modelExtract:value('MODEL_EXTRACT')||'gemini-3.5-flash-lite',modelExplore:value('MODEL_EXPLORE')||'gemini-3.5-flash-lite',e2bTemplate:value('E2B_TEMPLATE')||'base'};
  if (![config.modelExtract,config.modelExplore].every(model=>/^(?:models\/)?[a-zA-Z0-9._-]+$/.test(model))) throw new HttpError('서버 모델 설정을 확인해 주세요.',503);
  return Object.freeze(config);
}

function documentIds(body,run) {
  const ids=new Set();
  for (const source of [body,run]) {
    if(!source)continue;
    for (const key of ['documentIds','criteriaDocumentIds','analysisDocumentIds']) if(Array.isArray(source[key])) for(const id of source[key]) if(typeof id==='string')ids.add(id);
    for (const key of ['documentId','sourceDocumentId']) if(typeof source[key]==='string')ids.add(source[key]);
  }
  return [...ids];
}

export async function createRuntime(env,sessionId,options={}) {
  const storage=options.storage??new SitesStorage({db:env.DB,bucket:env.BUCKET,sessionId});
  await storage.init();
  const config=options.config??configFromEnv(env), documents=options.documents??new DocumentStore();
  const activityStore=createActivityStore({secrets:[config.geminiApiKey,config.e2bApiKey]});
  const engine=new ReviewEngine({documents,config,deferJobs:true});
  let lazyGemini;
  const underlying=options.gemini??Object.fromEntries(['generateText','generateJson','streamText'].map(method=>[method,args=>{lazyGemini??=createGemini({config,live:true,budgetGuard:createSitesProviderBudget({db:env.DB,seed:env.PROVIDER_BUDGET_SEED,enabled:true})});return lazyGemini[method](args);}]));
  const gemini=Object.fromEntries(['generateText','generateJson'].map(method=>[method,args=>engine.queueModel(()=>underlying[method](args),args.signal)]));
  gemini.streamText=underlying.streamText?.bind(underlying);
  const sandbox=options.withSandbox??((work,settings={})=>withSandbox(work,{...settings,config,live:true}));
  engine.analyzer=options.analyzer??createDocumentAnalyzer({gemini,withSandbox:sandbox,activityStore});
  const router=createRouter(), revisions=new Map(), documentRevisions=new Map(), analysisCaches=new Map();
  const runtime={env,storage,config,documents,engine,activityStore,router,revisions,documentRevisions};
  const loadRun=async id=>{const stored=await storage.getState('run',id);if(!stored)throw notFound();const run=hydrateRun(stored.state);engine.runs.set(id,run);revisions.set(`run:${id}`,stored.revision);return {run,stored};};
  const loadDocuments=async ids=>{
    const missing=[...new Set(ids)].filter(id=>!documents.documents.has(id));
    // Loading a large collection together would exceed the Worker memory budget.
    const metadata=missing.length?await storage.listDocuments():[];
    const required=metadata.filter(doc=>missing.includes(doc.id)).reduce((sum,doc)=>sum+doc.size,0);
    if(required>45*1024*1024)throw new HttpError('한 검토에 선택한 문서 용량이 큽니다. 문서를 나누어 검토해 주세요.',413);
    for(const id of missing){const stored=await storage.getDocument(id);if(!stored)throw new DocumentError('문서를 찾을 수 없습니다. 파일을 다시 업로드해 주세요.',404);documents.documents.set(id,stored.document);documents.totalBytes+=stored.document.size;documentRevisions.set(id,stored.revision);analysisCaches.set(id,stored.document.sandboxAnalysisResult);}
  };
  const persistRun=async(run,lease)=>{await runtime.ensureMutationLease?.();const key=`run:${run.id}`,state=serializeRun(run,{externalizeOriginals:true}),old=revisions.get(key);const saved=old===undefined?await storage.createState('run',run.id,state):await storage.putState('run',run.id,state,{expectedRevision:old,lease});revisions.set(key,saved.revision);};
  const persistDashboard=async(job,lease)=>{await runtime.ensureMutationLease?.();const key=`dashboard:${job.id}`,state=runtime.exports.dashboard.serializeJob(job),old=revisions.get(key);const saved=old===undefined?await storage.createState('dashboard',job.id,state):await storage.putState('dashboard',job.id,state,{expectedRevision:old,lease});revisions.set(key,saved.revision);};
  const persistNewDocuments=async()=>{await runtime.ensureMutationLease?.();const added=[],pending=[...documents.documents.values()].filter(doc=>!documentRevisions.has(doc.id)),existing=await storage.listDocuments();if(existing.length+pending.length>100||[...existing,...pending].reduce((sum,doc)=>sum+doc.size,0)>250*1024*1024)throw new DocumentError('문서 보관 한도를 초과했습니다.',413);try{for(const doc of pending){await runtime.ensureMutationLease?.();const saved=await storage.putDocument(doc);documentRevisions.set(doc.id,saved.revision);added.push(doc.id);}}catch(error){for(const id of added)await storage.deleteDocument(id,{expectedRevision:documentRevisions.get(id)}).catch(()=>{});throw error;}};
  const persistAnalyzedDocuments=async()=>{for(const doc of documents.documents.values())if(doc.sandboxAnalysisResult&&doc.sandboxAnalysisResult!==analysisCaches.get(doc.id)){const {analysisPromise,...clean}=doc;try{const saved=await storage.putDocument(clean,{expectedRevision:documentRevisions.get(doc.id)});documentRevisions.set(doc.id,saved.revision);analysisCaches.set(doc.id,doc.sandboxAnalysisResult);}catch(error){if(error.name!=='StorageConflictError')throw error;}}};
  Object.assign(runtime,{loadRun,loadDocuments,persistRun,persistDashboard,persistNewDocuments,persistAnalyzedDocuments});

  router.get('/api/health',(req,res)=>res.json({...publicConfig(config),model:config.modelExtract,runtime:'sites'}));
  router.post('/api/documents',async(req,res)=>{
    const max=MAX_FILE_BYTES+1024*1024;
    if(Number(req.native.headers.get('content-length')??0)>max)throw new HttpError('파일은 한 번에 하나씩, 20MB까지 업로드해 주세요.',413);
    let form,size=0,tooLarge=false;
    const bounded=req.native.body?.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.byteLength;if(size>max){tooLarge=true;throw new HttpError('파일은 한 번에 하나씩, 20MB까지 업로드해 주세요.',413);}controller.enqueue(chunk);}}));
    try{form=await new Response(bounded,{headers:{'Content-Type':req.native.headers.get('content-type')??''}}).formData();}catch{throw new HttpError(tooLarge?'파일은 한 번에 하나씩, 20MB까지 업로드해 주세요.':'업로드 요청 형식을 확인해 주세요.',tooLarge?413:400);}
    const files=form.getAll('files'),role=form.get('role');
    if(!['target','criteria','ledger'].includes(role))throw new DocumentError('문서 역할을 확인해 주세요.');
    if(!files.length||files.length>10||files.some(file=>typeof file==='string'))throw new DocumentError('업로드할 파일을 선택해 주세요.');
    if(files.reduce((sum,file)=>sum+file.size,0)>MAX_FILE_BYTES)throw new DocumentError('파일은 한 번에 하나씩, 20MB까지 업로드해 주세요.',413);
    const existing=await storage.listDocuments();
    if(existing.length+files.length>100||existing.reduce((sum,file)=>sum+file.size,0)+files.reduce((sum,file)=>sum+file.size,0)>250*1024*1024)throw new DocumentError('문서 보관 한도를 초과했습니다.',413);
    const added=[];
    try{for(const file of files)added.push(await documents.add({name:file.name,buffer:Buffer.from(await file.arrayBuffer()),role}));await persistNewDocuments();res.status(201).json({documents:added.map(doc=>documents.public(doc))});}catch(error){documents.rollback(added);throw error;}
  });
  router.get('/api/documents/:id/content',async(req,res)=>{const doc=await storage.getDocumentContent(req.params.id);if(!doc)throw notFound();res.set({'Content-Type':doc.mime,'Content-Disposition':disposition(doc.name),'Content-Length':String(doc.size)}).send(doc.body);});
  router.delete('/api/documents/:id',async(req,res)=>{
    const records=await storage.listStates('run');
    for(const record of records){const stored=await storage.getState('run',record.id);if(stored){const run=hydrateRun(stored.state);if(documentIds(null,run).includes(req.params.id))throw new ReviewError('검토 기록의 근거로 사용 중인 문서는 삭제할 수 없습니다.',409);}}
    await runtime.ensureMutationLease?.();const doc=(await storage.listDocuments()).find(item=>item.id===req.params.id);if(!doc||!await storage.deleteDocument(req.params.id,{expectedRevision:doc.revision}))throw notFound();res.json({deleted:true});
  });
  const deployedGolden=env.ASSETS?{root:'/golden',read:async location=>{const response=await env.ASSETS.fetch(new Request(`https://datasets.invalid${String(location).replaceAll('\\','/')}`));if(!response.ok||response.headers.get('content-type')?.startsWith('text/html'))throw new HttpError('예제 파일을 불러오지 못했습니다.',503);return Buffer.from(await response.arrayBuffer());}}:undefined;
  router.post('/api/samples',async(req,res)=>{const result=await loadSample(documents,req.body?.kind,options.sampleOptions??deployedGolden);await persistNewDocuments();res.status(201).json(result);});
  router.get('/api/golden',(req,res)=>res.json(goldenCatalog()));
  router.post('/api/golden/load',async(req,res)=>{const result=await loadGolden(documents,req.body,options.goldenOptions??deployedGolden);await persistNewDocuments();res.status(201).json(result);});
  router.post('/api/runs',async(req,res)=>{const records=await storage.listStates('run');if(records.filter(record=>OPEN_STATUSES.has(record.status)).length>=3)throw new ReviewError('동시 검토 한도에 도달했습니다. 진행 중인 검토가 끝난 뒤 다시 시도해 주세요.',429);const run=engine.start(req.body??{});await persistRun(run);res.status(202).json({runId:run.id});});
  router.get('/api/runs/:id',(req,res)=>res.json(engine.snapshot(req.params.id)));
  router.post('/api/runs/:id/criteria/revise',(req,res)=>res.status(202).json(engine.revise(req.params.id,req.body)));
  router.post('/api/runs/:id/criteria/confirm',(req,res)=>res.json(engine.confirm(req.params.id,req.body)));
  router.post('/api/runs/:id/documents',(req,res)=>res.status(202).json(engine.attachDocuments(req.params.id,req.body)));
  router.post('/api/runs/:id/cancel',async(req,res)=>{await storage.requestCancel('run',req.params.id);res.json({...engine.snapshot(req.params.id),cancelRequested:true});});
  router.post('/api/runs/:id/items/:itemId/resolve',(req,res)=>res.json(engine.resolve(req.params.id,req.params.itemId,req.body)));
  router.get('/api/activity',async(req,res)=>res.json(await activitySnapshot(storage)));
  router.delete('/api/dashboards/:id',async(req,res)=>{const stored=await storage.getState('dashboard',req.params.id);if(!stored)throw notFound();if(stored.lease?.expiresAt>Date.now())await storage.requestCancel('dashboard',req.params.id);else await storage.deleteState('dashboard',req.params.id,{expectedRevision:stored.revision});res.status(204).end();});
  runtime.exports=registerExportRoutes(router,{documents,engine,gemini,withSandbox:sandbox,activityStore,config,deferExecution:true,ensureAnalyzed:engine.ensureAnalyzed.bind(engine)});
  return runtime;
}

async function activitySnapshot(storage) {
  const records=await storage.listStates('activity'),tasks=new Map();
  for(const record of records.slice(-30)){const stored=await storage.getState('activity',record.id);for(const task of stored?.state?.tasks??[]){const prior=tasks.get(task.id);if(!prior||task.updatedAt>prior.updatedAt)tasks.set(task.id,task);}}
  return {tasks:[...tasks.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,30)};
}

function activityPersistence(runtime) {
  const id=randomUUID();let revision,dirty=false,chain=Promise.resolve();
  const unsubscribe=runtime.activityStore.subscribe(()=>{dirty=true;});
  const save=()=>{chain=chain.then(async()=>{if(!dirty)return;dirty=false;const state=runtime.activityStore.snapshot();const saved=revision===undefined?await runtime.storage.createState('activity',id,state):await runtime.storage.putState('activity',id,state,{expectedRevision:revision});revision=saved.revision;});return chain;};
  return {save,unsubscribe};
}

function eventHeaders(res){res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});res.flushHeaders();res.write('retry: 1500\n\n');}

async function jobEvents(runtime,req,res,kind,id) {
  const {storage,engine}=runtime;
  let sent=Number(req.query.after??req.get('Last-Event-ID')??0);
  if(!Number.isInteger(sent)||sent<0)throw new ReviewError('이벤트 순서가 올바르지 않습니다.');
  let stored=await storage.getState(kind,id);if(!stored||kind==='dashboard'&&stored.cancelRequested)throw notFound();
  eventHeaders(res);
  const sendRun=run=>{for(const event of run.events??[])if(event.sequence>sent){sent=event.sequence;res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);}};
  const show=state=>{const status=kind==='run'?state.run.status:state.status;if(stored.lease?.expiresAt>Date.now()&&(kind==='run'?status!=='running':['ready','failed'].includes(status)))return;if(kind==='run')sendRun(hydrateRun(state));else res.write(`event: progress\ndata: ${JSON.stringify({status:state.status})}\n\n`);};
  show(stored.state);
  const pending=state=>kind==='run'?state.run.pendingJob:state.pending;
  const finished=state=>kind==='run'?TERMINAL.has(state.run.status):['ready','failed'].includes(state.status);
  // Waiting for a user's command is observation only: do not acquire a lease
  // that could block confirmation or write unchanged snapshots on reconnect.
  for(let index=0;index<12&&!pending(stored.state)&&!finished(stored.state)&&!res.writableEnded;index++){
    await delay(1500);const next=await storage.getState(kind,id);if(!next)break;stored=next;show(stored.state);
  }
  if(res.writableEnded||!pending(stored.state)||finished(stored.state)){
    if(kind==='dashboard'&&finished(stored.state)&&!(stored.lease?.expiresAt>Date.now()))res.write('event: complete\ndata: {}\n\n');res.end();return;
  }
  let lease=await storage.acquireLease(kind,id);
  if(!lease){
    // Another connection owns execution. Observe its durable checkpoints.
    let terminal=false;
    for(let i=0;i<15&&!res.writableEnded;i++){await delay(1500);stored=await storage.getState(kind,id);if(!stored){terminal=true;break;}show(stored.state);const status=kind==='run'?stored.state.run.status:stored.state.status;if(TERMINAL.has(status)||['ready','awaiting_confirmation','awaiting_documents'].includes(status)){terminal=!(stored.lease?.expiresAt>Date.now());break;}res.write(': heartbeat\n\n');}
    if(kind==='dashboard'&&terminal)res.write('event: complete\ndata: {}\n\n');res.end();return;
  }
  stored=await storage.getState(kind,id);runtime.revisions.set(`${kind}:${id}`,stored.revision);
  let job,unsubscribe=()=>{},dirty=false,failed=false,leaseReleased=false,renewAt=Date.now()+20000;
  try {
    if(kind==='run'){job=hydrateRun(stored.state);engine.runs.set(id,job);if(job.pendingJob?.state==='queued'){await runtime.loadDocuments(documentIds(null,job));restoreRunOriginals(job,runtime.documents);}unsubscribe=engine.subscribe(job,event=>{dirty=true;if((event.runStatus??event.status)==='running')sendRun({events:[event]});});}
    else job=runtime.exports.dashboard.hydrateJob(stored.state,{recoverInterrupted:stored.state.pending?.state==='executing'});
  }catch(error){await storage.releaseLease(kind,id,lease).catch(()=>{});throw error;}
  const save=()=>kind==='run'?runtime.persistRun(job,lease):runtime.persistDashboard(job,lease);
  let chain=Promise.resolve();
  const queue=work=>{chain=chain.then(work);return chain;};
  const activity=activityPersistence(runtime);
  const abort=()=>{if(kind==='run')engine.cancel(job);else job.controller.abort();};
  res.on('close',abort);
  if(res.writableEnded||req.native.signal.aborted)abort();
  const tick=setInterval(()=>{queue(async()=>{
    if(Date.now()>=renewAt){const next=await storage.renewLease(kind,id,lease);if(!next)throw new Error('Lost job lease');lease=next;renewAt=Date.now()+20000;}
    if(await storage.isCancelRequested(kind,id))abort();
    if(dirty||kind==='dashboard'){dirty=false;await save();}
    await activity.save();res.write(': heartbeat\n\n');
  }).catch(()=>{failed=true;abort();});},4000);
  try {
    if(stored.cancelRequested)abort();
    const beforeExecute=()=>queue(save);
    if(kind==='run')await engine.executePendingJob(job,{beforeExecute});else await runtime.exports.dashboard.executePendingJob(job,{beforeExecute});
    clearInterval(tick);
    await queue(save);await runtime.persistAnalyzedDocuments();await activity.save();
    // A client may close immediately or submit the next command on this event.
    // Publish phase boundaries only after durable state and lease release.
    res.off('close',abort);
    if(!await storage.releaseLease(kind,id,lease))throw new HttpError('작업 저장 상태를 확인할 수 없습니다. 다시 연결해 주세요.',409);
    leaseReleased=true;
    if(kind==='run')sendRun(job);else res.write('event: complete\ndata: {}\n\n');
  }finally{
    clearInterval(tick);unsubscribe();activity.unsubscribe();res.off('close',abort);
    await chain.catch(()=>{});
    if(kind==='dashboard'&&await storage.isCancelRequested(kind,id).catch(()=>false))await storage.deleteState(kind,id,{expectedRevision:runtime.revisions.get(`${kind}:${id}`),...(leaseReleased?{}:{lease})}).catch(()=>{});
    if(!leaseReleased)await storage.releaseLease(kind,id,lease).catch(()=>{});
    if(!res.writableEnded)res.end();
  }
  if(failed)throw new HttpError('작업 연결이 중단되었습니다. 저장된 진행 내용을 확인해 주세요.',409);
}

async function activityEvents(runtime,req,res){eventHeaders(res);for(let index=0;index<12&&!res.writableEnded;index++){res.write(`event: activity\ndata: ${JSON.stringify(await activitySnapshot(runtime.storage))}\n\n`);await delay(2500);}res.end();}

export async function handleApi(request,env,context={},options={}) {
  let res;
  try {
    assertMutationOrigin(request);
    const session=await resolveSession(request,env),body=await readJson(request),req=createRequest(request,body);
    res=createResponse(request,{cookie:session.cookie,onClose:()=>req.emit('close')});
    if(req.path==='/api/health'){const config=options.config??configFromEnv(env);res.json({...publicConfig(config),model:config.modelExtract,runtime:'sites'});return res.response;}
    const runtime=await createRuntime(env,session.id,options),{storage,engine}=runtime;
    const stream=/^\/api\/(runs|dashboards)\/([^/]+)\/events$/.exec(req.path);
    if(stream||req.path==='/api/activity/events'){
      const work=(stream?jobEvents(runtime,req,res,stream[1]==='runs'?'run':'dashboard',decodeURIComponent(stream[2])):activityEvents(runtime,req,res)).catch(error=>{if(!res.headersSent)sendError(res,error);else res.end();});
      context.waitUntil?.(work);return res.response;
    }
    const route=runtime.router.match(req.method,req.path);if(!route)throw notFound();req.params=route.params;
    const runMatch=/^\/api\/runs\/([^/]+)/.exec(req.path),dashboardMatch=/^\/api\/dashboards\/([^/]+)/.exec(req.path);
    const runId=runMatch?decodeURIComponent(runMatch[1]):typeof body?.runId==='string'?body.runId:null;
    let lease,run,sessionLease,ledgerLease,ledgerLockId,ledgerTimer,ledgerLost=false,ledgerRenewal=Promise.resolve(),activity=activityPersistence(runtime);
    const mutation=runMatch&&isMutation(req.method)&&!req.path.endsWith('/cancel');
    try{
      const changesInventory=isMutation(req.method)&&(/^\/api\/(?:documents(?:\/[^/]+)?|samples|golden\/load|runs|dashboards)$/.test(req.path)||/^\/api\/runs\/[^/]+\/documents$/.test(req.path));
      if(changesInventory){
        if(!await storage.getState('activity','session-mutations')){try{await storage.createState('activity','session-mutations',{tasks:[]});}catch(error){if(error.name!=='StorageConflictError')throw error;}}
        sessionLease=await storage.acquireLease('activity','session-mutations');
        if(!sessionLease)throw new HttpError('문서나 작업을 저장하고 있습니다. 잠시 후 다시 시도해 주세요.',409);
        runtime.ensureMutationLease=async()=>{const renewed=await storage.renewLease('activity','session-mutations',sessionLease);if(!renewed)throw new HttpError('저장 작업이 만료되었습니다. 다시 시도해 주세요.',409);sessionLease=renewed;};
      }
      if(mutation){lease=await storage.acquireLease('run',runId);if(!lease)throw new HttpError('검토 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.',409);}
      if(runId)({run}=await runtime.loadRun(runId));
      if(/^\/api\/ledgers\/(?:analyze|export)$/.test(req.path)&&typeof body?.documentId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(body.documentId)){
        ledgerLockId=`ledger-${body.documentId}`;
        if(!await storage.getState('activity',ledgerLockId)){try{await storage.createState('activity',ledgerLockId,{tasks:[]});}catch(error){if(error.name!=='StorageConflictError')throw error;}}
        ledgerLease=await storage.acquireLease('activity',ledgerLockId);
        if(!ledgerLease)throw new HttpError('이 결과 대장을 분석하고 있습니다. 잠시 후 다시 시도해 주세요.',409);
        ledgerTimer=setInterval(()=>{ledgerRenewal=ledgerRenewal.then(async()=>{const next=await storage.renewLease('activity',ledgerLockId,ledgerLease);if(!next)throw new Error('Lost ledger lease');ledgerLease=next;}).catch(()=>{ledgerLost=true;req.emit('aborted');});},20000);
      }
      if(isMutation(req.method)&&!req.path.endsWith('/cancel'))await runtime.loadDocuments(documentIds(body));
      if(dashboardMatch){const id=decodeURIComponent(dashboardMatch[1]),stored=await storage.getState('dashboard',id);if(!stored||stored.cancelRequested)throw notFound();runtime.exports.dashboard.hydrateJob(stored.state);runtime.revisions.set(`dashboard:${id}`,stored.revision);}
      if(req.path==='/api/dashboards'&&req.method==='POST'){for(const meta of await storage.listStates('dashboard')){if(!['ready','failed'].includes(meta.status))throw new HttpError('대시보드를 생성하고 있습니다. 잠시 후 다시 시도하세요.',409);}}
      const tick=setInterval(()=>activity.save().catch(()=>{}),4000);
      try{if(request.signal.aborted||ledgerLost)throw new HttpError('요청이 취소되었습니다.',499);await route.handler(req,res);}finally{clearInterval(tick);}
      if(mutation)await runtime.persistRun(run,lease);
      if(req.path==='/api/runs/'+runId+'/cancel'&&!lease){const current=await storage.acquireLease('run',runId);if(current){try{({run}=await runtime.loadRun(runId));engine.cancel(run);await runtime.persistRun(run,current);}finally{await storage.releaseLease('run',runId,current);}}}
      for(const job of runtime.exports.dashboard.jobs.values())if(!runtime.revisions.has(`dashboard:${job.id}`))await runtime.persistDashboard(job);
      if(ledgerLease){await ledgerRenewal;const next=await storage.renewLease('activity',ledgerLockId,ledgerLease);if(!next||ledgerLost)throw new HttpError('결과 대장 분석 연결이 중단되었습니다. 다시 시도해 주세요.',409);ledgerLease=next;}
      await runtime.persistAnalyzedDocuments();await activity.save();
      if(!res.headersSent)res.status(204).end();
    }finally{activity.unsubscribe();clearInterval(ledgerTimer);await ledgerRenewal.catch(()=>{});if(ledgerLease)await storage.releaseLease('activity',ledgerLockId,ledgerLease).catch(()=>{});if(lease)await storage.releaseLease('run',runId,lease).catch(()=>{});if(sessionLease)await storage.releaseLease('activity','session-mutations',sessionLease).catch(()=>{});}
    return res.response;
  }catch(error){if(!res)res=createResponse(request);if(!res.streaming){res.reset();sendError(res,error);}else res.end();return res.response;}
}

function sendError(res,error){const known=error instanceof HttpError||error instanceof SessionError||error instanceof DocumentError||error instanceof ReviewError||['StorageConflictError','StorageError'].includes(error.name)||error.code==='RESOURCE_UNAVAILABLE';const message=known?error.message:safeMessage(error);const status=known?error.status:message===SAFE_MESSAGE?500:error.status??400;res.status(Number.isInteger(status)&&status>=400&&status<=599?status:500).json({error:message});}

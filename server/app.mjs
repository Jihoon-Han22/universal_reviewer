import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadConfig, publicConfig, createGemini, withSandbox, activityStore as sharedActivityStore } from '../integrations/src/index.mjs';
import { DocumentStore, DocumentError, MAX_FILE_BYTES } from './documents.mjs';
import { ReviewEngine, ReviewError, SAFE_MESSAGE, safeMessage } from './review.mjs';
import { createDocumentAnalyzer } from './document-analyzer.mjs';
import { registerRoutes as registerExportRoutes } from './exports.mjs';
import { goldenCatalog, loadGolden } from './golden-catalog.mjs';
import { loadSample } from './samples.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function contentDisposition(name, disposition = 'inline') {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g,'_');
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
function sseHeaders(res) { res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}); res.flushHeaders(); }
function runEvents(engine,req,res) {
  const run = engine.get(req.params.id), after = Number(req.query.after ?? req.get('Last-Event-ID') ?? 0);
  if (!Number.isInteger(after) || after < 0) throw new ReviewError('이벤트 순서가 올바르지 않습니다.');
  sseHeaders(res); let sent = after;
  const send = event => { if (event.sequence <= sent) return; sent = event.sequence; res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`); };
  for (const event of run.events) send(event);
  const unsubscribe = engine.subscribe(run,send);
  const timer = setInterval(() => res.write(': heartbeat\n\n'),15000); timer.unref?.();
  req.on('close',() => { clearInterval(timer); unsubscribe(); });
}
function activityEvents(store,req,res) {
  sseHeaders(res);
  const send = () => { if (res.writableLength > 512 * 1024) { res.destroy(); return; } res.write(`event: activity\nid: ${store.revision}\ndata: ${JSON.stringify(store.snapshot())}\n\n`); };
  send(); const unsubscribe = store.subscribe(send);
  const timer = setInterval(() => { if (res.writableLength > 512 * 1024) res.destroy(); else res.write(': heartbeat\n\n'); },15000); timer.unref?.();
  req.on('close',() => { clearInterval(timer); unsubscribe(); });
}
export function createApp(options = {}) {
  const config = options.config ?? loadConfig();
  const documents = options.documents ?? options.engine?.documents ?? new DocumentStore();
  const activityStore = options.activityStore ?? sharedActivityStore;
  const engine = options.engine ?? new ReviewEngine({documents,config,geminiConfigured:options.geminiConfigured});
  let lazyGemini;
  const underlyingGemini = options.gemini ?? Object.fromEntries(['generateText','generateJson','streamText'].map(method => [method,args => { lazyGemini ??= createGemini({config,live:options.live ?? false,budgetGuard:options.budgetGuard}); return lazyGemini[method](args); }]));
  const gemini = Object.fromEntries(['generateText','generateJson'].map(method => [method,args => engine.queueModel(() => underlyingGemini[method](args),args.signal)]));
  gemini.streamText = underlyingGemini.streamText?.bind(underlyingGemini);
  const sandbox = options.withSandbox ?? options.sandbox ?? ((work,settings = {}) => withSandbox(work,{...settings,config,live:options.live ?? false}));
  engine.analyzer ??= options.analyzer ?? createDocumentAnalyzer({gemini,withSandbox:sandbox,activityStore});
  const app = express(); app.disable('x-powered-by');
  app.locals.documents = documents; app.locals.engine = engine; app.locals.activityStore = activityStore;
  app.use((req,res,next) => { res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}); if (req.path === '/api' || req.path.startsWith('/api/')) res.set('Cache-Control','no-store'); next(); });
  app.use('/api',(req,res,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin !== undefined) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return res.status(403).json({error:'요청 출처를 확인할 수 없습니다.'}); }
      if (!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)) return res.status(403).json({error:'이 로컬 앱에서만 요청할 수 있습니다.'});
    }
    next();
  });
  app.use('/api',express.json({limit:'2mb'}));
  const upload = multer({storage:multer.memoryStorage(),limits:{files:10,fields:3,fieldSize:100,parts:13,fileSize:MAX_FILE_BYTES}}).array('files',10);
  app.get('/api/health',(req,res) => { const result = publicConfig(config); res.json({...result,model:result.modelExtract}); });
  app.post('/api/documents',upload,async(req,res) => {
    if (!['target','criteria','ledger'].includes(req.body?.role)) throw new DocumentError('문서 역할을 확인해 주세요.');
    if (!req.files?.length) throw new DocumentError('업로드할 파일을 선택해 주세요.');
    const added = [];
    try { for (const file of req.files) added.push(await documents.add({name:file.originalname,buffer:file.buffer,role:req.body.role})); res.status(201).json({documents:added.map(d => documents.public(d))}); }
    catch (error) { documents.rollback(added); throw error; }
  });
  app.get('/api/documents/:id/content',(req,res) => { const doc = documents.get(req.params.id); res.set({'Content-Type':doc.mime,'Content-Disposition':contentDisposition(doc.name)}).send(doc.buffer); });
  app.delete('/api/documents/:id',(req,res) => { documents.get(req.params.id); if (engine.usedDocument(req.params.id)) throw new ReviewError('검토 기록의 근거로 사용 중인 문서는 삭제할 수 없습니다.',409); documents.delete(req.params.id); res.json({deleted:true}); });
  app.post('/api/samples',async(req,res) => res.status(201).json(await loadSample(documents,req.body?.kind,options.sampleOptions)));
  app.get('/api/golden',(req,res) => res.json(goldenCatalog()));
  app.post('/api/golden/load',async(req,res) => res.status(201).json(await loadGolden(documents,req.body,options.goldenOptions)));
  app.post('/api/runs',(req,res) => { const body = req.body === undefined && /^application\/json\b/i.test(req.headers['content-type'] ?? '') ? {} : req.body; const run = engine.start(body); res.status(202).json({runId:run.id}); });
  app.param('id',(req,res,next,id) => { if (req.path.startsWith('/api/runs/')) { try { engine.get(id); } catch(error) { return next(error); } } next(); });
  app.get('/api/runs/:id',(req,res) => res.json(engine.snapshot(req.params.id)));
  app.get('/api/runs/:id/events',(req,res) => runEvents(engine,req,res));
  app.post('/api/runs/:id/criteria/revise',(req,res) => res.status(202).json(engine.revise(req.params.id,req.body)));
  app.post('/api/runs/:id/criteria/confirm',(req,res) => res.json(engine.confirm(req.params.id,req.body)));
  app.post('/api/runs/:id/documents',(req,res) => res.status(202).json(engine.attachDocuments(req.params.id,req.body)));
  app.post('/api/runs/:id/cancel',(req,res) => res.json(engine.cancel(req.params.id)));
  app.post('/api/runs/:id/items/:itemId/resolve',(req,res) => res.json(engine.resolve(req.params.id,req.params.itemId,req.body)));
  app.get('/api/activity',(req,res) => res.json(activityStore.snapshot()));
  app.get('/api/activity/events',(req,res) => activityEvents(activityStore,req,res));
  if (options.registerExports !== false) app.locals.exports = (options.registerExportRoutes ?? registerExportRoutes)(app,{documents,engine,gemini,withSandbox:sandbox,activityStore,config,ensureAnalyzed:engine.ensureAnalyzed.bind(engine)});
  app.use('/api',(req,res) => res.status(404).json({error:'API 경로를 찾을 수 없습니다.'}));
  const dist = options.dist ?? path.join(ROOT,'dist');
  if (existsSync(path.join(dist,'index.html'))) { app.use(express.static(dist)); app.get('/{*path}',(req,res) => res.sendFile(path.join(dist,'index.html'))); }
  app.use((error,req,res,next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({error:error.code === 'LIMIT_FILE_SIZE' ? '파일당 20MB까지 업로드할 수 있습니다.' : '한 번에 최대 10개 파일까지 업로드할 수 있습니다.'});
    if (error.type === 'entity.parse.failed' || error instanceof SyntaxError && 'body' in error) return res.status(400).json({error:'요청 JSON 형식이 올바르지 않습니다.'});
    if (error.type === 'entity.too.large') return res.status(413).json({error:'요청 크기는 2MB까지입니다.'});
    const message = safeMessage(error); res.status(message === SAFE_MESSAGE ? 500 : (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 400)).json({error:message});
  });
  return app;
}

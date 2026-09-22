import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.mjs';
import { ReviewError } from './review.mjs';

const config={geminiApiKey:'',e2bApiKey:'',modelExtract:'synthetic-extract',modelExplore:'synthetic-explore',e2bTemplate:'base'};
const criterion={id:'limit',label:'Strength',rule:'30 MPa 이상',comparison:{operator:'gte',value:30,unit:'MPa'},needsConfirmation:false};
const analyzer={analyze:async d=>({...d,analysis:{status:'complete',summary:'read',warnings:[],needsConfirmation:false,coverage:{complete:true,readerComplete:true,contextComplete:true}}}),discoverCriteria:async()=>({criteria:[criterion]}),extractTarget:async d=>({data:{items:[{label:'Strength',value:'31',unit:'MPa',criterionId:'limit',status:'pass',uncertain:false,explanation:'value',evidence:[{documentId:d.id,quote:'Strength 31 MPa'}]}]}}),reviseCriteria:async criteria=>({criteria})};
async function serve(t,options={}) {
  const app=createApp({config,analyzer,geminiConfigured:true,registerExports:false,...options});
  const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  return {app,engine:app.locals.engine,documents:app.locals.documents,request:(url,options)=>fetch(base+url,options)};
}
const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('health works without configured keys and only exposes capability flags/model aliases',async t=>{
  const h=await serve(t,{geminiConfigured:false});const r=await h.request('/api/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{geminiConfigured:false,e2bConfigured:false,modelExtract:'synthetic-extract',modelExplore:'synthetic-explore',model:'synthetic-extract'});assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('x-powered-by'),null);
  const start=await h.request('/api/runs',post({mode:'criteria_first',criteriaText:'x'}));assert.equal(start.status,503);
});
test('mutation Origin guard allows loopback hostname regardless of port and rejects malformed/nonlocal',async t=>{
  const h=await serve(t);
  for(const origin of ['http://localhost:1234','http://127.0.0.1:5199','http://[::1]:1']){const r=await h.request('/api/samples',{...post({kind:'expenses'}),headers:{'Content-Type':'application/json',Origin:origin}});assert.equal(r.status,201);}
  for(const [origin,message] of [['https://example.invalid','이 로컬 앱에서만 요청할 수 있습니다.'],['null','요청 출처를 확인할 수 없습니다.']]){const r=await h.request('/api/runs',{...post({}),headers:{'Content-Type':'application/json',Origin:origin}});assert.equal(r.status,403);assert.equal((await r.json()).error,message);}
  assert.equal((await h.request('/api/health',{headers:{Origin:'https://elsewhere.invalid'}})).status,200);
});
test('start body/parser ordering reproduces JSON versus absent/plain-text distinction',async t=>{
  const h=await serve(t);
  const cases=[{options:{method:'POST'},status:500},{options:{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'},status:500},{options:{method:'POST',headers:{'Content-Type':'application/json'},body:''},status:400},{options:post({}),status:400},{options:post([]),status:400},{options:post(null),status:400},{options:{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'},status:400}];
  for(const {options,status} of cases){const r=await h.request('/api/runs',options);assert.equal(r.status,status);const body=await r.json();assert.deepEqual(Object.keys(body),['error']);assert.doesNotMatch(body.error,/TypeError|stack|destructure/);}
});
test('upload rollback, original download MIME/filename and retained evidence deletion conflict',async t=>{
  const h=await serve(t);const files=new FormData();files.append('role','criteria');files.append('files',new Blob(['기준 30 이상']), '규칙.txt');files.append('files',new Blob(['legacy']), 'bad.xls');
  const failed=await h.request('/api/documents',{method:'POST',body:files});assert.equal(failed.status,400);assert.equal(h.documents.size,0);
  const good=new FormData();good.append('role','criteria');good.append('files',new Blob(['기준 30 이상']), '규칙.txt');const uploaded=await h.request('/api/documents',{method:'POST',body:good});assert.equal(uploaded.status,201);const doc=(await uploaded.json()).documents[0];
  const download=await h.request(doc.url);assert.equal(await download.text(),'기준 30 이상');assert.match(download.headers.get('content-type'),/text\/plain/);assert.match(download.headers.get('content-disposition'),/filename\*=UTF-8''/);
  const started=await h.request('/api/runs',post({mode:'criteria_first',criteriaDocumentIds:[doc.id]}));const {runId}=await started.json();await h.engine.get(runId).job;
  const deletion=await h.request(`/api/documents/${doc.id}`,{method:'DELETE'});assert.equal(deletion.status,409);assert.equal((await deletion.json()).error,'검토 기록의 근거로 사용 중인 문서는 삭제할 수 없습니다.');
});
test('multipart size/count limits return exact contract errors',async t=>{
  const h=await serve(t);const many=new FormData();many.append('role','target');for(let i=0;i<11;i++)many.append('files',new Blob(['x']),`${i}.txt`);
  let r=await h.request('/api/documents',{method:'POST',body:many});assert.equal(r.status,400);assert.equal((await r.json()).error,'한 번에 최대 10개 파일까지 업로드할 수 있습니다.');
  const huge=new FormData();huge.append('role','target');huge.append('files',new Blob([new Uint8Array(20*1024*1024+1)]),'big.txt');r=await h.request('/api/documents',{method:'POST',body:huge});assert.equal(r.status,413);assert.equal((await r.json()).error,'파일당 20MB까지 업로드할 수 있습니다.');assert.equal(h.documents.size,0);
});
test('missing run errors apply to every command, invalid cursors and unknown API paths',async t=>{
  const h=await serve(t);
  for(const path of ['/api/runs/absent','/api/runs/absent/events','/api/runs/absent/criteria/confirm','/api/runs/absent/documents','/api/runs/absent/cancel','/api/runs/absent/items/no/resolve']){const method=/criteria|documents|cancel|resolve/.test(path)?post({}):{};const r=await h.request(path,method);assert.equal(r.status,404);assert.equal((await r.json()).error,'검토 기록이 없습니다. 서버를 재시작했다면 다시 실행해 주세요.');}
  const run=h.engine.start({mode:'criteria_first',criteriaText:'x'});await run.job;
  assert.equal((await h.request(`/api/runs/${run.id}/events?after=-1`)).status,400);assert.equal((await h.request(`/api/runs/${run.id}/events?after=1.2`)).status,400);
  const unknown=await h.request('/api/no');assert.equal(unknown.status,404);assert.equal((await unknown.json()).error,'API 경로를 찾을 수 없습니다.');
});
test('run SSE replays completed-before-connect history, query cursor wins, close only unsubscribes',async t=>{
  const h=await serve(t),run=h.engine.start({mode:'criteria_first',criteriaText:'x'});await run.job;
  const controller=new AbortController();const r=await h.request(`/api/runs/${run.id}/events?after=1`,{headers:{'Last-Event-ID':'999'},signal:controller.signal});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-cache, no-transform');assert.equal(r.headers.get('x-accel-buffering'),'no');
  const reader=r.body.getReader();const {value}=await reader.read();const frames=new TextDecoder().decode(value);assert.doesNotMatch(frames,/^event:/m);assert.match(frames,/id: 2\n/);assert.match(frames,/criteria.confirmation_required/);assert.equal(run.listeners.size,1);
  controller.abort();await reader.cancel().catch(()=>{});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(run.listeners.size,0);assert.equal(run.status,'awaiting_confirmation');
});
test('activity SSE is a named full snapshot stream and unsubscribes on disconnect',async t=>{
  const listeners=new Set();const store={revision:7,snapshot:()=>({tasks:[]}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const h=await serve(t,{activityStore:store}),controller=new AbortController();const r=await h.request('/api/activity/events',{signal:controller.signal});const reader=r.body.getReader();assert.equal(new TextDecoder().decode((await reader.read()).value),'event: activity\nid: 7\ndata: {"tasks":[]}\n\n');assert.equal(listeners.size,1);controller.abort();await reader.cancel().catch(()=>{});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(listeners.size,0);
});
test('full HTTP criteria-confirm-attach-resolve round trip uses actual engine and safe public DTOs',async t=>{
  const h=await serve(t);const d=await h.documents.add({name:'target.txt',buffer:Buffer.from('Strength 31 MPa'),role:'target'});
  let r=await h.request('/api/runs',post({mode:'criteria_first',criteriaText:'Strength >=30 MPa'}));assert.equal(r.status,202);const {runId}=await r.json();await h.engine.get(runId).job;
  r=await h.request(`/api/runs/${runId}/criteria/confirm`,post({expectedCriterionVersion:1}));assert.equal((await r.json()).status,'awaiting_documents');
  r=await h.request(`/api/runs/${runId}/documents`,post({expectedCriterionVersion:1,documentIds:[d.id]}));assert.equal(r.status,202);await h.engine.get(runId).job;
  const snapshot=await(await h.request(`/api/runs/${runId}`)).json();assert.equal(snapshot.status,'completed');assert.equal(snapshot.documents[0].buffer,undefined);assert.equal(snapshot.documents[0].modelParts,undefined);
  r=await h.request(`/api/runs/${runId}/items/${snapshot.items[0].id}/resolve`,post({status:'fail',note:'원문 확인'}));assert.equal(r.status,200);const result=await r.json();assert.equal(result.item.machineStatus,'pass');assert.equal(result.summary.fail,1);
});

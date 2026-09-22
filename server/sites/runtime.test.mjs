import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { handleApi } from './runtime.mjs';
import { encodeState, decodeState } from './engine-state.mjs';

const env = { GEMINI_API_KEY:'mock-gemini-key', SESSION_SECRET:'test-only-session-secret-at-least-32-characters' };
const origin = 'https://reviewer.example';
const clone = value => decodeState(JSON.parse(JSON.stringify(encodeState(value))));
const criterion = { id:'strength', label:'Strength', rule:'30 MPa 이상', comparison:{operator:'gte',value:30,unit:'MPa'}, needsConfirmation:false, conditions:[], categoryPath:[], sourceDocumentId:'natural-language' };
const conflict = () => { throw Object.assign(new Error('Stored version changed'),{name:'StorageConflictError',status:409}); };

// This store deliberately clones across every request boundary and checks lease
// fencing/revisions, so request-local mutations cannot impersonate durable saves.
class MemoryStorage {
  states = new Map();
  documents = new Map();
  writes = [];
  leases = [];
  failStateWrites = false;
  async init() {}
  key(kind,id) { return `${kind}:${id}`; }
  async listDocuments() { return [...this.documents.values()].map(({document,revision})=>({...clone(document),revision,buffer:undefined})); }
  async putDocument(document,{expectedRevision=0}={}) { const prior=this.documents.get(document.id);if((prior?.revision??0)!==expectedRevision)conflict();const record={document:clone(document),revision:expectedRevision+1};this.documents.set(document.id,record);return {revision:record.revision}; }
  async getDocument(id) { const record=this.documents.get(id); return record?clone(record):null; }
  async getDocumentContent(id) { const record=this.documents.get(id); return record?{...clone(record.document),body:record.document.buffer}:null; }
  async deleteDocument(id,{expectedRevision}={}) { const prior=this.documents.get(id);if(!prior)return false;if(prior.revision!==expectedRevision)conflict();return this.documents.delete(id); }
  async listStates(kind) { return [...this.states.entries()].filter(([key])=>key.startsWith(`${kind}:`)).map(([key,value])=>({id:key.slice(kind.length+1),status:value.state.run?.status??value.state.status,revision:value.revision,lease:clone(value.lease),cancelRequested:value.cancelRequested})); }
  async getState(kind,id) { const state=this.states.get(this.key(kind,id)); return state?clone(state):null; }
  createState(kind,id,state) { return this.putState(kind,id,state,{expectedRevision:0}); }
  async putState(kind,id,state,{expectedRevision,lease}={}) {
    if(this.failStateWrites) throw new Error('Simulated durable storage failure');
    const key=this.key(kind,id),old=this.states.get(key);
    if((old?.revision??0)!==expectedRevision)conflict();
    if(old?.lease?.expiresAt>Date.now() && (!lease||lease.owner!==old.lease.owner||lease.fence!==old.lease.fence))conflict();
    const record={state:clone(state),revision:expectedRevision+1,lease:clone(old?.lease??null),fence:old?.fence??0,cancelRequested:old?.cancelRequested??false};
    this.states.set(key,record);this.writes.push({kind,id,state:clone(state)});return {revision:record.revision};
  }
  async acquireLease(kind,id) {
    this.leases.push({kind,id});
    const record=this.states.get(this.key(kind,id));if(!record||record.lease?.expiresAt>Date.now())return null;
    record.lease={owner:randomUUID(),fence:++record.fence,expiresAt:Date.now()+60000};return clone(record.lease);
  }
  async renewLease(kind,id,lease) { const record=this.states.get(this.key(kind,id));if(record?.lease?.owner!==lease.owner||record?.lease?.fence!==lease.fence)return null;record.lease.expiresAt=Date.now()+60000;return clone(record.lease); }
  async releaseLease(kind,id,lease) { const record=this.states.get(this.key(kind,id));if(record?.lease?.owner!==lease.owner||record?.lease?.fence!==lease.fence)return false;record.lease=null;return true; }
  async requestCancel(kind,id) { const record=this.states.get(this.key(kind,id));if(!record)return false;record.cancelRequested=true;return true; }
  async isCancelRequested(kind,id) { return Boolean(this.states.get(this.key(kind,id))?.cancelRequested); }
  async deleteState(kind,id) { return this.states.delete(this.key(kind,id)); }
}

function harness({discover,analyze}={}) {
  const storage=new MemoryStorage(),calls={discover:0,analyze:0};
  const analyzer={
    analyze:async document=>{calls.analyze++;if(analyze)await analyze(document);return {...document,analysis:{status:'complete',summary:'Read',warnings:[],coverage:{complete:true,readerComplete:true,contextComplete:true}}};},
    discoverCriteria:async(...args)=>{calls.discover++;return discover?discover(...args):{criteria:[clone(criterion)]};},
  };
  const unexpectedProvider=()=>{throw new Error('Unexpected provider invocation');};
  const options={storage,analyzer,gemini:{generateText:unexpectedProvider,generateJson:unexpectedProvider,streamText:unexpectedProvider},withSandbox:unexpectedProvider};
  const pending=[];
  let cookie;
  const request=async(path,{method='GET',body,headers={},signal,environment=env}={})=>{
    const requestHeaders=new Headers(headers);
    if(cookie)requestHeaders.set('cookie',cookie);
    if(method!=='GET'&&!requestHeaders.has('origin'))requestHeaders.set('origin',origin);
    if(body!==undefined && !(body instanceof FormData)&&!(body instanceof ReadableStream)){requestHeaders.set('content-type','application/json');body=JSON.stringify(body);}
    const response=await handleApi(new Request(origin+path,{method,body,headers:requestHeaders,signal,...(body instanceof ReadableStream?{duplex:'half'}:{})}),environment,{waitUntil:work=>pending.push(work)},options);
    cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;
    return response;
  };
  const start=async(body={})=>{const response=await request('/api/runs',{method:'POST',body:{mode:'criteria_first',criteriaText:'Strength 30 MPa 이상',...body}});assert.equal(response.status,202,await response.clone().text());return (await response.json()).runId;};
  const events=async id=>{const response=await request(`/api/runs/${id}/events`);assert.equal(response.status,200);const text=await response.text();await Promise.all(pending);return text;};
  return {storage,calls,request,start,events,pending};
}

async function uploadLedger(h) {
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('검토대장');
  sheet.addRow(['성적서번호','판정','비고']);sheet.addRow(['R-42','기존','보존 전']);
  const bytes=await workbook.xlsx.writeBuffer(),form=new FormData();form.set('role','ledger');
  form.append('files',new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'ledger.xlsx');
  const response=await h.request('/api/documents',{method:'POST',body:form});assert.equal(response.status,201,await response.clone().text());
  return (await response.json()).documents[0];
}

test('Sites uploads persist original bytes and serve them on a fresh API request',async()=>{
  const h=harness(),form=new FormData();form.set('role','target');form.append('files',new Blob(['Strength 31 MPa'],{type:'text/plain'}),'target.txt');
  const response=await h.request('/api/documents',{method:'POST',body:form});assert.equal(response.status,201,await response.clone().text());
  const {documents:[document]}=await response.json();const stored=await h.storage.getDocument(document.id);
  assert.equal(stored.document.buffer.toString(),'Strength 31 MPa');assert.equal(stored.document.role,'target');
  const content=await h.request(`/api/documents/${document.id}/content`);assert.equal(content.status,200);assert.equal(await content.text(),'Strength 31 MPa');assert.match(content.headers.get('content-type'),/text\/plain/);
  const deleted=await h.request(`/api/documents/${document.id}`,{method:'DELETE'});assert.equal(deleted.status,200);assert.equal(await h.storage.getDocument(document.id),null);
});

test('starting a review persists queued work without executing a provider',async()=>{
  const h=harness(),id=await h.start();await new Promise(resolve=>setImmediate(resolve));
  const stored=await h.storage.getState('run',id);assert.equal(stored.state.run.pendingJob.state,'queued');assert.equal(stored.state.run.status,'running');assert.equal(h.calls.discover,0);
  const snapshot=await h.request(`/api/runs/${id}`);assert.equal(snapshot.status,200);assert.equal((await snapshot.json()).id,id);assert.equal(h.calls.discover,0);
});

test('SSE persists execution acknowledgement before analysis and final confirmation state afterward',async()=>{
  let h;h=harness({discover:async(_sources,_text,options)=>{const stored=await h.storage.getState('run',options.runId);assert.equal(stored.state.run.pendingJob.state,'executing');return {criteria:[clone(criterion)]};}});
  const id=await h.start(),text=await h.events(id),stored=await h.storage.getState('run',id);
  assert.match(text,/criteria\.confirmation_required/);assert.equal(h.calls.discover,1);assert.equal(stored.state.run.status,'awaiting_confirmation');assert.equal(stored.state.run.pendingJob,undefined);assert.equal(stored.lease,null);
  const snapshot=await h.request(`/api/runs/${id}`);assert.equal((await snapshot.json()).criteria[0].id,'strength');
});

test('waiting SSE observes confirmation without leases or writes and can disconnect immediately',async()=>{
  const h=harness(),id=await h.start();await h.events(id);
  const writes=h.storage.writes.length,leases=h.storage.leases.length;
  const response=await h.request(`/api/runs/${id}/events`),reader=response.body.getReader();
  assert.equal(response.status,200);assert.equal((await reader.read()).done,false);await reader.cancel();await Promise.all(h.pending);
  assert.equal(h.storage.writes.length,writes);assert.equal(h.storage.leases.length,leases);assert.equal(h.calls.discover,1);
  assert.equal((await h.storage.getState('run',id)).state.run.status,'awaiting_confirmation');
});

test('concurrent SSE connections share one execution lease',async()=>{
  let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const h=harness({discover:async()=>{entered();await gate;return {criteria:[clone(criterion)]};}}),id=await h.start();
  const first=await h.request(`/api/runs/${id}/events`),firstText=first.text();await started;
  const second=await h.request(`/api/runs/${id}/events`),secondText=second.text();
  assert.equal(h.calls.discover,1);release();
  await Promise.all([firstText,secondText,...h.pending]);assert.equal(h.calls.discover,1);assert.equal((await h.storage.getState('run',id)).state.run.status,'awaiting_confirmation');
});

test('expired executing checkpoints fail visibly without replaying provider calls',async()=>{
  const h=harness(),id=await h.start(),record=h.storage.states.get(`run:${id}`);
  record.state.run.pendingJob.state='executing';record.lease={owner:'expired-owner',fence:1,expiresAt:Date.now()-1};record.fence=1;
  const text=await h.events(id),stored=await h.storage.getState('run',id);
  assert.equal(h.calls.discover,0);assert.equal(stored.state.run.status,'failed');assert.match(stored.state.run.error,/연결이 중단/);assert.equal(stored.state.run.pendingJob,undefined);assert.match(text,/run\.failed/);
});

test('failed durable confirmation returns an error and preserves the stored unapproved state',async()=>{
  const h=harness(),id=await h.start();await h.events(id);h.storage.failStateWrites=true;
  const response=await h.request(`/api/runs/${id}/criteria/confirm`,{method:'POST',body:{expectedCriterionVersion:1}});
  assert.equal(response.status,500);assert.ok((await response.json()).error);
  const stored=await h.storage.getState('run',id);assert.equal(stored.state.run.status,'awaiting_confirmation');assert.equal(stored.state.run.approvedCriteria,null);assert.equal(stored.lease,null);
});

test('failed initial persistence returns an error without starting analysis',async()=>{
  const h=harness();h.storage.failStateWrites=true;
  const response=await h.request('/api/runs',{method:'POST',body:{mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'}});
  assert.equal(response.status,500);assert.ok((await response.json()).error);assert.equal(h.calls.discover,0);assert.equal(h.storage.states.size,0);
});

test('a failed executing checkpoint cannot invoke analysis',async()=>{
  const h=harness(),id=await h.start();h.storage.failStateWrites=true;await h.events(id);
  assert.equal(h.calls.discover,0);const stored=await h.storage.getState('run',id);assert.equal(stored.state.run.pendingJob.state,'queued');assert.equal(stored.lease,null);
});

test('off-origin mutations are forbidden before storage or provider activity',async()=>{
  const h=harness(),response=await h.request('/api/runs',{method:'POST',headers:{origin:'https://untrusted.example'},body:{mode:'criteria_first',criteriaText:'Strength 30 MPa 이상'}});
  assert.equal(response.status,403);assert.ok((await response.json()).error);assert.equal(h.storage.writes.length,0);assert.equal(h.calls.discover,0);
});

test('missing session secret returns a service error even for an unknown path',async()=>{
  const h=harness(),response=await h.request('/api/unknown',{environment:{...env,SESSION_SECRET:''}});
  assert.equal(response.status,503);assert.ok((await response.json()).error);assert.equal(h.storage.writes.length,0);
});

test('multipart uploads enforce the byte limit without a Content-Length header',async()=>{
  const h=harness(),boundary='test-upload-boundary',encoder=new TextEncoder();let chunks=0;
  const body=new ReadableStream({pull(controller){
    if(chunks===0)controller.enqueue(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="role"\r\n\r\ntarget\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="large.txt"\r\nContent-Type: text/plain\r\n\r\n`));
    else if(chunks<=22)controller.enqueue(new Uint8Array(1024*1024).fill(65));
    else {controller.enqueue(encoder.encode(`\r\n--${boundary}--\r\n`));controller.close();}
    chunks++;
  }});
  const response=await h.request('/api/documents',{method:'POST',headers:{'content-type':`multipart/form-data; boundary=${boundary}`},body});
  assert.equal(response.status,413,await response.clone().text());assert.ok((await response.json()).error);assert.equal(h.storage.documents.size,0);assert.equal(h.calls.analyze,0);
});

test('request aborted during stored document loading never starts a provider',async()=>{
  const h=harness(),form=new FormData();form.set('role','criteria');form.append('files',new Blob(['Strength 30 MPa minimum']),'criteria.txt');
  const uploaded=await h.request('/api/documents',{method:'POST',body:form});assert.equal(uploaded.status,201);
  const document=(await uploaded.json()).documents[0],id=await h.start({criteriaDocumentIds:[document.id]});
  let entered,release;const loading=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const getDocument=h.storage.getDocument.bind(h.storage);
  h.storage.getDocument=async key=>{entered();await gate;return getDocument(key);};
  const abort=new AbortController(),response=await h.request(`/api/runs/${id}/events`,{signal:abort.signal});
  const consumed=response.text().catch(()=>null);await loading;abort.abort();release();await consumed;await Promise.all(h.pending);
  assert.equal(h.calls.analyze,0);assert.equal(h.calls.discover,0);const saved=await h.storage.getState('run',id);assert.equal(saved.state.run.status,'cancelled');assert.equal(saved.lease,null);
});

test('ledger analysis cache persists across fresh requests and increments its document revision once',async()=>{
  const h=harness(),document=await uploadLedger(h),body={documentId:document.id,key:'R-42'};
  assert.equal((await h.storage.getDocument(document.id)).revision,1);
  const first=await h.request('/api/ledgers/analyze',{method:'POST',body});assert.equal(first.status,200,await first.clone().text());
  const firstResult=await first.json();assert.equal(firstResult.mapping.status,'ready');assert.deepEqual(firstResult.mapping.targetCells,['B2','C2']);assert.equal(firstResult.analysis.status,'complete');
  const persisted=await h.storage.getDocument(document.id);assert.equal(persisted.revision,2);assert.equal(persisted.document.sandboxAnalysisResult.analysis.status,'complete');assert.equal(h.calls.analyze,1);
  const second=await h.request('/api/ledgers/analyze',{method:'POST',body});assert.equal(second.status,200,await second.clone().text());assert.deepEqual(await second.json(),firstResult);
  assert.equal(h.calls.analyze,1);assert.equal((await h.storage.getDocument(document.id)).revision,2);
  assert.equal((await h.storage.getState('activity',`ledger-${document.id}`)).lease,null);
});

test('concurrent ledger requests cannot duplicate paid analysis',async()=>{
  let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const h=harness({analyze:async()=>{entered();await gate;}}),document=await uploadLedger(h),body={documentId:document.id,key:'R-42'};
  const first=h.request('/api/ledgers/analyze',{method:'POST',body});await started;
  try {
    const concurrent=await h.request('/api/ledgers/analyze',{method:'POST',body});assert.equal(concurrent.status,409);assert.ok((await concurrent.json()).error);assert.equal(h.calls.analyze,1);
  }finally{release();}
  const completed=await first;assert.equal(completed.status,200,await completed.clone().text());assert.equal((await completed.json()).mapping.status,'ready');
  assert.equal(h.calls.analyze,1);assert.equal((await h.storage.getDocument(document.id)).revision,2);assert.equal((await h.storage.getState('activity',`ledger-${document.id}`)).lease,null);
});

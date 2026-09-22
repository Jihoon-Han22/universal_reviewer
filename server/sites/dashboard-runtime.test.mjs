import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {handleApi} from './runtime.mjs';
import {serializeRun} from './engine-state.mjs';

const origin='https://reviewer.example';
const env={GEMINI_API_KEY:'mock-gemini-key',E2B_API_KEY:'mock-e2b-key',SESSION_SECRET:'test-only-session-secret-at-least-32-characters'};
const clone=value=>structuredClone(value);
const conflict=()=>{throw Object.assign(new Error('Stored version changed'),{name:'StorageConflictError',status:409});};

// Clone every stored value so GETs and providers can only observe committed state.
class DashboardStorage {
 states=new Map();
 writes=[];
 failExecutingWrite=false;
 async init(){}
 async listDocuments(){return [];}
 async listStates(kind){return [...this.states].filter(([key])=>key.startsWith(`${kind}:`)).map(([key,record])=>({id:key.slice(kind.length+1),status:record.state.run?.status??record.state.status,revision:record.revision}));}
 async getState(kind,id){const record=this.states.get(`${kind}:${id}`);return record?clone(record):null;}
 createState(kind,id,state){return this.putState(kind,id,state,{expectedRevision:0});}
 async putState(kind,id,state,{expectedRevision,lease}={}){
  if(this.failExecutingWrite&&kind==='dashboard'&&state.pending?.state==='executing')throw new Error('Simulated checkpoint outage');
  const key=`${kind}:${id}`,prior=this.states.get(key);
  if((prior?.revision??0)!==expectedRevision)conflict();
  if(prior?.lease?.expiresAt>Date.now()&&(!lease||lease.owner!==prior.lease.owner||lease.fence!==prior.lease.fence))conflict();
  if(lease&&(!prior?.lease||lease.owner!==prior.lease.owner||lease.fence!==prior.lease.fence||prior.lease.expiresAt<=Date.now()))conflict();
  this.states.set(key,{state:clone(state),revision:expectedRevision+1,lease:clone(prior?.lease??null),fence:prior?.fence??0,cancelRequested:prior?.cancelRequested??false});
  this.writes.push({kind,id,state:clone(state)});return {revision:expectedRevision+1};
 }
 async acquireLease(kind,id){const record=this.states.get(`${kind}:${id}`);if(!record||record.lease?.expiresAt>Date.now())return null;record.lease={owner:randomUUID(),fence:++record.fence,expiresAt:Date.now()+90000};return clone(record.lease);}
 async renewLease(kind,id,lease){const record=this.states.get(`${kind}:${id}`);if(record?.lease?.owner!==lease.owner||record.lease.fence!==lease.fence)return null;record.lease.expiresAt=Date.now()+90000;return clone(record.lease);}
 async releaseLease(kind,id,lease){const record=this.states.get(`${kind}:${id}`);if(record?.lease?.owner!==lease.owner||record.lease.fence!==lease.fence)return false;record.lease=null;return true;}
 async requestCancel(kind,id){const record=this.states.get(`${kind}:${id}`);if(!record)return false;record.cancelRequested=true;return true;}
 async isCancelRequested(kind,id){return Boolean(this.states.get(`${kind}:${id}`)?.cancelRequested);}
 async deleteState(kind,id){return this.states.delete(`${kind}:${id}`);}
}

async function harness({generateText}={}){
 const storage=new DashboardStorage(),calls={model:0,sandbox:0},pending=[];
 const run={id:'completed-review',status:'completed',criterionVersion:3,createdAt:new Date().toISOString(),documentIds:[],criteriaDocumentIds:[],analysisDocumentIds:[],documents:[{id:'source-1',name:'inspection.csv',role:'target',status:'completed'}],items:[{id:'item-1',documentId:'source-1',label:'Strength',value:'31',unit:'MPa',criterion:'30 MPa minimum',status:'pass',evidence:[{documentId:'source-1',sheet:'Results',cell:'B2',quote:'31'}]}]};
 await storage.createState('run',run.id,serializeRun(run));
 const gemini={generateText:async args=>{
  calls.model++;
  const records=await storage.listStates('dashboard');
  const saved=await storage.getState('dashboard',records[0].id);
  assert.equal(saved.state.pending.state,'executing','checkpoint must be durable before provider work');
  return generateText?generateText(args):{text:JSON.stringify({title:'Inspection',subtitle:'Verified results',accent:'cobalt',focus:'overview',density:'comfortable'})};
 }};
 const withSandbox=async work=>{
  calls.sandbox++;
  const files=new Map();
  return work({files:{write:async entries=>{for(const {path,data} of entries)files.set(path,data);},read:async path=>{
   if(!path.endsWith('/validation.json'))return files.get(path);
   const snapshot=JSON.parse(files.get('/home/user/review-dashboard/data.json'));
   return JSON.stringify({version:1,ok:true,engine:'node-dom',visualBrowser:false,checks:Object.fromEntries(['input','syntax','csp','offline','kpis','charts','files','findings','filters','details','escaping'].map(check=>[check,true])),diagnostics:[],totals:snapshot.summary,files:new Set(snapshot.items.map(item=>item.documentId)).size});
  }},commands:{run:async()=>({exitCode:0,stdout:'',stderr:''})}},Object.assign(()=>{},{taskId:'mock-dashboard-sandbox'}));
 };
 let cookie;
 const request=async(path,{method='GET',body,signal}={})=>{
  const headers=new Headers();if(cookie)headers.set('cookie',cookie);if(method!=='GET')headers.set('origin',origin);if(body!==undefined)headers.set('content-type','application/json');
  const response=await handleApi(new Request(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal}),env,{waitUntil:work=>pending.push(work)},{storage,gemini,withSandbox});
  cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;return response;
 };
 const create=async()=>{const response=await request('/api/dashboards',{method:'POST',body:{runId:run.id,instruction:'라이트 테마에 도넛 차트'}});assert.equal(response.status,202,await response.clone().text());return response.json();};
 const events=async id=>{const response=await request(`/api/dashboards/${id}/events`);assert.equal(response.status,200);const result=await response.text();await Promise.all(pending);return result;};
 return {storage,calls,pending,request,create,events};
}

test('Worker dashboard POST queues without providers and SSE persists the generated artifact for fresh GETs',async()=>{
 const h=await harness(),queued=await h.create();
 assert.equal(queued.status,'queued');assert.equal(queued.eventsUrl,`/api/dashboards/${queued.id}/events`);
 assert.deepEqual(h.calls,{model:0,sandbox:0});
 const initial=(await h.storage.getState('dashboard',queued.id)).state;
 assert.equal(initial.pending.state,'queued');assert.equal(initial.html,undefined);
 const inspected=await h.request(`/api/dashboards/${queued.id}`);assert.equal((await inspected.json()).status,'queued');
 const events=await h.events(queued.id),saved=await h.storage.getState('dashboard',queued.id);
 assert.match(events,/event: complete/);assert.deepEqual(h.calls,{model:1,sandbox:1});
 assert.equal(saved.state.status,'ready');assert.equal(saved.state.presentation,'generated');assert.equal(saved.state.pending,undefined);assert.equal(saved.lease,null);
 assert.ok(saved.state.html.length>1000);assert.equal(saved.state.validation.ok,true);
 const response=await h.request(`/api/dashboards/${queued.id}`),result=await response.json();
 assert.equal(response.status,200);assert.equal(result.html,saved.state.html);assert.equal(result.design.theme,'light');assert.equal(result.sourceItems[0].evidence[0].cell,'B2');assert.equal(result.eventsUrl,undefined);
 await h.events(queued.id);assert.deepEqual(h.calls,{model:1,sandbox:1});
});

test('Worker dashboard inspection preserves executing status and expired execution fails without provider replay',async()=>{
 const h=await harness(),queued=await h.create(),record=h.storage.states.get(`dashboard:${queued.id}`);
 record.state.status='building';record.state.pending={state:'executing'};record.state.attempt=1;record.lease={owner:'expired-owner',fence:1,expiresAt:Date.now()-1};record.fence=1;
 const inspected=await h.request(`/api/dashboards/${queued.id}`);assert.equal((await inspected.json()).status,'building');assert.equal(record.state.status,'building');
 const events=await h.events(queued.id),saved=await h.storage.getState('dashboard',queued.id);
 assert.match(events,/event: complete/);assert.deepEqual(h.calls,{model:0,sandbox:0});
 assert.equal(saved.state.status,'failed');assert.match(saved.state.error,/중단/);assert.equal(saved.state.pending,undefined);assert.equal(saved.lease,null);
});

test('Worker dashboard provider failure persists the same standard fallback as Node',async()=>{
 const h=await harness({generateText:async()=>{throw Object.assign(new Error('mock provider unavailable'),{name:'IntegrationError'});}}),queued=await h.create();
 await h.events(queued.id);
 const saved=await h.storage.getState('dashboard',queued.id),response=await h.request(`/api/dashboards/${queued.id}`),result=await response.json();
 assert.deepEqual(h.calls,{model:1,sandbox:0});assert.equal(result.status,'ready');assert.equal(result.presentation,'standard');assert.equal(result.html,saved.state.html);assert.equal(result.design.theme,'light');
});

test('Worker dashboard does not call a provider when the durable executing checkpoint fails',async()=>{
 const h=await harness(),queued=await h.create();h.storage.failExecutingWrite=true;
 await h.events(queued.id);
 const saved=await h.storage.getState('dashboard',queued.id);
 assert.deepEqual(h.calls,{model:0,sandbox:0});assert.equal(saved.state.pending.state,'queued');assert.equal(saved.lease,null);
});

test('disconnecting a Worker dashboard stream aborts generation without rendering a fallback',async()=>{
 let enter;const entered=new Promise(resolve=>{enter=resolve;});
 const h=await harness({generateText:async({signal})=>{enter();await new Promise((_resolve,reject)=>{const abort=()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'}));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});}}),queued=await h.create();
 const response=await h.request(`/api/dashboards/${queued.id}/events`),reader=response.body.getReader();
 await entered;await reader.cancel();await Promise.all(h.pending);
 const saved=await h.storage.getState('dashboard',queued.id);
 assert.deepEqual(h.calls,{model:1,sandbox:0});assert.equal(saved.state.status,'failed');assert.match(saved.state.error,/취소/);assert.equal(saved.state.html,undefined);assert.equal(saved.lease,null);
});

test('dashboard complete is sent only after durable completion and immediate reader close preserves it',async()=>{
 const h=await harness(),queued=await h.create();
 let enter,release;
 const saving=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const putState=h.storage.putState.bind(h.storage);
 h.storage.putState=async(kind,id,state,options)=>{
  if(kind==='dashboard'&&state.status==='ready'){enter();await gate;}
  return putState(kind,id,state,options);
 };
 const response=await h.request(`/api/dashboards/${queued.id}/events`),reader=response.body.getReader(),decoder=new TextDecoder();
 let terminalDelivered=false,received='';
 const consume=(async()=>{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   received+=decoder.decode(value,{stream:true});
   if(received.includes('event: complete')){terminalDelivered=true;await reader.cancel();break;}
  }
 })();
 try{
  await saving;
  assert.equal(terminalDelivered,false);
  const uncommitted=await h.storage.getState('dashboard',queued.id);
  assert.equal(uncommitted.state.pending.state,'executing');assert.notEqual(uncommitted.state.status,'ready');
 }finally{release();}
 await consume;await Promise.all(h.pending);
 const saved=await h.storage.getState('dashboard',queued.id);
 assert.equal(terminalDelivered,true);assert.equal(saved.state.status,'ready');assert.equal(saved.state.pending,undefined);assert.equal(saved.lease,null);assert.ok(saved.state.html.length>1000);assert.deepEqual(h.calls,{model:1,sandbox:1});
});

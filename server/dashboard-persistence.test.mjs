import test from 'node:test';
import assert from 'node:assert/strict';
import {createDashboardService} from './dashboard.mjs';

const completedRun={id:'run-1',status:'completed',criterionVersion:2,documents:[{id:'doc-1',name:'Review.csv'}],items:[{id:'item-1',documentId:'doc-1',label:'Value',value:'12',unit:'mm',criterion:'10 or more',status:'pass'}]};
function setup(options={}){
 const service=createDashboardService({engine:{get:()=>completedRun},deferExecution:true,...options}),routes=new Map();
 service.registerRoutes(Object.fromEntries(['post','get','delete'].map(method=>[method,(path,handler)=>routes.set(`${method} ${path}`,handler)])));
 function create(){const response={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};routes.get('post /api/dashboards')({body:{runId:completedRun.id}},response);return response;}
 return {service,create};
}

test('deferred dashboard persists its queued descriptor and durable start precedes provider work',async()=>{
 const order=[];
 const {service,create}=setup({gemini:{generateText:async()=>{order.push('provider');throw Object.assign(new Error('offline fixture'),{name:'IntegrationError'});}}});
 const response=create(),job=service.jobs.get(response.body.id);
 assert.equal(response.statusCode,202);
 assert.equal(response.body.eventsUrl,`/api/dashboards/${job.id}/events`);
 await Promise.resolve();
 assert.deepEqual(order,[]);
 const queued=service.serializeJob(job);
 assert.deepEqual(queued.pending,{state:'queued'});
 assert.equal(queued.controller,undefined);
 assert.equal(queued.work,undefined);
 const options={beforeExecute:async current=>{assert.deepEqual(service.serializeJob(current).pending,{state:'executing'});order.push('persist');}};
 const first=service.executePendingJob(job,options),second=service.executePendingJob(job.id,options);
 assert.equal(first,second);
 await first;
 assert.deepEqual(order,['persist','provider']);
 assert.equal(job.status,'ready');
 assert.equal(job.presentation,'standard');
 assert.equal(job.pending,undefined);
 const stored=service.serializeJob(job),restored=setup().service.hydrateJob(stored);
 assert.equal(restored.html,job.html);
 assert.deepEqual(restored.design,job.design);
 assert.deepEqual(restored.snapshot,job.snapshot);
 assert.ok(Object.isFrozen(restored.snapshot));
 assert.ok(restored.controller instanceof AbortController);
});

test('dashboard failed durable start is retryable without making provider requests',async()=>{
 let calls=0;
 const {service,create}=setup({gemini:{generateText:async()=>{calls++;throw Object.assign(new Error('offline fixture'),{name:'IntegrationError'});}}});
 const job=service.jobs.get(create().body.id);
 await assert.rejects(service.executePendingJob(job,{beforeExecute:()=>{throw new Error('storage unavailable');}}),/storage unavailable/);
 assert.equal(calls,0);
 assert.equal(job.pending.state,'queued');
 assert.equal(job.work,undefined);
 await service.executePendingJob(job);
 assert.equal(calls,1);
});

test('inspecting and recovering an executing dashboard never repeats provider work',async()=>{
 let calls=0;
 const original=setup(),job=original.service.jobs.get(original.create().body.id);
 job.pending={state:'executing'};job.status='building';job.attempt=1;
 const state=original.service.serializeJob(job),{service}=setup({gemini:{generateText:async()=>{calls++;}}});
 const inspected=service.hydrateJob(state);
 assert.equal(inspected.status,'building');
 await service.executePendingJob(inspected);
 assert.equal(calls,0);
 const interrupted=service.hydrateJob(state,{recoverInterrupted:true});
 assert.equal(interrupted.status,'failed');
 assert.match(interrupted.error,/중단/);
 assert.equal(interrupted.pending,undefined);
 await service.executePendingJob(interrupted);
 assert.equal(calls,0);
});

test('deleting a queued dashboard releases the active slot and Node starts automatically',async()=>{
 const deferred=setup(),first=deferred.create();
 assert.equal(deferred.create().statusCode,409);
 assert.equal(deferred.service.deleteJob(first.body.id),true);
 assert.equal(deferred.create().statusCode,202);
 let calls=0;
 const node=setup({deferExecution:false,gemini:{generateText:async()=>{calls++;throw Object.assign(new Error('offline fixture'),{name:'IntegrationError'});}}});
 const response=node.create(),job=node.service.jobs.get(response.body.id);
 assert.equal(response.body.eventsUrl,undefined);
 await job.work;
 assert.equal(calls,1);
 assert.equal(job.status,'ready');
});

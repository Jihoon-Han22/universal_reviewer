import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {documentSandboxResources} from './document-sandbox-resources.mjs';
const defer=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture(){
  const document={id:'source',kind:'txt',buffer:Buffer.from('authored')},sha256=createHash('sha256').update(document.buffer).digest('hex'),started=defer(),gate=defer(),writes=[],commands=[];let active=0,maximum=0,reads=0;
  const sandbox={files:{write:async(first,data)=>{for(const item of Array.isArray(first)?first:[{path:first,data}])writes.push(item.path);},read:async()=>JSON.stringify({kind:'txt',sha256,inventory:{},coverage:{complete:true},warnings:[],selections:[{request:{kind:'text',start:1,end:1},source:'authored'}]})},commands:{run:async command=>{commands.push(command);active++;maximum=Math.max(maximum,active);try{if(command.includes('document-requery.py')&&++reads===1){started.resolve();await gate.promise;}return {exitCode:0,stdout:'',stderr:''};}finally{active--;}}}};
  return {document,sandbox,started,gate,writes,commands,get maximum(){return maximum;}};
}
const requests=[{kind:'text',start:1,end:1}];
test('retained session admits one active plus100 pending and rejects the102nd before it runs',async()=>{
  const f=fixture(),resources=documentSandboxResources(f.sandbox,f.document),first=resources.requery(requests);await f.started.promise;
  const waiting=Array.from({length:100},()=>resources.requery(requests));await assert.rejects(resources.requery(requests),{code:'POOL_FULL',status:429});assert.equal(f.maximum,1);
  f.gate.resolve();await Promise.all([first,...waiting]);
  assert.equal(f.commands.filter(command=>command.includes('document-requery.py')).length,101);assert.equal(f.commands.filter(command=>command.includes('pip install')).length,1);assert.equal(f.writes.filter(name=>name.endsWith('document-input.bin')).length,1);
  assert.throws(()=>documentSandboxResources(f.sandbox,{...f.document,buffer:Buffer.from('changed')}),/식별자/);
});
test('queued caller abort rejects before active owner settles without executing queued command',async()=>{
  const f=fixture(),owner=documentSandboxResources(f.sandbox,f.document),controller=new AbortController(),waiter=documentSandboxResources(f.sandbox,f.document,{signal:controller.signal});
  const first=owner.requery(requests);await f.started.promise;const queued=waiter.requery(requests);controller.abort();await assert.rejects(queued,{name:'AbortError'});assert.equal(f.commands.filter(command=>command.includes('document-requery.py')).length,1);
  f.gate.resolve();await first;assert.equal(f.maximum,1);
});
test('active caller cancellation retains the local slot until the underlying command settles',async()=>{
  const f=fixture(),controller=new AbortController(),owner=documentSandboxResources(f.sandbox,f.document,{signal:controller.signal}),waiter=documentSandboxResources(f.sandbox,f.document);
  const first=owner.requery(requests),rejected=assert.rejects(first,{name:'AbortError'});await f.started.promise;
  const queued=waiter.requery(requests);controller.abort();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.commands.filter(command=>command.includes('document-requery.py')).length,1);assert.equal(f.maximum,1);
  f.gate.resolve();await Promise.all([rejected,queued]);assert.equal(f.maximum,1);assert.equal(f.commands.filter(command=>command.includes('document-requery.py')).length,2);
});

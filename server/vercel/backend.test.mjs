import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createPostgresBinding} from './postgres.mjs';
import {handleApi} from '../sites/runtime.mjs';
import {registerChunkedUploads} from './uploads.mjs';
import {SitesStorage} from '../sites/storage.mjs';

test('Postgres-backed API persists samples, chunked uploads and isolates sessions',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 const client={async query(sql,values){const r=await pg.query(sql,values);return {rows:r.rows,rowCount:r.affectedRows};},release(){}};
 const DB=createPostgresBinding({...client,async connect(){return client;}}),objects=new Map();
 const BUCKET={async put(key,value){objects.set(key,Buffer.from(value));},async get(key){const bytes=objects.get(key);if(!bytes)return null;return {body:new Blob([bytes]).stream(),text:async()=>bytes.toString(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)};},async delete(key){objects.delete(key);}};
 const env={DB,BUCKET,SESSION_SECRET:'t'.repeat(40),RUNTIME:'vercel'};let cookie='';
 async function call(path,{method='GET',json,body,anonymous=false}={}){const r=await handleApi(new Request('https://test.example'+path,{method,headers:{origin:'https://test.example',...(!anonymous&&cookie?{cookie}:{}),...(json?{'content-type':'application/json'}:{})},body:json?JSON.stringify(json):body}),env,{}, {configureRuntime:registerChunkedUploads});if(!anonymous)cookie=r.headers.get('set-cookie')?.split(';')[0]||cookie;return r;}
 const sample=await call('/api/samples',{method:'POST',json:{kind:'expenses'}});assert.equal(sample.status,201);const doc=(await sample.json()).documents[0];assert.equal((await call(doc.url)).status,200);assert.equal((await call(doc.url,{anonymous:true})).status,404);
 const ticketResponse=await call('/api/uploads',{method:'POST',json:{name:'criteria.txt',role:'criteria',size:8}});assert.equal(ticketResponse.status,201);const ticket=await ticketResponse.json();
 assert.equal((await call(`/api/uploads/${ticket.uploadId}/parts/0`,{method:'PUT',body:Buffer.from('max 3000')})).status,200);
 const completed=await call('/api/documents',{method:'POST',json:{uploadId:ticket.uploadId}});assert.equal(completed.status,201);const uploaded=(await completed.json()).documents[0];assert.equal(await (await call(uploaded.url)).text(),'max 3000');
 const retry=await call('/api/documents',{method:'POST',json:{uploadId:ticket.uploadId}});assert.equal((await retry.json()).documents[0].id,uploaded.id);
 const storage=new SitesStorage({db:DB,bucket:BUCKET,sessionId:'lease-test'});await storage.init();await storage.createState('run','one',{status:'queued'});const lease=await storage.acquireLease('run','one');assert.ok(lease);assert.equal(await storage.acquireLease('run','one'),null);await storage.putState('run','one',{status:'completed'},{expectedRevision:1,lease});assert.equal(await storage.releaseLease('run','one',lease),true);assert.equal((await storage.getState('run','one')).state.status,'completed');
 const policies=await pg.query("SELECT relrowsecurity FROM pg_class WHERE relname='review_objects'");assert.equal(policies.rows[0].relrowsecurity,true);
});

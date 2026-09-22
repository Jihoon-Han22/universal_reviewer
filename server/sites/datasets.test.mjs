import test from 'node:test';
import assert from 'node:assert/strict';
import {serveDataset} from './datasets.mjs';
const originals=[Buffer.from('abcdef'),Buffer.from('ghijkl'),Buffer.from('mnop')];
const files={'/data/test.pdf':{size:16,sha256:'test-hash',mime:'application/pdf',chunks:originals.map((part,i)=>({path:`/parts/${i}`,size:part.length}))}};
const env={ASSETS:{async fetch(request){const part=originals[Number(new URL(request.url).pathname.split('/').at(-1))];const [,start,end]=/bytes=(\d+)-(\d+)/.exec(request.headers.get('Range'));return new Response(part.subarray(Number(start),Number(end)+1),{status:206});}}};
test('large datasets stream original bytes and single byte ranges across chunks',async()=>{
 for(const [range,expected,status]of [[null,'abcdefghijklmnop',200],['bytes=4-9','efghij',206],['bytes=-4','mnop',206],['bytes=10-','klmnop',206],['bytes=0-0','a',206]]){
  const response=await serveDataset(new Request('https://site.test/data/test.pdf',{headers:range?{Range:range}:{}}),env,files);
  assert.equal(response.status,status);assert.equal(response.headers.get('Content-Length'),String(expected.length));assert.equal(await response.text(),expected);
 }
});
test('dataset HEAD, invalid ranges, cache conditions and unrelated paths',async()=>{
 const head=await serveDataset(new Request('https://site.test/data/test.pdf',{method:'HEAD'}),env,files);assert.equal(head.headers.get('Content-Length'),'16');assert.equal(await head.text(),'');
 for(const range of ['bytes=99-100','bytes=3-1','bytes=-0','bytes=0-1,3-4'])assert.equal((await serveDataset(new Request('https://site.test/data/test.pdf',{headers:{Range:range}}),env,files)).status,416);
 assert.equal((await serveDataset(new Request('https://site.test/data/test.pdf',{headers:{'If-None-Match':'"test-hash"'}}),env,files)).status,304);
 assert.equal(await serveDataset(new Request('https://site.test/other'),env,files),null);
});
test('asset bindings that ignore Range still return exactly the requested bytes',async()=>{
 const fullAssets={ASSETS:{async fetch(request){return new Response(originals[Number(new URL(request.url).pathname.split('/').at(-1))]);}}};
 for(const [range,expected]of [['bytes=4-9','efghij'],['bytes=0-0','a'],['bytes=-4','mnop']]){
  const response=await serveDataset(new Request('https://site.test/data/test.pdf',{headers:{Range:range}}),fullAssets,files);
  assert.equal(response.status,206);assert.equal(await response.text(),expected);
 }
});

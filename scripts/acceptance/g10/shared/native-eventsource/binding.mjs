// Parent must execute this bounded SDK check before attaching the observer.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const SDK_SOURCE_SHA256='83f8c03ae28d3979b57f005ef530321fe064a279cf446b526bd28e61f707540f';
export function verifyNativeEventSourceBinding(file=new URL('./sdk-source.json',import.meta.url)){
 const bytes=fs.readFileSync(file),sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(bytes),SDK_SOURCE_SHA256);const source=JSON.parse(bytes);assert.equal(source.version,'1.62.1');
 for(const r of source.refs){const b=fs.readFileSync(r.path);assert.equal(b.length,r.bytes);assert.equal(sha(b),r.sha256);}
 return {kind:'verified-native-eventsource-sdk-binding',version:source.version,sourceSha256:SDK_SOURCE_SHA256,refs:source.refs};
}

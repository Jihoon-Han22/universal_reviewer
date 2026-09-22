import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMutationOrigin, resolveSession } from './auth.mjs';

const env={SESSION_SECRET:'test-secret-that-is-at-least-thirty-two-bytes-long'};
test('session cookie is signed, stable and isolated from forged identity headers',async()=>{
  const first=await resolveSession(new Request('https://review.test/api/health'),env);
  assert.match(first.cookie,/HttpOnly; Secure; SameSite=Strict/);
  const cookie=first.cookie.split(';')[0];
  const restored=await resolveSession(new Request('https://review.test/api/health',{headers:{cookie,'oai-authenticated-user-id':'spoofed'}}),env);
  assert.equal(restored.id,first.id);assert.equal(restored.cookie,undefined);
  const forged=await resolveSession(new Request('https://review.test/api/health',{headers:{cookie:cookie.slice(0,-1)+(cookie.endsWith('a')?'b':'a')}}),env);
  assert.notEqual(forged.id,first.id);
  const other=await resolveSession(new Request('https://review.test/api/health'),env);assert.notEqual(other.id,first.id);
});
test('mutation origins require full exact same origin',()=>{
  for(const origin of [undefined,'https://evil.test','https://review.test.evil.test','http://review.test','null'])assert.throws(()=>assertMutationOrigin(new Request('https://review.test/api/runs',{method:'POST',headers:origin?{origin}:{}})),error=>error.status===403);
  assert.doesNotThrow(()=>assertMutationOrigin(new Request('https://review.test/api/runs',{method:'POST',headers:{origin:'https://review.test'}})));
  assert.doesNotThrow(()=>assertMutationOrigin(new Request('https://review.test/api/health')));
});
test('missing deployment session secret fails closed',async()=>{await assert.rejects(resolveSession(new Request('https://review.test/api/health'),{}),error=>error.status===503);});

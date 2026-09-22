import { deepFreeze } from '../review.mjs';

const runtimeFields = new Set(['controller','listeners','job','resume','executingJobId','externalizedOriginalDocuments']);
const marker = '__reviewStoredType';
const originalMarker = '__reviewOriginal';

function bytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer,value.byteOffset,value.byteLength);
  return null;
}

function sameBase64(value, buffer) {
  if (value.length !== Math.ceil(buffer.length / 3) * 4) return false;
  // Multiples of three preserve base64 chunk boundaries without allocating
  // another complete 27 MB string for each 20 MB uploaded original.
  const chunkBytes = 24_576;
  for (let offset=0;offset<buffer.length;offset+=chunkBytes) {
    const expected=buffer.subarray(offset,Math.min(offset+chunkBytes,buffer.length)).toString('base64');
    if (!value.startsWith(expected,offset / 3 * 4)) return false;
  }
  return true;
}

/** Replace only exact duplicates of an already separately stored original. */
export function externalizeOriginals(value, { documentId, buffer } = {}) {
  const original=bytes(buffer);
  if (!original || typeof documentId !== 'string' || !documentId) throw new TypeError('An original document id and bytes are required');
  const reference=representation=>({[originalMarker]:1,documentId,representation});
  const walk=(entry,parentKey='',literal=false)=>{
    if (entry === null || typeof entry !== 'object') return entry;
    const binary=bytes(entry);
    if (binary) return binary.length===original.length && binary.equals(original) ? reference('bytes') : entry;
    if (entry instanceof Date) return entry;
    if (entry instanceof Map) return new Map([...entry].map(([key,item])=>[key,walk(item)]));
    if (Array.isArray(entry)) return entry.map(item=>walk(item));
    // Escape even malformed literal marker objects. User data cannot become a
    // storage reference when the snapshot is subsequently restored.
    if (!literal && Object.hasOwn(entry,originalMarker)) return {[originalMarker]:0,value:walk(entry,parentKey,true)};
    return Object.fromEntries(Object.entries(entry).map(([key,item])=>[key,parentKey==='inlineData' && key==='data' && typeof item==='string' && sameBase64(item,original) ? reference('base64') : walk(item,key)]));
  };
  return walk(value);
}

/** Restore references using only the matching document's separately read bytes. */
export function restoreOriginals(value, { documentId, buffer, base64: storedBase64 } = {}) {
  const original=bytes(buffer);
  if (!original || typeof documentId !== 'string' || !documentId) throw new TypeError('An original document id and bytes are required');
  if (storedBase64 !== undefined && (typeof storedBase64 !== 'string' || !sameBase64(storedBase64,original))) throw new TypeError('Original base64 does not match the document');
  let base64=storedBase64;
  const walk=(entry,literal=false)=>{
    if (entry === null || typeof entry !== 'object' || bytes(entry) || entry instanceof Date) return entry;
    if (entry instanceof Map) return new Map([...entry].map(([key,item])=>[key,walk(item)]));
    if (Array.isArray(entry)) return entry.map(item=>walk(item));
    if (!literal && Object.hasOwn(entry,originalMarker)) {
      const keys=Object.keys(entry);
      if (entry[originalMarker]===0 && keys.length===2 && Object.hasOwn(entry,'value') && entry.value && typeof entry.value==='object') return walk(entry.value,true);
      if (entry[originalMarker]!==1 || keys.length!==3 || entry.documentId!==documentId || !['bytes','base64'].includes(entry.representation)) throw new Error('Invalid original document reference');
      if (entry.representation==='bytes') return original;
      return base64 ??= original.toString('base64');
    }
    return Object.fromEntries(Object.entries(entry).map(([key,item])=>[key,walk(item)]));
  };
  return walk(value);
}

// R2 snapshots contain private source material as well as the public result.
// Encode bytes explicitly: JSON.stringify(Buffer) would otherwise expand each
// uploaded file into a very large array and lose its Buffer prototype.
export function encodeState(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof ArrayBuffer) return { [marker]:'bytes', value:Buffer.from(value).toString('base64') };
  if (ArrayBuffer.isView(value)) return { [marker]:'bytes', value:Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString('base64') };
  if (value instanceof Date) return { [marker]:'date', value:value.toISOString() };
  if (value instanceof Map) return { [marker]:'map', value:[...value].map(([key,item]) => [encodeState(key),encodeState(item)]) };
  if (Array.isArray(value)) return value.map(encodeState);
  const encoded=Object.fromEntries(Object.entries(value).filter(([key,item]) => key !== 'analysisPromise' && typeof item !== 'function').map(([key,item]) => [key,encodeState(item)]));
  return Object.hasOwn(value,marker) ? {[marker]:'object',value:encoded} : encoded;
}

export function decodeState(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value[marker] === 'bytes' && typeof value.value === 'string') return Buffer.from(value.value,'base64');
  if (value[marker] === 'date' && typeof value.value === 'string') return new Date(value.value);
  if (value[marker] === 'map' && Array.isArray(value.value)) return new Map(value.value.map(([key,item]) => [decodeState(key),decodeState(item)]));
  if (value[marker] === 'object' && value.value && typeof value.value === 'object') return Object.fromEntries(Object.entries(value.value).map(([key,item]) => [key,decodeState(item)]));
  if (Array.isArray(value)) return value.map(decodeState);
  return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,decodeState(item)]));
}

export function serializeRun(run, { externalizeOriginals: externalize = false } = {}) {
  const stored=Object.fromEntries(Object.entries(run).filter(([key]) => !runtimeFields.has(key)));
  const originals=new Set(run.externalizedOriginalDocuments ?? []);
  if (externalize && run.analyzedDocuments instanceof Map) {
    stored.analyzedDocuments=new Map([...run.analyzedDocuments].map(([id,document])=>{
      if (!bytes(document?.buffer)) return [id,document];
      originals.add(id);
      return [id,externalizeOriginals(document,{documentId:id,buffer:document.buffer})];
    }));
  }
  return { version:1, run:encodeState(stored), ...(originals.size ? {externalizedOriginals:[...originals]} : {}) };
}

export function restoreRunOriginals(run, documents) {
  if (!(run.analyzedDocuments instanceof Map) || !documents?.get) throw new TypeError('A run and document store are required');
  for (const id of run.externalizedOriginalDocuments ?? []) {
    const analyzed=run.analyzedDocuments.get(id);
    if (!analyzed) throw new Error('Analyzed document is unavailable');
    const document=documents.get(id);
    if (!document) throw new Error('Original document is unavailable');
    const original=bytes(document.buffer);
    const base64=document.modelParts?.find(part=>typeof part.inlineData?.data==='string' && original && sameBase64(part.inlineData.data,original))?.inlineData.data;
    run.analyzedDocuments.set(id,restoreOriginals(analyzed,{documentId:id,buffer:document.buffer,base64}));
    run.externalizedOriginalDocuments.delete(id);
  }
  return run;
}

export function hydrateRun(state) {
  if (typeof state === 'string') state = JSON.parse(state);
  if (state?.version !== 1 || !state.run || typeof state.run.id !== 'string') throw new Error('Unsupported stored review state');
  const run = decodeState(state.run);
  for (const key of runtimeFields) delete run[key];
  run.controller = new AbortController();
  run.listeners = new Set();
  run.externalizedOriginalDocuments = new Set(state.externalizedOriginals ?? []);
  if (!(run.analyzedDocuments instanceof Map)) run.analyzedDocuments = new Map();
  if (run.approvedCriteria) deepFreeze(run.approvedCriteria);
  if (run.status === 'cancelled') run.controller.abort();
  return run;
}

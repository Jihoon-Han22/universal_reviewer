import {randomUUID} from 'node:crypto';
import {HttpError} from '../sites/router.mjs';
import {cleanFilename} from '../documents.mjs';
const CHUNK=2*1024*1024;
const LIMIT=250*1024*1024;
export function registerChunkedUploads(runtime){
 const {router,storage,env,documents}=runtime;
 const key=(id,index)=>`sessions/${storage.sessionId}/uploads/${id}/${index}`;
 const find=async id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError('업로드를 찾을 수 없습니다.',404);const found=await storage.getState('activity',`upload-${id}`);if(!found||found.state.expires<Date.now())throw new HttpError('업로드가 만료되었습니다. 다시 선택해 주세요.',404);return found;};
 router.post('/api/uploads',async(req,res)=>{const {name,role,size}=req.body??{};if(!['criteria','target','ledger'].includes(role)||!Number.isSafeInteger(size)||size<1||size>LIMIT)throw new HttpError('문서 보관 한도 안에서 파일을 선택해 주세요.',413);const id=randomUUID(),state={name:cleanFilename(name),role,size,parts:Math.ceil(size/CHUNK),expires:Date.now()+3600000,documentId:randomUUID()};await storage.createState('activity',`upload-${id}`,state);res.status(201).json({uploadId:id,chunkSize:CHUNK});});
 router.put('/api/uploads/:id/parts/:index',async(req,res)=>{const {state}=await find(req.params.id),index=Number(req.params.index);if(!Number.isSafeInteger(index)||index<0||index>=state.parts)throw new HttpError('잘못된 업로드 조각입니다.');const expected=Math.min(CHUNK,state.size-index*CHUNK),reader=req.native.body?.getReader();if(!reader)throw new HttpError('파일 데이터가 없습니다.');let size=0;const chunks=[];try{for(;;){const value=await reader.read();if(value.done)break;size+=value.value.length;if(size>expected){await reader.cancel();throw new HttpError('업로드 조각이 너무 큽니다.',413);}chunks.push(value.value);}}finally{reader.releaseLock();}if(size!==expected)throw new HttpError('파일 업로드가 완료되지 않았습니다.');await env.BUCKET.put(key(req.params.id,index),Buffer.concat(chunks,size));res.json({uploaded:true,index});});
 const route=router.routes.find(route=>route.method==='POST'&&route.pattern.test('/api/documents'));
 const multipart=route.handler;
 route.handler=async(req,res)=>{
  if(!req.body?.uploadId)return multipart(req,res);
  const id=req.body.uploadId,{state}=await find(id),existing=await storage.getDocument(state.documentId);
  if(existing){res.status(201).json({documents:[documents.public(existing.document)]});return;}
  const buffer=Buffer.alloc(state.size);let offset=0;
  for(let index=0;index<state.parts;index++){const object=await env.BUCKET.get(key(id,index));if(!object)throw new HttpError('파일 업로드가 완료되지 않았습니다.');const part=Buffer.from(await object.arrayBuffer());if(part.length!==Math.min(CHUNK,state.size-offset))throw new HttpError('업로드 데이터 길이가 다릅니다.');part.copy(buffer,offset);offset+=part.length;}
  const doc=await documents.add({name:state.name,role:state.role,buffer});documents.documents.delete(doc.id);doc.id=state.documentId;doc.url=`/api/documents/${doc.id}/content`;documents.documents.set(doc.id,doc);
  try{await runtime.persistNewDocuments();}catch(error){documents.rollback([doc]);throw error;}
  for(let index=0;index<state.parts;index++)await env.BUCKET.delete(key(id,index)).catch(()=>{});
  res.status(201).json({documents:[documents.public(doc)]});
 };
}

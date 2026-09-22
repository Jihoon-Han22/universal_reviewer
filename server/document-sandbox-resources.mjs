import {readResourceText} from './sites/resources.mjs';
import {createHash} from 'node:crypto';
import {runObservedCommand,TaskPool} from '../integrations/src/index.mjs';
const states=new WeakMap(),sources=new Map();
const kinds=new Set(['pdf','docx','xlsx','csv','txt','md','json','png','jpg','jpeg','webp']);
export class SandboxDocumentError extends Error { constructor(message='문서 샌드박스 분석에 실패했습니다.',code='SANDBOX_DOCUMENT_FAILED'){super(message);this.name='SandboxDocumentError';this.code=code;} }
const abort=signal=>{if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');};
function script(name){if(!sources.has(name))sources.set(name,readResourceText(`server/${name}`));return sources.get(name);}
export function documentSandboxResources(sandbox,document,{signal,report=()=>{}}={}) {
  if(!kinds.has(document.kind)||!document.buffer?.byteLength)throw new SandboxDocumentError('지원하지 않는 원본 문서입니다.');
  const sha256=createHash('sha256').update(document.buffer).digest('hex');let state=states.get(sandbox);
  if(state&&(state.id!==document.id||state.kind!==document.kind||state.sha256!==sha256))throw new SandboxDocumentError('한 샌드박스에서 원본 문서 식별자가 변경되었습니다.');
  if(!state){state={id:document.id,kind:document.kind,sha256,pool:new TaskPool(1)};states.set(sandbox,state);}
  const command=async(text,step,timeoutMs=180000)=>{abort(signal);const result=await runObservedCommand(sandbox,text,{step,title:step==='install'?'문서 해석 도구 준비':'신뢰 원문 읽기',timeoutMs,requestTimeoutMs:timeoutMs+5000,outputKind:step==='install'?'packages':'reader',onActivity:report,signal});abort(signal);if(result.exitCode!==0)throw new SandboxDocumentError('신뢰 원문 읽기 작업이 완료되지 않았습니다.');return result;};
  const serial=work=>state.pool.submit(()=>{abort(signal);return work();},signal);
  const prepare=async()=>{
    state.sourcePromise??=(async()=>{report({step:'files',status:'running',title:'원본 파일 전달'});await sandbox.files.write([{path:'/home/user/document-input.bin',data:Uint8Array.from(document.buffer).buffer},{path:'/home/user/document-reader.py',data:await script('sandbox-document-reader.py')}]);report({step:'files',status:'completed',title:'원본 파일 전달 완료'});})();await state.sourcePromise;
    state.parsersPromise??=command('python -m pip install --disable-pip-version-check --no-input openpyxl==3.1.5 python-docx==1.1.2 PyMuPDF==1.26.4 Pillow==11.3.0','install',90000);await state.parsersPromise;
  };
  const admit=raw=>{if(Buffer.byteLength(raw,'utf8')>32*1024*1024)throw new SandboxDocumentError('원문 분석 결과 크기 한도를 초과했습니다.');let profile;try{profile=JSON.parse(raw);}catch{throw new SandboxDocumentError('원문 분석 결과 형식이 올바르지 않습니다.');}if(profile.kind!==document.kind||profile.sha256!==sha256||!profile.coverage||!profile.inventory||!Array.isArray(profile.warnings))throw new SandboxDocumentError('원본 문서와 분석 결과의 식별자가 일치하지 않습니다.');return profile;};
  return {sha256,read:()=>serial(async()=>{await prepare();await command(`python /home/user/document-reader.py /home/user/document-input.bin ${document.kind} /home/user/document-profile.json`,'read');return admit(await sandbox.files.read('/home/user/document-profile.json'));}),requery:requests=>serial(async()=>{
    await prepare();state.queryPromise??=sandbox.files.write('/home/user/document-requery.py',await script('document-requery.py'));await state.queryPromise;
    await sandbox.files.write('/home/user/document-requests.json',JSON.stringify({requests}));await command(`python /home/user/document-requery.py /home/user/document-input.bin ${document.kind} /home/user/document-requests.json /home/user/document-requery.json`,'reread');
    const raw=await sandbox.files.read('/home/user/document-requery.json');if(raw.length>180000)throw new SandboxDocumentError('재조회 결과 한도를 초과했습니다.');let result;try{result=JSON.parse(raw);}catch{throw new SandboxDocumentError('재조회 결과 형식이 올바르지 않습니다.');}
    if(result.sha256!==sha256||result.kind!==document.kind)throw new SandboxDocumentError('재조회 원본 식별자가 일치하지 않습니다.');if(result.selections?.some((selection,i)=>JSON.stringify(selection.request)!==JSON.stringify(requests[i])))throw new SandboxDocumentError('재조회 선택 범위가 요청과 일치하지 않습니다.');return result;
  })};
}

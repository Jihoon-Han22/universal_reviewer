// Non-billable checks against a running Worker (uses synthetic documents only).
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createInterface} from 'node:readline';
let base=process.argv[2]||'http://127.0.0.1:8788';
const auth={};
if(base==='--stdin'){
 const input=createInterface({input:process.stdin});
 const config=await new Promise((resolve,reject)=>{input.once('line',line=>{try{resolve(JSON.parse(line));}catch{reject(new Error('Invalid input'));}});input.once('close',()=>reject(new Error('Missing input')));});
 input.close();process.stdin.pause();base=config.base;
 if(config.token)auth['OAI-Sites-Authorization']=`Bearer ${config.token}`;
}
let cookie='';
const added=[];
async function call(path,init={},expected=200){
 const headers=new Headers({...auth,...init.headers});headers.set('Origin',base);if(cookie)headers.set('Cookie',cookie);
 const response=await fetch(base+path,{...init,headers});
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal(response.status,expected,`${path}: ${response.status}`);return response;
}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function upload(name,bytes,role='target'){
 const body=new FormData();body.set('role',role);body.append('files',new Blob([bytes]),name);
 const data=await(await call('/api/documents',{method:'POST',body},201)).json();
 assert.equal(data.documents.length,1);added.push(data.documents[0]);return data.documents[0];
}
try{
 const health=await(await call('/api/health')).json();assert.equal(health.runtime,'sites');
 const text=await upload('worker-smoke.txt','Synthetic Worker storage test.');
 assert.equal(await(await call(text.url)).text(),'Synthetic Worker storage test.');
 const isolated=await fetch(base+text.url,{headers:auth});assert.equal(isolated.status,404);
 const invalidOrigin=await fetch(base+'/api/samples',{...json('POST',{kind:'expenses'}),headers:{...auth,'Content-Type':'application/json',Origin:'https://unexpected.example',Cookie:cookie}});assert.equal(invalidOrigin.status,403);
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic DOCX 검증</w:t></w:r></w:p></w:body></w:document>');
 const docx=await upload('worker-smoke.docx',await zip.generateAsync({type:'nodebuffer'}));assert.match(docx.preview.text,/Synthetic DOCX 검증/);
 const sample=await(await call('/api/samples',json('POST',{kind:'expenses'}),201)).json();
 assert.ok(sample.documents.length>0);added.push(...sample.documents);
 for(const doc of sample.documents){const response=await call(doc.url);assert.equal((await response.arrayBuffer()).byteLength,doc.size);}
 if(!health.geminiConfigured)await call('/api/runs',json('POST',{mode:'criteria_first',documentIds:[],criteriaDocumentIds:[],criteriaText:'금액은 100 이하'}),503);
 console.log(JSON.stringify({ok:true,checks:['health','durable-text-upload','isolated-sessions','same-origin-mutations','docx-parser','xlsx-sample','original-downloads'],documents:added.length}));
}finally{for(const doc of added)await call(`/api/documents/${doc.id}`,{method:'DELETE'}).catch(error=>console.error('Cleanup failed:',error.message));}

import {readdir,stat,readFile,writeFile,mkdir,copyFile,open} from 'node:fs/promises';
import {join,dirname,extname} from 'node:path';
import {createHash} from 'node:crypto';
const CHUNK=20*1024*1024;
const roots=['golden','ralph-golden-v3','architecture','artifacts'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const types={'.pdf':'application/pdf','.json':'application/json','.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.zip':'application/zip','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.py':'text/plain; charset=utf-8'};
export async function buildDatasets(root,client){
 const files={},large={};
 async function walk(relative){
  for(const item of (await readdir(join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(item.name.startsWith('.')||item.name==='__pycache__'||/\.(?:webm|mp4|pyc)$/i.test(item.name))continue;
   const name=`${relative}/${item.name}`;
   if(item.isDirectory()){await walk(name);continue;}if(!item.isFile())continue;
   const source=join(root,name),{size}=await stat(source),mime=types[extname(name).toLowerCase()]||'application/octet-stream';
   if(size<=CHUNK){const bytes=await readFile(source);if(bytes.subarray(0,80).toString().startsWith('version https://git-lfs.github.com/spec/v1'))throw new Error(`Run git lfs pull before building: ${name}`);await mkdir(dirname(join(client,name)),{recursive:true});await copyFile(source,join(client,name));files[name]={size,sha256:hash(bytes),mime};}
   else{
    const digest=createHash('sha256'),chunks=[],file=await open(source,'r');
    try{for(let offset=0;offset<size;offset+=CHUNK){const bytes=Buffer.alloc(Math.min(CHUNK,size-offset));let filled=0;while(filled<bytes.length){const read=await file.read(bytes,filled,bytes.length-filled,offset+filled);if(!read.bytesRead)throw new Error(`Unexpected EOF: ${name}`);filled+=read.bytesRead;}digest.update(bytes);const part=`/_dataset_chunks/${hash(bytes)}`;await mkdir(join(client,'_dataset_chunks'),{recursive:true});await writeFile(join(client,part),bytes);chunks.push({path:part,size:bytes.length});}}
    finally{await file.close();}
    files[name]={size,sha256:digest.digest('hex'),mime};large[`/${name}`]={...files[name],chunks};
   }
  }
 }
 for(const rootName of roots)await walk(rootName);
 await mkdir(join(client,'_project'),{recursive:true});
 await writeFile(join(client,'_project/files.json'),JSON.stringify(files));
 await writeFile(join(client,'_project/index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>프로젝트 자료</title><style>body{font:16px/1.6 system-ui;max-width:1100px;margin:40px auto;padding:0 24px;background:#f5f7f4;color:#22352c}a{color:#245b3d}input{padding:12px;width:90%;font:inherit}li{margin:8px 0;overflow-wrap:anywhere}small{color:#666}</style><h1>프로젝트 자료</h1><p><a href="/">검토 서비스</a> · <a href="/ralph-golden-v3/">Ralph v3 자료 보기</a></p><input id="filter" aria-label="파일 검색" placeholder="파일명 또는 폴더 검색"><p id="count"></p><ul id="files"></ul><script>fetch('/_project/files.json').then(r=>r.json()).then(data=>{const entries=Object.entries(data),input=document.getElementById('filter'),list=document.getElementById('files');function show(){list.replaceChildren();let n=0;for(const [path,file]of entries){if(!path.toLowerCase().includes(input.value.toLowerCase()))continue;n++;const li=document.createElement('li'),a=document.createElement('a'),s=document.createElement('small');a.href='/'+path.split('/').map(encodeURIComponent).join('/');a.textContent=path;s.textContent=' — '+(file.size/1024/1024).toFixed(2)+' MB';li.append(a,s);list.append(li);}document.getElementById('count').textContent=n+'개 파일';}input.addEventListener('input',show);show();});</script></html>`);
 console.log(`Project datasets: ${Object.keys(files).length} files; ${Object.keys(large).length} streamed large files`);
 return large;
}

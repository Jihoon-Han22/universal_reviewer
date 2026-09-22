import manifest from './dataset-manifest.mjs';

export async function serveDataset(request,env,files=manifest){
 let path;try{path=decodeURIComponent(new URL(request.url).pathname);}catch{return new Response('Invalid path',{status:400});}
 const file=Object.hasOwn(files,path)?files[path]:null;if(!file)return null;
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const etag=`"${file.sha256}"`,headers=new Headers({'Content-Type':file.mime,'Accept-Ranges':'bytes',ETag:etag,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});
 if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
 let start=0,end=file.size-1,status=200;
 const range=request.headers.get('Range');
 if(range&&(!request.headers.get('If-Range')||request.headers.get('If-Range')===etag)){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});
  if(!match[1]){start=Math.max(0,file.size-Number(match[2]));}else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=file.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});
  status=206;headers.set('Content-Range',`bytes ${start}-${end}/${file.size}`);
 }
 headers.set('Content-Length',String(end-start+1));
 if(request.method==='HEAD')return new Response(null,{status,headers});
 let offset=0;const pieces=[];
 for(const chunk of file.chunks){if(offset<=end&&offset+chunk.size>start)pieces.push({path:chunk.path,start:Math.max(0,start-offset),end:Math.min(chunk.size-1,end-offset)});offset+=chunk.size;}
 let index=0,reader,skip=0,remaining=0;
 const next=async()=>{const part=pieces[index++];if(!part)return false;const response=await env.ASSETS.fetch(new Request(new URL(part.path,request.url),{headers:{Range:`bytes=${part.start}-${part.end}`}}));if(!response.ok||!response.body)throw new Error('Dataset asset unavailable');skip=response.status===206?0:part.start;remaining=part.end-part.start+1;reader=response.body.getReader();return true;};
 await next();
 const body=new ReadableStream({async pull(controller){try{for(;;){if(!reader&&!await next()){controller.close();return;}const {done,value}=await reader.read();if(done)throw new Error('Dataset asset truncated');const offset=Math.min(skip,value.byteLength);skip-=offset;const bytes=value.subarray(offset,offset+remaining);remaining-=bytes.byteLength;if(!remaining){await reader.cancel();reader.releaseLock();reader=null;}if(bytes.byteLength){controller.enqueue(bytes);return;}}}catch(error){controller.error(error);}},async cancel(){await reader?.cancel();}});
 return new Response(body,{status,headers});
}

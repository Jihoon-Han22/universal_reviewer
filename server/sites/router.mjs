import { EventEmitter } from 'node:events';

export class HttpError extends Error {
  constructor(message,status=400) { super(message); this.status=status; }
}
const encoder = new TextEncoder();
export async function readJson(request,limit=2*1024*1024) {
  if (!/\bapplication\/json\b/i.test(request.headers.get('content-type') ?? '')) return undefined;
  if (Number(request.headers.get('content-length') ?? 0)>limit) throw new HttpError('요청 크기는 2MB까지입니다.',413);
  const reader=request.body?.getReader(); if (!reader) return {};
  let size=0; const chunks=[];
  try { for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new HttpError('요청 크기는 2MB까지입니다.',413);}chunks.push(value);} }
  finally {reader.releaseLock();}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
  try {const text=new TextDecoder().decode(all);return text.trim()?JSON.parse(text):{};}catch{throw new HttpError('요청 JSON 형식이 올바르지 않습니다.');}
}

export function createRouter() {
  const routes=[];
  const router={routes};
  for (const method of ['get','post','delete','put','patch']) router[method]=(pattern,handler)=>{const keys=[];const source=pattern.split('/').map(part=>part.startsWith(':')?(keys.push(part.slice(1)),'([^/]+)'):part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/');routes.push({method:method.toUpperCase(),pattern:new RegExp(`^${source}$`),keys,handler});return router;};
  router.match=(method,path)=>{for(const route of routes){if(route.method!==method)continue;const match=route.pattern.exec(path);if(match)return {...route,params:Object.fromEntries(route.keys.map((key,index)=>[key,decodeURIComponent(match[index+1])]))};}return null;};
  return router;
}

export function createRequest(request,body) {
  const req=new EventEmitter(),url=new URL(request.url);
  Object.assign(req,{native:request,method:request.method,path:url.pathname,headers:Object.fromEntries(request.headers),query:Object.fromEntries(url.searchParams),params:{},body,get:name=>request.headers.get(name)});
  request.signal.addEventListener('abort',()=>{req.emit('aborted');req.emit('close');},{once:true});
  return req;
}

export function createResponse(request,{cookie,onClose}={}) {
  const res=new EventEmitter(),headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  if(cookie)headers.append('Set-Cookie',cookie);
  let resolveResponse,controller,closed=false;
  res.response=new Promise(resolve=>{resolveResponse=resolve;});
  Object.assign(res,{statusCode:200,headersSent:false,writableEnded:false,writableLength:0,streaming:false,headers});
  res.reset=()=>{if(res.streaming)return;res.headersSent=false;res.writableEnded=false;headers.delete('Content-Length');headers.delete('Content-Disposition');res.response=new Promise(resolve=>{resolveResponse=resolve;});};
  res.status=code=>{res.statusCode=code;return res;};
  res.setHeader=(key,value)=>{headers.set(key,value);return res;};
  res.set=(key,value)=>{if(typeof key==='object')for(const [name,item] of Object.entries(key))headers.set(name,item);else headers.set(key,value);return res;};
  res.type=value=>{headers.set('Content-Type',value);return res;};
  const close=()=>{if(closed)return;closed=true;res.emit('close');onClose?.();};
  const respond=body=>{if(res.headersSent)return;res.headersSent=true;resolveResponse(new Response(body,{status:res.statusCode,headers}));};
  res.send=body=>{if(res.headersSent)return res;if(typeof body==='object'&&body!==null&&!(body instanceof Uint8Array)&&!(body instanceof ArrayBuffer)&&!(body instanceof ReadableStream))return res.json(body);res.writableEnded=true;respond(body);return res;};
  res.json=value=>{res.type('application/json; charset=utf-8');return res.send(JSON.stringify(value));};
  res.flushHeaders=()=>{if(res.headersSent)return;res.streaming=true;const stream=new ReadableStream({start(value){controller=value;},cancel(){res.writableEnded=true;close();}},{highWaterMark:512*1024,size:chunk=>chunk.byteLength});respond(stream);};
  res.write=chunk=>{if(res.writableEnded)return false;res.flushHeaders();try{controller.enqueue(typeof chunk==='string'?encoder.encode(chunk):chunk);res.writableLength=Math.max(0,512*1024-(controller.desiredSize??0));if(res.writableLength>1024*1024){res.destroy();return false;}return true;}catch{res.writableEnded=true;close();return false;}};
  res.end=chunk=>{if(res.writableEnded)return res;if(!res.headersSent){res.writableEnded=true;respond(chunk??null);}else{if(chunk)res.write(chunk);res.writableEnded=true;try{controller?.close();}catch{}}close();return res;};
  res.destroy=()=>{if(!res.writableEnded){res.writableEnded=true;try{controller?.error(new Error('Connection closed'));}catch{}}close();};
  request.signal.addEventListener('abort',()=>res.destroy(),{once:true});
  return res;
}

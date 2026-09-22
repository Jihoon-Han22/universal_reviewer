import {waitUntil} from '@vercel/functions';
import {handleApi} from '../server/sites/runtime.mjs';
import {createDatabase} from '../server/vercel/postgres.mjs';
import {createBucket} from '../server/vercel/bucket.mjs';
import {registerChunkedUploads} from '../server/vercel/uploads.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {goldenCatalog} from '../server/golden-catalog.mjs';

let bindings;
export default {async fetch(request){
  try{
    const url=new URL(request.url),route=url.searchParams.get('__route');
    if(route!==null){url.pathname=`/api/${route}`;url.searchParams.delete('__route');request=new Request(url,request);}
    if(request.method==='GET'&&url.pathname==='/api/golden')return Response.json(goldenCatalog(),{headers:{'Cache-Control':'no-store'}});
    bindings??={DB:createDatabase(process.env),BUCKET:createBucket(process.env)};
    const sessionSource=process.env.SUPABASE_JWT_SECRET||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
    const env={...process.env,...bindings,SESSION_SECRET:process.env.SESSION_SECRET||(sessionSource?createHash('sha256').update('reviewer-session-v1:'+sessionSource).digest('hex'):undefined),RUNTIME:'vercel',MAX_REVIEW_BYTES:250*1024*1024};
    return await handleApi(request,env,{waitUntil},{onError:error=>console.error('Review backend error',{name:error.name,code:error.code??null}),configureRuntime:registerChunkedUploads,goldenOptions:{root:path.join(process.cwd(),'golden')},sampleOptions:{root:path.join(process.cwd(),'golden')}});
  }catch(error){console.error('Backend initialization failed:',error.code||error.name);return Response.json({error:'백엔드 저장소 연결을 확인해 주세요.'},{status:503});}
}};

import {createClient} from '@supabase/supabase-js';
const PART=8*1024*1024;
export function createBucket(env) {
  const url=env.SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL;
  const token=env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!url||!token)throw new Error('Vercel document storage connection is missing');
  const client=createClient(url,token,{auth:{persistSession:false,autoRefreshToken:false}}),name='reviewer-private';
  let ready;
  const init=()=>ready??=(async()=>{const found=await client.storage.getBucket(name);if(!found.error){if(found.data.public)throw new Error('Document bucket must be private');return;}const made=await client.storage.createBucket(name,{public:false,fileSizeLimit:PART+1024});if(made.error&&!/exist|duplicate/i.test(made.error.message))throw made.error;})();
  const rawGet=async key=>{const {data,error}=await client.storage.from(name).download(key);if(error){if(String(error.statusCode)==='404'||/not found/i.test(error.message))return null;throw error;}return data;};
  const rawPut=async(key,value,contentType)=>{const {error}=await client.storage.from(name).upload(key,value,{upsert:true,contentType});if(error)throw error;};
  return {async put(key,value,options={}){await init();const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value),parts=Math.ceil(bytes.length/PART);for(let i=0;i<parts;i++)await rawPut(`${key}.parts/${i}`,bytes.subarray(i*PART,(i+1)*PART),'application/octet-stream');await rawPut(`${key}.manifest`,JSON.stringify({parts,size:bytes.length,contentType:options.httpMetadata?.contentType}),'application/json');},async get(key){await init();const manifest=await rawGet(`${key}.manifest`);if(!manifest)return null;const meta=await manifest.text().then(JSON.parse);let index=0;const body=new ReadableStream({async pull(controller){if(index>=meta.parts){controller.close();return;}try{const part=await rawGet(`${key}.parts/${index++}`);if(!part)throw new Error('Stored part is missing');controller.enqueue(new Uint8Array(await part.arrayBuffer()));}catch(error){controller.error(error);}}});const response=new Response(body);return {body:response.body,size:meta.size,text:()=>response.text(),arrayBuffer:()=>response.arrayBuffer()};},async delete(key){await init();const manifest=await rawGet(`${key}.manifest`);if(!manifest)return;const meta=await manifest.text().then(JSON.parse);const {error}=await client.storage.from(name).remove([`${key}.manifest`,...Array.from({length:meta.parts},(_,i)=>`${key}.parts/${i}`)]);if(error)throw error;}};
}

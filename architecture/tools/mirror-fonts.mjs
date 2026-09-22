// Optional authoring tool. Downloads only public font resources; never reads .env.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const base=resolve('architecture/ui/fonts'); await mkdir(base,{recursive:true});
const source='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;450;500;550;600;650;700&display=swap';
const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const response=await fetch(source,{headers:{'User-Agent':ua}}); if(!response.ok)throw Error('CSS HTTP '+response.status);
let css=await response.text(); const urls=[...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m=>m[1]))];
const entries=[];
for(const [i,url] of urls.entries()) {
 const r=await fetch(url); if(!r.ok) throw Error('font HTTP '+r.status);
 const bytes=Buffer.from(await r.arrayBuffer()); if(bytes.length>25_000_000)throw Error('unexpected font size');
 const name='font-'+String(i+1).padStart(3,'0')+(url.endsWith('.woff2')?'.woff2':url.endsWith('.woff')?'.woff':'.ttf');
 await writeFile(resolve(base,name),bytes);css=css.replaceAll(url,'./'+name);
 entries.push({path:name,source:url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
for(const family of ['dmsans','notosanskr']){
 const r=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/'+family+'/OFL.txt'); if(!r.ok)throw Error('license HTTP '+r.status);
 await writeFile(resolve(base,family+'-OFL.txt'),await r.text());
}
await writeFile(resolve(base,'fonts.css'),css);
await writeFile(resolve(base,'manifest.json'),JSON.stringify({retrievedAt:new Date().toISOString(),source,userAgent:ua,entries},null,2));
console.log(JSON.stringify({fonts:entries.length,bytes:entries.reduce((s,x)=>s+x.bytes,0)}));

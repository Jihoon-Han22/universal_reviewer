import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2] || '.');
const out = resolve(process.argv[3] || 'architecture/baseline/source-snapshot.json');
const dirs = ['src','server','integrations/src','integrations/test','integrations/scripts','scripts'];
const entries = [];
async function add(file) {
 const bytes = await readFile(file);
 entries.push({path:relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
async function walk(dir) {
 for(const e of await readdir(dir,{withFileTypes:true})) {
  if(['node_modules','__pycache__'].includes(e.name)) continue;
  const p = resolve(dir,e.name);
  if(e.isDirectory()) await walk(p); else if(/\.(mjs|mts|js|jsx|ts|tsx|css|py|json)$/.test(e.name)) await add(p);
 }
}
for(const d of dirs) await walk(resolve(root,d));
for(const f of ['package.json','package-lock.json','integrations/package.json','integrations/package-lock.json','tsconfig.json','vite.config.ts','index.html','public/gspec.svg']) await add(resolve(root,f));
entries.sort((a,b)=>a.path.localeCompare(b.path));
await mkdir(resolve(out,'..'),{recursive:true});
await writeFile(out,JSON.stringify({schemaVersion:1,capturedAt:new Date().toISOString(),node:process.version,scope:'Source only. No .env, uploads, datasets, caches or user artifacts.',files:entries},null,2)+'\n');
console.log(JSON.stringify({out,files:entries.length}));

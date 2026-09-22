// Run from the new project root. Never reads or changes .env or datasets.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const packageRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(process.argv[2] || '.');
const mapping=[
 ['environment/root/package.json','package.json'],['environment/root/package-lock.json','package-lock.json'],
 ['environment/integrations/package.json','integrations/package.json'],['environment/integrations/package-lock.json','integrations/package-lock.json'],
 ['environment/templates/tsconfig.json','tsconfig.json'],['environment/templates/vite.config.ts','vite.config.ts'],['environment/templates/index.html','index.html'],
 ['environment/templates/scripts/dev.mjs','scripts/dev.mjs'],['environment/templates/scripts/copy-pdfjs-assets.mjs','scripts/copy-pdfjs-assets.mjs'],
 ['environment/templates/scripts/build-dashboard-chart-runtime.mjs','scripts/build-dashboard-chart-runtime.mjs'],['environment/assets/gspec.svg','public/gspec.svg']
];
for(const file of await readdir(resolve(packageRoot,'ui/fonts'))) mapping.push(['ui/fonts/'+file,'public/fonts/'+file]);
const pending=[];
for(const [source,target] of mapping){
 const bytes=await readFile(resolve(packageRoot,source));
 const dest=resolve(root,target);
 try {const old=await readFile(dest); if(!old.equals(bytes)) throw new Error('Refusing to overwrite different existing file: '+target);}
 catch(e){if(e.code==='ENOENT') pending.push({dest,bytes});else throw e;}
}
for(const {dest,bytes} of pending){await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes,{flag:'wx'});}
for(const dir of ['src/components','server/assets','integrations/src','integrations/scripts','integrations/test']) await mkdir(resolve(root,dir),{recursive:true});
console.log(JSON.stringify({status:'scaffold-only',created:pending.length,root,next:['npm ci','npm --prefix integrations ci','Implement architecture/PLAN.md M0 onward; src/server/integrations application code is not supplied.']}));

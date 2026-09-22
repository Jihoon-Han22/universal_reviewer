import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('.');
const dest = resolve('architecture/environment');
await mkdir(dest,{recursive:true});
const report = {nodeObserved:process.version,nodeRequired:'>=22.13.0',npmObserved:'11.8.0',packages:[]};
for(const prefix of ['', 'integrations/']) {
 const pkg=JSON.parse(await readFile(prefix+'package.json','utf8'));
 const lock=JSON.parse(await readFile(prefix+'package-lock.json','utf8'));
 const folder=prefix?'integrations':'root';
 await mkdir(resolve(dest,folder),{recursive:true});
 for(const f of ['package.json','package-lock.json']) await copyFile(prefix+f,resolve(dest,folder,f));
 for(const section of ['dependencies','devDependencies']) for(const [name,declared] of Object.entries(pkg[section]||{})) {
  let installed=null;
  try { installed=JSON.parse(await readFile(prefix+'node_modules/'+name+'/package.json','utf8')).version; } catch {}
  const locked=lock.packages['node_modules/'+name];
  report.packages.push({workspace:folder,name,section,declared,locked:locked?.version,installed,engines:locked?.engines||null});
 }
}
await writeFile(resolve(dest,'versions.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {builtinModules} from 'node:module';

const root=resolve(import.meta.dirname,'..');
const output=join(root,'.cache','sites-output');
// Every generated deletion is constrained to this project's cache.
const inside=relative(join(root,'.cache'),output);
if(!inside||inside.startsWith('..')||isAbsolute(inside))throw new Error('Unsafe output directory');
const npm=process.platform==='win32'?'npm.cmd':'npm';
const workerOnly=process.argv.includes('--worker-only');
if(!process.argv.includes('--skip-client')&&!workerOnly){
 const buildClient=spawnSync(npm,['run','build'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
 if(buildClient.status!==0)process.exit(buildClient.status||1);
}
if(!workerOnly)await rm(output,{recursive:true,force:true});
await mkdir(join(output,'server'),{recursive:true});
await mkdir(join(output,'.openai'),{recursive:true});
if(!workerOnly)await cp(join(root,'dist'),join(output,'client'),{recursive:true});
await cp(join(root,'.openai','hosting.json'),join(output,'.openai','hosting.json'));
const resourceNames=[
 'server/assets/dashboard-design.schema.json','server/assets/dashboard-system.txt',
 'server/assets/dashboard-validator.cjs','server/assets/dashboard.css',
 'server/assets/dashboard-chart-runtime.js','server/sandbox-document-reader.py',
 'server/document-requery.py','server/criteria-workbook-profile.py',
];
const resources=Object.fromEntries(await Promise.all(resourceNames.map(async name=>[name,await readFile(join(root,name),'utf8')])));
const result=await build({
 absWorkingDir:root,entryPoints:['worker/index.mjs'],outfile:join(output,'server','index.js'),
 bundle:true,format:'esm',platform:'neutral',target:'es2022',minify:true,metafile:true,
 conditions:['workerd','worker','browser','import','default'],mainFields:['browser','module','main'],
 external:['node:*','cloudflare:*',...builtinModules],
 banner:{js:"import {getBuiltinModule as __sitesBuiltin} from 'node:process'; const require = name => { const builtin=__sitesBuiltin(name.replace(/\\/$/,'')); if(!builtin) throw new Error('Unavailable builtin: '+name); return builtin; };"},
 define:{'process.env.NODE_ENV':'"production"'},
 plugins:[{name:'sites-embedded-resources',setup(builder){
  builder.onResolve({filter:/pdf-text\.mjs$/},args=>args.importer.replaceAll('\\','/').endsWith('/server/documents.mjs')?{path:join(root,'server','sites','pdf-text.mjs')}:null);
  builder.onLoad({filter:/[\\/]sites[\\/]resource-registry\.mjs$/},()=>({contents:`export default ${JSON.stringify(resources)};`,loader:'js'}));
 }}],
});
const config={name:'universal-reviewer',main:'./index.js',compatibility_date:'2026-09-22',compatibility_flags:['nodejs_compat'],assets:{directory:'../client',binding:'ASSETS',not_found_handling:'single-page-application',run_worker_first:['/api/*']}};
await writeFile(join(output,'server','wrangler.json'),JSON.stringify(config,null,2)+'\n');
await writeFile(join(root,'.cache','sites-metafile.json'),JSON.stringify(result.metafile));
console.log(`Sites artifact ready: ${output}`);

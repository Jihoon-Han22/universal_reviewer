import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
function command(bin,args){const result=spawnSync(bin,args,{cwd:root,encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||`${bin} failed`);return result.stdout.trim();}
if(command('git',['status','--porcelain']).trim())throw new Error('Commit the exact source before packaging a Sites version.');
const sha=command('git',['rev-parse','HEAD']);
const hosting=JSON.parse(await readFile(join(root,'.openai','hosting.json'),'utf8'));
const archive=join(root,'.cache','universal-reviewer-sites.tar.gz');
command('tar',['-czf',archive,'-C',join(root,'.cache','sites-output'),'.openai','server','client']);
await writeFile(join(root,'.cache','sites-release.json'),JSON.stringify({project_id:hosting.project_id,commit_sha:sha,archive},null,2)+'\n');
console.log(JSON.stringify({project_id:hosting.project_id,commit_sha:sha,archive}));

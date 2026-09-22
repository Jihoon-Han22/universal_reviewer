// Receives a short-lived Sites credential over stdin. Never saves or prints it.
import {createInterface} from 'node:readline';
import {spawnSync} from 'node:child_process';
const input=createInterface({input:process.stdin});
const credential=await new Promise((resolve,reject)=>{input.once('line',line=>{try{resolve(JSON.parse(line));}catch{reject(new Error('Invalid credential input'));}});input.once('close',()=>reject(new Error('Missing credential input')));});
input.close();process.stdin.pause();
if(credential.auth_mode!=='http_extra_header'||!credential.token||!credential.remote_url?.startsWith('https://git.chatgpt-team.site/')||!/^[A-Za-z0-9/_-]+$/.test(credential.branch)||/[\r\n]/.test(credential.token))throw new Error('Unexpected Sites repository configuration');
const quote=value=>`'${value.replace(/'/g,"'\\''")}'`;
const result=spawnSync('git',['-c','credential.helper=','push',credential.remote_url,`HEAD:refs/heads/${credential.branch}`],{
 stdio:['ignore','inherit','inherit'],
 env:{...process.env,GIT_CONFIG_PARAMETERS:`${quote('credential.helper=')} ${quote(`http.extraHeader=Authorization: Bearer ${credential.token}`)}`,GIT_TERMINAL_PROMPT:'0'},
});
delete credential.token;
process.exit(result.status??1);

import {cp,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
// Vercel's Git LFS checkout must resolve originals before copying public assets.
const roots=['golden','ralph-golden-v3','architecture','artifacts'];
for(const root of roots){
  async function verify(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=join(dir,item.name);if(item.isDirectory())await verify(file);else if(/\.(pdf|zip|png|jpe?g)$/i.test(item.name)){const bytes=await readFile(file);if(bytes.subarray(0,80).toString().startsWith('version https://git-lfs.github.com/spec/v1'))throw new Error('Enable Git LFS in Vercel Git settings before deploying: '+file);}}}
  await verify(root);
  await cp(root,join('dist',root),{recursive:true,filter:source=>!/(?:^|[\\/])(?:__pycache__|\.[^\\/]+)(?:[\\/]|$)/.test(source)&&!(/\.(mp4|webm|pyc)$/i.test(source))});
}
console.log('Full project datasets copied to Vercel output.');

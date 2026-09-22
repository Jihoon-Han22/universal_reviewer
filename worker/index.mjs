import { handleApi } from '../server/sites/runtime.mjs';

export default {
  async fetch(request,env,context) {
    const url=new URL(request.url);
    if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return handleApi(request,env,context);
    if(!env.ASSETS)return new Response('Site assets are unavailable',{status:503});
    return env.ASSETS.fetch(request);
  },
};

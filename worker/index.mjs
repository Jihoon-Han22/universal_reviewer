import { handleApi } from '../server/sites/runtime.mjs';
import { serveDataset } from '../server/sites/datasets.mjs';

export default {
  async fetch(request,env,context) {
    const url=new URL(request.url);
    if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return handleApi(request,env,context);
    if(!env.ASSETS)return new Response('Site assets are unavailable',{status:503});
    const dataset=await serveDataset(request,env);if(dataset)return dataset;
    return env.ASSETS.fetch(request);
  },
};

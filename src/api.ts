import type {Doc,UploadResponse} from './types';

export function messageOf(data: any) { return data?.message || data?.error?.message || (typeof data?.error === 'string' ? data.error : '요청을 완료하지 못했어요. 다시 시도해 주세요.'); }
export async function request<T>(path:string, init:RequestInit = {}):Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messageOf(data));
  if (init.method && init.method !== 'GET') window.dispatchEvent(new Event('trace:activity-refresh'));
  return data as T;
}
export const get = <T,>(path:string, signal?:AbortSignal) => request<T>(path,{signal});
export const post = <T,>(path:string, body:unknown={}, signal?:AbortSignal) => request<T>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
export async function upload(files:File[],role:Doc['role'],signal?:AbortSignal) {
  if (!files.length || files.length>10) throw new Error('한 번에 1~10개 파일을 선택해 주세요.');
  const documents:Doc[]=[];
  const health=await get<{runtime?:string}>('/api/health',signal);
  try {
    // Persist one file at a time so a batch does not occupy the Worker heap.
    for (const file of files) {
      signal?.throwIfAborted();
      let result:UploadResponse;
      if(health.runtime==='vercel'){
        const ticket=await post<{uploadId:string;chunkSize:number}>('/api/uploads',{name:file.name,role,size:file.size},signal);
        for(let start=0,index=0;start<file.size;start+=ticket.chunkSize,index++)await request(`/api/uploads/${ticket.uploadId}/parts/${index}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(start,start+ticket.chunkSize),signal});
        result=await post<UploadResponse>('/api/documents',{uploadId:ticket.uploadId},signal);
      }else{
        const body=new FormData(); body.append('files',file); body.append('role',role);
        result=await request<UploadResponse>('/api/documents',{method:'POST',body,signal});
      }
      documents.push(...result.documents);
    }
    return {documents};
  } catch (error) {
    await Promise.allSettled(documents.map(document=>request(`/api/documents/${document.id}`,{method:'DELETE'})));
    throw error;
  }
}

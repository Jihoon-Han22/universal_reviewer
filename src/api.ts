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
  if (files.some(file=>file.size>20*1024*1024)) throw new Error('파일당 20MB까지 업로드할 수 있습니다.');
  const documents:Doc[]=[];
  try {
    // Persist one file at a time so a batch does not occupy the Worker heap.
    for (const file of files) {
      signal?.throwIfAborted();
      const body=new FormData(); body.append('files',file); body.append('role',role);
      const result=await request<UploadResponse>('/api/documents',{method:'POST',body,signal});
      documents.push(...result.documents);
    }
    return {documents};
  } catch (error) {
    await Promise.allSettled(documents.map(document=>request(`/api/documents/${document.id}`,{method:'DELETE'})));
    throw error;
  }
}

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
  const body=new FormData(); files.forEach(file=>body.append('files',file)); body.append('role',role);
  return request<UploadResponse>('/api/documents',{method:'POST',body,signal});
}

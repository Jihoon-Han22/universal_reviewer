// Source-pinned, read-only Playwright1.62.1 in-process identity adapter.
// Call only after the parent verifies the exact SDK refs in sdk-source.json.
// Unlike the GET donor, this preserves and verifies reciprocal redirect links.
export function observePinnedEventSourceRequestIdentity(publicRequest,publicMainFrame){
 const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!('value'in d))throw Error('Missing own data property '+String(k));return d.value;};
 const connection=own(publicRequest,'_connection');if(connection!==own(publicMainFrame,'_connection'))throw Error('Different client connection');
 const toImpl=own(connection,'toImpl');if(typeof toImpl!=='function')throw Error('Not pinned in-process bridge');
 const server=Reflect.apply(toImpl,connection,[publicRequest]),frame=Reflect.apply(toImpl,connection,[publicMainFrame]);
 if(!server||own(server,'_frame')!==frame||own(server,'_serviceWorker')!==null)throw Error('Not exact main-frame request');
 const symbols=Object.getOwnPropertySymbols(server).filter(s=>s.description==='InterceptableRequest');if(symbols.length!==1)throw Error('Ambiguous native request symbol');
 const wrapper=own(server,symbols[0]);if(own(wrapper,'request')!==server)throw Error('Broken reciprocal native request');
 const related=direction=>{const p=own(publicRequest,direction),s=own(server,direction);if(p===null&&s===null)return null;
  if(!p||!s||own(p,'_connection')!==connection||Reflect.apply(toImpl,connection,[p])!==s)throw Error('Broken public/server redirect identity');
  const opposite=direction==='_redirectedFrom'?'_redirectedTo':'_redirectedFrom';if(own(p,opposite)!==publicRequest||own(s,opposite)!==server)throw Error('Non-reciprocal redirect');return own(p,'_guid');};
 const r={kind:'pinned-native-eventsource-request-identity',publicGuid:own(publicRequest,'_guid'),nativeRequestId:own(wrapper,'_requestId'),nativeTimestamp:own(wrapper,'_timestamp'),nativeWallTime:own(wrapper,'_wallTime'),nativeFrameId:own(frame,'_id'),url:own(server,'_url'),method:own(server,'_method'),resourceType:own(server,'_resourceType'),redirectedFromGuid:related('_redirectedFrom'),redirectedToGuid:related('_redirectedTo'),sourceGuardRequired:true,proof:{sameClientConnection:true,exactDispatcherObject:true,exactMappedMainFrame:true,uniqueOwnNativeSymbol:true,reciprocalServerRequest:true,reciprocalRedirects:true}};
 if(!r.publicGuid||!r.nativeRequestId||!r.nativeFrameId||!Number.isFinite(r.nativeTimestamp)||!Number.isFinite(r.nativeWallTime)||r.method!=='GET'||r.resourceType!=='eventsource')throw Error('Invalid native EventSource identity');return r;
}

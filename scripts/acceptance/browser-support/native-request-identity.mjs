// Version-pinned read-only adapter; execute only inside the reviewed owned collector.
// Caller must verify the exact reviewed installed Playwright1.62.1 bytes first.
// This intentionally uses a pinned private in-process bridge, never an inferred ID.
export function observePinnedNativeRequestIdentity(publicRequest,publicMainFrame){
 function own(object,key){const d=Object.getOwnPropertyDescriptor(object,key);if(!d||!('value'in d))throw Error('Missing own data property '+String(key));return d.value;}
 const connection=own(publicRequest,'_connection');
 if(connection!==own(publicMainFrame,'_connection'))throw Error('Different client connection');
 const toImpl=own(connection,'toImpl');if(typeof toImpl!=='function')throw Error('Not the pinned in-process client bridge');
 const guid=own(publicRequest,'_guid');if(typeof guid!=='string'||!guid)throw Error('Missing actual public Request guid');
 const serverRequest=Reflect.apply(toImpl,connection,[publicRequest]),serverFrame=Reflect.apply(toImpl,connection,[publicMainFrame]);
 if(!serverRequest||!serverFrame||own(serverRequest,'_frame')!==serverFrame)throw Error('Server Request is not owned by the exact mapped main frame');
 const symbols=Object.getOwnPropertySymbols(serverRequest).filter(s=>s.description==='InterceptableRequest');
 if(symbols.length!==1)throw Error('Missing or ambiguous pinned InterceptableRequest symbol');
 const wrapper=own(serverRequest,symbols[0]);
 if(!wrapper||own(wrapper,'request')!==serverRequest)throw Error('Broken reciprocal native/server Request identity');
 const requestId=own(wrapper,'_requestId'),timestamp=own(wrapper,'_timestamp'),wallTime=own(wrapper,'_wallTime'),frameId=own(serverFrame,'_id');
 if(typeof requestId!=='string'||!requestId||typeof frameId!=='string'||!frameId||!Number.isFinite(timestamp)||!Number.isFinite(wallTime))throw Error('Invalid actual native request identity fields');
 const url=own(serverRequest,'_url'),method=own(serverRequest,'_method'),resourceType=own(serverRequest,'_resourceType');
 if(typeof url!=='string'||typeof method!=='string'||typeof resourceType!=='string')throw Error('Invalid server request primitives');
 if(own(serverRequest,'_serviceWorker')!==null||own(serverRequest,'_redirectedFrom')!==null||own(serverRequest,'_redirectedTo')!==null)throw Error('Worker or redirected request is outside this adapter');
 return {kind:'pinned-inprocess-native-request-identity',publicGuid:guid,nativeRequestId:requestId,nativeTimestamp:timestamp,nativeWallTime:wallTime,nativeFrameId:frameId,url,method,resourceType,proof:{sameClientConnection:true,exactDispatcherObject:true,exactMappedMainFrame:true,uniqueOwnNativeSymbol:true,reciprocalServerRequest:true},sourceGuardRequired:true};
}

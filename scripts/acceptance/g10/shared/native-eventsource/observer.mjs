// Passive renderer observer. No clock replacement, URL mutation or synthetic events.
// Install before the application; evaluate only its snapshot during actual capture.
export function installNativeEventSourceOwnership(){
 const key='__gspecNativeEventSourceOwnership';
 if(Object.prototype.hasOwnProperty.call(window,key))throw Error('EventSource observer already installed');
 const Original=window.EventSource,proto=Original.prototype,closeDescriptor=Object.getOwnPropertyDescriptor(proto,'close');
 const nativeClose=closeDescriptor.value,nativeAdd=EventTarget.prototype.addEventListener,nativeRemove=EventTarget.prototype.removeEventListener;
 const getUrl=Object.getOwnPropertyDescriptor(proto,'url').get,getState=Object.getOwnPropertyDescriptor(proto,'readyState').get;
 const ids=new WeakMap(),listeners=new Map(),rows=[],observerErrors=[];let sequence=0,objectSequence=0,callSequence=0,restored=false;
 const safe=fn=>{try{return fn();}catch(e){if(observerErrors.length<100)observerErrors.push({name:String(e?.name??'Error'),message:String(e?.message??e)});return null;}};
 const stamp=()=>({at:new Date().toISOString(),timeOrigin:performance.timeOrigin,monotonicMs:performance.now()});
 const stack=()=>String(new Error('native EventSource observation').stack??'');
 const note=(kind,data={})=>safe(()=>{if(rows.length>=10000)throw Error('EventSource observer row limit');const r={sequence:++sequence,kind,...stamp(),...data};rows.push(r);return r;});
 const state=object=>Reflect.apply(getState,object,[]);
 const Wrapped=new Proxy(Original,{construct(target,args,newTarget){
  const callId='construct-'+(++callSequence),caller=safe(stack);note('construct-call',{callId,stack:caller});
  let object;try{object=Reflect.construct(target,args,newTarget);}catch(e){note('construct-throw',{callId,name:safe(()=>String(e?.name??'Error'))});throw e;}
  safe(()=>{if(objectSequence>=2000)throw Error('EventSource object limit');const objectId='eventsource-'+(++objectSequence),url=Reflect.apply(getUrl,object,[]);ids.set(object,{objectId,url,callId});
   note('construct-return',{callId,objectId,url,readyState:state(object),nativePrototype:proto.isPrototypeOf(object)});
   const open=event=>note('native-open',{objectId,url,isTrusted:event.isTrusted,readyState:state(object)});
   const error=event=>note('native-error',{objectId,url,isTrusted:event.isTrusted,readyState:state(object)});
   Reflect.apply(nativeAdd,object,['open',open]);Reflect.apply(nativeAdd,object,['error',error]);listeners.set(object,{open,error});
  });return object;
 }});
 function observedClose(...args){
  const owned=ids.get(this),callId='close-'+(++callSequence);note('close-call',{callId,objectId:owned?.objectId??null,url:owned?.url??null,readyState:safe(()=>state(this)),stack:safe(stack)});
  let returned;try{returned=Reflect.apply(nativeClose,this,args);}catch(e){note('close-throw',{callId,objectId:owned?.objectId??null,name:safe(()=>String(e?.name??'Error'))});throw e;}
  note('close-return',{callId,objectId:owned?.objectId??null,url:owned?.url??null,readyState:safe(()=>state(this)),returnedUndefined:returned===undefined});return returned;
 }
 Object.defineProperty(proto,'close',{...closeDescriptor,value:observedClose});window.EventSource=Wrapped;
 const api={snapshot:()=>({schemaVersion:1,snapshotAt:stamp(),rows:rows.map(r=>({...r})),observerErrors:observerErrors.map(e=>({...e})),restored,wrapperIntegrity:window.EventSource===Wrapped&&Object.getOwnPropertyDescriptor(proto,'close')?.value===observedClose,prototypeIdentity:Wrapped.prototype===proto}),restore(){
  if(window.EventSource===Wrapped)window.EventSource=Original;
  if(Object.getOwnPropertyDescriptor(proto,'close')?.value===observedClose)Object.defineProperty(proto,'close',closeDescriptor);
  for(const [object,pair] of listeners)safe(()=>{Reflect.apply(nativeRemove,object,['open',pair.open]);Reflect.apply(nativeRemove,object,['error',pair.error]);});listeners.clear();restored=true;
 }};
 Object.defineProperty(window,key,{value:api,configurable:true});
}

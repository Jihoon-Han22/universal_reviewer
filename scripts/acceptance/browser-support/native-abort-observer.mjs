// Passive call-through observer; no request tags, response reads, retries or source edits.
export function installNativeAbortEvidence(){
 if(window.__gspecNativeAbortEvidence)throw Error('Native abort observer already installed');
 const nativeFetch=window.fetch,nativeAbort=AbortController.prototype.abort,nativeDispatch=EventTarget.prototype.dispatchEvent;
 const nativeSetTimeout=window.setTimeout,nativeClearTimeout=window.clearTimeout;
 const rows=[],observerErrors=[],signals=new WeakMap(),controllers=new WeakMap(),timers=new Map();
 let seq=0,signalSeq=0,controllerSeq=0,fetchSeq=0,dispatchSeq=0,timerSeq=0,activeDispatch=null,activeTimer=null;
 function report(e){try{observerErrors.push({name:String(e?.name??'Error'),message:String(e?.message??e).slice(0,1000)});}catch{observerErrors.push({name:'ObserverError',message:'Error serialization failed'});}}
 function observe(fn){try{return fn();}catch(e){report(e);return null;}}
 const reason=v=>v==null?null:typeof v==='object'?{name:v.name??null,message:typeof v.message==='string'?v.message.slice(0,500):null}:{type:typeof v,value:String(v).slice(0,500)};
 const detail=e=>({name:e?.name??'Error',message:String(e?.message??e).slice(0,1000)});
 function note(kind,data={}){return observe(()=>{if(rows.length>=10000){if(!observerErrors.some(x=>x.message==='Observer row limit'))observerErrors.push({message:'Observer row limit'});return null;}const row={sequence:++seq,kind,at:new Date().toISOString(),timeOrigin:performance.timeOrigin,monotonicMs:performance.now(),...data};rows.push(row);return row;});}
 const stack=()=>new Error('Native call-through observation').stack??'';
 const scoped=value=>{const u=new URL(value,location.href);return u.origin===location.origin&&(/^\/api\/activity$/.test(u.pathname)||/^\/api\/runs(?:\/|$)/.test(u.pathname))?u.href:null;};
 function signalId(signal){
  if(!signal)return null;if(signals.has(signal))return signals.get(signal);
  const id='signal-'+(++signalSeq);signals.set(signal,id);note('signal-observed',{signalId:id,aborted:signal.aborted,reason:signal.aborted?reason(signal.reason):null});
  signal.addEventListener('abort',event=>observe(()=>note('native-signal-abort',{signalId:id,isTrusted:event.isTrusted,aborted:signal.aborted,reason:reason(signal.reason),activeDispatchId:activeDispatch,activeTimerId:activeTimer,stack:stack()})),{once:true});return id;
 }
 function fetchObserved(...args){
  let data=null;
  observe(()=>{const input=args[0],options=args[1],isRequest=input instanceof Request,url=scoped(typeof input==='string'?input:isRequest?input.url:'');if(!url)return;
   // Undefined retains a Request signal; explicit null removes it. Accessor-backed
   // RequestInit is left native and deliberately unattributed (do not invoke getters twice).
   const own=options&&Object.getOwnPropertyDescriptor(options,'signal'),methodOwn=options&&Object.getOwnPropertyDescriptor(options,'method');
   const exotic=options!=null&&(Object.getPrototypeOf(options)!==Object.prototype&&Object.getPrototypeOf(options)!==null||own&&(!('value'in own))||methodOwn&&(!('value'in methodOwn)));
   if(exotic){note('fetch-unattributed-shape',{url,reason:'Accessor or nonplain RequestInit'});return;}
   const optionSignal=own?.value,signal=optionSignal===undefined?(isRequest?input.signal:null):optionSignal;
   const method=methodOwn?.value===undefined?(isRequest?input.method:'GET'):methodOwn.value;
   if(typeof method!=='string'){note('fetch-unattributed-shape',{url,reason:'Non-string method'});return;}
   data={fetchId:'fetch-'+(++fetchSeq),url,method:method.toUpperCase(),signalId:signalId(signal),abortedAtCall:signal?.aborted??null,activeDispatchId:activeDispatch,activeTimerId:activeTimer,stack:stack()};note('fetch-call',data);
  });
  let promise;try{promise=Reflect.apply(nativeFetch,this,args);}catch(e){if(data)observe(()=>note('fetch-sync-throw',{fetchId:data.fetchId,error:detail(e)}));throw e;}
  if(data){observe(()=>note('fetch-native-return',{fetchId:data.fetchId}));observe(()=>{promise.then(response=>observe(()=>note('fetch-response',{fetchId:data.fetchId,url:response.url,status:response.status,type:response.type})),e=>observe(()=>note('fetch-rejected',{fetchId:data.fetchId,error:detail(e)})));});}
  return promise;
 }
 function abortObserved(...args){
  let data=null;
  observe(()=>{const signal=this.signal,id=signals.get(signal);if(id){if(!controllers.has(this))controllers.set(this,'controller-'+(++controllerSeq));data={controllerId:controllers.get(this),signalId:id,abortedBefore:signal.aborted,reasonArgument:reason(args[0]),activeDispatchId:activeDispatch,activeTimerId:activeTimer,stack:stack()};note('abort-call',data);}});
  let returned;try{returned=Reflect.apply(nativeAbort,this,args);}catch(e){if(data)observe(()=>note('abort-throw',{controllerId:data.controllerId,signalId:data.signalId,error:detail(e)}));throw e;}
  if(data)observe(()=>note('abort-return',{controllerId:data.controllerId,signalId:data.signalId,abortedAfter:this.signal.aborted,reason:reason(this.signal.reason)}));return returned;
 }
 function dispatchObserved(...args){
  if(this!==window||args[0]?.type!=='trace:activity-refresh')return Reflect.apply(nativeDispatch,this,args);
  const id='dispatch-'+(++dispatchSeq),previous=activeDispatch;activeDispatch=id;observe(()=>note('activity-refresh-dispatch-call',{dispatchId:id,isTrusted:args[0].isTrusted,stack:stack()}));
  try{const returned=Reflect.apply(nativeDispatch,this,args);observe(()=>note('activity-refresh-dispatch-return',{dispatchId:id,returned}));return returned;}catch(e){observe(()=>note('activity-refresh-dispatch-throw',{dispatchId:id,error:detail(e)}));throw e;}finally{activeDispatch=previous;}
 }
 function setTimeoutObserved(callback,delay,...args){
  const caller=observe(stack),relevant=typeof callback==='function'&&delay===10000&&typeof caller==='string'&&caller.includes('/src/activity-observer.ts');
  if(!relevant)return Reflect.apply(nativeSetTimeout,this,[callback,delay,...args]);
  const timerId='timer-'+(++timerSeq);let handle;
  function observedCallback(...values){const previous=activeTimer;activeTimer=timerId;observe(()=>note('timer-fire',{timerId,stack:stack()}));try{return Reflect.apply(callback,this,values);}finally{activeTimer=previous;}}
  try{handle=Reflect.apply(nativeSetTimeout,this,[observedCallback,delay,...args]);}catch(e){observe(()=>note('timer-schedule-throw',{timerId,error:detail(e)}));throw e;}
  timers.set(handle,timerId);observe(()=>note('timer-scheduled',{timerId,delay,stack:caller}));return handle;
 }
 function clearTimeoutObserved(...args){const id=timers.get(args[0]);let returned;try{returned=Reflect.apply(nativeClearTimeout,this,args);}catch(e){if(id)observe(()=>note('timer-clear-throw',{timerId:id,error:detail(e)}));throw e;}if(id)observe(()=>note('timer-cleared',{timerId:id}));return returned;}
 window.fetch=fetchObserved;AbortController.prototype.abort=abortObserved;EventTarget.prototype.dispatchEvent=dispatchObserved;window.setTimeout=setTimeoutObserved;window.clearTimeout=clearTimeoutObserved;
 const observer={snapshot:()=>structuredClone({rows,observerErrors}),restore(){if(window.fetch===fetchObserved)window.fetch=nativeFetch;if(AbortController.prototype.abort===abortObserved)AbortController.prototype.abort=nativeAbort;if(EventTarget.prototype.dispatchEvent===dispatchObserved)EventTarget.prototype.dispatchEvent=nativeDispatch;if(window.setTimeout===setTimeoutObserved)window.setTimeout=nativeSetTimeout;if(window.clearTimeout===clearTimeoutObserved)window.clearTimeout=nativeClearTimeout;}};
 Object.defineProperty(window,'__gspecNativeAbortEvidence',{value:observer,configurable:true});note('observer-installed',{location:location.href});return observer;
}

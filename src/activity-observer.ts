import type {ActivitySnapshot} from './types';
type Clock={now:()=>number;setTimeout:(callback:()=>void,delay:number)=>number;clearTimeout:(timer:number)=>void};
type ObserverOptions={clock:Clock;getSnapshot:(signal:AbortSignal)=>Promise<ActivitySnapshot>;openEvents:(snapshot:(value:ActivitySnapshot)=>void,error:()=>void)=>()=>void;publish:(snapshot:ActivitySnapshot,live:boolean,frozenAt:number)=>void};

/** Owns one replaceable GET/SSE generation; it never mutates review business state. */
export class ActivityObserver {
 private generation=0;private disposed=false;private request:AbortController|null=null;private closeEvents:(()=>void)|null=null;private quiet:number|undefined;private retry:number|undefined;private timeout:number|undefined;private retries=0;private lastError=Number.NEGATIVE_INFINITY;private lastConfirmed=0;private live=false;private frozenAt=0;private snapshot:ActivitySnapshot={tasks:[]};busy=false;
 constructor(private options:ObserverOptions){}
 start(){this.reconnect();}
 refresh(){if(!this.disposed)this.reconnect();}
 online(){if(!this.disposed&&!this.request&&(!this.live||!this.closeEvents||this.options.clock.now()-this.lastConfirmed>=15000))this.reconnect();}
 dispose(){this.disposed=true;this.generation++;this.clearConnections();}
 private clearTimer(key:'quiet'|'retry'|'timeout'){const timer=this[key];if(timer!==undefined)this.options.clock.clearTimeout(timer);this[key]=undefined;}
 private clearConnections(){this.clearTimer('quiet');this.clearTimer('retry');this.clearTimer('timeout');this.closeEvents?.();this.closeEvents=null;this.request?.abort();this.request=null;}
 private disconnected(){if(this.live||!this.frozenAt)this.frozenAt=this.options.clock.now();this.live=false;this.options.publish(this.snapshot,false,this.frozenAt);}
 private confirmed(snapshot:ActivitySnapshot){if(!snapshot||!Array.isArray(snapshot.tasks))return;this.snapshot=snapshot;this.live=true;this.frozenAt=0;this.lastConfirmed=this.options.clock.now();this.retries=0;this.clearTimer('retry');this.options.publish(snapshot,true,0);this.armQuiet();}
 private armQuiet(){this.clearTimer('quiet');this.quiet=this.options.clock.setTimeout(()=>{if(this.disposed)return;if(this.busy||this.snapshot.tasks.some(task=>task?.status==='running'||task?.status==='queued'))this.reconnect();else this.armQuiet();},15000);}
 private scheduleRetry(){this.clearTimer('retry');const delay=Math.min(60000,4000*2**this.retries++);this.retry=this.options.clock.setTimeout(()=>this.reconnect(),delay);}
 private streamError(generation:number){if(this.disposed||generation!==this.generation)return;const now=this.options.clock.now(),recent=now-this.lastError<15000;this.lastError=now;this.generation++;this.closeEvents?.();this.closeEvents=null;this.clearTimer('quiet');this.disconnected();if(recent)this.scheduleRetry();else this.reconnect();}
 private reconnect(){
  if(this.disposed)return;const generation=++this.generation;this.clearConnections();const request=new AbortController();this.request=request;
  this.timeout=this.options.clock.setTimeout(()=>request.abort(),10000);
  void this.options.getSnapshot(request.signal).then(snapshot=>{
   if(this.disposed||generation!==this.generation)return;if(!snapshot||!Array.isArray(snapshot.tasks))throw Error('Invalid activity snapshot');this.clearTimer('timeout');this.request=null;this.confirmed(snapshot);
   this.closeEvents=this.options.openEvents(value=>{if(!this.disposed&&generation===this.generation)this.confirmed(value);},()=>this.streamError(generation));
  }).catch(()=>{if(this.disposed||generation!==this.generation)return;this.clearTimer('timeout');this.request=null;this.disconnected();this.scheduleRetry();});
 }
}

import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {ActivityTask} from './types';
import {activitySession,handoffCandidates,HandoffQueue,rememberTransfer,visitGroup,type Handoff} from './activity-model';
import {useMotionPreference} from './motion-preference';

export function useActivityHandoffs(tasks:ActivityTask[],file:string|undefined,scope:string,connected:boolean,cutoff?:number){
 const instance=useId(),{enabled}=useMotionPreference(),session=useMemo(()=>activitySession(scope||instance,cutoff),[scope,instance,cutoff]);
 const queue=useRef(new HandoffQueue()),previousFile=useRef(''),liveSince=useRef(Date.now()),remaining=useRef(1400),[current,setCurrent]=useState<Handoff|null>(null),[last,setLast]=useState<Handoff|null>(null),[pending,setPending]=useState(0),[epoch,setEpoch]=useState(0);
 const candidates=useMemo(()=>handoffCandidates(tasks),[tasks]);
 useEffect(()=>{queue.current.reset();previousFile.current='';liveSince.current=session.liveSince;remaining.current=1400;setCurrent(null);setLast(null);setPending(0);},[session]);
 useEffect(()=>{
  const changing=previousFile.current!==String(file||'');const firstLive=changing&&!previousFile.current&&!!file&&!session.visited.has(file);
  if(changing){queue.current.clearPending();remaining.current=1400;setCurrent(null);setLast(null);setPending(0);if(file)visitGroup(session,file);previousFile.current=file||'';if(!firstLive){for(const candidate of candidates)rememberTransfer(session,candidate.key);return;}}
  const accepted:Handoff[]=[];const now=Date.now();for(const candidate of candidates){if(session.seen.has(candidate.key))continue;rememberTransfer(session,candidate.key);const age=now-candidate.time;if(enabled&&candidate.time>=liveSince.current&&age>=-5000&&age<=15000)accepted.push(candidate);}
  queue.current.enqueue(accepted);setPending(queue.current.pending.length);if(!enabled){queue.current.clearPending();setCurrent(null);setPending(0);remaining.current=1400;}setEpoch(value=>value+1);
 },[candidates,file,session,enabled]);
 useEffect(()=>{if(!enabled||!connected||current)return;const next=queue.current.take();if(next){remaining.current=1400;setCurrent(next);setLast(next);setPending(queue.current.pending.length);}},[epoch,current,connected,enabled]);
 useEffect(()=>{if(!current||!connected||!enabled)return;const started=performance.now();const timer=window.setTimeout(()=>{remaining.current=1400;setCurrent(null);setEpoch(value=>value+1);},remaining.current);return()=>{window.clearTimeout(timer);remaining.current=Math.max(0,remaining.current-(performance.now()-started));};},[current,connected,enabled]);
 return {current,last,pending,busy:!!current||pending>0,enabled};
}

import {useEffect,useRef,useState} from 'react';
import {get} from './api';
import {ActivityObserver} from './activity-observer';
import {normalizeActivity} from './activity-model';
import type {ActivitySnapshot,ActivityTask} from './types';
export function useActivityObserver(busy:boolean){
 const [observation,setObservation]=useState<{tasks:ActivityTask[];live:boolean;frozenAt:number}>({tasks:[],live:false,frozenAt:0}),observer=useRef<ActivityObserver|null>(null),busyRef=useRef(busy);busyRef.current=busy;
 useEffect(()=>{const current=new ActivityObserver({clock:{now:Date.now,setTimeout:(callback,delay)=>window.setTimeout(callback,delay),clearTimeout:timer=>window.clearTimeout(timer)},getSnapshot:signal=>get<ActivitySnapshot>('/api/activity',signal),openEvents:(snapshot,error)=>{const events=new EventSource('/api/activity/events');events.addEventListener('activity',event=>{try{const value=JSON.parse((event as MessageEvent).data);if(value&&Array.isArray(value.tasks))snapshot(value);}catch{}});events.onerror=error;return()=>events.close();},publish:(snapshot,live,frozenAt)=>setObservation({tasks:normalizeActivity(snapshot.tasks),live,frozenAt})});observer.current=current;current.busy=busyRef.current;const refresh=()=>current.refresh(),online=()=>current.online();window.addEventListener('trace:activity-refresh',refresh);window.addEventListener('online',online);current.start();return()=>{current.dispose();observer.current=null;window.removeEventListener('trace:activity-refresh',refresh);window.removeEventListener('online',online);};},[]);
 useEffect(()=>{if(observer.current)observer.current.busy=busy;},[busy]);
 return observation;
}

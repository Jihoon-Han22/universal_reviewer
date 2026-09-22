import {createContext,useContext,useState,useEffect,type ReactNode} from 'react';
import {MotionConfig} from 'motion/react';
const Context=createContext({enabled:true,toggle:()=>{}});
export function MotionPreferenceProvider({children}:{children:ReactNode}){const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem('trace-demo-motion')!=='off';}catch{return true;}});useEffect(()=>{document.documentElement.dataset.motion=enabled?'full':'reduced';try{localStorage.setItem('trace-demo-motion',enabled?'on':'off');}catch{}},[enabled]);return <Context.Provider value={{enabled,toggle:()=>setEnabled(x=>!x)}}><MotionConfig reducedMotion={enabled?'never':'always'} transition={{duration:enabled ? .28 : 0,ease:[.22,1,.36,1]}}>{children}</MotionConfig></Context.Provider>;}
export const useMotionPreference=()=>useContext(Context);

import {Check,X,CircleHelp,Loader2} from 'lucide-react';
import type {Verdict} from '../types';
export const statusLabels:Record<Verdict,string>={pass:'적합',fail:'부적합',review:'확인 필요',pending:'대조 중'};
export function StatusIcon({status,size=14}:{status:Verdict;size?:number}){const Icon=status==='pass'?Check:status==='fail'?X:status==='review'?CircleHelp:Loader2;return <Icon size={size}/>;}

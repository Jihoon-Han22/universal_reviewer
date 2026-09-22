import {motion} from 'motion/react';
import {FileText} from 'lucide-react';
import type {ReviewPacket} from '../review-presentation';
export default function FlowingPacket({packet,example=false}:{packet:ReviewPacket;example?:boolean}){
 const extraction=packet.kind==='extraction',status=extraction?'extract':packet.item.status,y=status==='pass'?60:status==='review'?240:150;
 const coordinates=extraction?{x:[224,282,348,414,457],y:[150,150,150,150,150],times:[0,.25,.5,.8,1]}:{x:[224,322,420,500,574,618,658,696,755],y:[150,150,150,150,150,150,150+(y-150)*.52,y,y],times:[0,.14,.29,.43,.57,.65,.77,.87,1]};
 const colors:Record<string,string>={pass:'#70f3c4',fail:'#ff9189',review:'#f3cb7c',extract:'#94adff'};
 return <motion.div className={'theater-stream-packet theater-stream-packet-'+status} style={{color:colors[status]}} initial={{left:'20%',top:'50%',opacity:0}} animate={{left:coordinates.x.map(x=>`${x/1120*100}%`),top:coordinates.y.map(y=>`${y/300*100}%`),opacity:coordinates.x.map((_,index)=>index===0||index===coordinates.x.length-1?0:1)}} transition={{duration:extraction?1.3:1.8,delay:packet.delay/1000,ease:'linear',times:coordinates.times,...(example?{repeat:Infinity,repeatDelay:4.6}:{})}} title={`${packet.item.label}: ${packet.item.value??'확인 불가'}`}><span className="theater-packet-trail"/><FileText size={13} strokeWidth={1.6}/><span>{packet.item.label.length>7?packet.item.label.slice(0,7)+'…':packet.item.label}</span></motion.div>;
}

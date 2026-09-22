import {ArrowRight,Play,FileText,FileSpreadsheet,Table2,Image} from 'lucide-react';
import {motion} from 'motion/react';
import {useMotionPreference} from '../motion-preference';
import ReviewTheater from './ReviewTheater';
import '../visual-contract/src/components/landing-intro.css';
export default function LandingIntro({onStart,onSample,loading}:{onStart:()=>void;onSample:()=>void;loading:boolean}){
  const reduced=!useMotionPreference().enabled;
  const appear=(delay:number)=>({
    initial:reduced?false as const:{opacity:0,y:16},
    animate:{opacity:1,y:0},
    transition:{duration:reduced?0:.7,delay:reduced?0:delay,ease:[.22,1,.36,1] as [number,number,number,number]},
  });
  return <section className={`landing-intro-stage${reduced?' is-reduced':''}`}><header className="landing-intro-hero"><motion.div className="landing-intro-copy" {...appear(0)}><div className="landing-intro-kicker"><span/>DOCUMENT INTELLIGENCE<span className="landing-intro-kicker-line"/></div><h1>어떤 문서든,<br/><em>당신의 기준으로<span className="landing-intro-period">.</span></em></h1><p>문서를 읽고, 기준에 맞는지 근거와 함께 검토합니다.</p></motion.div><motion.div className="landing-intro-actions" {...appear(.12)}><div className="landing-intro-buttons"><button className="landing-intro-start" onClick={onStart} disabled={loading}>검토 기준부터 시작하기<ArrowRight size={20}/></button><button className="landing-intro-demo" onClick={onSample} disabled={loading}><Play size={15}/><span>{loading?'예제 불러오는 중':'경비 예제로 체험'}</span></button></div><div className="landing-intro-formats" aria-label="PDF, Word, XLSX, CSV, 이미지 문서 지원">{[[FileText,'PDF'],[FileText,'Word'],[FileSpreadsheet,'XLSX'],[Table2,'CSV'],[Image,'이미지']].map(([Icon,label]:any,index:number)=><motion.span key={label} {...appear(.22+index*.045)}><Icon size={12}/>{label}</motion.span>)}<i/><small>자연어로 기준 입력</small></div></motion.div></header><motion.div className="landing-intro-theater" {...appear(.2)}><ReviewTheater preview/></motion.div></section>;}

// Bounded, sequential, pre-action sampling. Imports start no clocks or browser work.
export const CALIBRATION_POLICY=Object.freeze({maximumSamples:3,maximumBracketMs:100,selection:'first valid sample before native actions',pending:'no next sample until all current commands settle; existing owned scenario deadline fences pending work'});
const ORIGIN='http://127.0.0.1:5210/';
const stamp=()=>({at:new Date().toISOString(),monotonicMs:performance.now()});
export function inspectCalibration(sample,expectedTimeOrigin=null){
 const timestamp=value=>{const a=value?.metrics?.filter(x=>x.name==='Timestamp')??[];return a.length===1?a[0].value*1000:NaN;};
 const before=timestamp(sample?.before),after=timestamp(sample?.after),r=sample?.renderer?.result?.value;
 const valid=Number.isFinite(before)&&Number.isFinite(after)&&after>=before&&after-before<=100&&Number.isFinite(r?.timeOrigin)&&Number.isFinite(r?.monotonicMs)&&r?.href===ORIGIN&&!sample?.renderer?.exceptionDetails&&(expectedTimeOrigin===null||r.timeOrigin===expectedTimeOrigin);
 return {valid,beforeMs:Number.isFinite(before)?before:null,afterMs:Number.isFinite(after)?after:null,widthMs:Number.isFinite(after-before)?after-before:null,timeOrigin:r?.timeOrigin??null};
}
export async function collectPreActionCalibration(cdp,raw,{clock=stamp}={}){
 if(raw.calibrationAdmission||raw.clockCalibrationSamples||raw.actionAdmission)throw Error('Calibration admission is single-use and before actions only');
 raw.clockCalibrationSamples=[];raw.calibrationAdmission={status:'PENDING',started:clock(),selectedOrdinal:null,policy:CALIBRATION_POLICY};let expectedTimeOrigin=null;
 for(let ordinal=1;ordinal<=3;ordinal++){
  const sample={ordinal,started:clock()};raw.clockCalibrationSamples.push(sample);
  try{sample.before=await cdp.send('Performance.getMetrics');sample.renderer=await cdp.send('Runtime.evaluate',{expression:'({timeOrigin:performance.timeOrigin,monotonicMs:performance.now(),href:location.href})',returnByValue:true});sample.after=await cdp.send('Performance.getMetrics');}
  catch(e){sample.error={name:e?.name??'Error',message:String(e?.message??e)};sample.ended=clock();raw.calibrationAdmission.status='ERROR';raw.calibrationAdmission.ended=clock();throw e;}
  sample.ended=clock();const r=sample.renderer?.result?.value;if(expectedTimeOrigin===null&&Number.isFinite(r?.timeOrigin))expectedTimeOrigin=r.timeOrigin;
  sample.assessment=inspectCalibration(sample,expectedTimeOrigin);
  if(sample.assessment.valid){raw.clockCalibration=sample;raw.calibrationAdmission.status='READY';raw.calibrationAdmission.selectedOrdinal=ordinal;raw.calibrationAdmission.expectedTimeOrigin=expectedTimeOrigin;raw.calibrationAdmission.ended=clock();return sample;}
 }
 raw.calibrationAdmission.status='INVALID';raw.calibrationAdmission.ended=clock();throw Error('CALIBRATION_ADMISSION_FAILED: all three pre-action brackets failed the unchanged100ms criterion');
}
export function calibrationAdmissionProblems(raw){
 const problems=[],samples=raw.clockCalibrationSamples,admission=raw.calibrationAdmission,action=raw.actionAdmission;
 if(!Array.isArray(samples)||samples.length<1||samples.length>3)return ['Missing/bad bounded calibration sample list'];
 if(admission?.status!=='READY'||JSON.stringify(admission.policy)!==JSON.stringify(CALIBRATION_POLICY))problems.push('Calibration admission was not ready under the frozen policy');
 let origin=null,firstValid=null;
 for(let i=0;i<samples.length;i++){const s=samples[i],r=s.renderer?.result?.value;if(origin===null&&Number.isFinite(r?.timeOrigin))origin=r.timeOrigin;const assessed=inspectCalibration(s,origin);if(s.ordinal!==i+1||s.error||JSON.stringify(assessed)!==JSON.stringify(s.assessment))problems.push('Sample order/assessment/error mismatch');if(assessed.valid&&firstValid===null)firstValid=i+1;if(!Number.isFinite(s.started?.monotonicMs)||!Number.isFinite(s.ended?.monotonicMs)||s.ended.monotonicMs<s.started.monotonicMs||(i&&s.started.monotonicMs<samples[i-1].ended.monotonicMs))problems.push('Sample timing is missing/inverted/overlapping');}
 if(firstValid===null||admission?.selectedOrdinal!==firstValid||samples.length!==firstValid||JSON.stringify(raw.clockCalibration)!==JSON.stringify(samples[firstValid-1]))problems.push('Selection is not the first valid complete sample');
 if(origin!==admission?.expectedTimeOrigin)problems.push('Calibrated renderer origin changed');
 if(!Number.isFinite(admission?.ended?.monotonicMs)||!Number.isFinite(action?.monotonicMs)||admission.ended.monotonicMs>action.monotonicMs||samples.some(s=>s.ended?.monotonicMs>action?.monotonicMs))problems.push('Calibration is not durably before native actions');
 return problems;
}

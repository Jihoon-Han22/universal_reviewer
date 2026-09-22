import {prompt,schemas,systemInstruction} from './pipeline-prompts.mjs';
export function originalVisualParts(document,pages){const parts=[{inlineData:{mimeType:document.mime,data:Buffer.from(document.buffer).toString('base64')}}];for(const image of document.pdfPageImages||[])if(pages.includes(image.page))parts.push({text:prompt('visual-quality-judge:text-part:71',{number:image.page})},{inlineData:{mimeType:image.mimeType,data:image.data}});return parts;}
export function validateVisualJudge(raw,requestedPages){
  if(!raw||typeof raw.acceptable!=='boolean'||!Array.isArray(raw.issues)||raw.issues.length>100||!Array.isArray(raw.rereadPages)||raw.rereadPages.length>30)throw new Error('Invalid visual judge');
  for(const issue of raw.issues)if(!requestedPages.includes(issue.page)||typeof issue.detail!=='string'||!issue.detail.trim()||issue.detail.length>2000)throw new Error('Invalid visual issue');
  if(raw.rereadPages.some(page=>!requestedPages.includes(page)))throw new Error('Invalid reread page');
  if(raw.verificationLimits!==undefined&&(!Array.isArray(raw.verificationLimits)||raw.verificationLimits.length>30||raw.verificationLimits.some(v=>typeof v!=='string'||v.length>2000)))throw new Error('Invalid visual verification limit');
  if(raw.blankPages!==undefined&&(!Array.isArray(raw.blankPages)||raw.blankPages.some(p=>!requestedPages.includes(p.page)||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>2000)))throw new Error('Invalid blank page confirmation');
  return raw;
}
export async function judgeVisualTranscription(document,pages,{gemini,signal,commonSystem=true,expectedPages}={}){const requestedPages=pages.map(p=>p.page),response=await gemini.generateJson({role:'extract',schema:schemas.visualQualityJudgeSchema,systemInstruction:systemInstruction('visual-quality-judge:SYSTEM:39',commonSystem),contents:[{text:prompt('visual-quality-judge:returned-template:78',{document,pages,requestedPages,expectedPages})},...originalVisualParts(document,requestedPages)],maxOutputTokens:4000,signal});return validateVisualJudge(response.data,requestedPages);}

import {parseRange,parseAddress,sourceLines,excelColumn} from './document-source.mjs';
export function validateRequeryRequest(request,profile) {
  if(!request||typeof request!=='object')return null;
  if(request.kind==='sheet') { const range=parseRange(request.range);return range&&(profile.sheets||[]).some(s=>s.name===request.sheet)?{kind:'sheet',sheet:request.sheet,range:range.range}:null; }
  if(!['blocks','text'].includes(request.kind))return null;
  const size=request.kind==='blocks'?(profile.blocks||[]).length:sourceLines(profile.text).length,cap=request.kind==='blocks'?200:1000;
  return Number.isInteger(request.start)&&Number.isInteger(request.end)&&request.start>=1&&request.end>=request.start&&request.end<=size&&request.end-request.start+1<=cap?{kind:request.kind,start:request.start,end:request.end}:null;
}
export function fallbackRequeryRequests(profile) {
  if(profile.sheets?.length)return profile.sheets.slice(0,8).map(sheet=>{const positions=sheet.rows.flatMap(row=>row.cells).map(c=>parseAddress(c.cell)).filter(Boolean),bounds=positions.reduce((b,p)=>({left:Math.min(b.left,p.col),right:Math.max(b.right,p.col),top:Math.min(b.top,p.row),bottom:Math.max(b.bottom,p.row)}),{left:16384,right:1,top:1048576,bottom:1});return {kind:'sheet',sheet:sheet.name,range:positions.length?`${excelColumn(bounds.left)}${bounds.top}:${excelColumn(bounds.right)}${bounds.bottom}`:'A1'};});
  if(profile.blocks?.length)return [{kind:'blocks',start:1,end:Math.min(200,profile.blocks.length)}];
  const length=sourceLines(profile.text).length;return length?[{kind:'text',start:1,end:Math.min(1000,length)}]:[];
}
export function selectRequeryRequests(issues,profile) { const proposed=issues.map(i=>i.request).filter(Boolean),selected=proposed.length?proposed:fallbackRequeryRequests(profile),map=new Map();for(const request of selected){const valid=validateRequeryRequest(request,profile);if(valid)map.set(JSON.stringify(valid),valid);}return [...map.values()].slice(0,8); }

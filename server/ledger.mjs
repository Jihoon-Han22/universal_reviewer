import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

export class LedgerError extends Error { constructor(message, status = 400) { super(message); this.name = 'LedgerError'; this.status = status; } }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new LedgerError(message); };
const text = cell => cell.value == null ? '' : cell.text;
const escapeXml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const unescapeXml = value => value.replace(/&(?:amp|lt|gt|quot|apos);/g, ch => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[ch]));
const attributes = value => Object.fromEntries([...value.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m => [m[1],unescapeXml(m[3])]));
const columnName = index => { let out=''; for (;index;index=Math.floor((index-1)/26)) out=String.fromCharCode(65+(index-1)%26)+out; return out; };
const columnNumber = name => [...name].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const normalizeHeader = value => String(value ?? '').normalize('NFKC').replace(/[\s\u200b-\u200d\uFEFF._()\-]/g,'').toLowerCase();
const roles = {key:new Set(['성적서번호','시험성적서번호','성적서no','reportno','reportnumber','certificateno','certificatenumber']),result:new Set(['판정','검토결과','최종판정','판정결과','결과판정']),note:new Set(['비고','검토의견','판정사유','검토비고'])};
const reasons = {headers_not_found:'성적서번호, 판정, 비고 열을 함께 찾지 못했습니다.',ambiguous_headers:'같은 역할의 열이 여러 개여서 기록 위치를 확정할 수 없습니다.',key_not_found:'입력한 성적서번호와 정확히 일치하는 행을 찾지 못했습니다.',duplicate_key:'같은 성적서번호가 여러 행에 있습니다.',protected_sheet:'보호된 시트에는 기록할 수 없습니다.',formula_key:'성적서번호가 수식으로 구성되어 있습니다.',merged_target:'성적서번호 또는 기록할 셀이 병합되어 있습니다.',formula_target:'기록할 셀에 수식이 있습니다.',aggregate_row:'합계 행에는 기록할 수 없습니다.'};

// Validate declarations and bounded decompression before either workbook parser runs.
export function validateLedgerZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > 20*1024*1024) fail('20MB 이하의 올바른 XLSX 파일을 선택해 주세요.');
  let eocd=-1;
  for(let p=buffer.length-22;p>=Math.max(0,buffer.length-65557);p--) if(buffer.readUInt32LE(p)===0x06054b50 && p+22+buffer.readUInt16LE(p+20)===buffer.length){eocd=p;break;}
  if(eocd<0) fail('XLSX 압축 파일의 구조가 올바르지 않습니다.');
  const count=buffer.readUInt16LE(eocd+10),size=buffer.readUInt32LE(eocd+12),offset=buffer.readUInt32LE(eocd+16);
  if(buffer.readUInt16LE(eocd+4)||buffer.readUInt16LE(eocd+6)||count<1||count>20000||buffer.readUInt16LE(eocd+8)!==count||offset+size!==eocd) fail('지원하지 않는 XLSX 압축 구조입니다.');
  let p=offset, declared=0, actual=0;
  for(let n=0;n<count;n++) {
    if(p+46>eocd||buffer.readUInt32LE(p)!==0x02014b50) fail('XLSX 압축 목록이 올바르지 않습니다.');
    const flags=buffer.readUInt16LE(p+8),method=buffer.readUInt16LE(p+10),compressed=buffer.readUInt32LE(p+20),expanded=buffer.readUInt32LE(p+24),local=buffer.readUInt32LE(p+42);
    const next=p+46+buffer.readUInt16LE(p+28)+buffer.readUInt16LE(p+30)+buffer.readUInt16LE(p+32);
    if(next>eocd||flags&1||![0,8].includes(method)||buffer.readUInt16LE(p+34)||local+30>offset||buffer.readUInt32LE(local)!==0x04034b50||buffer.readUInt16LE(local+8)!==method||buffer.readUInt16LE(local+6)&1) fail('지원하지 않는 XLSX 압축 항목입니다.');
    declared+=expanded; if(declared>100*1024*1024) fail('XLSX 압축 해제 크기가 허용 범위를 초과했습니다.');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28),end=start+compressed;
    if(end>offset) fail('XLSX 압축 항목이 손상되었습니다.');
    let data; try {data=method===0?buffer.subarray(start,end):inflateRawSync(buffer.subarray(start,end),{maxOutputLength:Math.max(1,Math.min(expanded,100*1024*1024-actual))});} catch {fail('XLSX 압축 항목을 안전하게 읽을 수 없습니다.');}
    if(data.length!==expanded) fail('XLSX 압축 항목 크기가 일치하지 않습니다.'); actual+=data.length; if(actual>100*1024*1024) fail('XLSX 압축 해제 크기가 허용 범위를 초과했습니다.');
    p=next;
  }
  if(p!==eocd) fail('XLSX 압축 목록 개수가 일치하지 않습니다.');
}
async function loadLedger(buffer) {
  validateLedgerZip(buffer);
  try {
    const zip=await JSZip.loadAsync(buffer); if(!zip.file('xl/workbook.xml')) fail('XLSX 워크북을 찾을 수 없습니다.');
    const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
    if(workbook.worksheets.length>30) fail('검토대장은 30개 이하의 시트를 지원합니다.');
    for(const sheet of workbook.worksheets) if(sheet.rowCount>10000||sheet.columnCount>200) fail('검토대장의 행 또는 열 수가 허용 범위를 초과했습니다.');
    return {zip,workbook};
  } catch(error) {if(error instanceof LedgerError) throw error; fail('올바른 XLSX 검토대장을 읽을 수 없습니다.');}
}
async function sheetXml(zip,name) {
  const book=await zip.file('xl/workbook.xml').async('string'), relfile=zip.file('xl/_rels/workbook.xml.rels');
  if(!relfile) fail('시트 연결 정보를 찾을 수 없습니다.');
  const sheet=[...book.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?\s*>/g)].map(m=>attributes(m[1])).find(a=>a.name===name);
  const rel=[...(await relfile.async('string')).matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?\s*>/g)].map(m=>attributes(m[1])).find(a=>a.Id===sheet?.['r:id']);
  if(!rel||rel.TargetMode==='External') fail('시트 연결 정보가 올바르지 않습니다.');
  const location=rel.Target.startsWith('/')?rel.Target.slice(1):path.posix.normalize(path.posix.join('xl',rel.Target));
  if(!location.startsWith('xl/worksheets/')||!zip.file(location)) fail('시트 파일을 찾을 수 없습니다.');
  return {location,xml:await zip.file(location).async('string')};
}
function inFormulaRange(xml,address) {
  const point=/^([A-Z]+)(\d+)$/.exec(address); const col=columnNumber(point[1]),row=+point[2];
  return [...xml.matchAll(/<(?:\w+:)?f\b([^>]*)>/g)].some(m=>{const ref=attributes(m[1]).ref?.replaceAll('$',''); const bounds=/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(ref||''); if(!bounds)return false;return col>=columnNumber(bounds[1])&&col<=columnNumber(bounds[3]||bounds[1])&&row>=+bounds[2]&&row<=+(bounds[4]||bounds[2]);});
}
export async function analyzeLedger(buffer,key) {
  if(typeof key!=='string'||key.length>200||!key.trim()) fail('200자 이내의 성적서번호를 입력해 주세요.'); key=key.trim();
  const {workbook,zip}=await loadLedger(buffer); const tables=[]; let visited=0;
  for(const sheet of workbook.worksheets) sheet.eachRow(row=>{visited+=row.cellCount;if(visited>100000) fail('검토대장 탐색 셀 수가 허용 범위를 초과했습니다.');const cols={key:[],result:[],note:[]};row.eachCell((cell,n)=>{const norm=normalizeHeader(text(cell));for(const role of Object.keys(roles))if(roles[role].has(norm))cols[role].push(n);});if(Object.values(cols).every(c=>c.length))tables.push({sheet,row:row.number,cols});});
  const blocked=(code,extra={})=>({status:'blocked',code,reason:reasons[code],key,sheet:null,keyColumn:null,resultColumn:null,noteColumn:null,matchingRows:[],targetCells:[],existingValues:{},...extra});
  if(!tables.length)return blocked('headers_not_found'); if(tables.some(t=>Object.values(t.cols).some(c=>c.length>1)))return blocked('ambiguous_headers');
  const matches=[]; for(const table of tables) {const end=tables.filter(t=>t.sheet===table.sheet&&t.row>table.row).reduce((n,t)=>Math.min(n,t.row),table.sheet.rowCount+1);for(let row=table.row+1;row<end;row++)if(text(table.sheet.getRow(row).getCell(table.cols.key[0])).trim()===key)matches.push({...table,matchRow:row});}
  if(!matches.length)return blocked('key_not_found');if(matches.length>1)return blocked('duplicate_key',{matchingRows:matches.map(m=>m.matchRow),candidates:matches.map(m=>({sheet:m.sheet.name,row:m.matchRow}))});
  const found=matches[0],{sheet,cols,matchRow}=found; const keyColumn=columnName(cols.key[0]),resultColumn=columnName(cols.result[0]),noteColumn=columnName(cols.note[0]),targetCells=[resultColumn+matchRow,noteColumn+matchRow],keyCell=sheet.getCell(keyColumn+matchRow),targets=targetCells.map(a=>sheet.getCell(a));
  const details={sheet:sheet.name,headerRow:found.row,keyColumn,resultColumn,noteColumn,matchingRows:[matchRow],targetCells,existingValues:Object.fromEntries(targetCells.map((a,n)=>[a,text(targets[n])])),sourceDigest:sha(buffer)};
  const {xml}=await sheetXml(zip,sheet.name);
  if(sheet.sheetProtection?.sheet||[...xml.matchAll(/<(?:\w+:)?sheetProtection\b([^>]*)>/g)].some(m=>['1','true'].includes(attributes(m[1]).sheet)))return blocked('protected_sheet',details);
  if(keyCell.type===ExcelJS.ValueType.Formula)return blocked('formula_key',details);
  if([keyCell,...targets].some(c=>c.isMerged))return blocked('merged_target',details);
  if(targets.some(c=>c.type===ExcelJS.ValueType.Formula))return blocked('formula_target',details);
  if(inFormulaRange(xml,keyCell.address))return blocked('formula_key',details);
  if(targetCells.some(a=>inFormulaRange(xml,a)))return blocked('formula_target',details);
  let aggregate=false;sheet.getRow(matchRow).eachCell(cell=>{if(/^(합계|소계|총계|총합계|total|subtotal)$/i.test(text(cell).trim()))aggregate=true;});if(aggregate)return blocked('aggregate_row',details);
  return {status:'ready',code:null,reason:'',key,...details};
}
export function createLedgerProposal(run,sourceDocumentId) {
  if(!run||!['completed','partial'].includes(run.status))throw new LedgerError('검토를 완료한 후 대장에 기록할 수 있습니다.',409);
  const document=run.documents.find(d=>d.id===sourceDocumentId);if(!document)fail('검토 대상 문서를 찾을 수 없습니다.');
  const items=run.items.filter(i=>i.documentId===sourceDocumentId); const counts={total:items.length,pass:items.filter(i=>i.status==='pass').length,fail:items.filter(i=>i.status==='fail').length,review:items.filter(i=>i.status==='review').length};
  const incomplete=document.status!=='completed'||!items.length||items.some(i=>!['pass','fail','review'].includes(i.status)); const result=counts.fail?'부적합':counts.review||incomplete?'확인 필요':'적합';
  const lines=[`${document.name}: ${counts.total}개 검토 (적합 ${counts.pass}, 부적합 ${counts.fail}, 확인 필요 ${counts.review})`];if(incomplete)lines.push('문서 검토가 불완전합니다. 누락·처리 오류 확인이 필요합니다.'); lines.push(...items.filter(i=>i.status!=='pass').slice(0,5).map(i=>`${i.label}: ${i.explanation}`));
  const proposal={result,note:lines.join('\n').slice(0,6500),counts,sourceDocumentId,sourceDocumentName:document.name,incomplete}; return {...proposal,fingerprint:sha(Buffer.from(JSON.stringify(proposal)))};
}
function replaceCell(xml,address,value) {
  const rowNum=/\d+$/.exec(address)[0];const rowRe=new RegExp(`<((?:\\w+:)?row)\\b([^>]*\\br=["']${rowNum}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`);
  const rowMatch=rowRe.exec(xml);if(!rowMatch) fail('기록할 행 XML을 찾을 수 없습니다.');const row=rowMatch[0],prefix=rowMatch[1].includes(':')?rowMatch[1].split(':')[0]+':':'';
  const cellRe=new RegExp(`<((?:\\w+:)?c)\\b([^>]*\\br=["']${address}["'][^>]*)(?:\\/>|>([\\s\\S]*?)<\\/\\1>)`);const current=cellRe.exec(row);const cellPrefix=current?(current[1].includes(':')?current[1].split(':')[0]+':':''):prefix;let attrs=current?current[2]:` r="${address}"`;attrs=attrs.replace(/\s+t\s*=\s*(["']).*?\1/g,'');const replacement=`<${cellPrefix}c${attrs} t="inlineStr"><${cellPrefix}is><${cellPrefix}t xml:space="preserve">${escapeXml(value)}</${cellPrefix}t></${cellPrefix}is></${cellPrefix}c>`;
  let changed;if(current)changed=row.replace(cellRe,()=>replacement);else {const next=[...row.matchAll(/<(?:\w+:)?c\b[^>]*\br=["']([A-Z]+)\d+["'][^>]*(?:\/>|>)/g)].find(m=>columnNumber(m[1])>columnNumber(address.replace(/\d+$/,'')));const at=next?.index??row.lastIndexOf('</');changed=row.slice(0,at)+replacement+row.slice(at);}
  return xml.slice(0,rowMatch.index)+changed+xml.slice(rowMatch.index+row.length);
}
const stripCells=(xml,addresses)=>addresses.reduce((source,a)=>source.replace(new RegExp(`<((?:\\w+:)?c)\\b[^>]*\\br=["']${a}["'][^>]*(?:\\/>|>[\\s\\S]*?<\\/\\1>)`),''),xml);
export async function writeLedgerCopy(buffer,mapping,result,note) {
  if(mapping?.status!=='ready'||!['적합','부적합','확인 필요'].includes(result)||typeof note!=='string'||!note.length||note.length>8000||/[\x00-\x08\x0b\x0c\x0e-\x1f\uFFFE\uFFFF]/.test(note))fail('기록할 판정과 비고를 확인해 주세요.');
  const fresh=await analyzeLedger(buffer,mapping.key);const equal=['sheet','key','headerRow','keyColumn','resultColumn','noteColumn','sourceDigest'].every(k=>mapping[k]===fresh[k])&&['targetCells','matchingRows','existingValues'].every(k=>JSON.stringify(mapping[k])===JSON.stringify(fresh[k]));
  if(fresh.status!=='ready'||!equal)throw new LedgerError('대장 또는 기록 위치가 변경되었습니다. 기록 위치를 다시 확인해 주세요.',409);
  const {zip}=await loadLedger(buffer),{location,xml}=await sheetXml(zip,mapping.sheet);let changed=replaceCell(xml,mapping.targetCells[0],result);changed=replaceCell(changed,mapping.targetCells[1],note);
  if(stripCells(xml,mapping.targetCells)!==stripCells(changed,mapping.targetCells))(()=>{throw new LedgerError('대장의 다른 영역이 변경되어 사본을 만들 수 없습니다.',500);})();
  zip.file(location,changed,{createFolders:false});const output=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});const original=await JSZip.loadAsync(buffer),copy=await JSZip.loadAsync(output);
  if(JSON.stringify(Object.keys(original.files).sort())!==JSON.stringify(Object.keys(copy.files).sort()))(()=>{throw new LedgerError('사본의 파일 구성이 원본과 다릅니다.',500);})();
  for(const name of Object.keys(original.files))if(name!==location&&!original.files[name].dir&&!Buffer.from(await original.file(name).async('nodebuffer')).equals(await copy.file(name).async('nodebuffer')))(()=>{throw new LedgerError('대장의 다른 파일이 변경되었습니다.',500);})();
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(output);const sheet=workbook.getWorksheet(mapping.sheet);for(const [n,value]of [result,note].entries()){const cell=sheet.getCell(mapping.targetCells[n]);if(cell.type===ExcelJS.ValueType.Formula||text(cell)!==value)(()=>{throw new LedgerError('기록한 셀을 다시 확인하지 못했습니다.',500);})();}return output;
}

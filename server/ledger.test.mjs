import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {analyzeLedger,writeLedgerCopy,createLedgerProposal,validateLedgerZip} from './ledger.mjs';

async function fixture({offset=0,duplicate=false,formula=false,merge=false,aggregate=false,protectedSheet=false}={}){const w=new ExcelJS.Workbook();const s=w.addWorksheet('임의 검사표');s.getCell(`D${8+offset}`).value='시험 성적서 번호';s.getCell(`F${8+offset}`).value='최종 판정';s.getCell(`H${8+offset}`).value='검토 의견';s.getCell(`D${9+offset}`).value=' R-42 ';s.getCell(`E${9+offset}`).value=17;s.getCell(`F${9+offset}`).value=formula?{formula:'1+1',result:2}:'기존';s.getCell(`F${9+offset}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123456'}};s.getCell(`H${9+offset}`).value='보존 전';s.getCell('A2').value={formula:'10+1',result:11};w.addWorksheet('숨은 보관',{state:'hidden'}).getCell('G33').value='변경 금지';if(duplicate){s.getCell(`D${10+offset}`).value='R-42';}if(merge)s.mergeCells(`H${9+offset}:I${9+offset}`);if(aggregate)s.getCell(`J${9+offset}`).value='합계';if(protectedSheet)await s.protect('test',{spinCount:1});return Buffer.from(await w.xlsx.writeBuffer());}
test('ledger maps headers independently of location and requires exact unique keys',async()=>{for(const offset of [0,17]){const m=await analyzeLedger(await fixture({offset}),' R-42 ');assert.equal(m.status,'ready');assert.deepEqual(m.targetCells,[`F${9+offset}`,`H${9+offset}`]);assert.equal(m.headerRow,8+offset);}assert.equal((await analyzeLedger(await fixture(),'r-42')).code,'key_not_found');assert.equal((await analyzeLedger(await fixture({duplicate:true}),'R-42')).code,'duplicate_key');await assert.rejects(()=>analyzeLedger(Buffer.alloc(25),' '));});
test('unsafe targets are blocked in priority order',async()=>{for(const [config,code]of [[{formula:true},'formula_target'],[{merge:true},'merged_target'],[{aggregate:true},'aggregate_row'],[{protectedSheet:true,formula:true},'protected_sheet']])assert.equal((await analyzeLedger(await fixture(config),'R-42')).code,code);});
test('surgical copy changes exactly two cell nodes and preserves all other entries',async()=>{const original=await fixture(),mapping=await analyzeLedger(original,'R-42'),note='=HYPERLINK("https://invalid") & <태그>\n사용자 확인: 정확한 문자열';const output=await writeLedgerCopy(original,mapping,'부적합',note);const [a,b]=await Promise.all([JSZip.loadAsync(original),JSZip.loadAsync(output)]);assert.deepEqual(Object.keys(a.files).sort(),Object.keys(b.files).sort());const strip=xml=>mapping.targetCells.reduce((s,address)=>s.replace(new RegExp(`<c\\b[^>]*r="${address}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`),''),xml);for(const name of Object.keys(a.files)){if(a.files[name].dir)continue;const before=await a.file(name).async('nodebuffer'),after=await b.file(name).async('nodebuffer');if(name==='xl/worksheets/sheet1.xml')assert.equal(strip(before.toString()),strip(after.toString()));else assert.deepEqual(after,before,name);}const w=new ExcelJS.Workbook();await w.xlsx.load(output);assert.equal(w.worksheets[0].getCell('H9').value,note);assert.equal(w.worksheets[0].getCell('F9').fill.fgColor.argb,'FF123456');assert.equal(w.worksheets[0].getCell('E9').value,17);assert.equal(w.worksheets[0].getCell('A2').formula,'10+1');for(const key of ['sourceDigest','resultColumn','sheet'])await assert.rejects(()=>writeLedgerCopy(original,{...mapping,[key]:'forged'},'적합','note'),error=>error.status===409);});
test('missing target cells are inserted in order without changing other XML',async()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('표');s.addRow(['성적서번호','판정','비고','값']);s.addRow(['R',null,null,8]);const bytes=Buffer.from(await w.xlsx.writeBuffer()),mapping=await analyzeLedger(bytes,'R');const out=await writeLedgerCopy(bytes,mapping,'적합','완료');await w.xlsx.load(out);assert.equal(w.worksheets[0].getCell('B2').value,'적합');assert.equal(w.worksheets[0].getCell('C2').value,'완료');assert.equal(w.worksheets[0].getCell('D2').value,8);});
test('proposal only fingerprints serialized selected document values',()=>{const run={status:'completed',documents:[{id:'a',name:'A',status:'completed'},{id:'b',name:'B',status:'completed'}],items:[{id:'1',documentId:'a',status:'pass',label:'밀도',explanation:'통과'},{id:'2',documentId:'b',status:'fail'}]};const first=createLedgerProposal(run,'a');assert.equal(first.result,'적합');run.items[0].humanNote='사람 메모';run.items[0].reviewedByHuman=true;run.items[1].explanation='다른 문서';assert.equal(createLedgerProposal(run,'a').fingerprint,first.fingerprint);run.items[0].status='review';assert.equal(createLedgerProposal(run,'a').result,'확인 필요');assert.notEqual(createLedgerProposal(run,'a').fingerprint,first.fingerprint);run.items[0].status='fail';run.documents[0].status='partial';assert.equal(createLedgerProposal(run,'a').result,'부적합');assert.equal(createLedgerProposal(run,'a').incomplete,true);});
test('malformed central directory counts rejected before loading workbook',async()=>{const bytes=await fixture();const forged=Buffer.from(bytes);const end=forged.length-22;forged.writeUInt16LE(forged.readUInt16LE(end+10)+1,end+10);assert.throws(()=>validateLedgerZip(forged));assert.throws(()=>validateLedgerZip(Buffer.alloc(22)));});
test('later tables use their own headers, ambiguous roles block globally, hidden duplicates count',async()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('복합');s.addRow(['성적서번호','판정','비고']);s.addRow(['first','','']);s.getCell('E12').value='성적서번호';s.getCell('G12').value='판정';s.getCell('J12').value='비고';s.getCell('E14').value='second';let bytes=Buffer.from(await w.xlsx.writeBuffer());assert.deepEqual((await analyzeLedger(bytes,'second')).targetCells,['G14','J14']);assert.equal((await analyzeLedger(bytes,'first')).headerRow,1);s.getCell('K12').value='검토의견';bytes=Buffer.from(await w.xlsx.writeBuffer());assert.equal((await analyzeLedger(bytes,'first')).code,'ambiguous_headers');s.getCell('K12').value=null;const hidden=w.addWorksheet('숨김',{state:'hidden'});hidden.addRow(['성적서번호','판정','비고']);hidden.addRow(['first']);bytes=Buffer.from(await w.xlsx.writeBuffer());const duplicate=await analyzeLedger(bytes,'first');assert.equal(duplicate.code,'duplicate_key');assert.deepEqual(duplicate.candidates,[{sheet:'복합',row:2},{sheet:'숨김',row:2}]);});
test('array formula range blocks a target away from its anchor',async()=>{const original=await fixture(),zip=await JSZip.loadAsync(original);let xml=await zip.file('xl/worksheets/sheet1.xml').async('string');xml=xml.replace('</row><row r="9"','</row><row r="9"');xml=xml.replace('<c r="H9"','<c r="G9"><f t="array" ref="G9:H9">1+1</f><v>2</v></c><c r="H9"');zip.file('xl/worksheets/sheet1.xml',xml);const bytes=await zip.generateAsync({type:'nodebuffer'});assert.equal((await analyzeLedger(bytes,'R-42')).code,'formula_target');});
test('existing ledger cells preserve dollar replacement tokens literally',async()=>{
  const original=await fixture(),mapping=await analyzeLedger(original,'R-42');
  const note=['가격 $$100','원문 $&','참조 $1 및 $2',"접두 $` / 접미 $'",'XML & <태그> "인용"'].join('\n');
  const output=await writeLedgerCopy(original,mapping,'적합',note);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(output);
  assert.equal(workbook.worksheets[0].getCell('H9').value,note);
  assert.equal(workbook.worksheets[0].getCell('H9').type,ExcelJS.ValueType.String);
  assert.equal(workbook.worksheets[0].getCell('F9').value,'적합');
  assert.equal(workbook.worksheets[0].getCell('F9').fill.fgColor.argb,'FF123456');
  const before=await JSZip.loadAsync(original),after=await JSZip.loadAsync(output);
  const strip=xml=>mapping.targetCells.reduce((s,address)=>s.replace(new RegExp(`<c\\b[^>]*r="${address}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`),''),xml);
  assert.deepEqual(Object.keys(after.files).sort(),Object.keys(before.files).sort());
  for(const name of Object.keys(before.files)){
    if(before.files[name].dir)continue;
    const [left,right]=await Promise.all([before.file(name).async('nodebuffer'),after.file(name).async('nodebuffer')]);
    if(name==='xl/worksheets/sheet1.xml')assert.equal(strip(right.toString()),strip(left.toString()));
    else assert.deepEqual(right,left,name);
  }
});
test('surgical copy preserves archives without explicit directory entries',async()=>{
  const source=await JSZip.loadAsync(await fixture()),minimal=new JSZip();
  for(const entry of Object.values(source.files))if(!entry.dir)minimal.file(entry.name,await entry.async('nodebuffer'),{createFolders:false});
  const original=await minimal.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),unchanged=Buffer.from(original);
  const before=await JSZip.loadAsync(original);
  assert.ok(Object.values(before.files).every(entry=>!entry.dir));
  const mapping=await analyzeLedger(original,'R-42'),note='디렉터리 항목 없는 원본 보존';
  assert.equal(mapping.status,'ready');
  const output=await writeLedgerCopy(original,mapping,'확인 필요',note),after=await JSZip.loadAsync(output);
  assert.deepEqual(original,unchanged);
  assert.deepEqual(Object.keys(after.files).sort(),Object.keys(before.files).sort());
  assert.ok(Object.values(after.files).every(entry=>!entry.dir));
  const strip=xml=>mapping.targetCells.reduce((s,address)=>s.replace(new RegExp(`<c\\b[^>]*r="${address}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`),''),xml);
  for(const name of Object.keys(before.files)){
    const [left,right]=await Promise.all([before.file(name).async('nodebuffer'),after.file(name).async('nodebuffer')]);
    if(name==='xl/worksheets/sheet1.xml')assert.equal(strip(right.toString()),strip(left.toString()));
    else assert.deepEqual(right,left,name);
  }
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(output);
  assert.equal(workbook.worksheets[0].getCell('F9').value,'확인 필요');
  assert.equal(workbook.worksheets[0].getCell('H9').value,note);
  assert.equal(workbook.worksheets[0].getCell('F9').fill.fgColor.argb,'FF123456');
  assert.equal(workbook.worksheets[0].getCell('A2').formula,'10+1');
});

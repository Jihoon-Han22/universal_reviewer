import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { DocumentStore, cleanFilename, publicTablePreview, validateOOXML } from './documents.mjs';
import { loadSample } from './samples.mjs';
import { validateGoldenRequest, loadGolden } from './golden-catalog.mjs';

test('uploads retain bytes and serialize only the public document allowlist',async () => {
  const store = new DocumentStore(), original = Buffer.from('기준\n강도 30 이상');
  const doc = await store.add({name:'../품질.txt',buffer:original,role:'criteria'});
  original[0] = 0;
  assert.equal(doc.name,'품질.txt'); assert.equal(doc.buffer.toString(),'기준\n강도 30 이상');
  assert.deepEqual(Object.keys(store.public(doc)),['id','name','kind','mime','size','role','url','preview']);
  assert.equal(store.public(doc).preview.type,'text'); assert.equal(doc.role,'criteria');
});
test('filename mojibake decoding is conditional and paths/control bytes are removed',() => {
  assert.equal(cleanFilename(Buffer.from('기준.txt').toString('latin1')),'기준.txt');
  assert.equal(cleanFilename('C:\\upload\\기\u0000준.txt'),'기준.txt');
  assert.equal(cleanFilename('é.txt'),'é.txt');
});
test('UTF8, NUL, JSON and signatures are verified independently of extension',async () => {
  const store = new DocumentStore();
  for (const [name,buffer] of [['bad.txt',Buffer.from([0xff])],['bad.txt',Buffer.from('a\0b')],['bad.json',Buffer.from('{')],['bad.pdf',Buffer.from('not PDF')],['bad.png',Buffer.from('not PNG')],['old.xls',Buffer.from('legacy')]]) await assert.rejects(store.add({name,buffer,role:'target'}));
  assert.equal(store.size,0); assert.equal(store.pendingBytes,0); assert.equal(store.pendingDocuments,0);
});
test('store reservation enforces 100 documents even during concurrent parsing',async () => {
  let release; const gate = new Promise(resolve => {release=resolve;});
  const store = new DocumentStore({parse:async()=>{await gate;return {preview:{type:'text',text:'x'},modelParts:[]};}});
  const pending = Array.from({length:100},(_,i)=>store.add({name:`${i}.txt`,buffer:Buffer.from('x'),role:'target'}));
  await assert.rejects(store.add({name:'overflow.txt',buffer:Buffer.from('x')}),{status:413});
  release(); await Promise.all(pending); assert.equal(store.size,100); assert.equal(store.totalBytes,100);
});
test('file boundary and parse failures release reservations',async () => {
  const store = new DocumentStore({parse:async()=>{throw new Error('synthetic parse');}});
  await assert.rejects(store.add({name:'too.txt',buffer:Buffer.alloc(20*1024*1024+1)}),{status:413});
  await assert.rejects(store.add({name:'empty.txt',buffer:Buffer.alloc(0)}),{status:400});
  await assert.rejects(store.add({name:'okay.txt',buffer:Buffer.from('x')}));
  assert.equal(store.pendingBytes,0); assert.equal(store.pendingDocuments,0);
});
test('public preview cell clipping alone does not mark table truncated',()=>{
  const preview=publicTablePreview([{name:'A',rows:[['x'.repeat(3000)]]}]);
  assert.equal(preview.sheets[0].rows[0][0].length,2000); assert.equal(preview.truncated,undefined);
  assert.equal(publicTablePreview([{name:'A',rows:Array.from({length:101},()=>['a'])}]).truncated,true);
});
test('XLSX formula cache sentinel and source cell length survive local parsing',async()=>{
  const workbook=new ExcelJS.Workbook(), sheet=workbook.addWorksheet('기준');
  sheet.getCell('A1').value='x'.repeat(3000); sheet.getCell('B2').value={formula:'1+1'}; sheet.getCell('C2').value={formula:'1+1',result:2};
  const buffer=Buffer.from(await workbook.xlsx.writeBuffer()); const store=new DocumentStore(); const doc=await store.add({name:'data.xlsx',buffer,role:'criteria'});
  assert.equal(doc.sourceSheets[0].rows[0].cells[0].text.length,3000);
  assert.match(doc.sourceSheets[0].rows[1].cells[0].text,/계산 결과 없음/);
  assert.equal(doc.sourceSheets[0].rows[1].cells[1].text,'2'); assert.deepEqual(doc.buffer,buffer);
});
test('XLSX more than 30 local sheets defers preview and preserves original bytes',async()=>{
  const w=new ExcelJS.Workbook(); for(let i=0;i<31;i++)w.addWorksheet(`S${i}`).getCell('A1').value='x';
  const buffer=Buffer.from(await w.xlsx.writeBuffer()); const d=await new DocumentStore().add({name:'many.xlsx',buffer});
  assert.equal(d.preview.type,'text'); assert.equal(d.preview.truncated,true); assert.deepEqual(d.sourceSheets,[]); assert.match(d.source,/LOCAL_PREVIEW_INCOMPLETE:/); assert.deepEqual(d.buffer,buffer);
});
test('ZIP admission rejects local name mismatches, encrypted entries and length corruption',async()=>{
  const zip=new JSZip(); zip.file('[Content_Types].xml','<Types/>');zip.file('xl/workbook.xml','<workbook/>',{createFolders:false});const original=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
  assert.equal(validateOOXML(original,'xlsx').size,2);
  const renamed=Buffer.from(original); renamed[30]^=1;assert.throws(()=>validateOOXML(renamed,'xlsx'));
  const encrypted=Buffer.from(original);encrypted.writeUInt16LE(1,6);assert.throws(()=>validateOOXML(encrypted,'xlsx'));
  const length=Buffer.from(original);const central=length.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));length.writeUInt32LE(999,central+24);assert.throws(()=>validateOOXML(length,'xlsx'));
  const localLengths=Buffer.from(original);localLengths.writeUInt32LE(0,18);localLengths.writeUInt32LE(0,22);assert.equal(validateOOXML(localLengths,'xlsx').size,2);
  const expanded=Buffer.from(original);expanded.writeUInt32LE(100*1024*1024+1,central+24);assert.throws(()=>validateOOXML(expanded,'xlsx'),{status:413});
});
test('XLSX public row/column positions retain blank leading rows',async()=>{
  const w=new ExcelJS.Workbook();w.addWorksheet('표').getCell('C8').value='기준';const d=await new DocumentStore().add({name:'offset.xlsx',buffer:Buffer.from(await w.xlsx.writeBuffer())});
  assert.equal(d.preview.sheets[0].rows[7][2],'기준');assert.deepEqual(d.preview.sheets[0].rows[0],[]);
});
test('local preview normalizes nested comment XML and omits drawings on a memory copy',async()=>{
  const w=new ExcelJS.Workbook(),sheet=w.addWorksheet('기준');sheet.getCell('A1').value='기준';sheet.getCell('A1').note='실제 메모';
  const zip=await JSZip.loadAsync(await w.xlsx.writeBuffer());const originalComment=await zip.file('xl/comments1.xml').async('string');
  zip.remove('xl/comments1.xml');zip.file('xl/comments/comment1.xml',originalComment);
  const rel='xl/worksheets/_rels/sheet1.xml.rels';zip.file(rel,(await zip.file(rel).async('string')).replace('../comments1.xml','/xl/comments/comment1.xml'));
  const image=w.addImage({base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCGkAAAAASUVORK5CYII=',extension:'png'});sheet.addImage(image,'C3:D4');
  const imageBuffer=Buffer.from(await w.xlsx.writeBuffer());const source=Buffer.from(await zip.generateAsync({type:'nodebuffer'}));const store=new DocumentStore();
  const comments=await store.add({name:'comments.xlsx',buffer:source});assert.equal(comments.sourceSheets[0].rows[0].cells[0].comment,'실제 메모');assert.deepEqual(comments.buffer,source);
  const drawing=await store.add({name:'image.xlsx',buffer:imageBuffer});assert.equal(drawing.preview.type,'table');assert.equal(drawing.preview.warnings.length,1);assert.deepEqual(drawing.buffer,imageBuffer);
  const empty=new ExcelJS.Workbook(),imageSheet=empty.addWorksheet('이미지');const id=empty.addImage({base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCGkAAAAASUVORK5CYII=',extension:'png'});imageSheet.addImage(id,'A1:B2');const fallback=await store.add({name:'only-image.xlsx',buffer:Buffer.from(await empty.xlsx.writeBuffer())});assert.equal(fallback.preview.type,'text');assert.equal(fallback.preview.text,'텍스트 미리보기 없음. 샌드박스에서 이미지/구조 분석 필요');assert.deepEqual(fallback.sourceSheets,[]);
});
test('expenses sample exact recipe bytes, roles and text, without starting analysis',async()=>{
  const store=new DocumentStore();const result=await loadSample(store,'expenses');const doc=store.get(result.documents[0].id);
  assert.equal(doc.size,453); assert.equal(createHash('sha256').update(doc.buffer).digest('hex'),'ff7ca5d2f3dc92b0b295796db07d1f5a2a57b0625bb038a44bd289daa764e418');assert.equal(doc.role,'target');assert.match(result.criteriaText,/30,000원/);assert.equal(doc.sandboxAnalysisResult,undefined);
});
test('sample and golden batch rollback does not remove preexisting documents',async()=>{
  const store=new DocumentStore({parse:async()=>({preview:{type:'pdf'},modelParts:[]})});const before=await store.add({name:'prior.txt',buffer:Buffer.from('x')});let n=0;
  await assert.rejects(loadSample(store,'materials',{read:async()=>{if(++n===2)throw new Error('read failure');return Buffer.from('x');}}));assert.equal(store.size,1);assert.ok(store.get(before.id));
  n=0;await assert.rejects(loadGolden(store,{criterionId:'C01',certificateIds:['P01']},{read:async()=>{if(++n===2)throw new Error('read failure');return Buffer.from('x');}}));assert.equal(store.size,1);
});
test('golden mode null/false validation reproduces asymmetric baseline rules',()=>{
  for(const ledgerId of [undefined,null,'',false,0])assert.doesNotThrow(()=>validateGoldenRequest({mode:'criteria',criterionId:'C01',ledgerId}));
  assert.throws(()=>validateGoldenRequest({mode:'criteria',criterionId:'C01',certificateIds:null}));
  assert.throws(()=>validateGoldenRequest({mode:'target',certificateIds:['P01'],criterionId:null}));
  assert.throws(()=>validateGoldenRequest({criterionId:'C01',certificateIds:['P01'],ledgerId:false}));
  assert.throws(()=>validateGoldenRequest({mode:'target',certificateIds:['P01','P01']}));
});

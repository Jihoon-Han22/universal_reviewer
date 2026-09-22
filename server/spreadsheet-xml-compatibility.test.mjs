import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {DocumentStore} from './documents.mjs';

const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
async function workbookBytes(){
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Source & units');
  sheet.getCell('A1').value='literal <grid:c> & "quoted" ]]>\r\n';sheet.getCell('A1').note='Original note & detail';
  sheet.getCell('B2').value={formula:'1-1',result:0};sheet.getCell('C2').value={formula:'1=0',result:false};
  sheet.getCell('D3').value='merged master';sheet.mergeCells('D3:E3');
  workbook.addWorksheet('Hidden source',{state:'hidden'}).getCell('A1').value='hidden text';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
async function prefixedBytes(original,prefix,strict=false){
  const zip=await JSZip.loadAsync(original);
  for(const entry of Object.values(zip.files)){
    if(entry.dir||!/^xl\/(?:workbook|styles|sharedStrings|comments\d+|worksheets\/[^/]+)\.xml$/.test(entry.name))continue;
    let xml=await entry.async('string');
    xml=xml.replace(`xmlns="${main}"`,`xmlns:${prefix}="${strict?'http://purl.oclc.org/ooxml/spreadsheetml/main':main}"`)
      .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g,`<$1${prefix}:$2`)
      .replaceAll('xmlns:r=','xmlns:link=').replaceAll(' r:id=',' link:id=');
    zip.file(entry.name,xml);
  }
  return Buffer.from(await zip.generateAsync({type:'nodebuffer'}));
}
for(const [prefix,strict] of [['grid',false],['n-sheet',true]])test(`prefixed ${strict?'strict':'standard'} spreadsheet XML retains exact source and preview on a memory copy`,async()=>{
  const original=await workbookBytes(),prefixed=await prefixedBytes(original,prefix,strict),store=new DocumentStore();
  const ordinary=await store.add({name:'ordinary.xlsx',buffer:original}),converted=await store.add({name:'prefixed.xlsx',buffer:prefixed});
  assert.deepEqual(converted.sourceSheets,ordinary.sourceSheets);assert.deepEqual(converted.preview,ordinary.preview);assert.equal(converted.source,ordinary.source);
  assert.deepEqual(converted.buffer,prefixed);assert.deepEqual(ordinary.buffer,original);assert.notDeepEqual(prefixed,original);
  assert.equal(converted.sourceSheets[1].state,'hidden');assert.equal(converted.sourceSheets[0].rows[0].cells[0].comment,'Original note & detail');
});
test('namespace compatibility does not turn malformed workbook XML into an admitted source',async()=>{
  const zip=await JSZip.loadAsync(await prefixedBytes(await workbookBytes(),'grid'));
  zip.file('xl/workbook.xml',(await zip.file('xl/workbook.xml').async('string')).replace('</grid:workbook>','</grid:wrong>'));
  const store=new DocumentStore();await assert.rejects(store.add({name:'invalid.xlsx',buffer:Buffer.from(await zip.generateAsync({type:'nodebuffer'}))}),{name:'DocumentError',status:400});
  assert.equal(store.size,0);assert.equal(store.pendingBytes,0);assert.equal(store.pendingDocuments,0);
});
for(const variant of ['root-r','nested-r','foreign-default','combined'])test(`namespace compatibility preserves ${variant} extension bindings without colliding with canonical names`,async()=>{
  const original=await workbookBytes(),zip=await JSZip.loadAsync(await prefixedBytes(original,'grid'));
  let xml=await zip.file('xl/workbook.xml').async('string');
  if(variant==='root-r'||variant==='combined')xml=xml.replace('<grid:workbook ','<grid:workbook xmlns:r="urn:foreign-root" r:marker="root" xmlns:compatNs1="urn:existing-prefix" ');
  if(variant==='nested-r'||variant==='combined')xml=xml.replace('<grid:sheet ','<grid:sheet xmlns:r="urn:foreign-child" r:marker="child" ');
  if(variant==='foreign-default'||variant==='combined')xml=xml.replace('<grid:workbook ','<grid:workbook xmlns="urn:foreign-default" ');
  zip.file('xl/workbook.xml',xml);
  const buffer=Buffer.from(await zip.generateAsync({type:'nodebuffer'})),store=new DocumentStore(),ordinary=await store.add({name:'ordinary.xlsx',buffer:original}),actual=await store.add({name:'colliding-prefixes.xlsx',buffer});
  assert.deepEqual(actual.preview,ordinary.preview);assert.deepEqual(actual.sourceSheets,ordinary.sourceSheets);assert.equal(actual.source,ordinary.source);assert.deepEqual(actual.buffer,buffer);
});

import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {deflateRawSync,createDeflateRaw,crc32} from 'node:zlib';
import {once} from 'node:events';
import {isDeepStrictEqual} from 'node:util';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {snapshotImplementation} from '../../architecture/validation/acceptance.mjs';
import {readRef,ref,safeFile,sha256,jsonPointer,compare,HASH} from './shared.mjs';
import {deriveBrowserMeasurements} from './g12-browser-measurements.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const MIB=1024*1024;
const now=()=>new Date().toISOString();
const ensure=(value,code)=>{if(!value)throw new Error(code);};
const command=()=>[process.execPath,...process.argv.slice(1)];
const runtimePath='.cache/runtime/node-v24.13.1-win-x64/node.exe';
const documentCaseIds=()=>caseIds.slice(0,5);
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
async function runtimeIdentity(root){
  ensure(process.version==='v24.13.1'&&path.resolve(process.execPath).toLowerCase()===path.resolve(root,runtimePath).toLowerCase(),'PINNED_NODE_24_13_1_REQUIRED');
  return{nodeVersion:process.version,executableRef:await ref(root,runtimePath)};
}
export const profile = 'CURRENT_REPRODUCTION';
export const gateId = 'G12';
export const caseIds = Object.freeze([
  'G12:CORE-03-C01', 'G12:CORE-03-C02', 'G12:CORE-03-C03',
  'G12:CORE-03-C04', 'G12:CORE-03-C05', 'G12:CORE-14-C05',
]);
const eq = (name, pointer, expected) => ({ name, pointer, operator: 'deepEqual', expected });
const every = (object, names, value) => Object.fromEntries(names.map(name => [name, value]));
const extensions = ['pdf','docx','xlsx','csv','txt','md','json','png','jpg','jpeg','webp'];
const rejectedExtensions = ['xls','xlsm','pptx','tsv','hwp','heic','bmp','tiff'];
const messageNegatives = ['wrongWindow','wrongOrigin','wrongChannel','wrongType','wrongToken','unknownItem','staleFrame','staleToken'];

/** Expected values are contract-derived, never populated from product output. */
export const assertions = Object.freeze({
  'G12:CORE-03-C01': [
    eq('all supported formats admitted with original bytes', '/formats', every(null,extensions,{accepted:true,originalUnchanged:true,retainedUnchanged:true})),
    eq('unsupported public extensions rejected', '/unsupported', every(null,rejectedExtensions,400)),
    eq('three roles accepted', '/roles/accepted', ['criteria','target','ledger']),
    eq('unknown role rejected', '/roles/invalidStatus',400),
    eq('path and control stripping', '/names/pathAndControl','기준.txt'),
    eq('mojibake decoding preserves Korean filename', '/names/mojibake','기준.txt'),
    eq('plain Latin1 filename retained', '/names/latin1','é.txt'),
    eq('filename cap', '/names/longLength',240),
    eq('empty cleaned filename rejected', '/names/emptyStatus',400),
    eq('signature and text negatives reject', '/invalid',every(null,['pdf','png','jpeg','webp','utf8','nul','json'],400)),
    eq('private fields not in public DTO', '/publicKeys',['id','name','kind','mime','size','role','url','preview']),
    eq('original content HTTP roundtrip', '/originalDownload',{status:200,bytesEqual:true,mimeMatches:true,encodedFilename:true}),
  ],
  'G12:CORE-03-C02': [
    eq('prefixed strict nested comment retained', '/compatibility/comment','원문 메모'),
    eq('hidden sheet retained', '/compatibility/hiddenState','hidden'),
    eq('merge preserved', '/compatibility/mergedRanges',['A2:B2']),
    eq('continuation points to master', '/compatibility/continuation','[병합 셀: A2]'),
    eq('saved zero formula cache retained', '/compatibility/cachedText','0'),
    eq('absent formula cache is not zero', '/compatibility/uncachedText','[계산 결과 없음: 수식 재계산 필요]'),
    eq('original file untouched', '/compatibility/originalUnchanged',true),
    eq('retained original untouched', '/compatibility/retainedUnchanged',true),
    eq('download retains unnormalized original', '/compatibility/downloadUnchanged',true),
  ],
  'G12:CORE-03-C03': [
    ...['sheets','cells','source'].flatMap(name=>[
      eq(`${name} exact boundary accepted`, `/limits/${name}/exact/accepted`,true),
      eq(`${name} exact boundary is not deferred`, `/limits/${name}/exact/deferred`,false),
      eq(`${name} one-over accepted as deferred`, `/limits/${name}/over/accepted`,true),
      eq(`${name} one-over resets partial source`, `/limits/${name}/over/sourceSheets`,[]),
      eq(`${name} one-over reports local preview only`, `/limits/${name}/over/localPreviewIncomplete`,true),
      eq(`${name} one-over public text preview`, `/limits/${name}/over/previewType`,'text'),
      eq(`${name} one-over truncated`, `/limits/${name}/over/truncated`,true),
      eq(`${name} exact original preserved`, `/limits/${name}/exact/originalUnchanged`,true),
      eq(`${name} over original preserved`, `/limits/${name}/over/originalUnchanged`,true),
    ]),
    eq('observed boundary fixture dimensions', '/fixtureCounts',{sheets:[30,31],cells:[100000,100001],sourceUtf16:[1500000,1500001]}),
    eq('exact cell boundary retains all local cells', '/limits/cells/exact/localCellCount',100000),
    eq('exact source boundary preserves serialization', '/limits/source/exact/sourceLength',1500000),
  ],
  'G12:CORE-03-C04': [
    eq('exact20MiB admission', '/file/exactAccepted',true),
    eq('file one-over rejection', '/file/overStatus',413),
    eq('empty file rejection', '/file/emptyStatus',400),
    eq('document reservation exact cap', '/documents/pendingAtCap',100),
    eq('101st simultaneous document rejected', '/documents/overStatus',413),
    eq('settled pending documents zero', '/documents/pendingAfter',0),
    eq('settled retained documents100', '/documents/retainedAfter',100),
    eq('byte reservation exact cap', '/bytes/pendingAtCap',250*1024*1024),
    eq('one more byte rejected', '/bytes/overStatus',413),
    eq('settled pending bytes zero', '/bytes/pendingAfter',0),
    eq('actual retained bytes at cap', '/bytes/retainedAfter',250*1024*1024),
    eq('delete releases actual bytes', '/bytes/deleteReleased',true),
    eq('parse failure releases reservations', '/failure',{rejected:true,pendingDocuments:0,pendingBytes:0,totalBytes:0,size:0}),
    eq('ZIP entry exact cap', '/zip/entryExactCount',20000),
    eq('ZIP entry one-over rejection', '/zip/entryOverStatus',413),
    eq('ZIP real expansion exact cap', '/zip/expandedExactBytes',100*1024*1024),
    eq('ZIP expansion one-over rejection', '/zip/expandedOverStatus',413),
    eq('corrupt/forbidden archives rejected', '/zip/rejections',every(null,['duplicate','encrypted','split','zip64','nameMismatch','methodMismatch','unsupportedMethod','wrongInflatedLength','missingRequiredMember'],400)),
    eq('local size fields need not match central', '/zip/localSizeMismatchAccepted',true),
  ],
  'G12:CORE-03-C05': [
    eq('missing formula sentinel', '/formula/text','[계산 결과 없음: 수식 재계산 필요]'),
    eq('drawing warning exact', '/drawing/warnings',['삽입 이미지·도형·차트는 로컬 미리보기에 포함되지 않았습니다. 샌드박스에서 이미지/구조 분석이 필요합니다.']),
    eq('drawing-only omission does not invent truncation', '/drawing/truncatedPresent',false),
    eq('drawing limitation private source present', '/drawing/sourceLimitation',true),
    eq('drawing original retained', '/drawing/originalUnchanged',true),
    eq('image-only local preview', '/imageOnly/preview',{type:'text',truncated:true,text:'텍스트 미리보기 없음. 샌드박스에서 이미지/구조 분석 필요'}),
    eq('image-only partial source removed', '/imageOnly/sourceSheets',[]),
    eq('PDF auxiliary read failure admitted', '/pdfFailure/accepted',true),
    eq('PDF auxiliary failure keeps visual preview', '/pdfFailure/preview',{type:'pdf'}),
    eq('PDF auxiliary failure has no invented text', '/pdfFailure/verificationPages',[]),
    eq('PDF original retained', '/pdfFailure/originalUnchanged',true),
    eq('preview does not create public analysis', '/publicAnalysisPresent',false),
    eq('single clipped cell is not exhaustive truncation signal', '/cellClip',{publicLength:2000,privateLength:3000,truncatedPresent:false}),
  ],
  'G12:CORE-14-C05': [
    ...['click','enter','space'].flatMap(name=>[
      eq(`${name} actual browser event trusted`, `/bridge/positive/${name}/isTrusted`,true),
      eq(`${name} selects intended frozen item`, `/bridge/positive/${name}/accepted`,true),
      eq(`${name} selected ID`, `/bridge/positive/${name}/selectedItemId`,'g12-item-a'),
    ]),
    ...messageNegatives.map(name=>eq(`${name} rejected independently`, `/bridge/rejected/${name}/unchanged`,true)),
    eq('unmount removes listener effect', '/bridge/unmount/unchanged',true),
    eq('opaque sandbox permits only scripts', '/bridge/iframe/sandbox','allow-scripts'),
    eq('no referrer', '/bridge/iframe/referrerPolicy','no-referrer'),
    eq('actual source message opaque origin', '/bridge/iframe/messageOrigin','null'),
    eq('real download has bytes', '/download/nonempty',true),
    eq('real download MIME', '/download/mime','text/html;charset=utf-8'),
    eq('download object URL is revoked', '/download/urlRevoked',true),
    eq('actual offline filters work', '/download/offlineFilterWorks',true),
    eq('actual offline detail opens', '/download/offlineDetailOpened',true),
    eq('standalone trusted script count', '/download/scriptCount',2),
    eq('bridge token absent from download', '/download/containsBridgeToken',false),
    eq('bridge script absent from download', '/download/containsBridgeScript',false),
    eq('original-only sentinel absent', '/download/containsSourceDocumentSentinel',false),
    eq('document URLs absent', '/download/containsDocumentURL',false),
    eq('source viewer absent', '/download/containsSourceViewer',false),
    eq('standalone source controls hidden', '/download/sourceButtonsHidden',true),
    eq('standalone offline external requests', '/download/externalRequests',0),
    eq('harmless review quote retained', '/download/containsExpectedQuote',true),
  ],
});

/** Build one independent plan entry; callers must hash real prepared fixtures. */
export function plannedCase(definition,{inputs,initialState,actions}) {
  if(!caseIds.includes(definition.id)||definition.gateId!==gateId||definition.driver!=='observations')throw new Error('G12_SCOPE_MISMATCH');
  if(!Array.isArray(inputs)||!Array.isArray(actions)||!actions.length)throw new Error('G12_INCOMPLETE_PLAN');
  return {caseId:definition.id,inputs,baselineReferences:structuredClone(definition.baselineReferences),initialState,actions,assertions:structuredClone(assertions[definition.id])};
}

/**
 * Projection shape only. Values must come from a real browser driver, not defaults.
 * readRef is injected from the existing helper and verifies each artifact hash.
 * This validation is necessary, not sufficient: independent trace review is required.
 */
export async function projectBrowserRecord(record,{freeze,registrySha256,planRef,readRef,root}) {
  const fail=code=>{throw new Error(code);};
  if(record?.schemaVersion!=='1.0'||record.acceptanceProfile!==profile||record.caseId!=='G12:CORE-14-C05')fail('G12_BROWSER_SCOPE');
  if(record.loop!==freeze.loop||record.codeDigest!==freeze.codeDigest||record.registrySha256!==registrySha256||record.planRef?.path!==planRef.path||record.planRef?.sha256!==planRef.sha256)fail('G12_BROWSER_STALE');
  if(record.origin!=='actual-browser'||record.oracleAccess!==false)fail('G12_BROWSER_ORIGIN');
  if(!['name','version','userAgent'].every(key=>typeof record.browser?.[key]==='string'&&record.browser[key].trim()))fail('G12_BROWSER_METADATA');
  const start=Date.parse(record.startedAt),end=Date.parse(record.endedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||!validTime(freeze.frozenAt)||end<start||start<Date.parse(freeze.frozenAt)||end>Date.now())fail('G12_BROWSER_TIME');
  const artifactKeys=['browserTraceRef','pngRef','domRef','downloadRef','eventLogRef','sourceProvenanceRef'];
  for(const key of artifactKeys)if(!record[key])fail('G12_BROWSER_ARTIFACT_MISSING');
  if(!/\.png$/i.test(record.pngRef.path)||!/\.json$/i.test(record.domRef.path)||!/\.html$/i.test(record.downloadRef.path))fail('G12_BROWSER_ARTIFACT_KIND');
  const bytes={};for(const key of artifactKeys)bytes[key]=await readRef(root,record[key]);
  if(!Buffer.from(bytes.pngRef).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('G12_BROWSER_PNG_SIGNATURE');
  if(!Buffer.from(bytes.browserTraceRef).subarray(0,4).equals(Buffer.from([80,75,3,4])))fail('G12_BROWSER_TRACE_SIGNATURE');
  const dom=JSON.parse(Buffer.from(bytes.domRef).toString('utf8'));if(!dom||typeof dom!=='object')fail('G12_BROWSER_DOM');
  const log=JSON.parse(Buffer.from(bytes.eventLogRef).toString('utf8'));
  if(log.schemaVersion!=='1.0'||log.kind!=='g12-browser-event-log'||!Array.isArray(log.events)||!log.events.length)fail('G12_BROWSER_EVENT_LOG');
  const requiredEvents=['click','enter','space',...messageNegatives,'unmount','download','offline'];
  if(new Set(log.events.map(event=>event.id)).size!==log.events.length||requiredEvents.some(id=>!log.events.some(event=>event.id===id)))fail('G12_BROWSER_EVENT_LOG');
  for(const event of log.events)if(!validTime(event.at)||Date.parse(event.at)<start||Date.parse(event.at)>end||typeof event.action!=='string'||!event.action.trim()||!event.observed||typeof event.observed!=='object')fail('G12_BROWSER_EVENT_LOG');
  const provenance=JSON.parse(Buffer.from(bytes.sourceProvenanceRef).toString('utf8'));
  if(provenance.schemaVersion!=='1.0'||provenance.kind!=='g12-browser-source-provenance'||provenance.loop!==freeze.loop||provenance.registrySha256!==registrySha256||provenance.codeDigestBefore!==freeze.codeDigest||provenance.codeDigestAfter!==freeze.codeDigest||provenance.serverCodeDigest!==freeze.codeDigest||provenance.serverIdentityBefore!==provenance.serverIdentityAfter||typeof provenance.serverIdentityBefore!=='string'||!provenance.serverIdentityBefore.trim())fail('G12_BROWSER_SOURCE_PARITY');
  if(record.providerCalls?.gemini!==0||record.providerCalls?.e2b!==0)fail('G12_UNEXPECTED_PROVIDER');
  if(!record.actual?.bridge||!record.actual?.download)fail('G12_BROWSER_RAW_RESULT_MISSING');
  for(const assertion of assertions['G12:CORE-14-C05']){
    let observed;try{observed=jsonPointer(record.actual,assertion.pointer);}catch{fail('G12_BROWSER_RAW_RESULT_MISSING');}
    if(observed!==null&&typeof observed!==typeof assertion.expected)fail('G12_BROWSER_RAW_RESULT_TYPE');
  }
  const measured=await deriveBrowserMeasurements({record,primaryBytes:bytes,eventLog:log,hostDom:dom,readRef,root});
  return {actual:measured.actual,artifactRefs:[...artifactKeys.map(key=>record[key]),...measured.artifactRefs],artifactDiagnostics:measured.diagnostics,startedAt:record.startedAt,endedAt:record.endedAt,browser:structuredClone(record.browser)};
}

async function outputDirectory(root,directory){
  ensure(/^\.cache\/rebuild\/[A-Za-z0-9_./-]+$/.test(directory)&&!directory.split('/').includes('..'),'G12_OUTPUT_PATH');
  let current=root;for(const segment of directory.split('/')){current=path.join(current,segment);await mkdir(current).catch(e=>{if(e.code!=='EEXIST')throw e;});const stat=await lstat(current);ensure(stat.isDirectory()&&!stat.isSymbolicLink(),'G12_OUTPUT_PATH');}return current;
}
async function freshJson(root,name,value){await outputDirectory(root,path.posix.dirname(name));ensure(/^[A-Za-z0-9_.-]+$/.test(path.posix.basename(name)),'G12_OUTPUT_PATH');try{await writeFile(path.join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code==='EEXIST')throw new Error('G12_OUTPUT_EXISTS');throw error;}return ref(root,name);}
async function bytesFile(root,directory,name,bytes){ensure(/^[A-Za-z0-9_.-]+$/.test(name),'G12_FIXTURE_NAME');await outputDirectory(root,directory);const relative=`${directory}/${name}`;await writeFile(path.join(root,relative),bytes,{flag:'wx'});return ref(root,relative);}
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function zipBytes(entries){
  const locals=[],centrals=[];let offset=0;for(const entry of entries){const name=Buffer.from(entry.name),data=entry.data??Buffer.alloc(0),compressed=entry.compressed??deflateRawSync(data),size=entry.size??data.length,crc=entry.crc??crc32(data);const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(size,22);local.writeUInt16LE(name.length,26);locals.push(local,name,compressed);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(size,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);centrals.push(central,name);offset+=local.length+name.length+compressed.length;}
  const central=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,central,end]);
}
async function repeatedEntry(name,size){const stream=createDeflateRaw(),chunks=[];stream.on('data',chunk=>chunks.push(chunk));const done=once(stream,'end');let crc=0,remaining=size;const block=Buffer.alloc(MIB,120);while(remaining){const piece=block.subarray(0,Math.min(remaining,block.length));crc=crc32(piece,crc);if(!stream.write(piece))await once(stream,'drain');remaining-=piece.length;}stream.end();await done;return{name,size,crc,compressed:Buffer.concat(chunks)};}
function workbookBytes(sheetRows){const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';return zipBytes([
  {name:'[Content_Types].xml',data:Buffer.from(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetRows.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)},
  {name:'_rels/.rels',data:Buffer.from(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`)},
  {name:'xl/workbook.xml',data:Buffer.from(`<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheetRows.map((_,i)=>`<sheet name="${i?'S'+(i+1):'S'}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`)},
  {name:'xl/_rels/workbook.xml.rels',data:Buffer.from(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRows.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${rel}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`)},
  ...sheetRows.map((values,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:Buffer.from(`<worksheet xmlns="${ns}"><sheetData>${values.map((value,n)=>`<row r="${n+1}"><c r="A${n+1}" t="inlineStr"><is><t>${xml(value)}</t></is></c></row>`).join('')}</sheetData></worksheet>`)})),
]);}
function sourceValues(length){const values=Array.from({length:50},()=> 'x'.repeat(29990));const serialized=v=>'SHEET: S\n'+v.map((value,i)=>`A${i+1}: ${value}`).join('\n');values[49]+='x'.repeat(length-serialized(values).length);ensure(values.every(v=>v.length<=32767)&&serialized(values).length===length,'G12_SOURCE_RECIPE');return values;}
export async function prepareFixtures(root,directory,{rasterManifest,heavy=true}={}){
  await outputDirectory(root,directory);ensure(!(await lstat(path.join(root,directory,'fixtures.json')).catch(()=>null)),'G12_FIXTURES_EXIST');const files={};const put=async(id,name,buffer)=>files[id]=await bytesFile(root,directory,name,buffer);
  ensure(rasterManifest,'G12_RASTER_MANIFEST_REQUIRED');const rasterRef=await ref(root,rasterManifest),raster=JSON.parse(await readRef(root,rasterRef));ensure(raster.kind==='g12-synthetic-rasters'&&raster.exitCode===0&&raster.oracleAccess===false,'G12_RASTER_MANIFEST');for(const kind of['png','jpg','webp']){await readRef(root,raster.files[kind]);files[kind]=raster.files[kind];}files.jpeg=files.jpg;
  for(const[kind,text]of[['txt','Synthetic source'],['md','# Synthetic source'],['csv','label,value\nSynthetic,7'],['json','{"synthetic":7}']])await put(kind,`valid.${kind}`,Buffer.from(text));
  const pdfObjects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];const content='BT /F1 12 Tf 10 100 Td (Synthetic source) Tj ET';pdfObjects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);let pdf='%PDF-1.4\n',offsets=[0];for(const[ i,object]of pdfObjects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;await put('pdf','valid.pdf',Buffer.from(pdf));
  await put('docx','valid.docx',zipBytes([{name:'[Content_Types].xml',data:Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')},{name:'_rels/.rels',data:Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')},{name:'word/document.xml',data:Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic source</w:t></w:r></w:p></w:body></w:document>')} ]));await put('xlsx','valid.xlsx',workbookBytes([['Synthetic',7]]));
  const w=new ExcelJS.Workbook(),sheet=w.addWorksheet('Visible');sheet.getCell('A1').value='memo';sheet.getCell('A1').note='원문 메모';sheet.getCell('A2').value='merged';sheet.mergeCells('A2:B2');sheet.getCell('E2').value={formula:'1-1',result:0};sheet.getCell('F2').value={formula:'1+1'};w.addWorksheet('Hidden',{state:'hidden'}).getCell('A1').value='retained';const z=await JSZip.loadAsync(await w.xlsx.writeBuffer());let comment=await z.file('xl/comments1.xml').async('string');comment=comment.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"','xmlns:c="http://purl.oclc.org/ooxml/spreadsheetml/main"').replace(/(<\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g,'$1c:$2');z.remove('xl/comments1.xml');z.file('xl/comments/comment1.xml',comment,{createFolders:false});const rel='xl/worksheets/_rels/sheet1.xml.rels';z.file(rel,(await z.file(rel).async('string')).replace('../comments1.xml','/xl/comments/comment1.xml'),{createFolders:false});await put('compatibility','compatibility.xlsx',await z.generateAsync({type:'nodebuffer'}));
  for(const only of[false,true]){const w=new ExcelJS.Workbook(),s=w.addWorksheet('품질');if(!only)s.getCell('A1').value='기준';const id=w.addImage({buffer:await readRef(root,files.png),extension:'png'});s.addImage(id,'C3:D4');await put(only?'imageOnly':'drawing',only?'image-only.xlsx':'drawing.xlsx',Buffer.from(await w.xlsx.writeBuffer()));}
  await put('cellClip','cell-clip.xlsx',workbookBytes([['x'.repeat(3000)]]));await put('pdfFailure','aux-failure.pdf',Buffer.from('%PDF-1.7\nintentionally malformed auxiliary-reader negative\n'));
  if(heavy){for(const n of[30,31])await put(`sheets${n}`,`sheets-${n}.xlsx`,workbookBytes(Array.from({length:n},()=>['x'])));for(const n of[100000,100001])await put(`cells${n}`,`cells-${n}.xlsx`,workbookBytes([Array(n).fill('x')]));for(const n of[1500000,1500001])await put(`source${n}`,`source-${n}.xlsx`,workbookBytes([sourceValues(n)]));}
  const required=[{name:'[Content_Types].xml',data:Buffer.from('c')},{name:'xl/workbook.xml',data:Buffer.from('w')}];await put('zipBase','zip-base.xlsx',zipBytes(required));
  const base=await readRef(root,files.zipBase),central=base.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));for(const name of['encrypted','split','zip64','nameMismatch','methodMismatch','unsupportedMethod','wrongInflatedLength','localSizes']){const b=Buffer.from(base);if(name==='encrypted')b.writeUInt16LE(1,6);if(name==='split')b.writeUInt16LE(1,b.length-18);if(name==='zip64')b.writeUInt16LE(65535,b.length-12);if(name==='nameMismatch')b[30]^=1;if(name==='methodMismatch')b.writeUInt16LE(0,8);if(name==='unsupportedMethod'){b.writeUInt16LE(99,8);b.writeUInt16LE(99,central+10);}if(name==='wrongInflatedLength')b.writeUInt32LE(7,central+24);if(name==='localSizes'){b.writeUInt32LE(0,18);b.writeUInt32LE(0,22);}await put(`zip_${name}`,`zip-${name}.xlsx`,b);}
  await put('zip_duplicate','zip-duplicate.xlsx',zipBytes([...required,required[0]]));await put('zip_missingRequiredMember','zip-missing-required.xlsx',zipBytes(required.slice(0,1)));
  if(heavy){for(const n of[20000,20001])await put(`entries${n}`,`zip-${n}.xlsx`,zipBytes([...required,...Array.from({length:n-2},(_,i)=>({name:`x${i}`,data:Buffer.alloc(0)}))]));for(const n of[100*MIB,100*MIB+1])await put(`expanded${n}`,`zip-expanded-${n}.xlsx`,zipBytes([...required,await repeatedEntry('payload.bin',n-2)]));}
  const manifest={schemaVersion:'1.0',acceptanceProfile:profile,kind:'g12-synthetic-fixtures',createdAt:now(),heavyPrepared:heavy,oracleAccess:false,providerCalls:{gemini:0,e2b:0},rasterRef,files,recipes:{sheets:[30,31],cells:[100000,100001],sourceUtf16:[1500000,1500001],zipEntries:[20000,20001],zipExpandedBytes:[100*MIB,100*MIB+1]}};return freshJson(root,`${directory}/fixtures.json`,manifest);
}
const statusOf=async action=>{try{await action();return null;}catch(error){return Number.isInteger(error.status)?error.status:500;}};
async function product(root){return import(pathToFileURL(path.join(root,'server/documents.mjs')).href);}
async function downloadDocument(root,store,document){
  const {createApp}=await import(pathToFileURL(path.join(root,'server/app.mjs')).href);
  const forbidden=async()=>{throw new Error('G12_UNEXPECTED_PROVIDER');};
  const app=createApp({documents:store,registerExports:false,config:{geminiApiKey:'',e2bApiKey:'',modelExtract:'synthetic',modelExplore:'synthetic',e2bTemplate:'base'},geminiConfigured:false,gemini:{generateText:forbidden,generateJson:forbidden},withSandbox:forbidden});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}${document.url}`,{signal:AbortSignal.timeout(15000)}),bytes=Buffer.from(await response.arrayBuffer()),headers=Object.fromEntries(response.headers);return{status:response.status,bytesEqual:bytes.equals(document.buffer),mimeMatches:(headers['content-type']??'').split(';')[0]===document.mime,encodedFilename:(headers['content-disposition']??'').includes("filename*=UTF-8''"),observed:{responseBytes:bytes.length,responseSha256:sha256(bytes),originalSha256:sha256(document.buffer),headers}};}
  finally{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
function results(actual,caseId){return assertions[caseId].map(assertion=>{try{const observed=jsonPointer(actual,assertion.pointer);return{...assertion,actual:observed,passed:compare(observed,assertion.expected,assertion.operator)};}catch(error){return{...assertion,passed:false,error:error.message};}});}
export async function executeDocumentCase(root,caseId,manifest){
  ensure(caseIds.slice(0,5).includes(caseId),'G12_DOCUMENT_CASE');const {DocumentStore,cleanFilename,validateOOXML}=await product(root),f=async id=>{ensure(manifest.files[id],'G12_FIXTURE_MISSING:'+id);return readRef(root,manifest.files[id]);};
  const read=async(id,name=`${id}.xlsx`)=>{const bytes=await f(id),before=sha256(bytes),store=new DocumentStore(),document=await store.add({name,buffer:bytes});return{bytes,store,document,originalUnchanged:sha256(bytes)===before&&sha256(await f(id))===before,retainedUnchanged:sha256(document.buffer)===before};};
  if(caseId.endsWith('CORE-03-C01')){
    const formats={},unsupported={},roles={accepted:[]},invalid={};let first;
    for(const kind of extensions){const value=await read(kind,`한글.${kind}`);formats[kind]={accepted:true,originalUnchanged:value.originalUnchanged,retainedUnchanged:value.retainedUnchanged};if(kind==='txt')first=value;}
    for(const kind of rejectedExtensions)unsupported[kind]=await statusOf(()=>new DocumentStore().add({name:`source.${kind}`,buffer:Buffer.from('source')}));
    for(const role of['criteria','target','ledger']){const doc=await new DocumentStore().add({name:'source.txt',buffer:Buffer.from('source'),role});roles.accepted.push(doc.role);}roles.invalidStatus=await statusOf(()=>new DocumentStore().add({name:'source.txt',buffer:Buffer.from('source'),role:'unknown'}));
    for(const[kind,name,bytes]of[['pdf','bad.pdf',Buffer.from('no PDF')],['png','bad.png',Buffer.from('no PNG')],['jpeg','bad.jpeg',Buffer.from('no JPEG')],['webp','bad.webp',Buffer.from('no WebP')],['utf8','bad.txt',Buffer.from([255])],['nul','bad.txt',Buffer.from('a\0b')],['json','bad.json',Buffer.from('{')]])invalid[kind]=await statusOf(()=>new DocumentStore().add({name,buffer:bytes}));
    const original=await downloadDocument(root,first.store,first.document);return{formats,unsupported,roles,names:{pathAndControl:cleanFilename('C:\\upload\\기\0준.txt'),mojibake:cleanFilename(Buffer.from('기준.txt').toString('latin1')),latin1:cleanFilename('é.txt'),longLength:cleanFilename('x'.repeat(260)+'.txt').length,emptyStatus:await statusOf(()=>cleanFilename('\0'))},invalid,publicKeys:Object.keys(first.store.public(first.document)),originalDownload:(({observed,...value})=>value)(original),observedOriginalDownload:original.observed};
  }
  if(caseId.endsWith('CORE-03-C02')){
    const value=await read('compatibility'),s=value.document.sourceSheets.find(s=>s.name==='Visible'),cell=address=>s.rows.flatMap(r=>r.cells).find(c=>c.address===address),download=await downloadDocument(root,value.store,value.document);return{compatibility:{comment:cell('A1')?.comment,hiddenState:value.document.sourceSheets.find(s=>s.name==='Hidden')?.state,mergedRanges:s.mergedRanges,continuation:cell('B2')?.text,cachedText:cell('E2')?.text,uncachedText:cell('F2')?.text,originalUnchanged:value.originalUnchanged,retainedUnchanged:value.retainedUnchanged,downloadUnchanged:download.bytesEqual},observedOriginalDownload:download.observed};
  }
  if(caseId.endsWith('CORE-03-C03')){
    const fixtureCounts={sheets:[],cells:[],sourceUtf16:[]};
    for(const name of ['sheets30','sheets31','cells100000','cells100001','source1500000','source1500001']){
      const zip=await JSZip.loadAsync(await f(name));
      if(name.startsWith('sheets'))fixtureCounts.sheets.push(((await zip.file('xl/workbook.xml').async('string')).match(/<sheet\b/g)??[]).length);
      else{const xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
        if(name.startsWith('cells'))fixtureCounts.cells.push((xml.match(/<c\b/g)??[]).length);
        else{const cells=[...xml.matchAll(/<c r="(A\d+)" t="inlineStr"><is><t>(x*)<\/t><\/is><\/c>/g)];ensure(cells.length===50,'G12_SOURCE_FIXTURE_SHAPE');fixtureCounts.sourceUtf16.push(('SHEET: S\n'+cells.map(([,address,text])=>address+': '+text).join('\n')).length);}
      }
    }
    const limits={};for(const[name,numbers]of Object.entries({sheets:[30,31],cells:[100000,100001],source:[1500000,1500001]})){limits[name]={};for(const[index,n]of numbers.entries()){const value=await read(`${name}${n}`),d=value.document;limits[name][index?'over':'exact']={accepted:true,deferred:d.source?.startsWith('LOCAL_PREVIEW_INCOMPLETE:')===true,sourceSheets:d.sourceSheets?.map(s=>({name:s.name,rows:s.rows.length})),localPreviewIncomplete:d.source?.startsWith('LOCAL_PREVIEW_INCOMPLETE:')===true,previewType:d.preview.type,truncated:d.preview.truncated===true,originalUnchanged:value.originalUnchanged&&value.retainedUnchanged,localCellCount:d.sourceSheets?.reduce((sum,s)=>sum+s.rows.reduce((n,r)=>n+r.cells.length,0),0),sourceLength:d.source.length};}}
    return{limits,fixtureCounts};
  }
  if(caseId.endsWith('CORE-03-C04')){
    const parsed={preview:{type:'text',text:'admission dependency fixture'},source:'fixture',modelParts:[]};const payload=Buffer.alloc(20*MIB,120),fileStore=new DocumentStore({parse:async()=>parsed});const exact=await fileStore.add({name:'boundary.txt',buffer:payload});const file={exactAccepted:exact.size===20*MIB,overStatus:await statusOf(()=>fileStore.add({name:'over.txt',buffer:Buffer.alloc(20*MIB+1)})),emptyStatus:await statusOf(()=>fileStore.add({name:'empty.txt',buffer:Buffer.alloc(0)}))};fileStore.delete(exact.id);
    let release;const gate=new Promise(resolve=>release=resolve),countStore=new DocumentStore({parse:async()=>{await gate;return parsed;}});const pending=Array.from({length:100},(_,i)=>countStore.add({name:`n${i}.txt`,buffer:Buffer.from('x')}));const documents={pendingAtCap:countStore.pendingDocuments,overStatus:await statusOf(()=>countStore.add({name:'overflow.txt',buffer:Buffer.from('x')}))};release();await Promise.all(pending);Object.assign(documents,{pendingAfter:countStore.pendingDocuments,retainedAfter:countStore.size});
    let releaseBytes;const bytesGate=new Promise(resolve=>releaseBytes=resolve),byteStore=new DocumentStore({parse:async()=>{await bytesGate;return parsed;}});const bytePending=Array.from({length:12},(_,i)=>byteStore.add({name:`b${i}.txt`,buffer:payload}));bytePending.push(byteStore.add({name:'tail.txt',buffer:Buffer.alloc(10*MIB,120)}));const bytes={pendingAtCap:byteStore.pendingBytes,overStatus:await statusOf(()=>byteStore.add({name:'one.txt',buffer:Buffer.from('x')}))};releaseBytes();await Promise.all(bytePending);Object.assign(bytes,{pendingAfter:byteStore.pendingBytes,retainedAfter:byteStore.totalBytes});const first=byteStore.documents.values().next().value,prior=byteStore.totalBytes;byteStore.delete(first.id);bytes.deleteReleased=prior-byteStore.totalBytes===first.size;for(const id of[...byteStore.documents.keys()])byteStore.delete(id);
    const failStore=new DocumentStore({parse:async()=>{throw new Error('synthetic parse rejection');}}),failureStatus=await statusOf(()=>failStore.add({name:'failure.txt',buffer:Buffer.from('x')}));const failure={rejected:failureStatus!==null,pendingDocuments:failStore.pendingDocuments,pendingBytes:failStore.pendingBytes,totalBytes:failStore.totalBytes,size:failStore.size};
    const zip={entryExactCount:validateOOXML(await f('entries20000'),'xlsx').size,entryOverStatus:await statusOf(async()=>validateOOXML(await f('entries20001'),'xlsx')),expandedExactBytes:[...validateOOXML(await f(`expanded${100*MIB}`),'xlsx').values()].reduce((sum,b)=>sum+b.length,0),expandedOverStatus:await statusOf(async()=>validateOOXML(await f(`expanded${100*MIB+1}`),'xlsx')),rejections:{},localSizeMismatchAccepted:validateOOXML(await f('zip_localSizes'),'xlsx').size===2};for(const name of['duplicate','encrypted','split','zip64','nameMismatch','methodMismatch','unsupportedMethod','wrongInflatedLength','missingRequiredMember'])zip.rejections[name]=await statusOf(async()=>validateOOXML(await f(`zip_${name}`),'xlsx'));
    return{file,documents,bytes,failure,zip,dependencyScope:'Only parsing is injected for admission reservations; actual DocumentStore counters, buffer copies, errors and finally paths run. ZIP admission uses actual compressed bytes.'};
  }
  const compatibility=await read('compatibility'),drawing=await read('drawing'),imageOnly=await read('imageOnly'),pdfFailure=await read('pdfFailure','aux-failure.pdf'),clip=await read('cellClip');return{formula:{text:compatibility.document.sourceSheets[0].rows.flatMap(r=>r.cells).find(c=>c.address==='F2')?.text},drawing:{warnings:drawing.document.preview.warnings,truncatedPresent:Object.hasOwn(drawing.document.preview,'truncated'),sourceLimitation:drawing.document.source.includes('EXTRACTION_LIMITATION: Embedded images'),originalUnchanged:drawing.originalUnchanged&&drawing.retainedUnchanged},imageOnly:{preview:imageOnly.document.preview,sourceSheets:imageOnly.document.sourceSheets},pdfFailure:{accepted:true,preview:pdfFailure.document.preview,verificationPages:pdfFailure.document.verificationPages,originalUnchanged:pdfFailure.originalUnchanged&&pdfFailure.retainedUnchanged},publicAnalysisPresent:Object.hasOwn(drawing.store.public(drawing.document),'analysis'),cellClip:{publicLength:clip.document.preview.sheets[0].rows[0][0].length,privateLength:clip.document.sourceSheets[0].rows[0].cells[0].text.length,truncatedPresent:Object.hasOwn(clip.document.preview,'truncated')}};
}
async function currentScope(root,loop){
  const runtime=await runtimeIdentity(root);
  const freeze=JSON.parse(await readFile(await safeFile(root,'.cache/rebuild/freeze.json'),'utf8'));
  const registryRef=await ref(root,'scripts/acceptance/case-registry.json'),registry=JSON.parse(await readRef(root,registryRef));
  ensure(freeze.schemaVersion==='1.0'&&freeze.acceptanceProfile===profile&&/^LOOP-\d{3}$/.test(freeze.loop)&&(!loop||loop===freeze.loop)&&Number.isFinite(Date.parse(freeze.frozenAt))&&HASH.test(freeze.codeDigest??'')&&freeze.registrySha256===registryRef.sha256,'G12_FREEZE_INVALID');
  const snapshot=await snapshotImplementation(root);ensure(snapshot.digest===freeze.codeDigest,'G12_IMPLEMENTATION_CHANGED');
  ensure(isDeepStrictEqual([...registry.gates.G12.caseIds].sort(),[...caseIds].sort()),'G12_REGISTRY_SCOPE');
  const definitions=registry.cases.filter(c=>c.gateId===gateId);ensure(definitions.length===6&&definitions.every(d=>d.driver==='observations'),'G12_REGISTRY_SCOPE');
  for(const reference of registry.sourceReferences)await readRef(root,reference);
  return{freeze,registryRef,registry,definitions,runtime};
}
async function loadManifest(root,name){const reference=await ref(root,name),manifest=JSON.parse(await readRef(root,reference));ensure(manifest.schemaVersion==='1.0'&&manifest.acceptanceProfile===profile&&manifest.kind==='g12-synthetic-fixtures'&&manifest.oracleAccess===false&&manifest.providerCalls?.gemini===0&&manifest.providerCalls?.e2b===0&&validTime(manifest.createdAt)&&manifest.files&&typeof manifest.files==='object'&&!Array.isArray(manifest.files),'G12_FIXTURE_MANIFEST');await readRef(root,manifest.rasterRef);for(const file of Object.values(manifest.files))await readRef(root,file);return{reference,manifest};}
export async function preparePlan(root,{loop,fixtures}){
  const scope=await currentScope(root,loop),{reference,manifest}=await loadManifest(root,fixtures);ensure(manifest.heavyPrepared===true,'G12_ALL_FIXTURES_REQUIRED');
  const inputs=[reference,...new Map(Object.values(manifest.files).map(r=>[r.path,r])).values()],directory=`.cache/rebuild/evidence/${scope.freeze.loop}`;
  for(const definition of scope.definitions)for(const baseline of definition.baselineReferences)await readRef(root,baseline);
  const plan={schemaVersion:'1.0',acceptanceProfile:profile,gateId,codeDigest:scope.freeze.codeDigest,registrySha256:scope.registryRef.sha256,preparedAt:now(),loop:scope.freeze.loop,fixtureManifestRef:reference,requiredRuntime:'v24.13.1',oracleAccess:false,cases:scope.definitions.map(definition=>plannedCase(definition,{inputs,initialState:definition.id.endsWith('CORE-14-C05')?{origin:'root actual browser required',syntheticItemId:'g12-item-a',originalSentinel:'GSPEC_G12_ORIGINAL_ONLY_SENTINEL',expectedQuote:'Synthetic review quote'}:{origin:'fresh in-memory DocumentStore and synthetic bytes',providerCalls:{gemini:0,e2b:0}},actions:definition.id.endsWith('CORE-14-C05')?['Create actual preview with synthetic source documents','Native click/Enter/Space; capture isTrusted and selected frozen item','Forge one message field at a time; replace preview; unmount','Download actual host HTML and inspect bytes and offline behavior']:['Hash predeclared synthetic input bytes','Invoke actual document admission/local parsing or explicitly injected parser reservation boundary','Read actual public/private results and HTTP original content when required','Rehash original fixture files and retained input buffers']}) )};
  Object.assign(plan,{runtime:scope.runtime,totalCaseCount:caseIds.length});
  return freshJson(root,`${directory}/G12-plan.json`,plan);
}
async function checkedPlan(root,name){const reference=await ref(root,name),plan=JSON.parse(await readRef(root,reference)),scope=await currentScope(root,plan.loop);ensure(plan.schemaVersion==='1.0'&&plan.acceptanceProfile===profile&&plan.gateId===gateId&&plan.codeDigest===scope.freeze.codeDigest&&plan.registrySha256===scope.registryRef.sha256&&Number.isFinite(Date.parse(plan.preparedAt))&&Date.parse(plan.preparedAt)>=Date.parse(scope.freeze.frozenAt),'G12_PLAN_STALE');ensure(plan.oracleAccess===false&&plan.requiredRuntime==='v24.13.1'&&isDeepStrictEqual(plan.runtime,scope.runtime),'G12_PLAN_RUNTIME');ensure(plan.totalCaseCount===caseIds.length&&isDeepStrictEqual(plan.cases.map(c=>c.caseId).sort(),[...caseIds].sort()),'G12_PLAN_SCOPE');const loaded=await loadManifest(root,plan.fixtureManifestRef.path);ensure(isDeepStrictEqual(loaded.reference,plan.fixtureManifestRef)&&loaded.manifest.heavyPrepared===true,'G12_PLAN_FIXTURES_CHANGED');const expectedInputs=[loaded.reference,...new Map(Object.values(loaded.manifest.files).map(r=>[r.path,r])).values()];for(const c of plan.cases){ensure(isDeepStrictEqual(c.assertions,assertions[c.caseId]),'G12_PLAN_ASSERTIONS_CHANGED');const definition=scope.definitions.find(d=>d.id===c.caseId);ensure(isDeepStrictEqual(c.baselineReferences,definition.baselineReferences),'G12_PLAN_BASELINES_CHANGED');ensure(isDeepStrictEqual(c.inputs,expectedInputs),'G12_PLAN_INPUTS_CHANGED');for(const r of[...c.inputs,...c.baselineReferences])await readRef(root,r);}return{...scope,plan,reference};}
export async function collectDocuments(root,{plan:planName}){
  const checked=await checkedPlan(root,planName),manifest=JSON.parse(await readRef(root,checked.plan.fixtureManifestRef)),directory=path.posix.dirname(planName),records=[],startedAt=now();
  await freshJson(root,`${directory}/G12-documents-execution.lock.json`,{planRef:checked.reference,startedAt,command:command(),runtime:checked.runtime,reason:'One immutable document collection per frozen plan; a failed or interrupted collection is retained.'});
  for(const caseId of caseIds.slice(0,5)){await currentScope(root,checked.freeze.loop);const start=now();let actual;try{actual=await executeDocumentCase(root,caseId,manifest);}catch(error){actual={executionError:{name:error.name,code:error.code??null,status:error.status??null}};}const assertions=results(actual,caseId),endedAt=now(),actualRef=await freshJson(root,`${directory}/${caseId.replace(':','-')}-actual.json`,actual);records.push({caseId,state:assertions.every(a=>a.passed)?'passed':'failed',startedAt:start,endedAt,actualRef,artifactRefs:[],assertions});}
  await currentScope(root,checked.freeze.loop);return freshJson(root,`${directory}/G12-documents.json`,{schemaVersion:'1.0',acceptanceProfile:profile,gateId,loop:checked.freeze.loop,runtime:checked.runtime,totalCaseCount:caseIds.length,codeDigest:checked.freeze.codeDigest,registrySha256:checked.registryRef.sha256,planRef:checked.reference,startedAt,endedAt:now(),command:command(),exitCode:0,origin:'actual-offline-document-implementation',oracleAccess:false,providerCalls:{gemini:0,e2b:0},cases:records,browserCase:'not_run',completeProductAcceptance:false,commandMeaning:'exitCode0 means collection completed; failed assertions remain failed cases'});
}
export async function finalize(root,{plan:planName,browser}){
  const checked=await checkedPlan(root,planName),directory=path.posix.dirname(planName),documentsRef=await ref(root,`${directory}/G12-documents.json`),documents=JSON.parse(await readRef(root,documentsRef));
  ensure(documents.schemaVersion==='1.0'&&documents.acceptanceProfile===profile&&documents.gateId===gateId&&documents.loop===checked.freeze.loop&&documents.oracleAccess===false&&documents.providerCalls?.gemini===0&&documents.providerCalls?.e2b===0&&documents.totalCaseCount===caseIds.length&&isDeepStrictEqual(documents.runtime,checked.runtime),'G12_DOCUMENT_RECORD_IDENTITY');
  ensure(documents.codeDigest===checked.freeze.codeDigest&&documents.registrySha256===checked.registryRef.sha256&&isDeepStrictEqual(documents.planRef,checked.reference)&&documents.exitCode===0&&documents.origin==='actual-offline-document-implementation'&&isDeepStrictEqual(documents.cases.map(c=>c.caseId),caseIds.slice(0,5)),'G12_DOCUMENT_RECORD_STALE');
  ensure(validTime(documents.startedAt)&&validTime(documents.endedAt)&&Date.parse(documents.endedAt)>=Date.parse(documents.startedAt)&&Date.parse(documents.endedAt)<=Date.now(),'G12_DOCUMENT_RECORD_TIME');
  ensure(browser,'G12_REAL_BROWSER_REQUIRED');const browserRef=await ref(root,browser),raw=JSON.parse(await readRef(root,browserRef)),projected=await projectBrowserRecord(raw,{freeze:checked.freeze,registrySha256:checked.registryRef.sha256,planRef:checked.reference,readRef,root});
  ensure(Date.parse(documents.startedAt)>=Date.parse(checked.plan.preparedAt)&&Date.parse(projected.startedAt)>=Date.parse(checked.plan.preparedAt),'G12_EXECUTION_PRECEDES_PLAN');
  // Keep the hash-bound measurements from the actual downloaded bytes and
  // offline DOM. A source regex also counts bundled React string literals.
  const actual=projected.actual;
  const actualRef=await freshJson(root,`${directory}/G12-CORE-14-C05-actual.json`,actual),cases=[];
  for(const record of documents.cases){const value=JSON.parse(await readRef(root,record.actualRef)),comparisons=results(value,record.caseId);ensure(Number.isFinite(Date.parse(record.startedAt))&&Date.parse(record.startedAt)>=Date.parse(documents.startedAt)&&Date.parse(record.endedAt)>=Date.parse(record.startedAt)&&Date.parse(record.endedAt)<=Date.parse(documents.endedAt),'G12_CASE_TIME');cases.push({...record,state:comparisons.every(a=>a.passed)?'passed':'failed',assertions:comparisons});}
  const comparisons=results(actual,'G12:CORE-14-C05');cases.push({caseId:'G12:CORE-14-C05',state:comparisons.every(a=>a.passed)?'passed':'failed',startedAt:projected.startedAt,endedAt:projected.endedAt,actualRef,artifactRefs:[browserRef,...projected.artifactRefs],assertions:comparisons});
  await currentScope(root,checked.freeze.loop);const startedAt=new Date(Math.min(Date.parse(documents.startedAt),Date.parse(projected.startedAt))).toISOString(),endedAt=now();ensure(Date.parse(endedAt)>=Date.parse(projected.endedAt),'G12_BROWSER_FUTURE_TIME');
  return freshJson(root,`${directory}/G12-observations.json`,{schemaVersion:'1.0',acceptanceProfile:profile,gateId,loop:checked.freeze.loop,runtime:checked.runtime,totalCaseCount:caseIds.length,codeDigest:checked.freeze.codeDigest,registrySha256:checked.registryRef.sha256,planRef:checked.reference,command:command(),startedAt,endedAt,exitCode:0,origin:'actual-offline-documents-and-root-browser',oracleAccess:false,providerCalls:{gemini:0,e2b:0},browser:projected.browser,browserTraceRef:raw.browserTraceRef,collectionCommandRef:documentsRef,cases,completeProductAcceptance:false,limitations:['Offline document probes and actual browser record; no live provider inference.','Independent artifact review remains required.','Collector completion is distinct from per-case assertion success.']});
}
export async function developmentProbe(root,{fixtures,out,cases=caseIds.slice(0,5)}){
  ensure(Array.isArray(cases)&&cases.length>0&&new Set(cases).size===cases.length&&cases.every(id=>documentCaseIds().includes(id)),'G12_PROBE_CASE_SELECTION');
  const runtime=await runtimeIdentity(root);
  await outputDirectory(root,out);
  const loaded=await loadManifest(root,fixtures),before=await Promise.all(['scripts/acceptance/g12-runtime.mjs','scripts/acceptance/shared.mjs','server/documents.mjs','server/app.mjs','package-lock.json','integrations/package-lock.json'].map(name=>ref(root,name))),startedAt=now(),records=[];
  await freshJson(root,`${out}/execution.lock.json`,{startedAt,command:command(),runtime,selectedCaseIds:cases,fixtureManifestRef:loaded.reference,sourceBefore:before});
  for(const caseId of cases){const start=now();let actual;try{actual=await executeDocumentCase(root,caseId,loaded.manifest);}catch(error){actual={executionError:{name:error.name,message:error.message,code:error.code??null,status:error.status??null}};}const compared=results(actual,caseId),actualRef=await freshJson(root,`${out}/${caseId.replace(':','-')}-actual.json`,actual);records.push({caseId,state:compared.every(a=>a.passed)?'passed':'failed',startedAt:start,endedAt:now(),actualRef,assertions:compared});}
  const after=await Promise.all(before.map(r=>ref(root,r.path)));
  const fixtureAfter=await loadManifest(root,fixtures);
  return freshJson(root,`${out}/development.json`,{schemaVersion:'1.0',acceptanceProfile:profile,gateId,totalCaseCount:caseIds.length,population:caseIds,selectedCaseIds:cases,notRunCaseIds:caseIds.filter(id=>!cases.includes(id)),origin:'development-document-probes',startedAt,endedAt:now(),command:command(),nodeVersion:process.version,runtime,fixtureManifestRef:loaded.reference,fixtureStable:isDeepStrictEqual(loaded.reference,fixtureAfter.reference),sourceBefore:before,sourceAfter:after,sourceStable:isDeepStrictEqual(before,after),oracleAccess:false,providerCalls:{gemini:0,e2b:0},cases:records,fullGateCasesPassed:0,completeProductAcceptance:false});
}
function options(argv){const output={};for(let i=0;i<argv.length;i+=2){ensure(/^--[a-z-]+$/.test(argv[i]??'')&&argv[i+1]&&!argv[i+1].startsWith('--')&&!Object.hasOwn(output,argv[i].slice(2)),'G12_CLI_ARGUMENTS');output[argv[i].slice(2)]=argv[i+1];}return output;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{ensure(process.version==='v24.13.1','PINNED_NODE_24_13_1_REQUIRED');const[mode,...args]=process.argv.slice(2),o=options(args);const allowed={fixtures:['out','raster-manifest','heavy'],prepare:['loop','fixtures'],documents:['plan'],finalize:['plan','browser'],probe:['fixtures','out','cases']};ensure(allowed[mode]&&Object.keys(o).every(k=>allowed[mode].includes(k)),'G12_CLI_ARGUMENTS');let output;
    if(mode==='fixtures'){ensure(o.out&&o['raster-manifest']&&(!o.heavy||['true','false'].includes(o.heavy)),'G12_CLI_ARGUMENTS');output=await prepareFixtures(ROOT,o.out,{rasterManifest:o['raster-manifest'],heavy:o.heavy!=='false'});}
    if(mode==='prepare'){ensure(o.loop&&o.fixtures,'G12_CLI_ARGUMENTS');output=await preparePlan(ROOT,{loop:o.loop,fixtures:o.fixtures});}
    if(mode==='documents'){ensure(o.plan,'G12_CLI_ARGUMENTS');output=await collectDocuments(ROOT,{plan:o.plan});}
    if(mode==='finalize'){ensure(o.plan&&o.browser,'G12_CLI_ARGUMENTS');output=await finalize(ROOT,{plan:o.plan,browser:o.browser});}
    if(mode==='probe'){ensure(o.fixtures&&o.out,'G12_CLI_ARGUMENTS');output=await developmentProbe(ROOT,{fixtures:o.fixtures,out:o.out,cases:o.cases?o.cases.split(','):undefined});}
    console.log(JSON.stringify({mode,artifact:output,completeProductAcceptance:false}));
  }catch(error){console.error(JSON.stringify({state:'failed',error:error.code??error.message,completeProductAcceptance:false}));process.exitCode=1;}
}

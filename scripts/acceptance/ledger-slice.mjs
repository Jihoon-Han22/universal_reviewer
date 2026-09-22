// Actual six-ledger mapper/writer replay. Expectations are fixed from independent
// original workbook XML inspection and the current 05a contract, before invocation.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotImplementation} from '../../architecture/validation/acceptance.mjs';
import {ref,readRef,writeJson,sha256} from './shared.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const loop=process.argv[2];if(!/^LOOP-\d{3}$/.test(loop??''))throw new Error('Pass LOOP-NNN');
const outputDirectory=`.cache/rebuild/evidence/${loop}/ledger-copy-${new Date().toISOString().replace(/[:.]/g,'-')}`;
const sourceInventoryRef=await ref(root,'.cache/rebuild/evidence/LOOP-002/ledger-source-inventory/source-inventory.json');
const inventory=JSON.parse(await readRef(root,sourceInventoryRef));
const manual=[
  {id:'L01',status:'ready',code:null,columns:['C','F','G'],rows:[12],targets:['F12','G12']},
  {id:'L02',status:'ready',code:null,columns:['E','H','I'],rows:[12],targets:['H12','I12']},
  {id:'L03',status:'blocked',code:'duplicate_key',columns:null,rows:[5,12],targets:[]},
  {id:'L04',status:'ready',code:null,columns:['C','F','G'],rows:[12],targets:['F12','G12']},
  {id:'L05',status:'ready',code:null,columns:['C','F','G'],rows:[12],targets:['F12','G12']},
  {id:'L06',status:'blocked',code:'protected_sheet',columns:['C','F','G'],rows:[12],targets:['F12','G12']},
];
const documents=[];
for(const definition of manual){
  const input=await ref(root,`golden/ledger/${definition.id}.xlsx`),source=inventory.records.find(r=>r.id===definition.id);
  if(!source||source.input.sha256!==input.sha256||source.sheets.length!==1)throw new Error(`Source inventory mismatch ${definition.id}`);
  const sheet=source.sheets[0],keyCells=sheet.cells.filter(c=>c.value==='2026-0891').map(c=>c.ref);
  const expectedKeys=definition.id==='L03'?['C5','C12']:[`${definition.columns[0]}12`];
  if(JSON.stringify(keyCells)!==JSON.stringify(expectedKeys)||sheet.name!=='검토대장'||sheet.protection!==(definition.id==='L06'))throw new Error(`Independent source facts changed ${definition.id}`);
  for(const address of definition.targets)if(sheet.cells.some(c=>c.ref===address&&c.value))throw new Error(`Expected blank target changed ${definition.id}:${address}`);
  documents.push({...definition,caseId:`G06:${definition.id}`,input,key:'2026-0891',sheet:'검토대장',sheetPath:'xl/worksheets/sheet1.xml',headerRow:1,
    expectedWriter:definition.status==='ready'?{kind:'copy',changedCells:definition.targets}:{kind:'rejection',status:400},
    sourceAssertions:['exact source key occurrence inventory','current mapping status/code','current mapping rows/columns/targets','original buffer and file unchanged','ready copy two target text cells only','all other ZIP entry bytes unchanged','worksheet XML outside two target cells unchanged','existing formulas/styles/notes preserved','blocked writer rejects without output'],
    pendingPhases:['actual run proposal and fingerprint HTTP flow','E2B document structure assessment','browser confirmation and downloaded file'],
  });
}
const implementationReferences=await Promise.all(['server/ledger.mjs','scripts/acceptance/ledger-slice.mjs','scripts/acceptance/verify-ledger-slice.py','scripts/acceptance/shared.mjs'].map(p=>ref(root,p)));
const snapshot=await snapshotImplementation(root);
const plan={schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',loop,preparedAt:new Date().toISOString(),kind:'actual-offline-ledger-subphases',outputDirectory,codeDigest:snapshot.digest,registryRef:await ref(root,'scripts/acceptance/case-registry.json'),sourceInventoryRef,baselineReferences:[await ref(root,'architecture/specs/05a-ledger-export.md')],implementationReferences,
  initialState:'Each original workbook is read independently, with no runtime document/model/run cache. Output is written only to this evidence directory.',
  actions:['validate original input and source inventory hashes','invoke actual analyzeLedger(buffer,key)','invoke actual writeLedgerCopy(buffer,mapping,result,note), including blocked mappings','save actual output or error','independent Python XML/ZIP verification against this pre-execution plan'],
  result:'부적합',note:'=HYPERLINK("https://example.invalid", "$$ $& $1") & <검증>\n사용자 확인: 원문 보존',documents,oracleAccess:false,providerCalls:{gemini:0,e2b:0}};
const planRef=await writeJson(root,`${outputDirectory}/plan.json`,plan);
console.log(JSON.stringify({phase:'plan-frozen-before-product-import',planRef,selectedPaths:documents.length}));
const startedAt=new Date().toISOString();
const {analyzeLedger,writeLedgerCopy}=await import('../../server/ledger.mjs');
const records=[];
for(const definition of documents){
  const record={caseId:definition.caseId,input:definition.input,startedAt:new Date().toISOString(),mapping:null,writer:null,error:null};
  try{
    const buffer=await readRef(root,definition.input);record.bufferDigestBefore=sha256(buffer);
    record.mapping=await analyzeLedger(buffer,definition.key);
    try{const output=await writeLedgerCopy(buffer,record.mapping,plan.result,plan.note);const relative=`${outputDirectory}/${definition.id}-copy.xlsx`;await writeFile(path.join(root,relative),output);record.writer={kind:'copy',outputRef:await ref(root,relative),bytes:output.length};}
    catch(error){record.writer={kind:'rejection',status:error.statusCode??error.status??null,name:error.name,message:error.message};}
    record.bufferDigestAfter=sha256(buffer);record.inputDigestAfter=sha256(await readFile(path.join(root,definition.input.path)));
  }catch(error){record.error={name:error.name,message:error.message,status:error.statusCode??error.status??null};}
  record.endedAt=new Date().toISOString();records.push(record);
  await writeJson(root,`${outputDirectory}/executions.json`,{schemaVersion:'1.0',planRef,startedAt,records,complete:false});
  console.log(JSON.stringify({caseId:definition.caseId,status:record.mapping?.status,code:record.mapping?.code,writer:record.writer?.kind,error:record.error}));
}
const currentSourceReferences=await Promise.all(implementationReferences.map(r=>ref(root,r.path)));
const execution={schemaVersion:'1.0',acceptanceProfile:plan.acceptanceProfile,loop,planRef,startedAt,endedAt:new Date().toISOString(),command:[process.execPath,'scripts/acceptance/ledger-slice.mjs',loop],exitCode:records.some(r=>r.error)?1:0,origin:'actual-offline-product-ledger-implementation',providerCalls:{gemini:0,e2b:0},oracleAccess:false,implementationReferences,currentSourceReferences,implementationStable:JSON.stringify(implementationReferences)===JSON.stringify(currentSourceReferences),complete:true,records,fullGateCasesPassed:0};
await writeJson(root,`${outputDirectory}/executions.json`,execution);
console.log(JSON.stringify({phase:'product-execution-complete-independent-verification-pending',directory:outputDirectory,exitCode:execution.exitCode,implementationStable:execution.implementationStable}));
process.exitCode=execution.exitCode;

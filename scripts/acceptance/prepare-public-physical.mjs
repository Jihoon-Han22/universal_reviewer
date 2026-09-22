// Freeze exact G08 physical input/range/assertion scope before product execution.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {snapshotImplementation} from '../../architecture/validation/acceptance.mjs';
import {ref,readRef} from './shared.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const name=process.argv[2];if(!name?.startsWith('.cache/rebuild/evidence/')||!name.endsWith('/input-manifest.json'))throw new Error('Pass original prepared input-manifest.json');
const inputManifestRef=await ref(root,name),manifest=JSON.parse(await readRef(root,inputManifestRef));
const authoredManifestRef=await ref(root,`${manifest.outputDirectory}/authored-manifest.json`),authored=JSON.parse(await readRef(root,authoredManifestRef));
if(manifest.cases.length!==13||authored.cases.length!==13)throw new Error('Full thirteen-case scope required');
const outputDirectory=`.cache/rebuild/evidence/${manifest.loop}/G08-physical-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(path.join(root,outputDirectory));
const cases=[];
for(const source of manifest.cases){
  const draftRef=authored.cases.find(c=>c.caseId===source.caseId)?.artifact;
  const draft=JSON.parse(await readRef(root,draftRef));
  const directory=`${outputDirectory}/${source.caseId.replace(':','-')}`;await mkdir(path.join(root,directory));
  const documents=[];
  for(const input of source.inputs){
    await readRef(root,input.input);
    const kind=path.extname(input.file).slice(1),sheets=input.role==='criteria'?draft.sourceFacts.criteriaSheets:draft.sourceFacts.targetSheets;
    const expectedSheets=sheets.map(sheet=>({name:kind==='csv'?'CSV':sheet.name,state:sheet.state}));
    const expectedNonemptyCells=sheets.flatMap(sheet=>sheet.cells.filter(cell=>cell.text!=='').map(cell=>({sheet:kind==='csv'?'CSV':sheet.name,cell:cell.cell,value:cell.text})));
    const expectedCsvCells=kind==='csv'?sheets.flatMap(sheet=>sheet.cells.map(cell=>({sheet:'CSV',cell:cell.cell,value:cell.text}))):null;
    documents.push({role:input.role,kind,input:input.input,output:`${directory}/${input.role}-reader.json`,expected:{status:'ready',complete:true,sheets:expectedSheets,nonemptyCells:expectedNonemptyCells,csvCells:expectedCsvCells,images:0,cellCap:100000,textCap:1500000}});
  }
  const criteriaSource=source.inputs.find(input=>input.role==='criteria');
  const ranges=draft.sourceFacts.criteriaTables.map(table=>({sheet:table.sheet,range:table.range}));
  for(const sheet of draft.sourceFacts.criteriaSheets)if(sheet.cells.length&&!ranges.some(range=>range.sheet===sheet.name)){
    // The inspected administrative sheet has one source cell. Retain it as a
    // physical input region; it is never promoted to a normative criterion.
    if(sheet.cells.length!==1)throw new Error('Additional non-table source region requires independent range review');
    ranges.push({sheet:sheet.name,range:sheet.cells[0].cell});
  }
  const requestPath=`${directory}/criteria-request.json`;
  await writeFile(path.join(root,requestPath),JSON.stringify({ranges}),{flag:'wx'});
  cases.push({caseId:source.caseId,authoredDraftRef:draftRef,documents,criteriaHelper:{input:criteriaSource.input,requestRef:await ref(root,requestPath),inventoryOutput:`${directory}/criteria-inventory.json`,detailsOutput:`${directory}/criteria-details.json`,expected:{complete:true,sheets:draft.sourceFacts.criteriaSheets.map(sheet=>({name:sheet.name,visibility:sheet.state})),ranges,nonemptyCells:draft.sourceFacts.criteriaSheets.flatMap(sheet=>sheet.cells.filter(cell=>cell.text!=='').map(cell=>({sheet:sheet.name,cell:cell.cell,value:cell.text}))) }},semanticState:'unresolved',fullGateCaseState:'not_run'});
}
const implementationReferences=await Promise.all(['server/sandbox-document-reader.py','server/criteria-workbook-profile.py','scripts/acceptance/public-physical.py','scripts/acceptance/prepare-public-physical.mjs'].map(file=>ref(root,file)));
const snapshot=await snapshotImplementation(root);
const plan={schemaVersion:'1.0',acceptanceProfile:'CURRENT_REPRODUCTION',loop:manifest.loop,kind:'preexecution-physical-public-transform-plan',preparedAt:new Date().toISOString(),outputDirectory,inputManifestRef,authoredManifestRef,implementationReferences,wholeImplementationDigestAtPreparation:snapshot.digest,
  baselineReferences:await Promise.all(['architecture/specs/02-backend-pipeline.md','architecture/specs/07-data-algorithms-concurrency.md','architecture/specs/06-verification.md'].map(file=>ref(root,file))),
  expectedScope:{publicCases:13,readerInvocations:26,criteriaWorkbooks:13,inventoryInvocations:13,rangeReadInvocations:13,totalProductHelperInvocations:52},
  command:['.cache/rebuild/python/Scripts/python.exe','-B','scripts/acceptance/public-physical.py',`${outputDirectory}/plan.json`],
  initialState:'Immutable copied input bytes and independently inspected XML/CSV source facts. No prior product profile is substituted.',
  actions:['verify every input, request and implementation hash','invoke actual trusted reader main once for each of 26 input paths','invoke actual workbook helper inventory once and range read once for each of 13 criteria workbooks','compare nonempty source cells and declared current limits with the independently frozen source facts','save every output, error, timestamp and source/code hash; retain all thirteen semantic cases as unresolved'],
  transport:'Pinned local Python, sequential imports/calls of unchanged product entrypoints; no subprocess, provider, browser or model.',
  scopeLimit:'This establishes physical artifacts and source fidelity only. It cannot pass semantic G08 or prove model extraction, context verification, application review, browser highlights or complete product acceptance.',oracleRead:false,providerCalls:{gemini:0,e2b:0},cases,fullGateCasesPassed:0};
const file=`${outputDirectory}/plan.json`;await writeFile(path.join(root,file),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({plan:await ref(root,file),expectedScope:plan.expectedScope,productExecuted:false}));

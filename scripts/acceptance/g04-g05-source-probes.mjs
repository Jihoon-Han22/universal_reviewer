/** Offline, authored-source G04/G05 observations. No providers, browser, or oracle inputs. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const assertion=(name,pointer,expected)=>({name,pointer,expected});
const copy=value=>JSON.parse(JSON.stringify(value));
const pick=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]??null]));
const criterion=(extra={})=>({id:'strength',label:'Strength',rule:'>= 80 MPa',comparison:{operator:'gte',value:80,unit:'MPa'},sourceDocumentId:'criteria',conditions:[],categoryPath:[],needsConfirmation:false,...extra});
const item=(extra={})=>({id:'result-1',documentId:'target',criterionId:'strength',label:'Strength',value:'92',unit:'MPa',status:'pass',uncertain:false,explanation:'authored source observation',evidence:[{documentId:'target',page:1,sheet:'Measurements',cell:'B2',quote:'Strength 92'}],...extra});
const pdfRuns=(y=0)=>[{text:'Strength',x:0,y,width:45,height:10,dx:1,dy:0},{text:'92',x:50,y,width:10,height:10,dx:1,dy:0}];

export async function createSourceProbeCatalog(root){
  if(process.version!=='v24.13.1')throw new Error('Source observations require pinned Node v24.13.1');
  const module=name=>import(pathToFileURL(path.join(root,name)).href);
  // Node 24 strips these type-only TypeScript annotations without changing the implementation.
  const S=await module('src/source-highlights.ts');
  const A=await module('server/algorithms.mjs');
  const Q=await module('server/document-quality.mjs');
  const D=await module('server/dashboard.mjs');
  const C=await module('src/criteria-model.ts');
  const {createCriterionPreviewProbe}=await module('scripts/acceptance/g04-g05-criterion-preview-probes.mjs');
  const probes=new Map();
  const define=(id,inputs,assertions,run)=>probes.set(id,{id,inputs,assertions,run});

  const dtoInput={reviewItem:item({evidence:[{documentId:'target',page:2,quote:'Strength 92'},{documentId:'criteria',sheet:'Limits',cell:'B2',quote:'>= 80 MPa'}]}),criterion:criterion({sourceEvidence:[{documentId:'criteria',sheet:'Limits',cell:'B2',quote:'>= 80 MPa'}]}),runs:pdfRuns()};
  define('source.dto',dtoInput,[
    assertion('Review source ownership keeps target and criterion references distinct','/projection',{targetIds:['target'],criterionIds:['criteria'],criterionRefs:[{documentId:'criteria',sheet:'Limits',cell:'B2',quote:'>= 80 MPa'}],targetPage1Runs:0,targetPage2Runs:2,otherDocumentRuns:0,resultId:'result-1',originalEvidenceCount:2})
  ],async()=>{const input=copy(dtoInput),target=S.sourceEvidence(input.reviewItem,'target'),criteria=S.sourceEvidence(input.reviewItem,'criteria'),refs=C.criteriaRefs(input.criterion),page1=S.pdfHighlightRuns(input.runs,input.reviewItem,'target',1),page2=S.pdfHighlightRuns(input.runs,input.reviewItem,'target',2),other=S.pdfHighlightRuns(input.runs,input.reviewItem,'unrelated',2);return {input,target,criteria,refs,page1,page2,other,projection:{targetIds:target.map(e=>e.documentId),criterionIds:criteria.map(e=>e.documentId),criterionRefs:refs,targetPage1Runs:page1.length,targetPage2Runs:page2.length,otherDocumentRuns:other.length,resultId:input.reviewItem.id,originalEvidenceCount:input.reviewItem.evidence.length},scope:'Pure source helpers and source DTOs; browser selection is collected separately.'};});

  const statuses=['pass','pending','review','fail'];
  define('source.priority',{statuses,selected:['pass','pending','review','fail',null]},[
    assertion('Selected item wins; otherwise fail, review, pending, pass','/projection',[
      {selected:'pass',order:['pass','fail','review','pending']},{selected:'pending',order:['pending','fail','review','pass']},{selected:'review',order:['review','fail','pending','pass']},{selected:'fail',order:['fail','review','pending','pass']},{selected:null,order:['fail','review','pending','pass']}
    ])
  ],async()=>{const rows=[...statuses,null].map(selected=>{const items=statuses.map(status=>item({id:status,status}));return {selected,items,priorities:items.map(i=>({id:i.id,priority:S.itemPriority(i,selected)})),order:items.sort((a,b)=>S.itemPriority(a,selected)-S.itemPriority(b,selected)).map(i=>i.id)};});return {rows,projection:rows.map(({selected,order})=>({selected,order})),scope:'Priority function, including pending; actual overlap painting and keyboard are browser facets.'};});

  const criterionPreviewProbe=await createCriterionPreviewProbe(root);
  probes.set(criterionPreviewProbe.id,criterionPreviewProbe);

  const missingCases=[
    {id:'explicit-missing',patch:{presence:'missing',value:''},directMissing:true,projectedMissing:false},
    {id:'verified-blank',patch:{missingVerified:true,value:''},directMissing:true,projectedMissing:false},
    {id:'legacy-sentinel',patch:{value:' NOT REPORTED '},directMissing:true,projectedMissing:true},
    {id:'explicit-present',patch:{presence:'present',missingVerified:true,value:'missing'},directMissing:false,projectedMissing:true},
    {id:'unreadable',patch:{presence:'unreadable',missingVerified:true,value:'판독불가'},directMissing:false,projectedMissing:false},
    {id:'null',patch:{value:null},directMissing:false,projectedMissing:false},
    {id:'zero',patch:{value:0},directMissing:false,projectedMissing:false}
  ];
  define('source.missingCaller',missingCases,[
    assertion('Actual dashboard projection loses flags while legacy sentinel survives','/projection',missingCases.map(({id,directMissing,projectedMissing})=>({id,directMissing,projectedMissing,directTargetCount:directMissing?0:1,projectedTargetCount:projectedMissing?0:1,criterionCount:1,originalCount:2,projectedHasPresence:false,projectedHasMissingVerified:false})))
  ],async()=>{const rows=missingCases.map(input=>{const original=item({...input.patch,evidence:[{documentId:'target',page:1,quote:'Strength'},{documentId:'criteria',sheet:'Limits',cell:'B2',quote:'>= 80 MPa'}]}),snapshot=D.snapshotRun({id:'authored-run',status:'complete',criterionVersion:3,documents:[{id:'target',name:'generated-target.pdf'}],items:[original]},'2000-01-01T00:00:00.000Z'),projected=D.sourceItems(snapshot)[0],direct=S.sourceEvidence(original,'target'),afterProjection=S.sourceEvidence(projected,'target');return {id:input.id,original,snapshot,projected,direct,afterProjection,directChip:S.sourceChip(original,'target',{page:1},false,true),projectedChip:S.sourceChip(projected,'target',{page:1},false,true),directMissing:S.isMissingItem(original),projectedMissing:S.isMissingItem(projected),directTargetCount:direct.length,projectedTargetCount:afterProjection.length,criterionCount:S.sourceEvidence(original,'criteria').length,originalCount:original.evidence.length,projectedHasPresence:Object.hasOwn(projected,'presence'),projectedHasMissingVerified:Object.hasOwn(projected,'missingVerified')};});return {rows,projection:rows.map(row=>pick(row,['id','directMissing','projectedMissing','directTargetCount','projectedTargetCount','criterionCount','originalCount','projectedHasPresence','projectedHasMissingVerified'])),scope:'Missing preprocessing and actual dashboard projection; criterion union, fallback and supplementation are exercised separately by source.criterionPreview for the unchanged owning cases.',baseline:'detail-controls D1.3 and dashboard DB-H01: preserve projection exception, do not silently strengthen it.'};});

  const tableCases=[
    {id:'coordinate-mismatch-permitted',e:{sheet:'Measurements',cell:'B2',quote:'different text'},names:['Measurements'],active:'Measurements',rows:3,cols:3,cells:['1:1'],ambiguous:false},
    {id:'different-sheet',e:{sheet:'Other',cell:'B2'},names:['Measurements','Other'],active:'Measurements',rows:3,cols:3,cells:[],ambiguous:false},
    {id:'unqualified-multisheet',e:{cell:'B2'},names:['Measurements','Other'],active:'Measurements',rows:3,cols:3,cells:[],ambiguous:true},
    {id:'conflicting-sheet',e:{sheet:'Measurements',cell:'Other!B2'},names:['Measurements','Other'],active:'Measurements',rows:3,cols:3,cells:[],ambiguous:true},
    {id:'reverse-union',e:{cell:'C3:B2; A1; B2'},names:['Measurements'],active:'Measurements',rows:3,cols:3,cells:['0:0','1:1','1:2','2:1','2:2'],ambiguous:false},
    {id:'clip-100',e:{cell:'A99:A102'},names:['Measurements'],active:'Measurements',rows:102,cols:1,cells:['98:0','99:0'],ambiguous:false},
    {id:'invalid-zero',e:{cell:'A0'},names:['Measurements'],active:'Measurements',rows:3,cols:3,cells:[],ambiguous:true},
    {id:'quoted-sheet',e:{cell:"'O''Brien'!B2"},names:["O'Brien"],active:"O'Brien",rows:3,cols:3,cells:['1:1'],ambiguous:false}
  ];
  const pdfCases=[
    {id:'witnessed',runs:pdfRuns(),patch:{},documentId:'target',page:1,xs:[0,50]},
    {id:'wrong-page',runs:pdfRuns(),patch:{},documentId:'target',page:2,xs:[]},
    {id:'wrong-document',runs:pdfRuns(),patch:{},documentId:'other',page:1,xs:[]},
    {id:'value-only',runs:pdfRuns(),patch:{evidence:[{documentId:'target',quote:'92'}]},documentId:'target',page:1,xs:[]},
    {id:'duplicate-witness-rows',runs:[...pdfRuns(),...pdfRuns(20)],patch:{},documentId:'target',page:1,xs:[]},
    {id:'missing-header',runs:pdfRuns(),patch:{presence:'missing',value:'',evidence:[{documentId:'target',quote:'Strength'}]},documentId:'target',page:1,xs:[]},
    {id:'duplicate-unnamed-values',runs:[...pdfRuns(),{text:'92',x:75,y:0,width:10,height:10,dx:1,dy:0}],patch:{evidence:[{documentId:'target',quote:'Strength'},{documentId:'target',quote:'92'}]},documentId:'target',page:1,xs:[0]}
  ];
  const textCases=[['15','5',[]],['5.0','5',[]],['-5','5',[]],['5e3','5',[]],['152,000','52,000',[]],['Strength\n  92 MPa','Strength 92 MPa',[{start:0,end:17}]],['ABC','abc',[]],['aaa','aa',[{start:0,end:2},{start:1,end:3}]]];
  define('source.matching',{tableCases,pdfCases,textCases},[
    assertion('Table coordinate authority, sheet isolation, clipping and invalid addresses','/tableProjection',tableCases.map(({id,cells,ambiguous})=>({id,cells,ambiguous}))),
    assertion('PDF witness, row ambiguity, missing and page/document guards','/pdfProjection',pdfCases.map(({id,xs})=>({id,xs}))),
    assertion('Text boundaries and literal offsets','/textProjection',textCases.map(([text,quote,matches])=>({text,quote,matches})))
  ],async()=>{const tables=tableCases.map(input=>{const result=S.tableEvidenceCells(input.e,input.active,input.names,input.rows,input.cols);return {input,result:{...result,cells:[...result.cells]},id:input.id,cells:[...result.cells],ambiguous:result.ambiguous};}),pdf=pdfCases.map(input=>{const original=item(input.patch),runs=S.pdfHighlightRuns(input.runs,original,input.documentId,input.page);return {input,item:original,runs,id:input.id,xs:runs.map(r=>r.x)};}),texts=textCases.map(([text,quote])=>({text,quote,matches:S.textMatches(text,quote)}));return {tables,pdf,texts,tableProjection:tables.map(({id,cells,ambiguous})=>({id,cells,ambiguous})),pdfProjection:pdf.map(({id,xs})=>({id,xs})),textProjection:texts,remainingFacets:['Coordinate-free table fallback is inside DocumentPreview; exact DOM highlight cells, rendered PDF alignment, and input events require browser evidence.'],baseline:'No OPTIONAL_FUTURE row witness is imposed on table coordinates.'};});

  const sizes=[8,16,32];
  define('complexity.review',{sizes,evidencePerCandidate:1,citationQuoteLength:40},[
    assertion('Repeated same-key merges preserve first identity and all unique citations','/projection',sizes.map(n=>({n,outputCount:1,citationCount:n,firstId:'c0',sampleEvidenceCell:'Z1',serializationCalls:n*n+n-2}))),
    assertion('Document, scope, category, sample, conditions, required and unit distinguish semantic keys','/semanticGroups',8)
  ],async()=>{const rows=[];for(const n of sizes){let serializations=0;const inputs=Array.from({length:n},(_,index)=>{const citation={documentId:'criteria',sheet:'Limits',cell:`B${index+1}`,quote:'x'.repeat(40)};Object.defineProperty(citation,'toJSON',{enumerable:false,value(){serializations++;return {documentId:this.documentId,sheet:this.sheet,cell:this.cell,quote:this.quote};}});return criterion({id:`c${index}`,evidenceCells:[citation],sampleEvidence:[{documentId:'criteria',cell:`Z${index+1}`,quote:'sample'}]});});const output=A.deduplicateCriteria(inputs),serializationCalls=serializations;rows.push({n,output:copy(output),outputCount:output.length,citationCount:output[0].sourceEvidence.length,firstId:output[0].id,sampleEvidenceCell:output[0].sampleEvidence[0].cell,serializationCalls});}const variants=[{}, {sourceDocumentId:'other'}, {scope:'exterior'}, {categoryPath:['metal']}, {sampleName:'batch-2'}, {conditions:['28 days']}, {required:false}, {comparison:{operator:'gte',value:80,unit:'kPa'}}].map((patch,index)=>criterion({id:`group-${index}`,...patch})),grouped=A.deduplicateCriteria(variants);return {rows,projection:rows.map(row=>pick(row,['n','outputCount','citationCount','firstId','sampleEvidenceCell','serializationCalls'])),variants,grouped,semanticGroups:grouped.length,analysis:{observation:'Instrumented citation.toJSON calls count actual repeated union serialization, not wall time. The fixture yields quadratic calls; this does not assert all implementation work is linear or prove parser cost.',contract:'07 §§7.1, 7.4: accumulated evidence reserialization can be Theta(C² e ell); Map lookup alone does not characterize total cost.'},owningCasePhysicalProbes:['workbook.pythonLimits','workbook.transforms'],limitations:['Parser CPU and heap measurements are not an additional CURRENT_REPRODUCTION acceptance threshold. These JavaScript observations do not measure OOXML loading or parser memory.'],crossProbeRequirements:['Current-source workbook.pythonLimits physical inventory/detail/cap evidence, both orientation/hidden/repeated-block functional transforms, and source audit of stored-cell iteration and conservative costs.']};});

  const textProfiles=[{id:'overlap-unsorted',ranges:['L9:L16','L1:L8','L5:L12'],missing:[]},{id:'single-hole',ranges:['L9:L16','L1:L7'],missing:['L8']},{id:'oversized-range',ranges:['L1:L999999999'],missing:Array.from({length:16},(_,i)=>`L${i+1}`)}];
  define('complexity.profiles',{lineCount:16,textProfiles,workbookCellCount:16,regionCounts:[1,8,16]},[
    assertion('Actual text coverage sweep merges overlapping intervals and rejects out-of-bounds ranges','/textProjection',textProfiles.map(({id,missing})=>({id,missing}))),
    assertion('Sparse distant cells are assessed by coordinate and uncovered cells remain explicit','/workbookProjection',[1,8,16].map(regions=>({regions,missingCells:15,coveredLast:true})))
  ],async()=>{const profile={kind:'txt',text:Array.from({length:16},(_,i)=>`line ${i+1}`).join('\n'),coverage:{complete:true}},texts=textProfiles.map(input=>{const context={structure:input.ranges.map(range=>({name:range,range,uncertain:false})),questions:[]},issues=Q.checkDocumentContext(context,profile);return {id:input.id,profile,context,issues,missing:issues.filter(i=>i.code==='missing_region').map(i=>`L${i.request.start}`)};}),workbooks=[];for(const regions of [1,8,16]){let coordinateReads=0;const cells=Array.from({length:16},(_,i)=>({get cell(){coordinateReads++;return `A${i===15?1048576:i+1}`;},value:`value ${i+1}`})),sheetProfile={kind:'xlsx',coverage:{complete:true},sheets:[{name:'Sparse',rows:[{row:1,cells}]}]},context={structure:Array.from({length:regions},(_,i)=>({name:`region ${i}`,sheet:'Sparse',range:'A1048576:A1048576',kind:'text',headers:[],uncertain:false})),questions:[]},issues=Q.checkDocumentContext(context,sheetProfile),reads=coordinateReads;workbooks.push({regions,profile:copy(sheetProfile),context,issues,coordinateReads:reads,missingCells:issues.filter(i=>i.code==='missing_region').length,coveredLast:!issues.some(i=>i.request?.range==='A1048576')});}return {texts,workbooks,textProjection:texts.map(({id,missing})=>({id,missing})),workbookProjection:workbooks.map(({regions,missingCells,coveredLast})=>({regions,missingCells,coveredLast})),analysis:{text:'Input intervals are deliberately unsorted and overlapping; source line sweep is observed on real checkDocumentContext.',workbook:'Actual cell property reads expose repeated region scans. The far coordinate is one stored cell, not a million-row allocation. No parser or inventory execution is claimed.'},owningCasePhysicalProbes:['workbook.pythonLimits','workbook.transforms'],limitations:['07 §§7.3–7.4 cost descriptions are conservative loop analysis, not a required new CPU/heap benchmark. Parser/library memory remains additional to sparse storage, with no streaming-memory or universal-linear-time claim.'],crossProbeRequirements:['Physical inventory/sampling/partial limits from workbook.pythonLimits and actual row/column role-discovery transforms must be linked, without rerunning already valid frozen evidence.']};});

  const guards=[['numeric',false,false,false,'numeric'],['conditions',true,false,false,'conditions'],['classification',true,true,false,'classification'],['extraction',true,true,true,'extraction']];
  define('complexity.guardReview',guards,[
    assertion('Later applicable guard overwrites reason; final label and machineStatus follow all guards','/projection',guards.map(([id,,,,reason])=>({id,reason,status:id==='numeric'?'pass':'review',machineStatus:id==='numeric'?'pass':'review',label:'Batch-Q · Strength',uncertain:id!=='numeric'})))
  ],async()=>{const rows=guards.map(([id,conditions,classification,extraction])=>{const document={id:'target',kind:'csv',sourceRows:[{row:1,cells:['id','Strength','Type']},{row:2,cells:['Batch-Q','92','Metal']}],analysis:{status:'complete',coverage:{complete:true}}};if(extraction)document.extraction={fields:[{label:'Strength',value:'91',unit:'MPa',uncertain:false,evidence:[{documentId:'target',cell:'B2',quote:'91'}]}]};const c=criterion({conditions:conditions?['28 days']:[],categoryPath:classification?['Metal']:[]}),raw=item({status:'fail',evidence:[{documentId:'target',cell:'B2',quote:'92'}]}),result=A.normalizeItems([raw],document,[c],{idFactory:()=>`guard-${id}`})[0],reason=result.extractionMismatch?'extraction':result.applicability?.verified===false?'classification':result.missingConditions?.length?'conditions':'numeric';return {id,document,criterion:c,raw,result,reason,...pick(result,['status','machineStatus','label','uncertain'])};});return {rows,projection:rows.map(row=>pick(row,['id','reason','status','machineStatus','label','uncertain'])),scope:'Actual composed normalizeItems order; pure numeric/missing matrices are separate probes.'};});
  return probes;
}

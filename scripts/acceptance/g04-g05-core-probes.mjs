// Additional actual implementation observations. These are authored inputs, not oracle replay.
import {isDeepStrictEqual} from 'node:util';

export async function augmentCoreProbes({probes,A,P,ReviewEngine,engineHarness,criterion,finding,csv,completeDoc,capture,clone,assertion,mapRows,discoveryReplay,candidate,cite,regionAssessment}) {
  const define=(id,inputs,assertions,run)=>probes.set(id,{id,inputs,assertions,run});
  const augment=(id,checks,work)=>{const prior=probes.get(id);probes.set(id,{...prior,assertions:[...prior.assertions,...checks],run:async()=>work(await prior.run())});};

  // §11.3 distinguishes rejected hierarchy from sample uncertainty: the latter
  // retains a grounded comparison while making classification ambiguous.
  const grounding=probes.get('workbook.grounding');
  grounding.assertions=grounding.assertions.map(check=>({...check,expected:check.expected.map(row=>row.id==='sampleMissing'?{...row,comparison:true}:row)}));
  augment('workbook.grounding',[assertion('Missing sample is removed and remains ambiguous','/sampleBoundary',{sampleAbsent:true,classification:'ambiguous',unresolved:true})],async out=>{const result=out.rows.find(r=>r.id==='sampleMissing').output,c=result.criteria[0];out.sampleBoundary={sampleAbsent:!c.sampleName,classification:c.classificationStatus,unresolved:result.unresolved.some(r=>r.sheet==='Rules'&&r.cell==='B2')};return out;});

  const duplicateLimit=probes.get('workbook.criteriaLimits');
  define('workbook.criteriaLimits',{distinctCounts:[250,251],duplicateCounts:[250,251],source:'03 §11.2 upsert precedes cap'},[
    assertion('Identical proposals upsert before the criteria cap','/duplicates',[250,251].map(count=>({count,criteriaLimitReached:false,dropped:0,criteriaCount:1}))),
    assertion('Distinct grounded candidates exercise the actual cap','/projection',[{count:250,criteriaLimitReached:false,dropped:0,criteriaCount:250,complete:true},{count:251,criteriaLimitReached:true,dropped:1,criteriaCount:250,complete:false}])
  ],async()=>{
    const duplicateResult=await duplicateLimit.run(),rows=[];
    for(const count of [250,251]){const cells=[{cell:'A1',text:'항목'},{cell:'B1',text:'기준'},{cell:'C1',text:'단위'}],proposals=[],anchors=[];
      for(let i=0;i<count;i++){const r=i+2,label='Synthetic metric '+String(i+1).padStart(3,'0');cells.push({cell:'A'+r,text:label},{cell:'B'+r,text:'20 이상'},{cell:'C'+r,text:'MPa'});proposals.push(candidate({label,citations:[cite('A'+r,label),cite('B'+r,'20 이상')],unitCitations:[cite('C'+r,'MPa')]}));anchors.push('B'+r);}
      const sheets=[{name:'Rules',range:'A1:C'+(count+1),cells}],assessments=[regionAssessment({criterionCells:anchors,evidence:[cite('B2','20 이상')]})],actual=await discoveryReplay({sheets,proposals,assessments});rows.push({count,sheets,proposals,assessments,...actual,criteriaLimitReached:actual.output.coverage.criteriaLimitReached,dropped:actual.output.coverage.droppedCriteria,criteriaCount:actual.output.criteria.length,complete:actual.output.coverage.extractedCriteriaComplete});
    }
    return {duplicateResult,rows,duplicates:duplicateResult.projection,projection:mapRows(rows,['count','criteriaLimitReached','dropped','criteriaCount','complete'])};
  });

  const sourceMatrix=[
    ['csv-cell','csv',{cell:'B2',quote:'0.50'},true],['csv-name-sheet','csv',{sheet:'arbitrary.csv',cell:'B2',quote:'0.50'},true],['csv-other-sheet','csv',{sheet:'Invented',cell:'B2',quote:'0.50'},false],
    ['csv-row-substring','csv',{cell:'A2:B2',quote:'result 0.50'},true],['csv-short-decimal','csv',{cell:'B2',quote:'0.5'},false],['csv-cross-row','csv',{cell:'A2:B3',quote:'result 0.50 next 0.60'},false],['csv-invalid-range','csv',{cell:'A0',quote:'result'},false],
    ['xlsx-cell','xlsx',{sheet:'Rules',cell:'B2',quote:'0.50'},true],['xlsx-comment','xlsx',{sheet:'Rules',cell:'B2',quote:'Comment source'},true],['xlsx-selected-row-substring','xlsx',{sheet:'Rules',cell:'A2:B3',quote:'result 0.50'},true],['xlsx-cross-row','xlsx',{sheet:'Rules',cell:'A2:B3',quote:'result 0.50 next 0.60'},false],['xlsx-other-sheet','xlsx',{sheet:'Other',cell:'B2',quote:'0.50'},false],['xlsx-missing-sheet','xlsx',{cell:'B2',quote:'0.50'},false],['xlsx-unselected-comment','xlsx',{sheet:'Rules',cell:'A2',quote:'Comment source'},false],
    ['pdf-page','pdf',{page:1,quote:'Recorded 0.50'},true],['pdf-wrong-page','pdf',{page:2,quote:'Recorded 0.50'},false],['pdf-no-page','pdf',{quote:'Recorded 0.50'},false],['pdf-invented-cell','pdf',{page:1,cell:'A1',quote:'Recorded 0.50'},false],
    ['word-block','docx',{quote:'Source block'},true],['word-supplement','docx',{quote:'Supplement source'},true],['word-invented-page','docx',{page:1,quote:'Source block'},false],['word-invented-table','docx',{table:1,quote:'Source block'},false],['word-role-only','docx',{quote:'criteria'},false]
  ];
  augment('eligibility.source',[
    assertion('CSV XLSX PDF and Word retain literal source and location predicates','/kindProjection',sourceMatrix.map(([id,,,accepted])=>({id,accepted})))
  ],async out=>{
    out.kindRows=[];
    for(const [id,kind,evidence]of sourceMatrix){const document={...completeDoc(),kind,name:kind==='csv'?'arbitrary.csv':'arbitrary.'+kind};
      if(kind==='csv')document.sourceRows=[{row:1,cells:['item','value']},{row:2,cells:['result','0.50']},{row:3,cells:['next','0.60']}];
      if(kind==='xlsx')document.sourceSheets=[{name:'Rules',rows:[{row:2,cells:[{address:'A2',text:'result'},{address:'B2',text:'0.50',comment:'Comment source'}]},{row:3,cells:[{address:'A3',text:'next'},{address:'B3',text:'0.60'}]}]}];
      if(kind==='pdf')document.verificationPages=[{page:1,text:'Recorded 0.50'}];
      if(kind==='docx')document.sandboxProfile={status:'ready',coverage:{complete:true},blocks:[{kind:'paragraph',text:'Source block'}],supplementaryText:[{text:'Supplement source'}]};
      const raw={status:'not_criteria',hasNormativeContent:false,sourceKind:'measurement_report',reason:'Authored completed record',evidence:[{documentId:'d',...evidence}]},result=await capture(()=>A.validateAssessment(raw,document,{strict:true}));out.kindRows.push({id,document,raw,result,accepted:result.accepted});
    }
    out.kindProjection=mapRows(out.kindRows,['id','accepted']);delete out.remainingFacets;return out;
  });

  const conditionCases=['재령','기간','온도'].flatMap((heading,index)=>['csv','xlsx'].flatMap(kind=>[false,true].map(transpose=>({heading,value:['28일','2시간','23℃'][index],kind,transpose}))));
  augment('criteria.notes',[
    assertion('Actual condition columns survive notes across kinds and orientations','/trueConditionProjection',conditionCases.map(x=>({...x,conditions:[x.value],noteRemoved:true}))),
    assertion('Source-evidence-only note citation remains under the documented baseline limit','/noteLeakProjection',{conditions:[],sourceEvidenceRetained:true,ignoredNotes:1}),
    assertion('Independent repeated criterion blocks survive note pseudo tables','/repeatedProjection',{labels:['First requirement','Second requirement'],count:2})
  ],async out=>{
    const documentFor=(matrix,kind,transpose=false)=>{const values=transpose?matrix[0].map((_,column)=>matrix.map(row=>row[column])):matrix;return {id:'source',name:'arbitrary.'+kind,kind,...(kind==='csv'?{sourceRows:values.map((cells,i)=>({row:i+1,cells}))}:{sourceSheets:[{name:'Rules',rows:values.map((row,i)=>({row:i+1,cells:row.map((text,j)=>({address:A.columnName(j+1)+(i+1),text}))}))}]})};};
    out.trueConditions=[];
    for(const input of conditionCases){const document=documentFor([['항목','기준',input.heading,'비고'],['Strength','>= 80',input.value,'99일']],input.kind,input.transpose),extracted=A.extractStaticCriteria(document),criteria=A.preserveSourceConditions(A.validateCriteria(extracted.criteria),[document]);out.trueConditions.push({...input,document,extracted,criteria,conditions:criteria[0]?.conditions,noteRemoved:!JSON.stringify(criteria[0]?.conditions).includes('99일')});}
    out.trueConditionProjection=mapRows(out.trueConditions,['heading','value','kind','transpose','conditions','noteRemoved']);
    const noteDoc=documentFor([['항목','기준','비고'],['Strength','>= 80','28일']],'xlsx'),note={documentId:'source',sheet:'Rules',cell:'C2',quote:'28일'},input=criterion({sourceDocumentId:'source',conditions:['28일'],sourceEvidence:[note]}),result=A.preserveSourceConditions([clone(input)],[noteDoc])[0];
    out.noteLeak={document:noteDoc,input,result};out.noteLeakProjection={conditions:result.conditions,sourceEvidenceRetained:isDeepStrictEqual(result.sourceEvidence,[note]),ignoredNotes:result.ignoredSourceNotes?.length??0};
    const repeated=documentFor([['항목','기준','비고','','항목','기준'],['First requirement','>= 5','항목','','Second requirement','>= 9'],['','','기준','','','']],'xlsx'),tables=A.structuredTables([repeated]),layouts=A.tableLayouts(tables[0]),labels=layouts.flatMap(layout=>layout.rows.flatMap(row=>row.values.filter(v=>v.role==='item').map(v=>v.cell.text))).filter(Boolean);
    out.repeated={document:repeated,layouts};out.repeatedProjection={labels,count:labels.length};out.remainingFacets=['actual workbook validator note/condition consumer'];return out;
  });

  augment('engine.revisionLimits',[
    assertion('Revision version guards and late success preserve the prior draft','/versionAndLate',{missing:400,stale:409,feedbackCount:0,lateDraftUnchanged:true,lateAuditCount:0,lateRevision:0})
  ],async out=>{
    const {engine,run}=await engineHarness(),missing=await capture(()=>engine.revise(run,{feedback:'change'})),stale=await capture(()=>engine.revise(run,{expectedCriterionVersion:0,feedback:'change'}));
    let release;const cancelled=await engineHarness({revision:criteria=>new Promise(resolve=>{release=()=>resolve({criteria:criteria.map(c=>({...c,label:'LATE RESPONSE MUST NOT APPLY'})),summary:'late'});})});
    const before=clone(cancelled.run.criteria);cancelled.engine.revise(cancelled.run,{expectedCriterionVersion:1,feedback:'Change the label'});await Promise.resolve();cancelled.engine.cancel(cancelled.run);release();await cancelled.run.job;
    out.versionErrors={missing,stale};out.lateSuccess={before,after:cancelled.engine.snapshot(cancelled.run)};
    out.versionAndLate={missing:missing.error?.status,stale:stale.error?.status,feedbackCount:run.criteriaFeedback.length,lateDraftUnchanged:isDeepStrictEqual(before,cancelled.run.criteria),lateAuditCount:cancelled.run.audit.length,lateRevision:cancelled.run.criteriaRevision};delete out.remainingFacets;return out;
  });

  augment('engine.revision',[
    assertion('Successful revision uses one actual patch model call and preserves version history','/patchProjection',{calls:1,version:2,revision:1,status:'awaiting_confirmation',label:'Revised strength',feedbackStatus:'completed',fromVersion:1,toVersion:2,auditAction:'criteria.revised',priorLabel:'Strength',approved:null}),
    assertion('Failed requests preserve prior committed draft','/failedDraftsPreserved',true)
  ],async out=>{
    const requests=[],patch={changes:[{id:'c',label:'Revised strength'}],additions:[],removeIds:[],summary:'Revised item label',warnings:[]};
    const analyzer=P.createDocumentAnalyzer({gemini:{generateJson:async request=>{requests.push(request);return {data:patch};}},withSandbox:async()=>{throw new Error('Revision must not create a sandbox');}});
    const {engine,run}=await engineHarness({revision:analyzer.reviseCriteria}),request={expectedCriterionVersion:1,feedback:'Rename Strength to Revised strength',scope:'Only the selected rule',documentId:'eligible'};
    engine.revise(run,request);await run.job;const snapshot=engine.snapshot(run),entry=snapshot.criteriaFeedback[0],audit=snapshot.audit[0];
    out.patch={request,rawPatch:patch,requests:requests.map(({signal,...value})=>value),snapshot};
    out.patchProjection={calls:requests.length,version:snapshot.criterionVersion,revision:snapshot.criteriaRevision,status:snapshot.status,label:snapshot.criteria[0]?.label,feedbackStatus:entry?.status,fromVersion:entry?.fromVersion,toVersion:entry?.toVersion,auditAction:audit?.action,priorLabel:audit?.priorDraft?.[0]?.label,approved:snapshot.approvedCriteria};
    out.failedDraftsPreserved=out.rows.filter(r=>r.id!=='successful').every(r=>r.snapshot.criteria[0]?.label==='Strength'&&r.snapshot.criteria[0]?.rule==='80 MPa 이상'&&r.snapshot.audit.length===0);delete out.remainingFacets;return out;
  });

  augment('criteria.limits',[
    assertion('Generic invalid comparator and unverified classification retain baseline permissiveness','/pathProjection',{genericComparator:false,genericNeedsConfirmation:false,genericClassification:'resolved',genericClassificationNeedsConfirmation:false,approvalInvalidConfirmedRejected:true,approvalInvalidUnconfirmedComparator:false,approvalUnverifiedClassification:'resolved',explicitSourceWins:'source-a',ambiguousInferredSource:'unassigned'})
  ],async out=>{
    const input=criterion({categoryPath:['Unverified arbitrary hierarchy'],comparison:{operator:'gte',value:'80',unit:'MPa'}}),generic=A.validateCriteria([input])[0],confirmed=await capture(()=>A.approveCriteria([criterion()],[{...input,comparatorConfirmed:true}])),unconfirmed=A.approveCriteria([criterion()],[input])[0],conflict=criterion({sourceDocumentId:'source-a',sourceEvidence:[{documentId:'source-b',quote:'rule'}]});
    const inferred={...conflict,sourceDocumentId:undefined,sourceEvidence:[{documentId:'source-a',quote:'rule'},{documentId:'source-b',quote:'other rule'}]};out.pathInputs={input,conflict,inferred};out.pathOutputs={generic,confirmed,unconfirmed};out.pathProjection={genericComparator:!!generic.comparison,genericNeedsConfirmation:generic.needsConfirmation,genericClassification:generic.classificationStatus,genericClassificationNeedsConfirmation:generic.classificationNeedsConfirmation,approvalInvalidConfirmedRejected:!confirmed.accepted,approvalInvalidUnconfirmedComparator:!!unconfirmed.comparison,approvalUnverifiedClassification:unconfirmed.classificationStatus,explicitSourceWins:A.criterionSourceGroup(conflict,[{id:'source-a'},{id:'source-b'}]),ambiguousInferredSource:A.criterionSourceGroup(inferred,[{id:'source-a'},{id:'source-b'}])};delete out.remainingFacets;return out;
  });

  augment('target.pipeline',[
    assertion('Independent extraction retains all raw values and reference identifier','/factsProjection',{referenceNumber:'0001',values:['N.D.','<0.01','0.025'],labels:['Lead','Cadmium','Strength'],thresholdAbsent:true}),
    assertion('Every applicable criterion and every source record reaches matching','/matchingProjection',{criterionIds:['first','second'],recordsPresent:true,thresholdsPresent:true})
  ],async out=>{
    const visual=out.rows.find(r=>r.kind==='pdf'),extraction=visual.output.extraction;
    out.factsProjection={referenceNumber:extraction.referenceNumber,values:extraction.fields.map(f=>f.value),labels:extraction.fields.map(f=>f.label),thresholdAbsent:!JSON.stringify(extraction).includes('987654.321')};
    const requests=[],document={...csv(),name:'arbitrary.csv',modelParts:[{text:'R1,92\nR2,91'}]},criteria=[criterion({id:'first'}),criterion({id:'second',label:'Other applicable requirement',rule:'20 MPa 이하',comparison:{operator:'lte',value:20,unit:'MPa'}})],analyzer=P.createDocumentAnalyzer({gemini:{generateJson:async request=>{requests.push(request);return {data:{items:[],reviewCoverage:{complete:false,remainingWork:['authored empty response']}}};}},withSandbox:async()=>{throw new Error('Matching must not open sandbox');}});
    const result=await analyzer.extractTarget(document,criteria),text=requests[0].contents.filter(p=>p.text).map(p=>p.text).join('\n');
    out.matching={document,criteria,result,requests:requests.map(({signal,...value})=>value)};out.matchingProjection={criterionIds:criteria.filter(c=>text.includes(c.id)).map(c=>c.id),recordsPresent:['R1','R2','92','91'].every(t=>text.includes(t)),thresholdsPresent:criteria.every(c=>text.includes(c.rule))};delete out.remainingFacets;return out;
  });

  define('target.engineOrder',{targetKind:'pdf',rawValue:'92',events:['document.extracted:fields','document.reviewing','document.extracted:review','item.decided']},[
    assertion('Actual engine emits independent fields before reviewing, pending items, then verdicts','/projection',{events:['document.extracted:fields','document.reviewing','document.extracted:review','item.decided'],fieldValue:'92',fieldItems:0,pendingStatus:'pending',decidedStatus:'pass',status:'completed'})
  ],async()=>{
    const source={...completeDoc(),id:'source',role:'criteria'},target={...completeDoc(),id:'target',name:'arbitrary.pdf',kind:'pdf',role:'target'},docs=new Map([[source.id,source],[target.id,target]]),requests=[];
    const documents={get:id=>docs.get(id),public:d=>({id:d.id,name:d.name,kind:d.kind,role:d.role,size:32,mime:'application/pdf',url:'/api/documents/'+d.id,preview:{type:'text',text:'authored source'}})};
    const actual=P.createDocumentAnalyzer({gemini:{generateJson:async request=>{requests.push(request);return {data:request.maxOutputTokens===14000?{referenceNumber:'0007',documentType:'report',warnings:[],fields:[{label:'Strength',value:'92',unit:'MPa',uncertain:false,evidence:[{documentId:'target',page:1,quote:'92'}]}]}:{items:[finding({documentId:'target',evidence:[{documentId:'target',page:1,quote:'92'}]})],reviewCoverage:{complete:true,remainingWork:[]}}};}},withSandbox:async()=>{throw new Error('No sandbox during extraction');}});
    const analyzer={analyze:async d=>d,discoverCriteria:async()=>({criteria:[criterion({sourceDocumentId:'source'})],criteriaAssessments:[{documentId:'source',status:'criteria',reason:'Authored rule',evidence:[{documentId:'source',quote:'Reusable requirement 80 MPa.'}]}]}),extractTarget:actual.extractTarget};
    const engine=new ReviewEngine({documents,analyzer,geminiConfigured:true}),run=engine.start({mode:'criteria_first',criteriaDocumentIds:['source']});await run.job;engine.confirm(run,{expectedCriterionVersion:1});engine.attachDocuments(run,{expectedCriterionVersion:1,documentIds:['target']});await run.job;
    const snapshot=engine.snapshot(run),events=snapshot.events.filter(e=>['document.extracted','document.reviewing','item.decided'].includes(e.type)),fields=events.find(e=>e.phase==='fields'),pending=events.find(e=>e.phase==='review'),decided=events.find(e=>e.type==='item.decided');
    return {documents:[source,target],requests:requests.map(({signal,...value})=>value),snapshot,projection:{events:events.map(e=>e.type+(e.phase?':'+e.phase:'')),fieldValue:fields?.fields?.[0]?.value,fieldItems:fields?.items?.length,pendingStatus:pending?.items?.[0]?.status,decidedStatus:decided?.item?.status,status:snapshot.status}};
  });
}

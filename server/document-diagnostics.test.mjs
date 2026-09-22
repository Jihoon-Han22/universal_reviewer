import test from 'node:test';
import assert from 'node:assert/strict';
import {visualTranscriptionShape,contextResponseShape,readerReasonCode,safeInternalFrames} from './document-diagnostics.mjs';
import {validateVisualTranscription,transcribeVisualDocument} from './visual-transcription.mjs';
import {schemas} from './pipeline-prompts.mjs';
import {validateRunAuthorization} from '../scripts/live-document-check.mjs';

const valid=()=>({warnings:[],pages:[{page:1,rotation:0,complete:true,warnings:[],blocks:[{id:'text-id',kind:'text',text:'PRIVATE_SOURCE_BODY',uncertain:false},{id:'block-id',kind:'table',text:'',tableId:'table-id',uncertain:false}],tables:[{id:'table-id',headers:['PRIVATE_HEADER'],cells:[{row:1,column:1,rowSpan:1,colSpan:1,text:'PRIVATE_CELL',uncertain:false}]}]}]});
test('schema-permitted optional link strings still need semantic validation',()=>{
  const schema=schemas.visualTranscriptionSchema.properties.pages.items.properties;
  assert.equal(schema.blocks.items.properties.tableId.type,'string');assert.equal(schema.tables.items.properties.parentCell.type,'string');
  assert.equal(schema.blocks.items.required.includes('tableId'),false);assert.equal(schema.tables.items.required.includes('parentCell'),false);
  assert.deepEqual(validateVisualTranscription(valid(),[1],1),valid());
  for(const [mutate,code] of [
    [raw=>{raw.pages[0].blocks[0].tableId='';},'VISUAL_UNKNOWN_REFERENCE'],
    [raw=>{raw.pages[0].tables[0].parentCell='';},'VISUAL_ROOT_OCCURRENCE'],
    [raw=>{raw.pages[0].blocks[0].id='table-id';},'VISUAL_DUPLICATE_ID'],
    [raw=>{raw.pages[0].tables[0].cells[0].rowSpan=0;},'VISUAL_CELL'],
    [raw=>{raw.pages[0].tables[0].cells.push({...raw.pages[0].tables[0].cells[0]});},'VISUAL_CELL_OVERLAP'],
  ]){const raw=valid();mutate(raw);assert.throws(()=>validateVisualTranscription(raw,[1],1),error=>error.code===code);}
});
test('first invalid visual result exposes a code without calling a judge or retrying',async()=>{
  const raw=valid();raw.pages[0].blocks[0].tableId='';let calls=0;
  await assert.rejects(transcribeVisualDocument({id:'doc',kind:'png',mime:'image/png',buffer:Buffer.from('offline-only')},{gemini:{generateJson:async()=>{calls++;return {data:raw};}}}),error=>error.code==='VISUAL_UNKNOWN_REFERENCE');
  assert.equal(calls,1);
});
test('observed two-table shape fails before judging colliding IDs and accepts distinct IDs',async()=>{
  // Synthetic structure matches saved counts only; no prior model text or IDs were retained.
  for(const collision of [true,false]){
    const tables=Array.from({length:2},(_,table)=>({id:`t${table+1}`,cells:Array.from({length:15},(_,cell)=>({row:Math.floor(cell/3)+1,column:cell%3+1,rowSpan:1,colSpan:1,text:'synthetic cell',uncertain:false}))}));
    const raw={warnings:[],pages:[{page:1,rotation:0,complete:true,warnings:[],blocks:tables.map((table,index)=>({id:collision?table.id:`b${index+1}`,kind:'table',tableId:table.id,text:'',uncertain:false})),tables}]};
    const shape=visualTranscriptionShape(raw);assert.equal(shape.pages[0].tableBlocks,2);assert.equal(shape.pages[0].tableCount,2);assert.equal(shape.pages[0].cellCount,30);
    let calls=0;const result=transcribeVisualDocument({id:'synthetic',kind:'png',mime:'image/png',buffer:Buffer.from('offline fixture')},{gemini:{generateJson:async()=>{calls++;return {data:calls===1?raw:{acceptable:true,issues:[],rereadPages:[]}};}}});
    if(collision){await assert.rejects(result,error=>error.code==='VISUAL_DUPLICATE_ID');assert.equal(calls,1);}
    else{assert.equal((await result).quality.status,'verified');assert.equal(calls,2);}
  }
});
test('visual shape records diagnostic counts without source text or identifiers',()=>{
  const raw=valid();raw.pages[0].blocks[0].tableId='';raw.pages[0].tables[0].parentCell='';
  const shape=visualTranscriptionShape(raw),encoded=JSON.stringify(shape);
  assert.equal(shape.pages[0].emptyBlockTableIds,1);assert.equal(shape.pages[0].emptyParentCells,1);assert.equal(shape.pages[0].cellCount,1);
  for(const secret of ['PRIVATE','text-id','block-id','table-id'])assert.equal(encoded.includes(secret),false);
  assert.equal(visualTranscriptionShape({pages:[null],warnings:null}).pages[0].pageType,'null');
});
test('workbook context diagnostics retain only type counts and known issue codes',()=>{
  const context=contextResponseShape({summary:'PRIVATE_TEXT',documentType:'PRIVATE_TYPE',structure:[{name:'PRIVATE_NAME',sheet:'PRIVATE_SHEET',range:'PRIVATE_RANGE',headers:['PRIVATE_HEADER'],kind:'table',uncertain:false}],warnings:[],questions:[]});
  const review=contextResponseShape({checked:true,issues:[{code:'wrong_header',message:'PRIVATE_QUOTE',request:{sheet:'PRIVATE_SHEET'}},{code:'PRIVATE_CODE',message:'PRIVATE_TEXT'}]},{review:true});
  assert.equal(context.structureCount,1);assert.equal(review.issueCodes.wrong_header,1);assert.equal(review.unrecognizedIssueCodes,1);assert.equal(review.selectorCount,1);
  assert.equal(JSON.stringify({context,review}).includes('PRIVATE'),false);
});
test('reader warnings and internal frames are restricted to known diagnostic metadata',()=>{
  assert.equal(readerReasonCode('Parser reported an unsupported or altered feature: DeprecationWarning'),'PARSER_DEPRECATION_WARNING');
  assert.equal(readerReasonCode('PRIVATE_SOURCE_BODY'),'UNCLASSIFIED_READER_WARNING');
  const error={stack:'Error: PRIVATE_SOURCE_BODY\n at validate (file:///C:/workspace/server/visual-transcription.mjs:19:4)\n at sdk (file:///C:/workspace/node_modules/sdk/private.mjs:55:8)\n at private (C:\\secrets\\credentials:1:2)'};
  assert.deepEqual(safeInternalFrames(error,'C:\\workspace',['server/visual-transcription.mjs']),[{module:'server/visual-transcription.mjs',line:19,column:4}]);
});
test('live authorization counts prior requests and rejects stale or unaccounted attempts offline',()=>{
  const permission={granted:true,inputs:['golden/certs/P01.pdf','golden/criteria/C05.xlsx'],destinations:['Gemini API','E2B sandbox'],maximumGeminiDocumentRequests:12,usedGeminiDocumentRequests:2,remainingGeminiDocumentRequests:10,attempts:[{path:'prior-attempt-1'},{path:'prior-attempt-2'}]},plan={inputs:[{path:'golden/criteria/C05.xlsx'}],limits:{totalModelRequests:6}},observations={priorRequests:2,priorPaths:['prior-attempt-1','prior-attempt-2'],foundPaths:['prior-attempt-1','prior-attempt-2']};
  assert.doesNotThrow(()=>validateRunAuthorization(plan,permission,observations));
  assert.throws(()=>validateRunAuthorization({...plan,limits:{totalModelRequests:10}},permission,observations),error=>error.evidenceCheck==='PERMISSION_REMAINING_CAP');
  assert.throws(()=>validateRunAuthorization({...plan,inputs:[{path:'golden/certs/P01.pdf'}]},permission,observations),error=>error.evidenceCheck==='PLAN_APPROVED_SELECTION');
  assert.throws(()=>validateRunAuthorization(plan,permission,{...observations,priorRequests:0}),error=>error.evidenceCheck==='PRIOR_REQUEST_TOTAL');
  assert.throws(()=>validateRunAuthorization(plan,permission,{...observations,foundPaths:[...observations.foundPaths,'another-attempt']}),error=>error.evidenceCheck==='NO_UNACCOUNTED_ATTEMPTS');
  assert.throws(()=>validateRunAuthorization(plan,{...permission,granted:false},observations),error=>error.evidenceCheck==='PERMISSION_GRANTED');
});

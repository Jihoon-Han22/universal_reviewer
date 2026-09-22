import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync(new URL('../analysis-model.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {structureGroups,inventoryParts,analysisFileStatus,analysisFinished,analysisPhase,analysisStatusLabel,attentionStatus,coverageRatio,readingSummary,selectedAnalysisDocument}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const fixtures=JSON.parse(fs.readFileSync(new URL('../../architecture/ui/document-analysis-structure-cases.json',import.meta.url),'utf8'));
for(const fixture of fixtures.cases)test(`baseline structure fixture: ${fixture.id}`,()=>assert.deepEqual(JSON.parse(JSON.stringify(structureGroups(fixture.input))),fixture.expected));
test('completion depends on finished status and quality; reading summary keeps unresolved source coverage explicit',()=>{assert.equal(analysisFinished({status:'complete',quality:{status:'limited'}}),false);assert.equal(analysisFinished({status:'done'}),true);assert.equal(readingSummary({coverage:{readerComplete:false,contextComplete:true}}),'원문 일부 미확인');assert.equal(readingSummary({coverage:{readerComplete:true,complete:false,transcription:{complete:false}}}),'원본 파일 확인 · 전사 확인 필요');});
test('phase classification order and ratio semantics use only actual evidence',()=>{assert.equal(analysisPhase('quality_extract'),'structure');assert.equal(analysisPhase('verification'),'extract');assert.equal(analysisPhase('read_page'),'transcribe');assert.equal(coverageRatio(2,4,false),.5);assert.equal(coverageRatio(undefined,4,false),0);assert.equal(coverageRatio(undefined,undefined,true),1);assert.equal(coverageRatio(8,4,false),1);});
test('manual document selection wins while an absent manual choice follows latest scoped activity',()=>{const docs=[{id:'a'},{id:'b'}],events=[{documentId:'b'},{documentId:'unknown'}];assert.equal(selectedAnalysisDocument(docs,events,null).id,'b');assert.equal(selectedAnalysisDocument(docs,events,'a').id,'a');});

test('file-row status uses the latest event for that document before retained quality and analysis',()=>{
 const complete={status:'complete',quality:{status:'verified'}},limited={status:'complete',quality:{status:'limited'}};
 const events=Object.freeze([
  Object.freeze({documentId:'a',step:'reread_pages',status:'running',title:'reading again',time:'2099-01-01'}),
  Object.freeze({documentId:'b',step:'repair_context',status:'running',title:'other document'}),
  Object.freeze({step:'quality_global',status:'running',title:'global event'}),
 ]);
 assert.equal(analysisFileStatus('a',complete,events,true),'reread_pages');
 assert.equal(analysisFileStatus('a',complete,events,false),'complete');
 assert.equal(analysisFileStatus('a',limited,[{documentId:'a',step:'verify_fields',status:'running',title:''}],true),'verify_fields');
 assert.equal(analysisFileStatus('a',limited,[{documentId:'a',step:'verify_fields',status:'completed',title:''}],true),'limited');
 assert.equal(analysisFileStatus('a',complete,[...events,{documentId:'a',step:'read_page',status:'running',title:'later in array',time:'2000-01-01'}],true),'complete');
 assert.equal(analysisFileStatus('a',complete,[{documentId:'b',step:'quality',status:'running',title:''},{step:'reread',status:'running',title:''}],true),'complete');
 assert.equal(events[0].step,'reread_pages');
});

test('file-row fallback precedence keeps quality, analysis and failed activity distinct',()=>{
 const failed=[{documentId:'a',step:'reading',status:'failed',title:''}];
 assert.equal(analysisFileStatus('a',{status:'failed',quality:{status:'limited'}},failed,false),'limited');
 assert.equal(analysisFileStatus('a',{status:'complete',quality:{status:'needs_review'}},failed,true),'partial');
 assert.equal(analysisFileStatus('a',{status:'complete',quality:{status:'verified'}},failed,true),'complete');
 assert.equal(analysisFileStatus('a',undefined,failed,false),'failed');
 assert.equal(analysisFileStatus('a',undefined,[],true),'waiting');
 assert.equal(analysisFileStatus('a',undefined,[{documentId:'a',step:'inventory',status:'completed',title:''}],true),'inventory');
 assert.equal(analysisFileStatus('a',undefined,[{documentId:'a',step:'',status:'running',title:''}],true),'reading');
 assert.equal(analysisFileStatus('a',undefined,[{documentId:'a',step:'inventory',status:'completed',title:''}],false),'waiting');
});

test('file-row labels distinguish terminal, attention, waiting and phase states',()=>{
 for(const status of ['ready','complete','completed','analyzed','done'])assert.equal(analysisStatusLabel(status),'완료',status);
 assert.equal(analysisStatusLabel('limited'),'검증 제한');
 for(const status of ['review','needs_confirmation','confirmation','partial','unsupported','failed','blocked','error'])assert.equal(analysisStatusLabel(status),'확인 필요',status);
 for(const status of ['queued','pending','waiting','idle',''])assert.equal(analysisStatusLabel(status),'대기',status);
 assert.equal(analysisStatusLabel('needs_review'),'탐색 중');
 assert.equal(attentionStatus('needs_review'),false);
 for(const [status,label] of [['reading','탐색 중'],['inventory','구조 분석'],['read_page','전사'],['normalize_fields','항목 정리']])assert.equal(analysisStatusLabel(status),label,status);
});

test('file-row quality labels are case-insensitive while generic phase fallback remains case-sensitive',()=>{
 for(const [status,label] of [['REREAD_REPAIR_VERIFY','재조회'],['RETRY_VERIFY','보완 중'],['QUALITY_EXTRACT','검증 중'],['VaLiDaTe','검증 중'],['VERIFY','검증 중'],['READ_PAGE','탐색 중'],['read_page','전사'],['STRUCTURE','탐색 중']])assert.equal(analysisStatusLabel(status),label,status);
});

test('file-row running state and canonical limited quality do not replace the independent completion count',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('../../architecture/ui/interaction-fixtures.json',import.meta.url),'utf8')).cases.find(item=>item.id==='ANALYSIS-SHEETS');
 const status=analysisFileStatus(fixture.input.documents[0].id,fixture.input.analysis,[],false);
 assert.equal(status,'limited');
 assert.equal(analysisStatusLabel(status),fixture.expected.fileLabel);
 assert.equal(attentionStatus(status),true);
 assert.equal(Number(analysisFinished(fixture.input.analysis)),fixture.expected.completedCount);
 const complete={status:'complete',quality:{status:'verified'}};
 assert.equal(analysisFileStatus('a',complete,[{documentId:'a',step:'reread_pages',status:'running',title:''}],true),'reread_pages');
 assert.equal(analysisFinished(complete),true);
});


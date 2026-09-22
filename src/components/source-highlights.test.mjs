import test from 'node:test';import assert from 'node:assert/strict';
import {isMissingItem,textMatches,tableEvidenceCells,pdfHighlightRuns,pdfRunBox,normalizePreview,previewRenderer,requestedPdfPage,sourceChipPdfPage,evidenceSheet,sourceChip,sourceEvidence,itemPriority} from '../source-highlights.ts';
test('verified missing is not painted, but explicit unreadable/present is retained',()=>{assert.equal(isMissingItem({value:null}),false);assert.equal(isMissingItem({value:0}),false);assert.equal(isMissingItem({value:' NOT REPORTED '}),true);assert.equal(isMissingItem({presence:'unreadable',missingVerified:true,value:null}),false);});
test('exact text matcher preserves numeric token boundaries and whitespace offsets',()=>{for(const text of ['15','5.0','5e3','-5','152,000'])assert.equal(textMatches(text,text==='152,000'?'52,000':'5').length,0);assert.equal(textMatches('강도\n  5 MPa','강도 5 MPa').length,1);assert.equal(textMatches('ABC','abc').length,0);assert.equal(textMatches('aaa','aa').length,2);});
test('table parser handles quoted sheet names, multiple ranges, reverse and row forms',()=>{const e={documentId:'d',sheet:"O'Brien",cell:"'O''Brien'!$C$3:$B$2; A1"};assert.deepEqual([...tableEvidenceCells(e,"O'Brien",["O'Brien"],6,4).cells].sort(),['0:0','1:1','1:2','2:1','2:2']);assert.equal(tableEvidenceCells({cell:'row 2'},'A',['A'],4,3).cells.size,3);assert.equal(tableEvidenceCells({cell:'3:1'},'A',['A'],4,3).cells.size,9);});
test('ambiguous worksheet addresses never paint an arbitrary worksheet',()=>{assert.equal(tableEvidenceCells({sheet:'A',cell:"'B'!A1"},'A',['A','B'],4,3).ambiguous,true);assert.equal(tableEvidenceCells({cell:'A1'},'A',['A','B'],4,3).ambiguous,true);assert.equal(tableEvidenceCells({cell:'A0'},'A',['A'],4,3).ambiguous,true);assert.equal(tableEvidenceCells({sheet:'csv',cell:'A1'},'Sheet1',['Sheet1'],4,3).cells.size,1);});
test('PDF requires a label witness and correct page, refuses duplicate anchor rows',()=>{const runs=[{text:'Strength',x:0,y:0,width:45,height:10,dx:1,dy:0},{text:'5',x:50,y:0,width:5,height:10,dx:1,dy:0}];const item={id:'i',documentId:'d',label:'Strength',value:5,status:'pass',evidence:[{documentId:'d',page:1,quote:'Strength 5'}]};assert.equal(pdfHighlightRuns(runs,item,'d',1).length,2);assert.equal(pdfHighlightRuns(runs,item,'d',2).length,0);assert.equal(pdfHighlightRuns(runs,{...item,evidence:[{documentId:'d',quote:'5'}]},'d',1).length,0);assert.equal(pdfHighlightRuns([...runs,...runs.map(r=>({...r,y:20}))],item,'d',1).length,0);});
test('PDF affine box handles rotation without estimating partial glyph widths',()=>{const box=pdfRunBox({str:'x',width:20,height:10,transform:[10,0,0,10,5,30],fontName:'f'},[0,1,1,0,0,0],{f:{ascent:1}});assert.equal(box.width,10);assert.equal(box.height,20);});
test('preview normalization preserves valid rows and warnings while renderer precedence follows the file',()=>{
 const preview=normalizePreview({type:'text',text:'fallback',sheets:[null,{name:'A',rows:[[null,0,false],null,['a']],state:'hidden'}],warnings:['limited',4],truncated:true});
 assert.deepEqual(preview.sheets,[{name:'A',rows:[['','0','false'],['a']],state:'hidden'}]);assert.deepEqual(preview.warnings,['limited']);
 assert.equal(previewRenderer({name:'a.bin',mime:'application/pdf'},preview),'pdf');assert.equal(previewRenderer({name:'a.PDF',mime:'image/png'},preview),'pdf');assert.equal(previewRenderer({name:'a.png',mime:'image/png'},preview),'image');assert.equal(previewRenderer({name:'a.docx',mime:''},preview),'table');
 assert.equal(previewRenderer({name:'a.txt',mime:''},normalizePreview({text:''})),'text');assert.equal(previewRenderer({name:'a.bin',mime:''},normalizePreview({text:3,sheets:'bad'})),'unsupported');
});
test('PDF requested evidence and chip page admission preserve the baseline fractional-page distinction',()=>{
 for(const page of [0,-1,1.5,4,NaN,Infinity,'2'])assert.equal(requestedPdfPage(page,3),null);assert.equal(requestedPdfPage(2,3),2);
 assert.equal(sourceChipPdfPage([{page:1.5}],3),1.5);for(const page of [0,-1,4,NaN,Infinity])assert.equal(sourceChipPdfPage([{page}],3),null);
});
test('sheet navigation resolves qualified names without selecting a conflicting or unknown worksheet',()=>{
 assert.equal(evidenceSheet({cell:"'O''Brien'!A1; B2"},['A',"O'Brien"]),"O'Brien");assert.equal(evidenceSheet({sheet:'A',cell:'B!A1'},['A','B']),null);assert.equal(evidenceSheet({cell:'A1'},['A','B']),null);assert.equal(evidenceSheet({sheet:'CSV',cell:'A1'},['Sheet1']),'Sheet1');assert.equal(evidenceSheet({sheet:'missing'},['A']),null);
});
test('source chips retain missing and unplaced sources while compact hides placed and other-location items',()=>{
 const item={id:'i',documentId:'d',label:'Strength',value:5,status:'pass',evidence:[{documentId:'d',page:2,quote:'Strength 5'}]};
 assert.equal(sourceChip(item,'d',{page:1},false,true).visible,false);assert.equal(sourceChip(item,'d',{page:1},false,false).hint,'2p');assert.equal(sourceChip(item,'d',{page:2},true,true).visible,false);assert.equal(sourceChip(item,'d',{page:2},false,true).hint,'위치 확인');
 assert.equal(sourceChip({...item,evidence:[]},'d',{page:1},false,true).hint,'근거 없음');const missing={...item,presence:'missing',evidence:[...item.evidence,{documentId:'criterion',quote:'required'}]};assert.equal(sourceChip(missing,'d',{page:1},false,true).hint,'항목 누락');assert.equal(sourceEvidence(missing,'d').length,0);assert.equal(sourceEvidence(missing,'criterion').length,1);
});
test('overlap ordering puts the selected item first and otherwise follows fail review pending pass',()=>{
 const items=['pass','pending','review','fail'].map(status=>({id:status,status}));assert.deepEqual(items.slice().sort((a,b)=>itemPriority(a)-itemPriority(b)).map(item=>item.id),['fail','review','pending','pass']);assert.deepEqual(items.sort((a,b)=>itemPriority(a,'pass')-itemPriority(b,'pass')).map(item=>item.id),['pass','fail','review','pending']);
});
test('table address unions remain row-major, clipped, and authoritative even with a mismatching quote',()=>{
 assert.deepEqual([...tableEvidenceCells({sheet:'A',cell:'C3; A1:B1; B1',quote:'text from another cell'},'A',['A'],3,3).cells],['0:0','0:1','2:2']);assert.equal(tableEvidenceCells({cell:'A99:A102'},'A',['A'],102,1).cells.size,2);
});
test('PDF named quotes include their witnessed row but repeated unnamed value quotes do not choose a parallel value',()=>{
 const runs=[{text:'Strength',x:0,y:0,width:45,height:10,dx:1,dy:0},{text:'5',x:50,y:0,width:5,height:10,dx:1,dy:0},{text:'5',x:65,y:0,width:5,height:10,dx:1,dy:0}];
 const item={id:'i',documentId:'d',label:'Strength',value:5,status:'pass',evidence:[{documentId:'d',quote:'Strength 5'}]};assert.deepEqual(pdfHighlightRuns(runs,item,'d',1).map(run=>run.x),[0,50]);assert.deepEqual(pdfHighlightRuns(runs,{...item,evidence:[{documentId:'d',quote:'Strength'},{documentId:'d',quote:'5'}]},'d',1).map(run=>run.x),[0]);
});

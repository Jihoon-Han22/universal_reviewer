/** Proposed offline criterion preview observations. Promote only after source HOLD release. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const citation=(extra={})=>({documentId:'criteria',sheet:'Limits',cell:'B2',quote:'30',...extra});
const rule=(extra={})=>({id:'strength',label:'Strength',rule:'>= 30 MPa',sourceEvidence:[citation()],...extra});
const doc=(rows=[['Item','Limit','Unit'],['Strength','30','MPa']],extra={})=>({id:'criteria',role:'criteria',kind:'xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',name:'authored-limits.xlsx',preview:{type:'table',sheets:[{name:'Limits',rows}]},...extra});
const labelCitation=(extra={})=>({documentId:'criteria',sheet:'Limits',cell:'A2',quote:'Strength',...extra});
const clone=value=>structuredClone(value);
const a=(name,pointer,expected)=>({name,pointer,expected});

/** Exact expected arrays are authored from D1.3, never copied from helper output. */
export async function createCriterionPreviewProbe(root){
  if(process.version!=='v24.13.1')throw new Error('Criterion preview observations require pinned Node v24.13.1');
  const {criterionPreviewEvidence}=await import(pathToFileURL(path.join(root,'src/criteria-preview-evidence.ts')).href);
  const cases=[];
  const add=(id,criterion,documents,expected)=>cases.push({id,criterion,documents,expected});
  add('single-rule-label',rule(),[doc()],[citation(),labelCitation()]);
  add('union-exact-dedup',rule({evidenceCells:[citation(),citation({cell:'C2',quote:'MPa'})]}),[doc()],[citation(),citation({cell:'C2',quote:'MPa'}),labelCitation()]);
  add('preserve-distinct-citation-quotes',rule({sourceEvidence:[citation(),citation({quote:'3'})]}),[doc()],[citation(),citation({quote:'3'}),labelCitation()]);
  add('already-cited-label-range',rule({sourceEvidence:[citation({cell:'A2:C2',quote:'Strength 30 MPa'})]}),[doc()],[citation({cell:'A2:C2',quote:'Strength 30 MPa'})]);
  add('explicit-legacy-document',rule({sourceEvidence:[],source:{documentId:'unresolved',page:1,quote:'source text'}}),[doc()],[{documentId:'unresolved',page:1,quote:'source text'}]);
  add('single-file-legacy-location',rule({sourceEvidence:[],source:{sheet:'Limits',cell:'B2',quote:'30'}}),[doc()],[citation(),labelCitation()]);
  add('legacy-quote-only-no-inferred-file',rule({sourceEvidence:[],source:{quote:'30'}}),[doc()],[]);
  add('multiple-criteria-files-no-inferred-file',rule({sourceEvidence:[],source:{sheet:'Limits',cell:'B2',quote:'30'}}),[doc(),doc(undefined,{id:'second'})],[]);
  add('stored-suppresses-legacy',rule({source:{documentId:'other',page:1,quote:'ignored fallback'}}),[doc()],[citation(),labelCitation()]);
  add('evidenceCells-suppresses-legacy',rule({sourceEvidence:[],evidenceCells:[citation()],source:{documentId:'other',page:1,quote:'ignored fallback'}}),[doc()],[citation(),labelCitation()]);
  add('normalized-label-only',rule({label:'Ｓｔｒｅｎｇｔｈ'}),[doc([['Test Item','Limit'],['S t r e n g t h','30']])],[citation(),labelCitation({quote:'S t r e n g t h'})]);
  add('digits-only-label-no-recovery',rule({label:'30'}),[doc()],[citation()]);
  for(const header of ['Name','Product','Limit'])add('wrong-header-'+header,rule(),[doc([[header,'Limit'],['Strength','30']])],[citation()]);
  for(const quote of ['300','3','missing'])add('mismatched-quote-'+quote,rule({sourceEvidence:[citation({quote})]}),[doc()],[citation({quote})]);
  add('blank-record-boundary',rule({sourceEvidence:[citation({cell:'C2'})]}),[doc([['Item','Gap','Limit'],['Strength','','30']])],[citation({cell:'C2'})]);
  add('blank-inside-range',rule({sourceEvidence:[citation({cell:'B2:C2'})]}),[doc([['Item','Gap','Limit'],['Strength','','30']])],[citation({cell:'B2:C2'})]);
  add('duplicate-label-one-row',rule(),[doc([['Item','Limit','Item'],['Strength','30','Strength']])],[citation()]);
  add('multiple-recovered-rows',rule({sourceEvidence:[citation(),citation({cell:'B3'})]}),[doc([['Item','Limit'],['Strength','30'],['Strength','30']])],[citation(),citation({cell:'B3'})]);
  add('intervening-header',rule({sourceEvidence:[citation({cell:'B4'})]}),[doc([['Item','Limit'],['Other','20'],['Limit','Item'],['Strength','30']])],[citation({cell:'B4'})]);
  add('blank-row-before-header',rule({sourceEvidence:[citation({cell:'B4'})]}),[doc([['Item','Limit'],['Other','20'],['',''],['Strength','30']])],[citation({cell:'B4'})]);
  const multiSheet=doc();multiSheet.preview.sheets.push({name:'Other',rows:clone(multiSheet.preview.sheets[0].rows)});
  add('unqualified-multiple-sheets',rule({sourceEvidence:[{documentId:'criteria',cell:'B2',quote:'30'}]}),[multiSheet],[{documentId:'criteria',cell:'B2',quote:'30'}]);
  add('conflicting-sheet-qualifier',rule({sourceEvidence:[citation({cell:'Other!B2'})]}),[multiSheet],[citation({cell:'Other!B2'})]);
  const wide=doc([['Item',...Array(13).fill('Limit')],['Strength',...Array(13).fill('30')]]);
  add('twelve-cells-accepted',rule({sourceEvidence:[citation({cell:'B2:M2'})]}),[wide],[citation({cell:'B2:M2'}),labelCitation()]);
  for(const cell of ['B2:N2','B2:ZZZ2','B2:B1000','B2;B3','B0','row 2'])add('rejected-range-'+cell,rule({sourceEvidence:[citation({cell})]}),[wide],[citation({cell})]);
  add('quoted-reverse-same-row',rule({sourceEvidence:[citation({cell:"'Limits'!$C$2:$B$2",quote:'30 MPa'})]}),[doc()],[citation({cell:"'Limits'!$C$2:$B$2",quote:'30 MPa'}),labelCitation()]);
  add('transposed-no-implicit-recovery',rule({sourceEvidence:[citation({cell:'B2'})]}),[doc([['Item','Strength'],['Limit','30'],['Unit','MPa']])],[citation({cell:'B2'})]);
  add('unknown-source-document',rule({sourceEvidence:[citation({documentId:'unknown'})]}),[doc()],[citation({documentId:'unknown'})]);

  return {
    id:'source.criterionPreview',
    inputs:{contract:'architecture/ui/detail-controls.md D1.3; CORE-14-C01/C03; UI-11-C06',cases:clone(cases),mutationPolicy:'No saved criterion or document changes; compare complete values before/after actual helper call.'},
    assertions:[
      a('Exact stored and supplemented preview citation arrays','/projection',cases.map(({id,expected})=>({id,evidence:expected}))),
      a('Saved criterion and documents remain unchanged','/mutationProjection',cases.map(({id})=>({id,criterionUnchanged:true,documentsUnchanged:true})))
    ],
    run:async()=>{
      const rows=cases.map(input=>{
        const criterion=clone(input.criterion),documents=clone(input.documents),before={criterion:clone(criterion),documents:clone(documents)};
        const evidence=criterionPreviewEvidence(criterion,documents);
        return{id:input.id,before,after:{criterion:clone(criterion),documents:clone(documents)},evidence:clone(evidence),criterionUnchanged:isDeepStrictEqual(criterion,before.criterion),documentsUnchanged:isDeepStrictEqual(documents,before.documents)};
      });
      return{rows,projection:rows.map(({id,evidence})=>({id,evidence})),mutationProjection:rows.map(({id,criterionUnchanged,documentsUnchanged})=>({id,criterionUnchanged,documentsUnchanged})),scope:'Actual pure criterionPreviewEvidence call with authored preview/source inputs; no browser or parser claim.',crossGateRequirements:['Real FileReviewResults source click and rendered DocumentPreview evidence cells remain in the separately mapped G10/G11 browser cases.']};
    }
  };
}

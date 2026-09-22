// Evaluator observation only. It reads normalized findings and retained original
// cells; no value produced here is supplied to the analyzer or review engine.
function columnName(number){let value='';while(number>0){number--;value=String.fromCharCode(65+number%26)+value;number=Math.floor(number/26);}return value;}
function position(value){const match=/^([A-Z]+)([1-9]\d*)$/.exec(value??'');return match?{column:[...match[1]].reduce((number,char)=>number*26+char.charCodeAt(0)-64,0),row:Number(match[2])}:null;}
function sourceCells(document){
  if(document.kind==='csv')return new Map((document.sourceRows??[]).flatMap(row=>row.cells.map((text,index)=>[`${columnName(index+1)}${row.row}`,String(text)])));
  return new Map((document.sourceSheets??[]).flatMap(sheet=>sheet.rows.flatMap(row=>row.cells.map(cell=>[`${sheet.name}\0${cell.address}`,cell.text]))));
}
export function observeSamples({snapshot,run,documents},bindings){
  const byItemId=new Map(),observations=[];
  for(const item of snapshot?.items??[]){
    const criterion=snapshot.criteria?.find(value=>value.id===item.criterionId),matches=[];
    for(const binding of bindings??[]){
      if(binding.criterionLabel!==criterion?.label||item.label!==`${binding.sampleName} · ${binding.criterionLabel}`)continue;
      const possible=documents.filter(document=>document.role===binding.role);
      for(const original of possible){
        const document=run?.analyzedDocuments?.get(original.id);if(!document)continue;
        const csv=document.kind==='csv',cells=sourceCells(document),key=address=>csv?address:`${binding.sheet}\0${address}`;
        const at=position(binding.cell),header=position(binding.headerCell);
        const associated=at&&header&&(binding.orientation==='horizontal'?at.column===header.column&&at.row>header.row:binding.orientation==='vertical'?at.row===header.row&&at.column>header.column:false);
        if(!associated||cells.get(key(binding.headerCell))!=='시료명'||cells.get(key(binding.cell))!==binding.sampleName)continue;
        const evidence=item.evidence?.find(value=>value.documentId===document.id&&value.cell===binding.cell&&value.quote===binding.sampleName&&(csv?value.sheet===undefined||value.sheet===document.name:value.sheet===binding.sheet));
        if(evidence)matches.push({sampleName:binding.sampleName,documentId:document.id,cell:binding.cell,...(!csv?{sheet:binding.sheet}:{}),quote:evidence.quote,headerCell:binding.headerCell,headerQuote:'시료명',orientation:binding.orientation});
      }
    }
    if(matches.length===1){byItemId.set(item.id,matches[0].sampleName);observations.push({itemId:item.id,state:'observed',source:matches[0]});}
    else observations.push({itemId:item.id,state:'unobserved',reason:matches.length?'ambiguous-source-sample-binding':'normalized-label-or-source-evidence-does-not-establish-sample'});
  }
  return {byItemId,observations};
}

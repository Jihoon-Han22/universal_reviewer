import type {Criterion,Doc,Evidence} from './types';
import {evidenceSheet,normalizePreview,textMatches} from './source-highlights.ts';

const normalizeLabel=(value:string)=>value.normalize('NFKC').replace(/\s/gu,'').toLowerCase();
const itemHeaders=new Set(['시험항목','검사항목','검토항목','측정항목','항목','항목명','항목/항목명','시험명','item','testitem','parameter','test']);
const entries=(value:unknown):Evidence[]=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&typeof item.documentId==='string'):value&&typeof value==='object'&&typeof (value as Evidence).documentId==='string'?[value as Evidence]:[];
const citationKey=(value:Evidence)=>JSON.stringify([value.documentId,value.page,value.sheet,value.cell,value.quote,value.blank]);
const unique=(values:Evidence[])=>[...new Map(values.map(value=>[citationKey(value),value])).values()];
const columnName=(column:number)=>{let name='';for(let n=column+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};

// Parse the complete requested range before any renderer clipping. A huge range
// cannot become a small, apparently safe recovery after the preview's 100-cell cap.
function smallRowCells(address:string,columnCount:number):{row:number;columns:number[]}|null{
  const pieces:string[]=[];let piece='',quoted=false;
  for(let i=0;i<address.length;i++){const value=address[i];if(value==="'"){if(quoted&&address[i+1]==="'"){piece+="''";i++;continue;}quoted=!quoted;}if(!quoted&&(value===','||value===';')){pieces.push(piece.trim());piece='';}else piece+=value;}
  if(quoted)return null;pieces.push(piece.trim());
  const cells=new Set<number>();let row:number|undefined;
  const parse=(value:string)=>{const match=/^\$?([a-z]+)\$?([1-9]\d*)$/i.exec(value.trim());if(!match)return null;const column=[...match[1].toUpperCase()].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1,r=Number(match[2])-1;return Number.isSafeInteger(column)&&Number.isSafeInteger(r)?{column,row:r}:null;};
  for(const entry of pieces){const qualifier=/^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(entry),range=qualifier?qualifier[3]:entry;if(!range||range.includes('!'))return null;
    const rowOnly=/^(?:row\s*(\d+)|(\d+)\s*행|(\d+)\s*:\s*(\d+))$/i.exec(range);
    let first,last;
    if(rowOnly){const a=Number(rowOnly[1]||rowOnly[2]||rowOnly[3])-1,b=Number(rowOnly[4]||a+1)-1;if(a!==b||a<0||!Number.isSafeInteger(a))return null;first={row:a,column:0};last={row:a,column:columnCount-1};}
    else{const bounds=range.split(':');if(bounds.length>2)return null;first=parse(bounds[0]);last=parse(bounds[1]||bounds[0]);}
    if(!first||!last||first.row!==last.row||row!==undefined&&row!==first.row)return null;
    row=first.row;const from=Math.min(first.column,last.column),to=Math.max(first.column,last.column);if(from<0||to>=columnCount||to-from+1>12)return null;
    for(let column=from;column<=to;column++)cells.add(column);if(cells.size>12)return null;
  }
  return row===undefined||!cells.size?null:{row,columns:[...cells].sort((a,b)=>a-b)};
}

/** Preview-only compatibility evidence. Never mutate the saved criterion. */
export function criterionPreviewEvidence(criterion:Criterion,documents:Doc[]):Evidence[]{
  const legacy=criterion as Criterion&{evidenceCells?:unknown};
  let stored=unique([...entries(criterion.sourceEvidence),...entries(legacy.evidenceCells)]);
  if(!stored.length&&criterion.source&&typeof criterion.source==='object'){
    const source=criterion.source as Partial<Evidence>,criteriaDocuments=documents.filter(document=>document.role==='criteria');
    const documentId=typeof source.documentId==='string'&&source.documentId.trim()?source.documentId:criteriaDocuments.length===1&&(source.page!==undefined||source.sheet!==undefined||source.cell!==undefined)?criteriaDocuments[0].id:null;
    if(documentId)stored=[{...source,documentId}];
  }
  const label=normalizeLabel(criterion.label);if(!/\p{L}/u.test(label))return stored;
  const candidates:Evidence[]=[];
  for(const citation of stored){
    if(typeof citation.cell!=='string'||typeof citation.quote!=='string'||!citation.quote.trim())continue;
    const document=documents.find(document=>document.id===citation.documentId);if(!document)continue;
    const preview=normalizePreview(document.preview),names=preview.sheets.map(sheet=>sheet.name),name=evidenceSheet(citation,names),sheet=preview.sheets.find(sheet=>sheet.name===name);if(!sheet)continue;
    const parsed=smallRowCells(citation.cell,Math.max(0,...sheet.rows.map(row=>row.length)));if(!parsed)continue;
    const row=sheet.rows[parsed.row];if(!row)continue;
    const first=parsed.columns[0],last=parsed.columns.at(-1)!;
    if(row.slice(first,last+1).some(value=>!value.trim())||last>=row.length)continue;
    const quoted=parsed.columns.map(column=>row[column]);
    if(!quoted.some(value=>textMatches(value,citation.quote!).length)&&!textMatches(quoted.join(' '),citation.quote).length)continue;
    let left=first,right=last;while(left>0&&row[left-1]?.trim())left--;while(right+1<row.length&&row[right+1]?.trim())right++;
    const matching=row.flatMap((value,column)=>column>=left&&column<=right&&normalizeLabel(value)===label?[column]:[]);if(matching.length!==1)continue;
    const labelColumn=matching[0];if(parsed.columns.includes(labelColumn))continue;let headerFound=false;
    for(let index=parsed.row-1;index>=0;index--){const previous=sheet.rows[index];if(!previous.some(value=>value.trim()))break;const headers=previous.flatMap((value,column)=>itemHeaders.has(normalizeLabel(value))?[column]:[]);if(headers.length){headerFound=headers.includes(labelColumn);break;}}
    if(!headerFound)continue;
    candidates.push({documentId:document.id,sheet:sheet.name,cell:`${columnName(labelColumn)}${parsed.row+1}`,quote:row[labelColumn]});
  }
  const recovered=unique(candidates);return recovered.length===1?unique([...stored,recovered[0]]):stored;
}

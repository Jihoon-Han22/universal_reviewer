// Diagnostics retain only host-defined codes, JSON types and bounded counts.
const type=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const listCount=value=>Array.isArray(value)?value.length:null;
const count=(items,predicate)=>Array.isArray(items)?items.filter(predicate).length:0;
export function contextResponseShape(raw,{review=false}={}){
  if(review){const codes=['missing_region','wrong_header','contradiction','ambiguity','missing_unit','source_limit','other'];return {rootType:type(raw),checkedType:type(raw?.checked),checked:raw?.checked===true,issuesType:type(raw?.issues),issueCount:listCount(raw?.issues),issueCodes:Object.fromEntries(codes.map(code=>[code,count(raw?.issues,issue=>issue?.code===code)])),unrecognizedIssueCodes:count(raw?.issues,issue=>!codes.includes(issue?.code)),selectorCount:count(raw?.issues,issue=>issue?.request!==undefined)};}
  return {rootType:type(raw),summaryType:type(raw?.summary),documentTypeType:type(raw?.documentType),structureType:type(raw?.structure),structureCount:listCount(raw?.structure),warningsType:type(raw?.warnings),warningCount:listCount(raw?.warnings),questionsType:type(raw?.questions),questionCount:listCount(raw?.questions),unknownKinds:count(raw?.structure,entry=>!['table','text','metadata','image','list','other'].includes(entry?.kind)),nonStringSheets:count(raw?.structure,entry=>entry?.sheet!==undefined&&typeof entry.sheet!=='string'),nonStringRanges:count(raw?.structure,entry=>entry?.range!==undefined&&typeof entry.range!=='string'),nonArrayHeaders:count(raw?.structure,entry=>!Array.isArray(entry?.headers)),uncertainEntries:count(raw?.structure,entry=>entry?.uncertain===true)};
}
export function visualTranscriptionShape(raw){
  return {rootType:type(raw),pagesType:type(raw?.pages),pageCount:listCount(raw?.pages),warningsType:type(raw?.warnings),warningCount:listCount(raw?.warnings),pages:Array.isArray(raw?.pages)?raw.pages.slice(0,4).map(page=>{
    const cells=Array.isArray(page?.tables)?page.tables.slice(0,61).flatMap(table=>Array.isArray(table?.cells)?table.cells.slice(0,1601):[]):[];
    return {pageType:type(page),pageNumberType:type(page?.page),rotationType:type(page?.rotation),completeType:type(page?.complete),warningsType:type(page?.warnings),warningCount:listCount(page?.warnings),blocksType:type(page?.blocks),blockCount:listCount(page?.blocks),tablesType:type(page?.tables),tableCount:listCount(page?.tables),cellCount:cells.length,
      textBlocks:count(page?.blocks,block=>block?.kind==='text'),tableBlocks:count(page?.blocks,block=>block?.kind==='table'),noteBlocks:count(page?.blocks,block=>block?.kind==='note'),unknownBlockKinds:count(page?.blocks,block=>!['text','table','note'].includes(block?.kind)),
      emptyBlockTableIds:count(page?.blocks,block=>block?.tableId===''),nullBlockTableIds:count(page?.blocks,block=>block?.tableId===null),missingBlockTableIds:count(page?.blocks,block=>block?.tableId===undefined),
      emptyParentTableIds:count(page?.tables,table=>table?.parentTableId===''),nullParentTableIds:count(page?.tables,table=>table?.parentTableId===null),emptyParentCells:count(page?.tables,table=>table?.parentCell===''),nullParentCells:count(page?.tables,table=>table?.parentCell===null),
      nonArrayCellLists:count(page?.tables,table=>!Array.isArray(table?.cells)),invalidCellCoordinates:count(cells,cell=>!Number.isInteger(cell?.row)||!Number.isInteger(cell?.column)||!Number.isInteger(cell?.rowSpan)||!Number.isInteger(cell?.colSpan)),nonStringCellTexts:count(cells,cell=>typeof cell?.text!=='string'),nonBooleanCellUncertainty:count(cells,cell=>typeof cell?.uncertain!=='boolean')};
  }):[]};
}

const readerReasons=new Map([
  ['Text extraction limit (1500000 characters) reached.','TEXT_EXTRACTION_LIMIT'],['Reader elapsed time limit reached','READER_TIME_LIMIT'],['Cell limit reached','CELL_LIMIT'],['Text character limit reached','TEXT_LIMIT'],['Image count limit reached','IMAGE_LIMIT'],
  ['Embedded image could not be decoded within supported limits','IMAGE_DECODE_FAILED'],['CSV delimiter detection failed; using comma','CSV_DELIMITER_FALLBACK'],['CSV row or content limit reached','CSV_CONTENT_LIMIT'],['Defined name limit reached','DEFINED_NAME_LIMIT'],['Worksheet limit reached','SHEET_LIMIT'],['Workbook cell, row, text or time limit reached','WORKBOOK_CONTENT_LIMIT'],['Workbook chart visual was not read','WORKBOOK_CHART_UNREAD'],['Formula saved results are missing; formulas were not recalculated','FORMULA_CACHE_MISSING'],['PDF page or content limit reached','PDF_CONTENT_LIMIT'],['PDF table detection could not inspect a page','PDF_TABLE_INSPECTION_FAILED'],['Only the first image frame was inspected','IMAGE_FRAME_LIMIT'],['Nested Word table depth limit reached','DOCX_NESTING_LIMIT'],
]);
export function readerReasonCode(reason){
  if(readerReasons.has(reason))return readerReasons.get(reason);
  if(typeof reason==='string'&&/^Parser reported an unsupported or altered feature: (?:UserWarning|RuntimeWarning|DeprecationWarning|PendingDeprecationWarning|FutureWarning|ResourceWarning)$/.test(reason))return 'PARSER_'+reason.split(': ')[1].replace(/Warning$/,'').toUpperCase()+'_WARNING';
  if(typeof reason==='string'&&/^Unsupported document or parser failure: [A-Za-z][A-Za-z0-9]*$/.test(reason))return 'PARSER_FAILURE';
  return 'UNCLASSIFIED_READER_WARNING';
}

export function safeInternalFrames(error,root,allowedFiles){
  if(typeof error?.stack!=='string')return [];
  const prefix=root.replaceAll('\\','/').replace(/\/$/,'')+'/';
  const frames=[];
  for(const line of error.stack.split(/\r?\n/).slice(1,25)){
    const normalized=line.replaceAll('\\','/'),start=normalized.indexOf(prefix);
    if(start<0)continue;
    const match=/^(.+?):([0-9]{1,7}):([0-9]{1,7})\)?$/.exec(normalized.slice(start+prefix.length).trim());
    if(match&&allowedFiles.includes(match[1]))frames.push({module:match[1],line:Number(match[2]),column:Number(match[3])});
    if(frames.length===6)break;
  }
  return frames;
}

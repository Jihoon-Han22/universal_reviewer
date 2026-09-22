import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { parse } from 'csv-parse/sync';
import { SaxesParser } from 'saxes';
import { pdfText } from './pdf-text.mjs';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE = 1_500_000;
const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
export class DocumentError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'DocumentError'; this.status = status; }
}
export function cleanFilename(input) {
  let name = String(input ?? '');
  if ([...name].every(char => char.codePointAt(0) <= 255)) {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (!decoded.includes('\ufffd')) name = decoded;
  }
  name = path.posix.basename(name.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 240);
  if (!name) throw new DocumentError('파일 이름을 확인해 주세요.');
  return name;
}
function utf8(buffer) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { throw new DocumentError('UTF-8 형식의 텍스트 파일을 업로드해 주세요.'); }
  if (text.includes('\0')) throw new DocumentError('텍스트 파일에 지원하지 않는 문자가 있습니다.');
  return text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
}

/** Validate the ZIP directory before passing any member to an OOXML parser. */
export function validateOOXML(buffer, kind) {
  const bad = message => { throw new DocumentError(message ?? '손상되었거나 지원하지 않는 Office 파일입니다.'); };
  let end = -1;
  for (let p = buffer.length - 22; p >= Math.max(0, buffer.length - 65557); p--) {
    if (buffer.readUInt32LE(p) === 0x06054b50 && p + 22 + buffer.readUInt16LE(p + 20) === buffer.length) { end = p; break; }
  }
  if (end < 0) bad();
  const count = buffer.readUInt16LE(end + 10), size = buffer.readUInt32LE(end + 12), offset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || buffer.readUInt16LE(end + 8) !== count || count === 65535 || size === 0xffffffff || offset === 0xffffffff) bad('분할 또는 ZIP64 Office 파일은 지원하지 않습니다.');
  if (count > 20000) throw new DocumentError('Office 파일에 항목이 너무 많습니다.', 413);
  if (offset + size > end) bad();
  let p = offset, expanded = 0;
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > offset + size || buffer.readUInt32LE(p) !== 0x02014b50) bad();
    const flags = buffer.readUInt16LE(p + 8), method = buffer.readUInt16LE(p + 10), compressed = buffer.readUInt32LE(p + 20), uncompressed = buffer.readUInt32LE(p + 24);
    const nl = buffer.readUInt16LE(p + 28), el = buffer.readUInt16LE(p + 30), cl = buffer.readUInt16LE(p + 32), local = buffer.readUInt32LE(p + 42);
    if (flags & 1 || ![0, 8].includes(method) || buffer.readUInt16LE(p + 34) || [compressed, uncompressed, local].includes(0xffffffff)) bad();
    if (p + 46 + nl + el + cl > offset + size) bad();
    const nameBytes = buffer.subarray(p + 46, p + 46 + nl), name = nameBytes.toString('utf8');
    if (entries.has(name)) bad('Office 압축 파일에 중복 항목이 있습니다.');
    expanded += uncompressed;
    if (expanded > 100 * 1024 * 1024) throw new DocumentError('압축 해제된 Office 파일은 100MB까지 처리할 수 있습니다.', 413);
    if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50) bad();
    const lnl = buffer.readUInt16LE(local + 26), lel = buffer.readUInt16LE(local + 28), start = local + 30 + lnl + lel;
    if (buffer.readUInt16LE(local + 6) & 1 || buffer.readUInt16LE(local + 8) !== method || start + compressed > offset || !buffer.subarray(local + 30, local + 30 + lnl).equals(nameBytes)) bad();
    let bytes;
    try { bytes = method === 0 ? buffer.subarray(start, start + compressed) : inflateRawSync(buffer.subarray(start, start + compressed), { maxOutputLength: Math.max(1, uncompressed) }); } catch { bad(); }
    if (bytes.length !== uncompressed) bad();
    entries.set(name, bytes);
    p += 46 + nl + el + cl;
  }
  if (p !== offset + size || !entries.has('[Content_Types].xml') || !entries.has(kind === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml')) bad();
  return entries;
}

export function deferredSpreadsheetPreview(reason, imageOnly = false) {
  return {
    source: `LOCAL_PREVIEW_INCOMPLETE: ${reason}. This is only a local preview limitation. Original workbook bytes are retained and must be analyzed by the sandbox before any review. Do not infer contents from this incomplete preview.`,
    sourceSheets: [],
    preview: { type: 'text', truncated: true, text: imageOnly ? '텍스트 미리보기 없음. 샌드박스에서 이미지/구조 분석 필요' : `로컬 텍스트 미리보기 일부 생략: ${reason}\n원본 파일은 유지되며 샌드박스에서 전체 구조 분석이 필요합니다.` },
  };
}
export function publicTablePreview(sheets, warnings = []) {
  let remaining = 60000, truncated = sheets.length > 30;
  const output = [];
  for (const sheet of sheets.slice(0, 30)) {
    const rows = [];
    if (sheet.rows.length > 100) truncated = true;
    for (const input of sheet.rows.slice(0, 100)) {
      const cells = Array.isArray(input) ? input : input.cells;
      if (cells.length > 100) truncated = true;
      const row = [];
      for (const inputCell of cells.slice(0, 100)) {
        const text = String(typeof inputCell === 'object' && inputCell !== null ? inputCell.value ?? '' : inputCell ?? '').slice(0, 2000);
        if (text.length > remaining) truncated = true;
        row.push(text.slice(0, remaining)); remaining = Math.max(0, remaining - text.length);
      }
      rows.push(row);
      if (!remaining) { truncated = true; break; }
    }
    output.push({ name: sheet.name, rows, ...(sheet.state ? { state: sheet.state } : {}) });
    if (!remaining) break;
  }
  return { type: 'table', sheets: output, ...(truncated ? { truncated: true } : {}), ...(warnings.length ? { warnings: warnings.slice(0, 10).map(w => String(w).slice(0, 1000)) } : {}) };
}
function displayValue(cell) {
  const value = cell.value;
  if (cell.isMerged && cell.master.address !== cell.address) return `[병합 셀: ${cell.master.address}]`;
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return cell.result == null || cell.result === '' ? '[계산 결과 없음: 수식 재계산 필요]' : String(cell.result);
    if (value.richText) return value.richText.map(t => t.text).join('');
    if (value.text != null) return String(value.text);
    if (value.error) return String(value.error);
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}
function spreadsheetXmlCompatibility(xml) {
  const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main',relationships='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const mainUris=new Set([main,'http://purl.oclc.org/ooxml/spreadsheetml/main']),relationshipUris=new Set([relationships,'http://purl.oclc.org/ooxml/officeDocument/relationships']);
  const prefixed=[...xml.matchAll(/\bxmlns:([^\s"'<>/=]+)\s*=\s*["']([^"']+)["']/g)];
  if(!prefixed.some(([,prefix,uri])=>mainUris.has(uri)||relationshipUris.has(uri)&&prefix!=='r')&&!xml.includes('http://purl.oclc.org/ooxml/'))return xml;
  // ExcelJS matches literal names. Canonicalize known spreadsheet namespaces on
  // the preview copy, using parsed namespace identity rather than prefix text.
  const parser=new SaxesParser({xmlns:true}),out=[],stack=[];
  const usedPrefixes=new Set(['r','xml','xmlns',...prefixed.map(([,prefix])=>prefix)]),foreignPrefixes=new Map();
  const foreignPrefix=uri=>{
    if(!foreignPrefixes.has(uri)){
      let prefix,index=0;do{prefix=`compatNs${++index}`;}while(usedPrefixes.has(prefix));
      usedPrefixes.add(prefix);foreignPrefixes.set(uri,prefix);
    }
    return foreignPrefixes.get(uri);
  };
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll('\r','&#13;');
  const name=node=>mainUris.has(node.uri)?node.local:relationshipUris.has(node.uri)?`r:${node.local}`:node.uri&&(!node.prefix||node.prefix==='r')?`${foreignPrefix(node.uri)}:${node.local}`:node.name;
  parser.on('opentag',tag=>{
    const attributes=[],namespaces=new Map();let defaultNamespace=stack.at(-1)?.defaultNamespace??'';
    for(const attribute of Object.values(tag.attributes)){
      if(attribute.uri==='http://www.w3.org/2000/xmlns/'){
        const prefix=attribute.name==='xmlns'?'':attribute.local,uri=attribute.value;
        if(mainUris.has(uri)){if(prefix&&prefix!=='r')namespaces.set(prefix,main);}
        else if(relationshipUris.has(uri)){if(prefix)namespaces.set(prefix,relationships);}
        else if(uri)namespaces.set(!prefix||prefix==='r'?foreignPrefix(uri):prefix,uri);
        continue;
      }
      attributes.push(`${name(attribute)}="${escape(attribute.value).replaceAll('\n','&#10;').replaceAll('\t','&#9;')}"`);
    }
    if(mainUris.has(tag.uri)&&defaultNamespace!==main){namespaces.set('',main);defaultNamespace=main;}
    else if(!tag.uri&&defaultNamespace){namespaces.set('','');defaultNamespace='';}
    if(!stack.length)namespaces.set('r',relationships);
    for(const [prefix,uri] of namespaces)attributes.push(`xmlns${prefix?':'+prefix:''}="${escape(uri)}"`);
    const tagName=name(tag);out.push(`<${tagName}${attributes.length?' '+attributes.join(' '):''}>`);stack.push({name:tagName,defaultNamespace});
  });
  parser.on('closetag',()=>out.push(`</${stack.pop().name}>`));
  parser.on('text',text=>out.push(escape(text)));parser.on('cdata',text=>out.push(escape(text)));
  parser.on('comment',text=>out.push(`<!--${text}-->`));
  parser.on('processinginstruction',instruction=>out.push(`<?${instruction.target} ${instruction.body}?>`));
  parser.write(xml).close();return out.join('');
}
async function parseWorkbook(buffer, entries) {
  const clone = await JSZip.loadAsync(buffer);
  let drawings = false;
  const commentPaths = new Map();
  let commentIndex = 0;
  for (const name of entries.keys()) if (/^xl\/comments\d+\.xml$/.test(name)) commentPaths.set(name,name);
  for (const name of entries.keys()) if (/^xl\/comments\/[^/]+\.xml$/.test(name)) { while (entries.has(`xl/comments${++commentIndex}.xml`)) {} commentPaths.set(name,`xl/comments${commentIndex}.xml`); }
  for (const [name, value] of entries) {
    const spreadsheetPart=/^xl\/(?:workbook\.xml|styles\.xml|sharedStrings\.xml|worksheets\/[^/]+\.xml|comments\d+\.xml|comments\/[^/]+\.xml)$/.test(name);
    const compatibleXml=spreadsheetPart?spreadsheetXmlCompatibility(value.toString('utf8')):undefined;
    if(spreadsheetPart)clone.file(name,compatibleXml);
    if (/^xl\/drawings\/drawing\d+\.xml$/.test(name)) drawings = true;
    // ExcelJS also reconciles orphan drawing relationships; discard the entire
    // drawing subtree on this preview-only copy, leaving original bytes intact.
    if (/^xl\/drawings\//.test(name)) { clone.remove(name); continue; }
    if (/\.rels$/.test(name)) {
      const xml = value.toString('utf8');
      const stripped = xml.replace(/<Relationship\b[^>]*\bType=["'][^"']*\/(?:drawing|vmlDrawing)["'][^>]*\/?\s*>/g, '').replace(/(<Relationship\b[^>]*\bTarget=["'])([^"']+)(["'][^>]*>)/g,(all,start,target,end) => {
        const absolute = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(path.posix.dirname(name)),target));
        return commentPaths.has(absolute) ? `${start}../${path.posix.basename(commentPaths.get(absolute))}${end}` : all;
      });
      if (stripped !== xml) clone.file(name, stripped);
    }
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) clone.file(name, compatibleXml.replace(/<(?:\w+:)?(?:drawing|legacyDrawing|legacyDrawingHF)\b[^>]*\/?\s*>/g, '').replace(/<\/(?:\w+:)?(?:drawing|legacyDrawing|legacyDrawingHF)>/g,''));
    if (commentPaths.has(name)) {
      clone.remove(name); clone.file(commentPaths.get(name),compatibleXml);
    }
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await clone.generateAsync({ type: 'nodebuffer' }));
  if (workbook.worksheets.length > 30) return deferredSpreadsheetPreview('로컬 시트 수 한도(30개)를 초과했습니다');
  let cells = 0, sourceSize = 0, meaningful = 0;
  const sourceSheets = [], chunks = [];
  for (const worksheet of workbook.worksheets) {
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, row => {
      const rowCells = [];
      row.eachCell({ includeEmpty: false }, cell => {
        if (++cells > 100000) return;
        const value = displayValue(cell);
        if (value) meaningful++;
        const record = { address: cell.address, text: value };
        if (cell.note) record.comment = typeof cell.note === 'string' ? cell.note : (cell.note.texts ?? []).map(t => t.text).join('');
        if (cell.formula) { record.formula = cell.formula; if (cell.result !== undefined) record.cachedValue = cell.result; }
        rowCells.push(record); sourceSize += value.length + cell.address.length + 2;
      });
      rows.push({ row: row.number, cells: rowCells });
    });
    if (cells > 100000) return deferredSpreadsheetPreview('로컬 셀 수 한도(100,000개)를 초과했습니다');
    if (sourceSize > MAX_SOURCE) return deferredSpreadsheetPreview('로컬 원문 길이 한도(1,500,000자)를 초과했습니다');
    sourceSheets.push({ name: worksheet.name, state: worksheet.state, mergedRanges: [...(worksheet.model.merges ?? [])], rows });
    chunks.push(`SHEET: ${worksheet.name}\n${rows.map(row => row.cells.map(cell => `${cell.address}: ${cell.text}`).join(' | ')).join('\n')}`);
  }
  if (!meaningful && drawings) return deferredSpreadsheetPreview('이미지 전용 워크북', true);
  const warnings = drawings ? ['삽입 이미지·도형·차트는 로컬 미리보기에 포함되지 않았습니다. 샌드박스에서 이미지/구조 분석이 필요합니다.'] : [];
  let source = chunks.join('\n\n');
  if (drawings) source += '\nEXTRACTION_LIMITATION: Embedded images, charts and drawings were not interpreted by the local preview. Original bytes must be analyzed by the sandbox before claiming to have reviewed those contents.';
  if (source.length > MAX_SOURCE) return deferredSpreadsheetPreview('로컬 원문 길이 한도(1,500,000자)를 초과했습니다');
  const sheets = sourceSheets.map(sheet => {
    const rows = Array.from({length:Math.min(sheet.rows.at(-1)?.row ?? 0,101)},()=>[]);
    for (const row of sheet.rows) {
      if (row.row > 100) continue;
      const values = rows[row.row - 1];
      for (const c of row.cells) {
        const column = [...c.address.match(/^[A-Z]+/)[0]].reduce((a, letter) => a * 26 + letter.charCodeAt(0) - 64, 0);
        while (values.length < Math.min(column,101)) values.push('');
        if (column <= 100) values[column - 1] = c.text;
      }
    }
    return {...sheet,rows};
  });
  return { source, sourceSheets, preview: publicTablePreview(sheets, warnings) };
}
export async function parseDocument(buffer, kind) {
  if (kind === 'pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new DocumentError('PDF 파일의 형식이 올바르지 않습니다.');
    const verificationPages = await pdfText(buffer);
    return { preview: { type: 'pdf' }, verificationPages, source: verificationPages.map(p => `PAGE ${p.page}\n${p.text}`).join('\n'), modelParts: [{ inlineData: { mimeType: MIME.pdf, data: buffer.toString('base64') } }] };
  }
  if (['png', 'jpg', 'jpeg', 'webp'].includes(kind)) {
    const valid = kind === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : kind === 'webp' ? buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP' : buffer.subarray(0,3).equals(Buffer.from([255,216,255]));
    if (!valid) throw new DocumentError('이미지 파일의 형식이 올바르지 않습니다.');
    return { preview: { type: 'image' }, source: '', modelParts: [{ inlineData: { mimeType: MIME[kind], data: buffer.toString('base64') } }] };
  }
  let result;
  if (kind === 'xlsx' || kind === 'docx') {
    const entries = validateOOXML(buffer, kind);
    try {
      if (kind === 'xlsx') result = await parseWorkbook(buffer, entries);
      else { const { value } = await mammoth.extractRawText({ buffer, arrayBuffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }); result = { source: value.slice(0, MAX_SOURCE), preview: { type: 'text', text: value.slice(0, 60000), ...(value.length > 60000 ? { truncated: true } : {}) } }; }
    } catch (error) { if (error instanceof DocumentError) throw error; throw new DocumentError('Office 파일을 읽을 수 없습니다. 파일 형식과 내용을 확인해 주세요.'); }
  } else {
    const text = utf8(buffer);
    if (kind === 'json') { try { JSON.parse(text); } catch { throw new DocumentError('JSON 파일 형식이 올바르지 않습니다.'); } }
    if (kind === 'csv') {
      let rows;
      try { rows = parse(text, { bom: true, relax_column_count: true, skip_empty_lines: false, max_record_size: 100000, to: 10001 }); } catch { throw new DocumentError('CSV 파일을 읽을 수 없습니다. 구분자와 내용을 확인해 주세요.'); }
      if (rows.length > 10000 || rows.some(row => row.length > 100)) throw new DocumentError('CSV 파일은 10,000행, 100열까지 업로드할 수 있습니다.');
      const sourceRows = rows.map((cells, i) => ({ row: i + 1, cells }));
      result = { sourceRows, source: sourceRows.map(row => `ROW ${row.row}: ${row.cells.join(' | ')}`).join('\n'), preview: publicTablePreview([{ name: 'CSV', rows }]) };
    } else result = { source: text.split('\n').map((line, i) => `L${i + 1}: ${line}`).join('\n'), preview: { type: 'text', text: text.slice(0, 60000), ...(text.length > 60000 ? { truncated: true } : {}) } };
    if (result.source.length > MAX_SOURCE) throw new DocumentError('텍스트 원문은 1,500,000자까지 처리할 수 있습니다.', 413);
  }
  return { ...result, modelParts: [{ text: result.source }] };
}

export class DocumentStore {
  constructor({ parse: parser = parseDocument } = {}) { this.documents = new Map(); this.pendingDocuments = 0; this.pendingBytes = 0; this.totalBytes = 0; this.parse = parser; }
  get size() { return this.documents.size; }
  get(id) { const doc = this.documents.get(id); if (!doc) throw new DocumentError('문서를 찾을 수 없습니다. 파일을 다시 업로드해 주세요.', 404); return doc; }
  public(document) { const d = typeof document === 'string' ? this.get(document) : document; return structuredClone(Object.fromEntries(['id','name','kind','mime','size','role','url','preview'].map(k => [k, d[k]]))); }
  toPublic(document) { return this.public(document); }
  async add(input, metadata = {}) {
    const args = Buffer.isBuffer(input) || input instanceof Uint8Array ? { ...metadata, buffer: input } : input;
    const buffer = Buffer.from(args.buffer ?? []), name = cleanFilename(args.name ?? args.originalname), role = args.role ?? 'target';
    const kind = path.extname(name).slice(1).toLowerCase();
    if (!['target','criteria','ledger'].includes(role)) throw new DocumentError('문서 역할을 확인해 주세요.');
    if (!MIME[kind]) throw new DocumentError('지원하지 않는 파일 형식입니다. PDF, DOCX, XLSX, CSV, TXT, MD, JSON 또는 이미지를 업로드해 주세요.');
    if (!buffer.length) throw new DocumentError('빈 파일은 업로드할 수 없습니다.');
    if (buffer.length > MAX_FILE_BYTES) throw new DocumentError('파일당 20MB까지 업로드할 수 있습니다.', 413);
    if (this.size + this.pendingDocuments >= 100) throw new DocumentError('문서는 최대 100개까지 보관할 수 있습니다.', 413);
    if (this.totalBytes + this.pendingBytes + buffer.length > 250 * 1024 * 1024) throw new DocumentError('문서 저장 용량은 총 250MB까지입니다.', 413);
    this.pendingDocuments++; this.pendingBytes += buffer.length;
    try {
      const parsed = await this.parse(buffer, kind);
      const id = randomUUID();
      const doc = { id, name, kind, mime: MIME[kind], size: buffer.length, role, url: `/api/documents/${id}/content`, ...parsed, buffer };
      this.documents.set(id, doc); this.totalBytes += buffer.length;
      return doc;
    } finally { this.pendingDocuments--; this.pendingBytes -= buffer.length; }
  }
  delete(id) { const doc = this.get(id); this.documents.delete(id); this.totalBytes -= doc.size; return true; }
  rollback(documents) { for (const doc of documents) if (this.documents.has(typeof doc === 'string' ? doc : doc.id)) this.delete(typeof doc === 'string' ? doc : doc.id); }
}

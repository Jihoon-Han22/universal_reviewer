// Deterministic source indexes. These functions never read documents from disk.
export const compact = value => String(value ?? '').normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]+/gu, '').toLowerCase();
export const normalizedText = value => String(value ?? '').normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]+/gu, ' ').trim();
export const columnNumber = name => [...name].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
export function columnName(number) { let result = ''; while (number > 0) { number--; result = String.fromCharCode(65 + number % 26) + result; number = Math.floor(number / 26); } return result; }
export function parseRange(value, { bounds = true } = {}) {
  if (typeof value !== 'string') return null;
  const match = value.replaceAll('$', '').match(/^([A-Z]{1,3})(\d{1,7})(?::([A-Z]{1,3})(\d{1,7}))?$/);
  if (!match) return null;
  const range = { c1: columnNumber(match[1]), r1: Number(match[2]), c2: columnNumber(match[3] ?? match[1]), r2: Number(match[4] ?? match[2]) };
  if (range.r1 < 1 || range.r2 < range.r1 || range.c2 < range.c1 || (bounds && (range.r2 > 1048576 || range.c2 > 16384))) return null;
  return range;
}
export const addressOf = cell => cell.address ?? cell.cell ?? (cell.column ? `${columnName(cell.column)}${cell.row ?? ''}` : '');
export const textOf = cell => String(cell.text ?? cell.value ?? '');
export function literalIncludes(source, quote, { caseSensitive = false, collapse = false } = {}) {
  const normalize = collapse ? normalizedText : compact;
  let s = normalize(source), q = normalize(quote);
  if (caseSensitive) { s = normalizedText(source); q = normalizedText(quote); }
  if (!q) return false;
  for (let at = s.indexOf(q); at !== -1; at = s.indexOf(q, at + 1)) {
    if (/[\d.,]/.test(q[0]) && /[\d.,]/.test(s[at - 1] ?? '')) continue;
    if (/[\d.,]/.test(q.at(-1)) && /[\d.,]/.test(s[at + q.length] ?? '')) continue;
    return true;
  }
  return false;
}
export function sourceRows(document) {
  if (Array.isArray(document.sourceRows)) return document.sourceRows;
  const profile = document.sandboxProfile;
  if (Array.isArray(profile?.rows)) return profile.rows;
  if (document.kind !== 'csv') return [];
  return (profile?.sheets?.[0]?.rows ?? []).map(row => {
    const cells = [];
    for (const c of row.cells ?? []) cells[(c.column ?? parseRange(addressOf(c))?.c1 ?? cells.length + 1) - 1] = textOf(c);
    return { row: row.row, cells: Array.from(cells, v => v ?? '') };
  });
}
export function sourceSheets(document) {
  if (Array.isArray(document.sourceSheets)) return document.sourceSheets;
  if (document.kind !== 'xlsx') return [];
  return (document.sandboxProfile?.sheets ?? []).map(sheet => ({ ...sheet, rows: (sheet.rows ?? []).map(row => ({ row: row.row, cells: (row.cells ?? []).map(c => ({ ...c, address: addressOf(c), text: textOf(c) })) })) }));
}
const ID_HEADER = /^(id|recordid|transactionid|documentid|거래번호|전표번호|성적서번호|문서번호|접수번호|관리번호|식별자|고유번호|번호)$/;
const AGGREGATE = /^(합계|소계|총계|주의|참고|비고|안내)/;
export function recordRows(document) {
  if (document.kind === 'csv' || document.sourceRows) {
    const rows = sourceRows(document), headers = rows[0]?.cells ?? [];
    return rows.slice(1).filter(r => r.cells.some(v => String(v).trim())).map(r => ({ row: r.row, label: String(r.cells.find(v => String(v).trim()) ?? ''), cells: headers.map((header, i) => ({ header: String(header), cell: `${columnName(i + 1)}${r.row}`, value: String(r.cells[i] ?? '') })) }));
  }
  const records = [];
  for (const sheet of sourceSheets(document)) {
    let headers = null, idColumn = null;
    for (const row of sheet.rows ?? []) {
      const populated = (row.cells ?? []).filter(c => textOf(c).trim());
      const id = populated.find(c => ID_HEADER.test(compact(textOf(c))));
      if (id && populated.length >= 2) { headers = populated.map(c => ({ header: textOf(c), column: parseRange(addressOf(c))?.c1 })); idColumn = parseRange(addressOf(id))?.c1; continue; }
      if (!headers) continue;
      const idCell = row.cells.find(c => parseRange(addressOf(c))?.c1 === idColumn), label = idCell ? textOf(idCell).trim() : '';
      if (!label || AGGREGATE.test(label)) continue;
      records.push({ sheet: sheet.name, row: row.row, label, cells: headers.map(h => { const cell = row.cells.find(c => parseRange(addressOf(c))?.c1 === h.column); return { header: h.header, cell: `${columnName(h.column)}${row.row}`, value: cell ? textOf(cell) : '', ...(cell?.formula ? { formula: cell.formula } : {}) }; }) });
    }
  }
  return records;
}
export function evidenceRecords(document, evidence) {
  const rows = recordRows(document), found = new Map();
  for (const e of evidence ?? []) {
    if (e.documentId !== document.id) continue;
    const range = parseRange(e.cell); if (!range) continue;
    for (const row of rows) if ((!row.sheet || e.sheet === row.sheet) && row.row >= range.r1 && row.row <= range.r2) found.set(`${row.sheet ?? ''}!${row.row}`, row);
  }
  return [...found.values()];
}
export function reviewRowCoverage(document, items, excludedRows = []) {
  const rows = recordRows(document), covered = new Set(evidenceRecords(document, items.flatMap(i => i.documentId === document.id ? i.evidence ?? [] : [])).map(r => `${r.sheet ?? ''}!${r.row}`));
  const exclusions = [];
  for (const e of Array.isArray(excludedRows) ? excludedRows : []) {
    const row = rows.find(r => r.row === e.row && (!r.sheet || r.sheet === e.sheet));
    if (!row || typeof e.reason !== 'string' || !e.reason.trim() || e.reason.length > 1000) continue;
    if (row.sheet && (!/제외|적용\s*않음|적용\s*없음|대상\s*아님|not applicable|out of scope/i.test(e.reason) || /빈칸|누락|미기재|판독|missing|blank|unreadable|값\s*없음|정보\s*없음/i.test(e.reason))) continue;
    covered.add(`${row.sheet ?? ''}!${row.row}`); exclusions.push({ ...e });
  }
  const missingRows = rows.filter(r => !covered.has(`${r.sheet ?? ''}!${r.row}`));
  return { complete: missingRows.length === 0, rows, coveredRows: rows.filter(r => covered.has(`${r.sheet ?? ''}!${r.row}`)), missingRows, excludedRows: exclusions };
}
export function structuredTables(documents) {
  const tables = [], seen = new Set(); let count = 0;
  const add = table => { const n = table.rows.reduce((sum, r) => sum + r.cells.length, 0); if (tables.length >= 2048 || count + n > 1000000) return; count += n; tables.push(table); };
  for (const document of Array.isArray(documents) ? documents : [documents]) {
    if (!document || seen.has(document.id)) continue; seen.add(document.id);
    if (document.kind === 'xlsx') for (const s of sourceSheets(document)) add({ ...s, documentId: document.id });
    else if (document.kind === 'csv') add({ documentId: document.id, name: document.name, csv: true, rows: sourceRows(document).map(r => ({ row: r.row, cells: r.cells.map((v, i) => ({ address: `${columnName(i + 1)}${r.row}`, text: String(v) })) })) });
    else if (document.kind === 'docx') {
      const visit = (t, name, block, depth) => { if (depth > 8 || !Array.isArray(t.rows) || t.rows.some(r => !Array.isArray(r))) return; add({ documentId: document.id, name, table: name, block, synthetic: true, rows: t.rows.map((r, j) => ({ row: j + 1, cells: r.map((v, i) => ({ address: `${columnName(i + 1)}${j + 1}`, text: String(v ?? '') })) })) }); for (const [i, n] of (t.nestedTables ?? []).entries()) visit(n, `${name}/R${n.row}C${n.column}/T${i + 1}`, block, depth + 1); };
      for (const b of document.sandboxProfile?.blocks ?? []) if (b.kind === 'table') visit(b, `BLOCK${b.index}`, b.index, 0);
    } else for (const p of document.transcription?.pages ?? []) for (const t of p.tables ?? []) {
      if (!Array.isArray(t.cells) || t.cells.some(c => !Number.isInteger(c.row) || c.row < 1 || !Number.isInteger(c.column) || c.column < 1 || typeof c.text !== 'string')) continue;
      const rows = new Map(); for (const c of t.cells) { if (!rows.has(c.row)) rows.set(c.row, []); rows.get(c.row).push({ ...c, address: `${columnName(c.column)}${c.row}` }); }
      add({ documentId: document.id, name: `PAGE${p.page}/${t.id}`, table: t.id, page: p.page, synthetic: true, rows: [...rows].map(([row, cells]) => ({ row, cells })) });
    }
  }
  return tables;
}
export function nativeCriteriaCitation(table, cell) {
  if (table.synthetic) return { documentId: table.documentId, ...(table.page !== undefined ? { page: table.page } : { block: table.block }), table: table.table };
  return { documentId: table.documentId, ...(!table.csv ? { sheet: table.name } : {}), cell: addressOf(cell) };
}

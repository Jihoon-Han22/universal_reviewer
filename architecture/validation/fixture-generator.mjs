// Reproduction evaluation tool; Node standard library only. No production imports.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const columnName = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const xml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function crc32(bytes) { let crc = -1; for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }

// Minimal standards-compliant STORE ZIP writer. Files are fresh synthetic inputs.
export function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of entries) {
    const n = Buffer.from(name), data = Buffer.from(value), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(33, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(33, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    local.push(h, n, data); central.push(c, n); offset += h.length + n.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export function workbook(sheets) {
  const entries = [
    ['[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"${s.hidden ? ' state="hidden"' : ''}/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`],
  ];
  for (const [i, sheet] of sheets.entries()) {
    const rows = new Map();
    for (const c of sheet.cells) { const r = Number(c.cell.match(/\d+$/)[0]); if (!rows.has(r)) rows.set(r, []); rows.get(r).push(c); }
    entries.push([`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${[...rows].sort((a, b) => a[0] - b[0]).map(([r, cells]) => `<row r="${r}">${cells.map(c => `<c r="${c.cell}" t="inlineStr"><is><t xml:space="preserve">${xml(c.quote)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`]);
  }
  return zip(entries);
}
function place(sheet, rows, { row = 1, column = 1, transpose = false } = {}) {
  const cells = [], at = (r, c) => `${columnName(column + (transpose ? r : c))}${row + (transpose ? c : r)}`;
  rows.forEach((values, r) => values.forEach((quote, c) => cells.push({ sheet, cell: at(r, c), quote: String(quote) })));
  return { cells, at };
}
const VARIANTS = ['baseline', 'shift', 'columns', 'transpose', 'blocks-hidden', 'renamed', 'scaled-both', 'changed-values', 'incompatible-unit', 'missing-required', 'unreadable', 'condition-mismatch', 'csv'];
export { VARIANTS };
export async function generateSuite(output, seed = 'public-2026-09') {
  output = path.resolve(output); await mkdir(output, { recursive: true });
  const token = sha256(seed), rand = n => parseInt(token.slice(n, n + 6), 16), cases = [];
  for (const [index, variant] of VARIANTS.entries()) {
    const id = sha256(`${seed}:${variant}`).slice(0, 14), dir = path.join(output, 'inputs', id); await mkdir(dir, { recursive: true });
    const suffix = sha256(`${seed}:labels:${variant === 'renamed' ? index : 0}`).slice(0, 5);
    const threshold = 10 + rand(0) % 50, limit = 2 + rand(6) % 10;
    const names = [`압력 Ω-${suffix}`, `두께 α-${suffix}`, `표면 Q-${suffix}`, `잔류 β-${suffix}`];
    const specs = [
      { label: names[0], comparison: { operator: 'gte', value: threshold, unit: 'kPa' }, rule: `${threshold} 이상`, condition: '건조', value: String(threshold), unit: 'kPa', status: 'pass' },
      { label: names[1], comparison: { operator: 'lte', value: limit, unit: 'mm' }, rule: `${limit} 이하`, condition: '', value: String(limit + 1), unit: 'mm', status: 'fail' },
      { label: names[2], comparison: null, rule: '이상 없음', condition: '', value: '이상 없음', unit: '', status: 'pass' },
      { label: names[3], comparison: { operator: 'lte', value: 0.05, unit: '%' }, rule: '0.05 이하', condition: '', value: 'N.D.', unit: '%', status: 'review' },
    ];
    if (variant === 'scaled-both') { specs[0].comparison.value = threshold / 1000; specs[0].comparison.unit = specs[0].unit = 'MPa'; specs[0].rule = `${threshold / 1000} 이상`; specs[0].value = String(threshold / 1000); }
    if (variant === 'changed-values') { specs[0].value = String(threshold - 0.25); specs[0].status = 'fail'; specs[1].value = String(limit); specs[1].status = 'pass'; }
    if (variant === 'incompatible-unit') { specs[0].unit = 'MPa'; specs[0].value = String(threshold / 1000); specs[0].status = 'review'; }
    if (variant === 'missing-required') { specs[0].value = ''; specs[0].status = 'fail'; specs[0].presence = 'missing'; }
    if (variant === 'unreadable') { specs[0].value = '판독불가'; specs[0].status = 'review'; specs[0].presence = 'unreadable'; }
    if (variant === 'condition-mismatch') specs[0].status = 'review';
    const criterionName = variant === 'renamed' ? `要件 ${suffix}` : `규정 ${suffix}`;
    const targetName = `관찰 ${suffix}`, sample = `시료-${token.slice(17, 22)}`;
    const headers = variant === 'columns' ? ['비고', '조건', '단위', '기준', '항목', '필수'] : ['항목', '기준', '단위', '조건', '필수', '비고'];
    const criteriaSheets = [], criteriaCells = [], expected = [];
    const blocks = variant === 'blocks-hidden' ? [specs.slice(0, 2), specs.slice(2)] : [specs];
    for (const [block, blockSpecs] of blocks.entries()) {
      const sheet = block ? `추가 ${suffix}` : criterionName;
      const rows = [headers, ...blockSpecs.map(s => headers.map(h => ({ '항목': s.label, '기준': s.rule, '단위': s.comparison?.unit ?? '', '조건': s.condition, '필수': '필수', '비고': '참고 전용 999 이상 / 습윤' })[h]))];
      const geometry = variant === 'shift' ? { row: 4700 + rand(12) % 100, column: 90 + rand(18) % 50 } : variant === 'transpose' ? { row: 27, column: 29, transpose: true } : variant === 'blocks-hidden' ? { row: 12 + block * 400, column: 4 + block * 30 } : {};
      const placed = place(sheet, rows, geometry); criteriaCells.push(...placed.cells); criteriaSheets.push({ name: sheet, cells: placed.cells, hidden: block === 1 });
      for (const [r, s] of blockSpecs.entries()) expected.push({ criterionLabel: s.label, comparison: s.comparison, rule: s.rule, conditions: s.condition ? [s.condition] : [], categoryPath: [], classificationStatus: 'not_applicable', sampleName: sample, sourceValue: s.value, unit: s.unit, status: s.status, presence: s.presence ?? 'present', criterionEvidence: { file: 'criteria.xlsx', sheet, cell: placed.at(r + 1, headers.indexOf('기준')), quote: s.rule }, valueEvidence: null });
    }
    // Add a visible administrative sheet and change sheet order. It is context, never a rule.
    if (variant === 'blocks-hidden') criteriaSheets.unshift({ name: '접수 안내', cells: [{ sheet: '접수 안내', cell: 'C19', quote: '접수번호 및 담당 부서 기록' }] });
    const targetRows = [['시료명', '항목', '결과', '단위', '조건'], ...specs.map(s => [sample, s.label, s.value, s.unit, variant === 'condition-mismatch' && s === specs[0] ? '습윤' : s.condition])];
    const targetFile = variant === 'csv' ? 'target.csv' : 'target.xlsx', targetSheet = variant === 'csv' ? '' : targetName;
    const target = place(targetSheet, targetRows, variant === 'transpose' ? { row: 7, column: 8, transpose: true } : {});
    for (const [r, s] of specs.entries()) { const e = expected.find(e => e.criterionLabel === s.label); e.valueEvidence = { file: targetFile, sheet: targetSheet, cell: target.at(r + 1, 2), quote: s.value }; }
    const criteriaBytes = workbook(criteriaSheets), targetBytes = variant === 'csv' ? Buffer.from('\uFEFF' + targetRows.map(row => row.map(s => `"${String(s).replaceAll('"', '""')}"`).join(',')).join('\r\n')) : workbook([{ name: targetName, cells: target.cells }]);
    await writeFile(path.join(dir, 'criteria.xlsx'), criteriaBytes); await writeFile(path.join(dir, targetFile), targetBytes);
    const documents = [{ file: 'criteria.xlsx', role: 'criteria', sha256: sha256(criteriaBytes) }, { file: targetFile, role: 'target', sha256: sha256(targetBytes) }];
    const sources = [...criteriaSheets.flatMap(s => s.cells.map(c => ({ ...c, file: 'criteria.xlsx' }))), ...target.cells.map(c => ({ ...c, file: targetFile }))];
    cases.push({ id, variant, inputDirectory: `inputs/${id}`, request: { schemaVersion: '1.0', documents, criteriaText: '기준서의 필수 항목을 모든 시료와 대조하세요. 비고는 판정 조건에서 제외합니다. 기준에는 유형 구분이 없습니다.' }, expected, sources });
  }
  const oracle = { schemaVersion: '1.0', purpose: 'evaluator-only synthetic expectations; never pass to application/model', seed, generatedAt: new Date().toISOString(), cases };
  await writeFile(path.join(output, 'oracle.json'), JSON.stringify(oracle, null, 2));
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ schemaVersion: '1.0', seed, cases: cases.map(({ id, variant, inputDirectory, request }) => ({ id, variant, inputDirectory, request })) }, null, 2));
  return oracle;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2]; if (!out) { console.error('Usage: node fixture-generator.mjs OUTPUT_DIRECTORY [SEED]'); process.exitCode = 2; }
  else { const suite = await generateSuite(out, process.argv[3]); console.log(JSON.stringify({ generatedCases: suite.cases.length, output: path.resolve(out), appExecuted: false })); }
}

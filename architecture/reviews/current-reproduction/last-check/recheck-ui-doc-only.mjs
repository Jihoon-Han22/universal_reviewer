// Independently implemented only from architecture/ui/detail-controls.md D3.2.1.
// Never imports application source or authors' verification scripts.
import { readFileSync } from 'node:fs';
import { deepStrictEqual } from 'node:assert';
const record = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const plain = v => typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
const first = (obj, keys) => keys.map(key => obj[key]).find(v => v !== null && v !== undefined);
function parts(value) {
  const root = record(value);
  const sheets = first(root, ['sheets', 'worksheets', 'sheetInventory']);
  const pages = first(root, ['pages', 'pageInventory']);
  const entries = Array.isArray(value) ? value : Array.isArray(sheets) ? sheets : Array.isArray(pages) ? pages : [];
  return entries.map((entry, i) => {
    if (typeof entry === 'string') return { name: entry, description: '', ...(Array.isArray(sheets) ? { sheet: entry } : {}) };
    const item = record(entry);
    const sheet = plain(first(item, ['sheet', 'sheetName', 'name']));
    const pv = first(item, ['page', 'pageNumber', 'number']);
    const page = typeof pv === 'number' ? pv : Array.isArray(pages) ? i + 1 : undefined;
    const range = plain(first(item, ['range', 'usedRange', 'dimension', 'dimensions']));
    const rows = plain(first(item, ['rows', 'rowCount', 'maxRow', 'max_row']));
    const cols = plain(first(item, ['columns', 'columnCount', 'maxColumn', 'max_column']));
    const name = plain(first(item, ['title', 'name', 'sheet', 'sheetName'])) || (page ? page + '페이지' : '영역 ' + (i + 1));
    const description = [rows && rows + '행', cols && cols + '열', range,
      Array.isArray(item.regions) && item.regions.length + '개 영역',
      typeof item.mergedRangeCount === 'number' && item.mergedRangeCount > 0 && `병합 ${item.mergedRangeCount}곳`,
      (item.hidden === true || ['hidden', 'veryHidden'].includes(item.state)) && '숨김 시트',
      typeof item.rotation === 'number' && item.rotation !== 0 && `회전 ${item.rotation}°`,
    ].filter(Boolean).join(' · ');
    return { name, description, ...(Array.isArray(sheets) && sheet ? { sheet } : {}), ...(page ? { page } : {}), ...(range ? { range } : {}) };
  });
}
function groups(analysis) {
  const key = v => v.sheet ? 'sheet:' + v.sheet : v.page ? 'page:' + v.page : 'document';
  const map = new Map();
  for (const part of parts(analysis.inventory)) map.set(key(part), { ...part, id: key(part), regions: [] });
  for (const region of analysis.structure || []) {
    const id = key(region);
    if (!map.has(id)) map.set(id, { id, name: region.sheet || (region.page ? region.page + '페이지' : '문서 전체'), description: '', sheet: region.sheet, page: region.page, regions: [] });
    const group = map.get(id);
    if (analysis.transcription && region.kind === 'text' && region.page && region.name === region.page + '쪽') group.description = [group.description, region.description].filter(Boolean).join(' · ');
    else group.regions.push(region);
  }
  return JSON.parse(JSON.stringify([...map.values()]));
}
const fixture = JSON.parse(readFileSync('architecture/ui/document-analysis-structure-cases.json', 'utf8'));
for (const test of fixture.cases) deepStrictEqual(groups(test.input), test.expected, test.id);
const original = [
  { inventory: { sheets: [{ name: 'B', state: 'visible', maxRow: 1, maxColumn: 1 }, { name: 'A', state: 'visible', maxRow: 1, maxColumn: 1 }] }, structure: [{ sheet: 'A' }, { sheet: 'B' }] },
  { inventory: { sheets: [{ name: '빈표', state: 'visible', maxRow: 1, maxColumn: 1 }, { name: '검사', state: 'visible', maxRow: 1, maxColumn: 1 }] }, structure: [{ sheet: '검사' }] },
];
deepStrictEqual(original.map(input => groups(input).map(v => v.id)), [['sheet:B', 'sheet:A'], ['sheet:빈표', 'sheet:검사']]);
console.log(JSON.stringify({ method: 'independent-code-from-prose', sourceRead: false, fixtureCasesPassed: fixture.cases.length, originalCounterexamplesResolved: 2, originalOrders: original.map(input => groups(input).map(v => v.id)), browserExecuted: false }));

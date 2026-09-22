// Two candidate implementations of the documented profileSource layout.
// This reads no application source and contacts no provider.
const inventory = {
  sheetCount: 1,
  definedNames: Array.from({ length: 500 }, (_, i) => ({
    name: `N${String(i + 1).padStart(3, '0')}`,
    reference: `S!${String.fromCharCode(65 + i % 26)}1`,
  })),
};
for (const [rows, charsPerCell] of [[4, 30500], [40, 29300]]) {
  const textChars = rows * charsPerCell;
  const coverage = { complete: true, unitsTotal: 1, unitsRead: 1, cellsTotal: rows,
    cellsRead: rows, textChars, truncated: false, truncatedReasons: [] };
  for (const indent of [0, 2]) {
    const json = value => JSON.stringify(value, null, indent);
    const source = [
      'SANDBOX_READER: original bytes physically opened in E2B',
      `INVENTORY: ${json(inventory)}`,
      `READ_COVERAGE: ${json(coverage)}`,
      `SHEET "S" state=visible size=${rows}x1`,
      'MERGED_RANGES []',
      'HIDDEN_ROWS [] HIDDEN_COLUMNS []',
      `SHEET_METADATA ${json({ autoFilter: null, tables: [], headersFooters: { header: '', footer: '' }, imageInventory: [] })}`,
      ...Array.from({ length: rows }, (_, i) => `XLSX_ROW ${i + 1} | "S"!A${i + 1}: ${JSON.stringify('x'.repeat(charsPerCell))}`),
    ].join('\n');
    console.log(JSON.stringify({ rows, charsPerCell, textChars, indent, sourceChars: source.length,
      contextSegmentsTotal: Math.ceil(Math.min(source.length, 1200000) / 150000),
      sourceTruncated: source.length > 1200000 }));
  }
}

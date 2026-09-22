/** Source-grounded G04 workbook probes. Injected transports are offline replay, never provider evidence. */
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const clone = value => structuredClone(value);
const assertion = (name, pointer, expected) => ({ name, pointer, expected });
const project = (rows, keys) => rows.map(row => Object.fromEntries(keys.map(key => [key, row[key]])));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const column = number => { let result = ''; for (; number; number = Math.floor((number - 1) / 26)) result = String.fromCharCode(65 + (number - 1) % 26) + result; return result; };
const cite = (sheet, cell, quote, extra = {}) => ({ sheet, cell, quote, ...extra });
const baseCandidate = extra => ({ label: 'Flux cohesion', rule: '17 이상', unit: 'MPa', conditions: [], scope: '', categoryPath: [], hierarchyCitations: [], sampleName: '', sampleCitations: [], classificationStatus: 'not_applicable', unitCitations: [], conditionCitations: [], scopeCitations: [], needsConfirmation: false, ...extra });
const serializeSource = source => ({ ...source, records: [...source.records] });

function source(entries, sheet = 'Rules', region = 'A1:H6') {
  return { document: { id: 'synthetic-workbook', name: 'arbitrary-name.xlsx', kind: 'xlsx' },
    inventory: { complete: true, warnings: [], sheets: [{ name: sheet, complete: true, images: 0, regions: [{ id: 's1-r1', range: region }] }] },
    records: new Map(entries.map(([cell, text, extra = {}]) => [sheet + '\0' + cell, { cell, text, styleId: 0, hiddenRow: false, hiddenColumn: false, ...extra }])) };
}
function basicSource() {
  return source([['A1', '항목'], ['B1', '기준'], ['C1', '단위'], ['D1', '적용 범위'], ['A2', 'Flux cohesion'], ['B2', '17 이상'], ['C2', 'MPa']]);
}
function basicCandidate(extra = {}) {
  return baseCandidate({ citations: [cite('Rules', 'A2', 'Flux cohesion'), cite('Rules', 'B2', '17 이상')], unitCitations: [cite('Rules', 'C2', 'MPa')], ...extra });
}
function basicAssessments() { return [{ id: 's1-r1', classification: 'criteria', criterionCells: ['B2'], reason: 'Actual source requirement', evidence: [cite('Rules', 'B2', '17 이상')] }]; }

export async function createWorkbookProbeCatalog(root) {
  root = path.resolve(root);
  const module = filename => import(pathToFileURL(path.join(root, filename)).href);
  const { validateWorkbookDiscovery } = await module('server/criteria-workbook-validation.mjs');
  const { discoverWorkbookCriteria } = await module('server/criteria-sandbox.mjs');
  const probes = new Map();
  const define = (id, inputs, assertions, run) => probes.set(id, { id, inputs, assertions, run });
  const validate = (input, proposals, assessments = basicAssessments()) => validateWorkbookDiscovery({ ...input, proposals, regionAssessments: assessments, dispositions: [] });

  const sessionCases = [false, true].flatMap(cached => ['repair-complete', 'still-unresolved'].map(mode => ({ cached, mode })));
  define('workbook.sessions', { cases: sessionCases, transport: 'instrumented offline replay', contract: '03 §11.1–11.2; 07 §7.10' }, [
    assertion('One dedicated discovery lifetime and pinned install for both rounds', '/projection', sessionCases.map(input => ({ ...input, sessions: 1, installs: 1, inventoryCommands: input.cached ? 0 : 1, detailCommands: 2, workbookWrites: 1, profileWrites: 1, requests: 3, rounds: 2, cellsRead: 4, requestedArea: 8, complete: input.mode === 'repair-complete', timeout: 300000, ended: true, allCommandsSameSession: true })))
  ], async () => {
    const rows = [];
    for (const input of sessionCases) {
      const inventory = { complete: true, warnings: [], sheets: [{ name: 'Rules', complete: true, images: 0, regions: [{ id: 's1-r1', range: 'A1:B2', nonEmptyCells: 4, sample: [], sampleOnly: false }] }] };
      const cells = [{ cell: 'A1', text: '항목' }, { cell: 'B1', text: '기준' }, { cell: 'A2', text: 'Appearance' }, { cell: 'B2', text: 'No visible split' }];
      const candidate = baseCandidate({ label: 'Appearance', rule: 'No visible split', unit: '', citations: [cite('Rules', 'A2', 'Appearance'), cite('Rules', 'B2', 'No visible split')] });
      const document = { id: 'synthetic-workbook', name: 'session-probe.xlsx', kind: 'xlsx', buffer: Buffer.from('declared offline transport bytes'), ...(input.cached ? { sandboxProfile: { criteriaInventory: clone(inventory) } } : {}) };
      const files = new Map(), writes = [], commands = [], requests = [], responses = [], lifetime = []; let sessions = 0, optionsSeen, ended = false;
      const output = await discoverWorkbookCriteria(document, {
        withSandbox: async (work, options) => {
          sessions++; optionsSeen = { timeoutMs: options.timeoutMs, activity: options.activity }; const sessionId = 'discovery-' + sessions;
          lifetime.push({ event: 'open', sessionId }); const report = () => {}; report.taskId = sessionId;
          try { return await work({ files: {
            write: async (filename, data) => { for (const entry of Array.isArray(filename) ? filename : [{ path: filename, data }]) { files.set(entry.path, entry.data); writes.push({ path: entry.path, sessionId, ...(typeof entry.data === 'string' ? { data: entry.data } : { bytes: entry.data.byteLength, sha256: sha256(Buffer.from(entry.data)) }) }); } },
            read: async filename => {
              if (filename.endsWith('inventory.json')) return JSON.stringify(inventory);
              if (filename.endsWith('details.json')) return JSON.stringify({ complete: true, cellsRead: 4, ranges: JSON.parse(files.get('/home/user/trace-criteria/request.json')).ranges.map(range => ({ ...range, cells, truncated: false })) });
              throw new Error('Unexpected offline file');
            }
          }, commands: { run: async (command, options) => { commands.push({ command, sessionId, timeoutMs: options.timeoutMs, requestTimeoutMs: options.requestTimeoutMs }); return { exitCode: 0, stdout: '', stderr: '' }; } } }, report); }
          finally { ended = true; lifetime.push({ event: 'close', sessionId }); }
        },
        gemini: { generateJson: async request => {
          requests.push({ ...request, signal: undefined });
          const data = request.role === 'explore' ? { ranges: [], regions: [], warnings: [] } : {
            criteria: requests.length === 3 && input.mode === 'repair-complete' ? [candidate] : [], followUpRanges: [], warnings: [], dispositions: [],
            regionAssessments: [{ id: 's1-r1', classification: 'criteria', criterionCells: ['B2'], reason: 'Actual qualitative requirement', evidence: [cite('Rules', 'B2', 'No visible split')] }]
          }; responses.push(clone(data)); return { data };
        } }
      });
      rows.push({ ...input, document: { ...document, buffer: { bytes: document.buffer.length, sha256: sha256(document.buffer) } }, inventory, cells, candidate, requestsRaw: requests, responses, writes, commands, lifetime, optionsSeen, output,
        sessions, installs: commands.filter(row => row.command.includes('pip install')).length, inventoryCommands: commands.filter(row => row.command.includes(' inventory ')).length,
        detailCommands: commands.filter(row => row.command.includes(' read ')).length, workbookWrites: writes.filter(row => row.path.endsWith('workbook.xlsx')).length,
        profileWrites: writes.filter(row => row.path.endsWith('profile.py')).length, requests: requests.length, rounds: output.coverage.rounds,
        cellsRead: output.coverage.cellsRead, requestedArea: output.coverage.requestedArea, complete: output.coverage.extractedCriteriaComplete,
        timeout: optionsSeen.timeoutMs, ended, allCommandsSameSession: new Set(commands.map(row => row.sessionId)).size === 1 });
    }
    return { rows, projection: project(rows, ['cached', 'mode', 'sessions', 'installs', 'inventoryCommands', 'detailCommands', 'workbookWrites', 'profileWrites', 'requests', 'rounds', 'cellsRead', 'requestedArea', 'complete', 'timeout', 'ended', 'allCommandsSameSession']), provenance: { origin: 'actual-product-with-offline-transport', physicalSandbox: false, earlierGenericAnalysisNotExecutedHere: true } };
  });

  const transformCases = ['baseline', 'renamed', 'shifted', 'transposed', 'hidden', 'adjacent', 'novel-type', 'two-levels', 'notes-conditions-swapped', 'different-unit'];
  define('workbook.transforms', { cases: transformCases, contract: '03 §9, §11.3; CORE-08-C05; CORE-09-C05', source: 'generated editable cells, no dataset/oracle' }, [
    assertion('Structural changes preserve source-grounded requirements and coverage', '/projection', transformCases.map(id => ({ id, count: id === 'adjacent' ? 4 : 3, numericValues: id === 'adjacent' ? [17, 29, 43] : [17, 29], conditions: [['7일'], ['28일']], qualitative: true, omitted: 0, unresolved: 0, regionProblems: 0, groundedCoordinates: true, noInventedSubtype: true, units: id === 'different-unit' ? ['kPa', 'kPa'] : ['MPa', 'MPa'] })))
  ], async () => {
    const rows = [];
    for (const id of transformCases) {
      const sheet = id === 'renamed' ? 'Untitled Ω 2026' : 'Rules', label = id === 'renamed' ? 'Previously unseen metric ζ' : 'Flux cohesion';
      const rowOffset = id === 'shifted' ? 7 : 0, columnOffset = id === 'shifted' ? 4 : 0, transposed = id === 'transposed', hidden = id === 'hidden';
      const depth = id === 'two-levels' ? 2 : id === 'novel-type' ? 1 : 0;
      const addr = (row, col) => column((transposed ? row : col) + columnOffset) + ((transposed ? col : row) + rowOffset);
      const entries = [], put = (row, col, text, extra = {}) => entries.push([addr(row, col), text, { hiddenRow: hidden, hiddenColumn: hidden, ...extra }]);
      const header = depth + 1, unit = id === 'different-unit' ? 'kPa' : 'MPa', conditionCol = id === 'notes-conditions-swapped' ? 5 : 4, notesCol = id === 'notes-conditions-swapped' ? 4 : 5;
      const pathNames = ['Uncatalogued alloy Ω', 'Subtype Lambda'];
      for (let level = 0; level < depth; level++) put(level + 1, 1, pathNames[level], { mergedRange: addr(level + 1, 1) + ':' + addr(level + 1, 5), styleId: level + 1 });
      for (const [col, text] of [[1, '항목'], [2, '기준'], [3, '단위'], [conditionCol, '시험조건'], [notesCol, '비고']]) put(header, col, text);
      const proposals = [], ruleCells = [];
      for (const [index, rule, condition] of [[1, '17 이상', '7일'], [2, '29 이하', '28일'], [3, 'No visible split', '']]) {
        const row = header + index, actualLabel = index === 3 ? 'Surface appearance' : label;
        put(row, 1, actualLabel); put(row, 2, rule); put(row, 3, index === 3 ? '' : unit); put(row, conditionCol, condition); put(row, notesCol, '>= 999 Reference only');
        ruleCells.push(addr(row, 2));
        proposals.push(baseCandidate({ label: actualLabel, rule, unit: index === 3 ? '' : unit, conditions: condition ? [condition] : [],
          citations: [cite(sheet, addr(row, 1), actualLabel), cite(sheet, addr(row, 2), rule)], unitCitations: index === 3 ? [] : [cite(sheet, addr(row, 3), unit)],
          conditionCitations: condition ? [cite(sheet, addr(row, conditionCol), condition)] : [], categoryPath: pathNames.slice(0, depth),
          hierarchyCitations: pathNames.slice(0, depth).map((name, level) => cite(sheet, addr(level + 1, 1), name, { level, relation: transposed ? 'row-header' : 'section-header' })), classificationStatus: depth ? 'resolved' : 'not_applicable' }));
      }
      if (id === 'adjacent') {
        put(header, 7, '항목'); put(header, 8, '기준'); put(header + 1, 7, 'Independent neighbouring metric'); put(header + 1, 8, '43 이상');
        proposals.push(baseCandidate({ label: 'Independent neighbouring metric', rule: '43 이상', unit: '', citations: [cite(sheet, addr(header + 1, 7), 'Independent neighbouring metric'), cite(sheet, addr(header + 1, 8), '43 이상')] }));
        ruleCells.push(addr(header + 1, 8));
      }
      const lastCol = id === 'adjacent' ? 8 : 5;
      const input = source(entries, sheet, addr(1, 1) + ':' + addr(header + 3, lastCol)); input.document.name = id === 'renamed' ? 'renamed-no-case-id.xlsx' : 'arbitrary-name.xlsx';
      const assessments = [{ id: 's1-r1', classification: 'criteria', criterionCells: ruleCells, reason: 'Source contains all declared requirements', evidence: [cite(sheet, addr(header + 1, 2), '17 이상')] }];
      const output = validate(input, proposals, assessments), criteria = output.criteria;
      rows.push({ id, input: serializeSource(input), proposals, assessments, output, count: criteria.length, numericValues: criteria.filter(c => c.comparison).map(c => c.comparison.value),
        conditions: criteria.filter(c => c.label === label).map(c => c.conditions), qualitative: criteria.some(c => c.label === 'Surface appearance' && !c.comparison && !c.needsConfirmation),
        omitted: output.omitted.length, unresolved: output.unresolved.length, regionProblems: output.regionProblems.length,
        groundedCoordinates: criteria.every(c => c.evidenceCells.every(e => input.records.has(e.sheet + '\0' + e.cell))),
        noInventedSubtype: criteria.every(c => JSON.stringify(c.categoryPath) === JSON.stringify(pathNames.slice(0, depth))), units: criteria.filter(c => c.label === label).map(c => c.comparison?.unit ?? null) });
    }
    return { rows, projection: project(rows, ['id', 'count', 'numericValues', 'conditions', 'qualitative', 'omitted', 'unresolved', 'regionProblems', 'groundedCoordinates', 'noInventedSubtype', 'units']) };
  });

  const classificationCases = [
    ['sample-grounded', 'Specimen Ω', 'resolved', false, [], false],
    ['sample-absent', null, 'ambiguous', true, [], false],
    ['sample-comment-only', null, 'ambiguous', true, [], false],
    ['shared-grounded', null, 'not_applicable', false, [], true],
    ['shared-ungrounded', null, 'not_applicable', true, [], true],
    ['merged-document-heading', null, 'resolved', false, ['Unlisted parent Ω'], false],
    ['unmerged-document-heading', null, 'ambiguous', true, ['Unlisted parent Ω'], false],
    ['lookup-heading', null, 'ambiguous', true, ['Unlisted parent Ω'], false],
    ['comment-heading', null, 'ambiguous', true, [], false]
  ];
  define('workbook.contextClassification', { cases: classificationCases.map(([id]) => id), contract: '03 §11.3 sample, shared scope and heading geometry' }, [
    assertion('Actual body citations and source geometry control classification', '/projection', classificationCases.map(([id, sampleName, classificationStatus, needsConfirmation, categoryPath, sharedScope]) => ({ id, sampleName, classificationStatus, needsConfirmation, categoryPath, sharedScope })))
  ], async () => {
    const rows = [];
    for (const [id] of classificationCases) {
      let input = basicSource(), proposal = basicCandidate(), assessments = basicAssessments();
      if (id.startsWith('sample')) {
        input.records.set('Rules\0E2', { cell: 'E2', text: id === 'sample-comment-only' ? 'Record ID' : 'Specimen Ω', ...(id === 'sample-comment-only' ? { comment: 'Specimen Ω' } : {}) });
        proposal = basicCandidate({ sampleName: 'Specimen Ω', classificationStatus: 'resolved', sampleCitations: id === 'sample-absent' ? [] : [cite('Rules', 'E2', 'Specimen Ω')] });
      } else if (id.startsWith('shared')) {
        input.records.set('Rules\0D2', { cell: 'D2', text: id === 'shared-grounded' ? '전체 공통' : 'Specific material' });
        proposal = basicCandidate({ sharedScope: true, scope: id === 'shared-grounded' ? '전체 공통' : 'Specific material', scopeCitations: [cite('Rules', 'D2', id === 'shared-grounded' ? '전체 공통' : 'Specific material')] });
      } else {
        input = source([['A1', id === 'comment-heading' ? 'Cover heading' : 'Unlisted parent Ω', { ...(id === 'merged-document-heading' ? { mergedRange: 'A1:D1' } : {}), ...(id === 'comment-heading' ? { comment: 'Unlisted parent Ω' } : {}) }], ['A2', '항목'], ['B2', '기준'], ['C2', '단위'], ['A3', 'Flux cohesion'], ['B3', '17 이상'], ['C3', 'MPa']]);
        proposal = basicCandidate({ citations: [cite('Rules', 'A3', 'Flux cohesion'), cite('Rules', 'B3', '17 이상')], unitCitations: [cite('Rules', 'C3', 'MPa')], categoryPath: ['Unlisted parent Ω'], classificationStatus: 'resolved', hierarchyCitations: [cite('Rules', 'A1', 'Unlisted parent Ω', { level: 0, relation: id === 'lookup-heading' ? 'lookup' : 'section-header' })] });
        assessments = [{ ...basicAssessments()[0], criterionCells: ['B3'], evidence: [cite('Rules', 'B3', '17 이상')] }];
      }
      const output = validate(input, [proposal], assessments), criterion = output.criteria[0];
      rows.push({ id, input: serializeSource(input), proposal, assessments, output, sampleName: criterion?.sampleName ?? null, classificationStatus: criterion?.classificationStatus ?? null,
        needsConfirmation: criterion?.needsConfirmation ?? null, categoryPath: criterion?.categoryPath ?? null, sharedScope: criterion?.sharedScope ?? false });
    }
    return { rows, projection: project(rows, ['id', 'sampleName', 'classificationStatus', 'needsConfirmation', 'categoryPath', 'sharedScope']) };
  });

  define('workbook.rawJsonLimit', { lengths: [1500000, 1500001], contract: '03 §11.1 Node raw JSON cap', measurement: 'JavaScript UTF-16 raw.length; valid JSON padded with spaces' }, [
    assertion('Node JSON admission cap is separate from Python unique record budget', '/projection', [{ length: 1500000, accepted: true, code: null, modelCalls: 2 }, { length: 1500001, accepted: false, code: 'CRITERIA_SANDBOX_LIMIT', modelCalls: 0 }])
  ], async () => {
    const rows = [];
    for (const length of [1500000, 1500001]) {
      const inventory = { complete: true, warnings: [], sheets: [{ name: 'Rules', complete: true, images: 0, regions: [{ id: 's1-r1', range: 'A1:B2' }] }] };
      const serialized = JSON.stringify(inventory), raw = serialized + ' '.repeat(length - serialized.length), files = new Map(), requests = [], commands = [];
      let result;
      try {
        const output = await discoverWorkbookCriteria({ id: 'd', name: 'raw-json.xlsx', kind: 'xlsx', buffer: Buffer.from('offline transport bytes') }, {
          withSandbox: async work => { const report = () => {}; return work({ files: {
            write: async (filename, data) => { for (const entry of Array.isArray(filename) ? filename : [{ path: filename, data }]) files.set(entry.path, entry.data); },
            read: async filename => filename.endsWith('inventory.json') ? raw : JSON.stringify({ complete: true, cellsRead: 4, ranges: JSON.parse(files.get('/home/user/trace-criteria/request.json')).ranges.map(range => ({ ...range, truncated: false, cells: [{ cell: 'A1', text: '항목' }, { cell: 'B1', text: '기준' }, { cell: 'A2', text: 'Appearance' }, { cell: 'B2', text: 'No visible split' }] })) })
          }, commands: { run: async command => { commands.push(command); return { exitCode: 0, stdout: '', stderr: '' }; } } }, report); },
          gemini: { generateJson: async request => { requests.push({ ...request, signal: undefined }); return { data: request.role === 'explore' ? { ranges: [], regions: [], warnings: [] } : {
            criteria: [baseCandidate({ label: 'Appearance', rule: 'No visible split', unit: '', citations: [cite('Rules', 'A2', 'Appearance'), cite('Rules', 'B2', 'No visible split')] })], followUpRanges: [], warnings: [], dispositions: [],
            regionAssessments: [{ id: 's1-r1', classification: 'criteria', criterionCells: ['B2'], reason: 'Source appearance rule', evidence: [cite('Rules', 'B2', 'No visible split')] }]
          } }; } }
        });
        result = { accepted: true, output };
      } catch (error) { result = { accepted: false, error: { name: error.name, code: error.code, message: error.message } }; }
      rows.push({ length, input: { inventory, rawConstruction: { baseJson: serialized, suffix: 'space', suffixCount: length - serialized.length, utf16Length: raw.length, sha256: sha256(raw) } }, result, requests, commands, accepted: result.accepted, code: result.error?.code ?? null, modelCalls: requests.length });
    }
    return { rows, projection: project(rows, ['length', 'accepted', 'code', 'modelCalls']) };
  });

  const noteCases = ['28일', '24시간', '20°C'].flatMap(condition => ['condition', 'note', 'both'].map(location => ({ id: location + ':' + condition, condition, location })));
  define('workbook.notes', { cases: noteCases, additional: ['rule-comment', 'note-comment-candidate', 'note-only-candidate'], contract: '03 note policy and §11.3 actual text/comment citation grounding' }, [
    assertion('Only actual condition authority survives; threshold comments retain the documented citation allowance', '/projection', [
      ...noteCases.map(({ id, condition, location }) => ({ id, count: 1, conditions: location === 'note' ? [] : [condition], comparison: 17, needsConfirmation: false, ignoredNotes: location === 'condition' ? 0 : 1, noteEvidenceRetained: false })),
      { id: 'rule-comment', count: 1, conditions: [], comparison: 17, needsConfirmation: false, ignoredNotes: 0, noteEvidenceRetained: false },
      ...['note-comment-candidate', 'note-only-candidate'].map(id => ({ id, count: 0, conditions: null, comparison: null, needsConfirmation: null, ignoredNotes: 0, noteEvidenceRetained: false }))
    ])
  ], async () => {
    const rows = [];
    for (const item of [...noteCases, ...['rule-comment', 'note-comment-candidate', 'note-only-candidate'].map(id => ({ id }))]) {
      const entries = [['A1', '항목'], ['B1', '기준'], ['C1', '단위'], ['D1', '시험조건'], ['E1', '비고'], ['A2', 'Flux cohesion'], ['B2', '17 이상'], ['C2', 'MPa']];
      let proposal = basicCandidate(), assessments = basicAssessments();
      if (item.condition) {
        const hasCondition = item.location !== 'note', hasNote = item.location !== 'condition';
        entries.push(['D2', hasCondition ? item.condition : ''], ['E2', hasNote ? item.condition : 'Reference text']);
        if (hasNote) proposal = basicCandidate({ rule: '17 이상 (' + item.condition + ')', conditions: [item.condition], citations: [...basicCandidate().citations, cite('Rules', 'E2', item.condition)] });
      } else if (item.id === 'rule-comment') {
        entries.find(row => row[0] === 'B2')[1] = 'See source comment';
        entries.find(row => row[0] === 'B2')[2] = { comment: '17 이상' };
      } else {
        entries.find(row => row[0] === 'B2')[1] = '';
        entries.push(['E2', item.id === 'note-only-candidate' ? '17 이상' : 'Reference text', item.id === 'note-comment-candidate' ? { comment: '17 이상' } : {}]);
        proposal = basicCandidate({ unit: '', unitCitations: [], citations: [cite('Rules', 'A2', 'Flux cohesion'), cite('Rules', 'E2', '17 이상')] });
        assessments = [];
      }
      const input = source(entries), output = validate(input, [proposal], assessments), criterion = output.criteria[0];
      rows.push({ ...item, input: serializeSource(input), proposal, assessments, output, count: output.criteria.length, conditions: criterion?.conditions ?? null,
        comparison: criterion?.comparison?.value ?? null, needsConfirmation: criterion?.needsConfirmation ?? null, ignoredNotes: criterion?.ignoredSourceNotes.length ?? 0,
        noteEvidenceRetained: criterion?.evidenceCells.some(evidence => evidence.cell === 'E2') ?? false });
    }
    return { rows, projection: project(rows, ['id', 'count', 'conditions', 'comparison', 'needsConfirmation', 'ignoredNotes', 'noteEvidenceRetained']) };
  });

  const inventoryExpected = [
    ...[99, 100, 101].map(n => ({ id: 'sheets-' + n, accepted: true, complete: n <= 100, sheets: n, profiledCells: Math.min(n, 100), regions: Math.min(n, 100), regionsOmitted: 0 })),
    { id: 'sheets-tail', accepted: true, complete: false, sheets: 103, profiledCells: 100, regions: 100, regionsOmitted: 0 },
    { id: 'cells-200001', accepted: true, complete: false, sheets: 1, profiledCells: 200000, regions: 1, regionsOmitted: 0 },
    { id: 'cells-200000', accepted: true, complete: true, sheets: 1, profiledCells: 200000, regions: 1, regionsOmitted: 0 },
    ...[300, 301].map(n => ({ id: 'regions-' + n, accepted: true, complete: n === 300, sheets: 1, profiledCells: n, regions: 300, regionsOmitted: n - 300 })),
    { id: 'sample-49', accepted: true, complete: true, sheets: 1, profiledCells: 49, regions: 1, regionsOmitted: 0 },
    { id: 'far-cell-inventory', accepted: true, complete: true, sheets: 1, profiledCells: 2, regions: 2, regionsOmitted: 0 },
    ...['forward', 'reverse'].map(order => ({ id: 'sheet-order-' + order + '-inventory', accepted: true, complete: true, sheets: 2, profiledCells: 16, regions: 2, regionsOmitted: 0 }))
  ];
  define('workbook.pythonLimits', { contract: '03 §11.1–11.1a; 07 limit inventory', transport: 'actual pinned local Python and openpyxl 3.1.5', heavy: true,
    recipes: ['99/100/101 populated sheets; 103-sheet empty/populated/comment tail', '200000/200001 populated cells', '300/301 sparse regions', '49-cell ordered sample', '219999/220000/220001 record JSON characters', '6001 genuine small records; character guard dominance', '18/19 repeated ranges', '12000/12001 rectangle area'] }, [
    assertion('Inventory physical boundaries and metadata denominator', '/inventoryProjection', inventoryExpected),
    assertion('101st empty sheet remains complete; populated and comment sheets do not', '/tailProjection', [{ complete: true, profiledCells: 0, nonEmptyCells: 0 }, { complete: false, profiledCells: 0, nonEmptyCells: 1 }, { complete: false, profiledCells: 0, nonEmptyCells: 1 }]),
    assertion('Exact Python record character boundary', '/characterProjection', [{ id: 'characters-219999', complete: true, cellsRead: 60 }, { id: 'characters-220000', complete: true, cellsRead: 60 }, { id: 'characters-220001', complete: false, cellsRead: 59 }]),
    assertion('Detail request and rectangle boundaries', '/requestProjection', [{ id: 'ranges-18', accepted: true, complete: true, cellsRead: 1 }, { id: 'ranges-19', accepted: false }, { id: 'area-12000', accepted: true, complete: true, cellsRead: 1 }, { id: 'area-12001', accepted: false }]),
    assertion('Character cap dominates genuine 6001-cell read', '/characterCapDominates', true),
    assertion('Overlapping ranges do not double-charge unique record budget', '/overlapProjection', { complete: true, cellsRead: 50, returnedRecords: 100, responseExceeds220000: true }),
    assertion('Record text/comment truncation and formula prefix have distinct flags', '/recordProjection', [{ cell: 'A1', textLength: 4000, commentLength: 0, formulaLength: 0, truncated: true, uncachedFormula: false }, { cell: 'A2', textLength: 16, commentLength: 4000, formulaLength: 0, truncated: true, uncachedFormula: false }, { cell: 'A3', textLength: 21, commentLength: 0, formulaLength: 1000, truncated: false, uncachedFormula: true }]),
    assertion('Region sampling keeps 24 ordered real cells and sampleOnly', '/sampleProjection', { cells: [1,3,5,7,9,11,14,16,18,20,22,24,26,28,30,32,34,36,39,41,43,45,47,49].map(n => 'A' + n), sampleOnly: true, nonEmptyCells: 49 }),
    assertion('Far maximum-coordinate stored cells and style-only omission', '/farProjection', { sameInputBytes: true, dimensions: 'A1:XFD1048576', nonEmptyCells: 2, profiledCells: 2, regions: ['A1:A1', 'XFD1048576:XFD1048576'], complete: true, cellsRead: 2, records: [{ cell: 'A1', text: 'near-source' }, { cell: 'XFD1048576', text: 'far-source' }] }),
    assertion('Physical sheet order changes inventory IDs but preserves all grounded meanings', '/sheetOrderProjection', {
      order: [['Alpha requirements', 'Omega requirements'], ['Omega requirements', 'Alpha requirements']],
      ids: [['s1-r1', 's2-r1'], ['s1-r1', 's2-r1']], sameInputBytesPerOperation: true, sameSemanticSource: true,
      coverage: [{ omitted: 0, unresolved: 0, regionProblems: 0, contextProblems: 0, examinedRegions: 2, droppedCriteria: 0 }, { omitted: 0, unresolved: 0, regionProblems: 0, contextProblems: 0, examinedRegions: 2, droppedCriteria: 0 }],
      semantic: [
        { sheet: 'Alpha requirements', label: 'Flux cohesion', comparison: { operator: 'gte', value: 17, unit: 'MPa' }, conditions: ['7일'], needsConfirmation: false, coordinates: ['A2', 'B2', 'C2', 'D2'] },
        { sheet: 'Omega requirements', label: 'Bending limit', comparison: { operator: 'lte', value: 29, unit: 'kPa' }, conditions: ['24시간'], needsConfirmation: false, coordinates: ['A2', 'B2', 'C2', 'D2'] }
      ]
    }),
    assertion('Pinned openpyxl version', '/raw/runtime/openpyxl', '3.1.5')
  ], async () => {
    if (process.version !== 'v24.13.1') throw new Error('PINNED_NODE_24_13_1_REQUIRED');
    const directory = path.join(root, '.cache/rebuild/g04-workbook-python', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID());
    await mkdir(path.dirname(directory), { recursive: true });
    const executable = path.join(root, '.cache/rebuild/python/Scripts/python.exe');
    const command = [path.join(root, 'scripts/acceptance/g04-workbook-python-probes.py'), root, directory];
    const execution = await new Promise((resolve, reject) => {
      const child = spawn(executable, ['-B', ...command], { cwd: root, windowsHide: true, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
      child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    });
    if (execution.code !== 0) throw Object.assign(new Error('WORKBOOK_PHYSICAL_PROBE_FAILED'), { execution, artifactDirectory: directory });
    const bytes = await readFile(path.join(directory, 'actual.json')), raw = JSON.parse(bytes), byId = new Map(raw.rows.map(row => [row.id, row]));
    const tail = byId.get('sheets-tail').result.output.sheets.slice(100), detail = byId.get('cells-6001-detail'), sample = byId.get('sample-49').result.output.sheets[0].regions[0];
    const accounting = detail.independentRecordAccounting, overlap = byId.get('overlapping-ranges'), recordCaps = byId.get('record-caps').result.output;
    const farInventory = byId.get('far-cell-inventory'), farDetail = byId.get('far-cell-detail'), farSheet = farInventory.result.output.sheets[0];
    const sheetOrderRows = [];
    for (const order of ['forward', 'reverse']) {
      const inventoryRow = byId.get('sheet-order-' + order + '-inventory'), detailRow = byId.get('sheet-order-' + order + '-detail');
      const inventory = inventoryRow.result.output, details = detailRow.result.output, proposals = [], assessments = [];
      const records = new Map(details.ranges.flatMap(range => range.cells.map(cell => [range.sheet + '\0' + cell.cell, cell])));
      for (const sheet of inventory.sheets) {
        const value = address => records.get(sheet.name + '\0' + address).text;
        const citations = ['A2', 'B2'].map(cell => cite(sheet.name, cell, value(cell)));
        proposals.push(baseCandidate({ label: value('A2'), rule: value('B2'), unit: value('C2'), conditions: [], citations, unitCitations: [cite(sheet.name, 'C2', value('C2'))] }));
        assessments.push({ id: sheet.regions[0].id, classification: 'criteria', criterionCells: ['B2'], reason: 'Actual complete source requirement', evidence: [cite(sheet.name, 'B2', value('B2'))] });
      }
      const input = { document: { id: 'sheet-order-source', name: 'order-invariance.xlsx', kind: 'xlsx' }, inventory, records };
      const output = validate(input, proposals, assessments);
      const semantic = output.criteria.map(criterion => ({ sheet: criterion.evidenceCells[0].sheet, label: criterion.label, comparison: criterion.comparison,
        conditions: criterion.conditions, needsConfirmation: criterion.needsConfirmation, coordinates: criterion.evidenceCells.map(evidence => evidence.cell).sort() })).sort((a, b) => a.sheet.localeCompare(b.sheet, 'en'));
      sheetOrderRows.push({ order, input: serializeSource(input), proposals, assessments, output, semantic,
        sameInputBytes: inventoryRow.input.sha256 === detailRow.input.sha256,
        coverage: { omitted: output.omitted.length, unresolved: output.unresolved.length, regionProblems: output.regionProblems.length, contextProblems: output.contextProblems.length, examinedRegions: output.examinedRegions.length, droppedCriteria: output.droppedCriteria } });
    }
    return { raw, execution, artifact: { path: path.relative(root, path.join(directory, 'actual.json')).replaceAll('\\', '/'), sha256: sha256(bytes) },
      inventoryProjection: raw.projection.filter(row => Object.hasOwn(row, 'sheets')),
      tailProjection: tail.map(({ complete, profiledCells, nonEmptyCells }) => ({ complete, profiledCells, nonEmptyCells })),
      characterProjection: raw.projection.filter(row => row.id.startsWith('characters-')).map(({ id, complete, cellsRead }) => ({ id, complete, cellsRead })),
      requestProjection: raw.projection.filter(row => row.id.startsWith('ranges-') || row.id.startsWith('area-')),
      characterCapDominates: detail.result.output.complete === false && detail.result.output.cellsRead < 6000 && accounting.retainedCharacters <= 220000 && accounting.plusNextCharacters > 220000 && accounting['6000MinimumCharacters'] > 220000,
      overlapProjection: { complete: overlap.result.output.complete, cellsRead: overlap.result.output.cellsRead, returnedRecords: overlap.result.output.ranges.reduce((sum, range) => sum + range.cells.length, 0), responseExceeds220000: overlap.responseCharacters > 220000 },
      recordProjection: recordCaps.ranges[0].cells.map(cell => ({ cell: cell.cell, textLength: [...cell.text].length, commentLength: [...(cell.comment ?? '')].length, formulaLength: (cell.formula ?? '').length, truncated: cell.truncated === true, uncachedFormula: cell.uncachedFormula === true })),
      sampleProjection: { cells: sample.sample.map(cell => cell.cell), sampleOnly: sample.sampleOnly, nonEmptyCells: sample.nonEmptyCells },
      farProjection: { sameInputBytes: farInventory.input.sha256 === farDetail.input.sha256, dimensions: farSheet.dimensions, nonEmptyCells: farSheet.nonEmptyCells, profiledCells: farSheet.profiledCells,
        regions: farSheet.regions.map(region => region.range), complete: farInventory.result.output.complete && farDetail.result.output.complete, cellsRead: farDetail.result.output.cellsRead,
        records: farDetail.result.output.ranges.flatMap(range => range.cells.map(({ cell, text }) => ({ cell, text }))) },
      sheetOrderRows,
      sheetOrderProjection: { order: sheetOrderRows.map(row => row.input.inventory.sheets.map(sheet => sheet.name)), ids: sheetOrderRows.map(row => row.input.inventory.sheets.flatMap(sheet => sheet.regions.map(region => region.id))),
        sameInputBytesPerOperation: sheetOrderRows.every(row => row.sameInputBytes), sameSemanticSource: JSON.stringify(sheetOrderRows[0].semantic) === JSON.stringify(sheetOrderRows[1].semantic),
        coverage: sheetOrderRows.map(row => row.coverage), semantic: sheetOrderRows[0].semantic } };
  });
  return probes;
}

import { compact, literalIncludes, structuredTables, nativeCriteriaCitation, addressOf, parseRange, textOf } from './table-records.mjs';
import { sourceEvidenceVerified } from './criterion-applicability.mjs';
import { parseRule } from './criteria-normalization.mjs';
const durationPattern = /([+-]?\d+(?:\.\d+)?)\s*(일령|일|days?|시간|hours?|hrs?|주|weeks?|개월|months?|년|years?|분|minutes?|초(?!과)|seconds?)/gi;
const durationUnit = unit => /^(일령|일|day)/i.test(unit) ? 'day' : /^(시간|hour|hr)/i.test(unit) ? 'hour' : /^(주|week)/i.test(unit) ? 'week' : /^(개월|month)/i.test(unit) ? 'month' : /^(년|year)/i.test(unit) ? 'year' : /^(분|minute)/i.test(unit) ? 'minute' : 'second';
export const durationTokens = text => [...String(text).matchAll(durationPattern)].map(m => `${Number(m[1])} ${durationUnit(m[2])}`);
const universal = value => /모든\s*거래|전체\s*문서|각\s*항목|all\s*records|every\s*row/i.test(value);
export function verifyConditions(criterion, evidence, document) {
  const conditions = (criterion.conditions ?? []).filter(c => !universal(c));
  const quotes = (evidence ?? []).filter(e => sourceEvidenceVerified(document, e, { wholeRow: true, visual: false, conditions: true })).map(e => e.quote);
  const missingConditions = conditions.filter(condition => {
    const tokens = durationTokens(condition);
    const relation = /이상|이하|초과|미만|이내|전|후|before|after|within|at least|between|[~–<>≤≥]/i.test(condition);
    if (tokens.length === 1 && !relation && compact(condition.replace(durationPattern, '')) === '') return !quotes.some(q => durationTokens(q).includes(tokens[0]));
    return !quotes.some(q => literalIncludes(q, condition));
  });
  return { verified: missingConditions.length === 0, missingConditions };
}
const ITEM = /^(항목|시험항목|검사항목|검토항목|측정항목|항목명|시험명|물성|item|testitem|parameter|test)$/;
const NOTE = /^(비고|참고|notes?|remarks?)$/;
const CONDITION = /^(조건|적용조건|시험조건|재령|기간|conditions?|testconditions|age|duration|온도|temperature)$/;
const RULE = /^(기준|품질기준|판정기준|관리기준|허용기준|허용값|허용치|한계|기준값|규격|허용조건|specification|requirement|criterion|criteria|limit)$/;
const RESULT = /^(측정값|측정결과|시험값|시험결과|추출값|보고값|결과|실측값|판정|근거|메모|results|measurements|actual|verdict|evidence)$/;
export function tableRole(value) { const v = compact(value).replace(/\([^()]*\)$/, ''); return NOTE.test(v) ? 'note' : RESULT.test(v) ? 'result' : ITEM.test(v) ? 'item' : CONDITION.test(v) ? 'condition' : RULE.test(v) ? 'rule' : /^(최소|최솟값|하한|min|minimum|lowerlimit|lowerbound)$/.test(v) ? 'min' : /^(최대|최댓값|상한|max|maximum|upperlimit|upperbound)$/.test(v) ? 'max' : /^(단위|units?)$/.test(v) ? 'unit' : null; }
export function tableLayouts(table) {
  const candidates = [];
  const excludedRole = role => role === 'note' || role === 'result';
  for (const transpose of [false, true]) {
    const lines = new Map();
    for (const row of table.rows) for (const cell of row.cells) { const a = parseRange(addressOf(cell)); if (!a) continue; const major = transpose ? a.c1 : a.r1, minor = transpose ? a.r1 : a.c1; if (!lines.has(major)) lines.set(major, []); const mergedRange = cell.mergedRange ?? table.mergedRanges?.find(value => { const r = parseRange(value); return r && a.c1 >= r.c1 && a.c1 <= r.c2 && a.r1 >= r.r1 && a.r1 <= r.r2; }); if (mergedRange) { const r = parseRange(mergedRange); if (r && (a.c1 !== r.c1 || a.r1 !== r.r1)) continue; } lines.get(major).push({ ...cell, ...(mergedRange ? { mergedRange } : {}), major, minor }); }
    const ordered = [...lines].sort((a, b) => a[0] - b[0]);
    for (let at = 0; at < ordered.length; at++) {
      const [headerLine, raw] = ordered[at], headers = raw.filter(c => textOf(c).trim()).sort((a, b) => a.minor - b.minor);
      const clusters = []; for (const h of headers) { const last = clusters.at(-1); if (!last || h.minor > last.at(-1).minor + 1) clusters.push([h]); else last.push(h); }
      for (const cluster of clusters) {
        let items = cluster.filter(c => tableRole(textOf(c)) === 'item');
        if (!items.length && cluster.some(c => tableRole(textOf(c)) === 'min') && cluster.some(c => tableRole(textOf(c)) === 'max')) { const unknown = cluster.filter(c => !tableRole(textOf(c))); if (unknown.length === 1 && unknown[0].minor < Math.min(...cluster.filter(c => ['min', 'max'].includes(tableRole(textOf(c)))).map(c => c.minor))) items = unknown; }
        if (!items.length || (items.length > 1 && cluster[0] !== items[0])) continue;
        for (let i = 0; i < items.length; i++) {
          const left = items.length === 1 ? cluster[0].minor : items[i].minor, right = items[i + 1]?.minor ?? cluster.at(-1).minor + 1;
          const roles = cluster.filter(c => c.minor >= left && c.minor < right).map(c => ({ ...c, role: c === items[i] ? 'item' : tableRole(textOf(c)) }));
          const rows = [], excludedCells = roles.filter(c => excludedRole(c.role)).map(cell => ({ role: cell.role, header: cell, cell }));
          for (const [line, cells] of ordered.slice(at + 1)) {
            // A header-shaped note/result value is still source data in that
            // excluded field. It cannot terminate the owning criterion table.
            if (cells.some(c => c.minor >= left && c.minor < right && !excludedRole(roles.find(r => r.minor === c.minor)?.role) && tableRole(textOf(c)) === 'item')) break;
            if (cells.some(c => { const m = parseRange(c.mergedRange); return m && (transpose ? m.r1 <= left && m.r2 >= right - 1 : m.c1 <= left && m.c2 >= right - 1); })) break;
            const values = roles.map(role => ({ role: role.role, header: role, cell: cells.find(c => c.minor === role.minor) })).filter(x => x.cell);
            // Keep exclusion ownership even on a continuation line with no
            // item label; a transposed pseudo-table may span those lines.
            excludedCells.push(...values.filter(v => excludedRole(v.role)));
            if (values.some(v => v.role === 'item' && textOf(v.cell).trim())) rows.push({ line, row: transpose ? null : line, values });
          }
          candidates.push({ table, transpose, headerLine, roles, rows, excludedCells });
        }
      }
    }
  }
  // Discard the exclusions proposed by a pseudo-table whose own core headers
  // already belong to a real excluded field. Otherwise that pseudo-table could
  // suppress a later, independent repeated block with its invented note axis.
  const claims = candidates.filter(layout => layout.roles.some(c => c.role && c.role !== 'item')).map(layout => ({ layout, core: layout.roles.filter(c => c.role && !excludedRole(c.role)).map(addressOf), excluded: new Set(layout.excludedCells.map(e => addressOf(e.cell))) }));
  const retained = []; let pending = claims;
  while (pending.length) {
    const roots = pending.filter(candidate => !pending.some(other => other !== candidate && candidate.core.some(address => other.excluded.has(address))));
    if (!roots.length) break; // Conflicting exclusion ownership is not a criterion table.
    retained.push(...roots);
    pending = pending.filter(candidate => !roots.includes(candidate) && !roots.some(root => candidate.core.some(address => root.excluded.has(address))));
  }
  const accepted = new Set(retained.map(entry => entry.layout));
  const layouts = candidates.filter(layout => accepted.has(layout)), excluded = new Map();
  for (const layout of layouts) for (const entry of layout.excludedCells) {
    const address = addressOf(entry.cell);
    if (!excluded.has(address) || entry.role === 'note') excluded.set(address, entry.role);
  }
  // Resolve both orientations together. Explicit note/result ownership wins
  // over an apparent item/limit header discovered in the other orientation.
  return layouts.map(layout => ({
    ...layout,
    rows: layout.rows.map(row => ({ ...row, values: row.values.map(v => excluded.has(addressOf(v.cell)) ? { ...v, role: excluded.get(addressOf(v.cell)) } : v) })).filter(row => row.values.some(v => v.role === 'item' && textOf(v.cell).trim()))
  }));
}
const sameCitation = (a, b) => a.documentId === b.documentId && ['sheet', 'cell', 'page', 'block', 'table'].every(k => a[k] === b[k]);
function rowMatches(c, layout, row, restrictSourceEvidence = false) {
  if (c.userOverride || c.sourceDocumentId && c.sourceDocumentId !== layout.table.documentId) return false;
  const item = row.values.find(v => v.role === 'item'); if (compact(c.label) !== compact(textOf(item.cell))) return false;
  const evidence = restrictSourceEvidence ? [...(c.evidenceCells ?? []), ...(Array.isArray(c.sourceEvidence) ? c.sourceEvidence : c.sourceEvidence ? [c.sourceEvidence] : [])] : c.evidenceCells ?? [];
  if (!evidence.length) return true;
  if (layout.table.synthetic) return evidence.some(e => e.documentId === layout.table.documentId && (e.table !== undefined && e.table === layout.table.table || e.block !== undefined && e.block === layout.table.block || e.page !== undefined && e.page === layout.table.page));
  return evidence.some(e => (!layout.table.csv ? e.sheet === layout.table.name : true) && (layout.transpose ? parseRange(e.cell)?.c1 === row.line : Number(e.cell?.match(/\d+/)?.[0]) === row.line));
}
export function preserveSourceConditions(criteria, documents) {
  const layouts = structuredTables(documents).flatMap(tableLayouts);
  for (const c of criteria) {
    if (c.userOverride || c.sourceDocumentId === 'natural-language' || c.source === '사용자 입력') continue;
    const matching = layouts.flatMap(layout => layout.rows.filter(row => rowMatches(c, layout, row, true)).map(row => ({ layout, row })));
    // Only a unique located row may lend its note-exclusion authority.
    if (matching.length === 1) {
      const { layout, row } = matching[0], notes = row.values.filter(v => v.role === 'note' && textOf(v.cell).trim());
      const ignored = notes.map(v => ({ text: textOf(v.cell), ...nativeCriteriaCitation(layout.table, v.cell) }));
      if (ignored.length) {
        c.ignoredSourceNotes = [...(c.ignoredSourceNotes ?? []), ...ignored];
        for (const note of ignored) {
          const tokens = [note.text, ...[...note.text.matchAll(durationPattern)].map(m => m[0])].sort((a, b) => b.length - a.length);
          const authoritativeText = row.values.filter(v => ['item', 'rule', 'min', 'max', 'condition'].includes(v.role)).map(v => textOf(v.cell));
          const supported = text => authoritativeText.some(source => literalIncludes(source, text));
          for (const token of tokens) if (!supported(token)) {
            c.conditions = (c.conditions ?? []).filter(t => supported(t) || !literalIncludes(note.text, t) && compact(t) !== compact(token));
            for (const key of ['rule', 'scope']) if (typeof c[key] === 'string') c[key] = c[key].split(token).join('').replace(/\(\s*\)/g, '').replace(/\s*·\s*(?:조건|적용 범위):\s*(?=·|$)/g, '').replace(/\s{2,}/g, ' ').trim();
          }
        }
        const before = c.evidenceCells?.length ?? 0;
        if (c.evidenceCells) c.evidenceCells = c.evidenceCells.filter(e => !ignored.some(n => sameCitation(e, n)));
        if (before > (c.evidenceCells?.length ?? 0) && c.sourceEvidence && c.evidenceCells?.length) c.sourceEvidence = Array.isArray(c.sourceEvidence) ? c.sourceEvidence.filter(e => !ignored.some(n => sameCitation(e, n))) : { ...c.evidenceCells[0], quote: c.evidenceCells.map(e => e.quote).join(' | ').slice(0, 4000) };
      }
    }
    for (const layout of layouts) for (const row of layout.rows) if (rowMatches(c, layout, row)) {
      for (const v of row.values.filter(v => v.role === 'condition' && textOf(v.cell).trim())) {
        const text = textOf(v.cell); if (universal(text)) continue;
        c.conditions = [...new Set([...(c.conditions ?? []), text])]; c.sourceNotes = [...new Set([...(c.sourceNotes ?? []), text])];
        if (!literalIncludes(c.rule, text)) c.rule = `${c.rule} 시험조건: ${text}.`;
        if (c.evidenceCells) { const native = nativeCriteriaCitation(layout.table, v.cell); c.evidenceCells.push({ ...native, quote: text }); }
      }
    }
    c.conditions = [...new Set([...(c.conditions ?? []), ...[...String(c.rule).matchAll(durationPattern)].map(m => m[0])])].filter(t => !universal(t));
  }
  return criteria;
}
export function extractStaticCriteria(document) {
  const candidates = [], tables = structuredTables([document]), lookups = new Map();
  for (const table of tables) {
    for (let index = 0; index < table.rows.length; index++) {
      const header = table.rows[index], code = header.cells.find(c => /^(코드|항목코드|시험코드|code|testcode|itemcode)$/.test(compact(textOf(c)))), name = header.cells.find(c => /^(항목|항목명|시험항목|시험명|품명|name|label|testname|itemname)$/.test(compact(textOf(c))));
      if (!code || !name) continue;
      const cc = parseRange(addressOf(code))?.c1, nc = parseRange(addressOf(name))?.c1;
      for (const row of table.rows.slice(index + 1)) {
        const codeCell = row.cells.find(c => parseRange(addressOf(c))?.c1 === cc), nameCell = row.cells.find(c => parseRange(addressOf(c))?.c1 === nc);
        if (!codeCell || !nameCell || !textOf(codeCell).trim() || !textOf(nameCell).trim()) continue;
        if (/^(코드|항목코드|시험코드|code|testcode|itemcode)$/.test(compact(textOf(codeCell)))) break;
        const key = compact(textOf(codeCell)); if (!lookups.has(key)) lookups.set(key, []); lookups.get(key).push({ label: textOf(nameCell), table, cells: [codeCell, nameCell] });
      }
    }
  }
  for (const layout of tables.flatMap(tableLayouts)) {
    if (!layout.roles.some(r => ['rule', 'min', 'max'].includes(r.role))) continue;
    const criteria = [];
    for (const row of layout.rows) {
      const val = role => row.values.find(v => v.role === role)?.cell, labelCell = val('item');
      const ruleCell = val('rule'), minimum = val('min'), maximum = val('max'), unitCell = val('unit');
      const limits = row.values.filter(v => ['rule', 'min', 'max'].includes(v.role));
      let inferredUnit = unitCell ? textOf(unitCell) : '', unitEvidence = [];
      if (!inferredUnit) for (const limit of limits) { const match = textOf(limit.header).match(/\(([^()]+)\)\s*$/); if (match) { inferredUnit = match[1].trim(); unitEvidence = [limit.header]; break; } }
      if (!inferredUnit && !layout.transpose) for (const sourceRow of layout.table.rows) for (const c of sourceRow.cells) {
        const at = parseRange(addressOf(c)); if (!at || at.r1 >= layout.headerLine || layout.headerLine - at.r1 > 3) continue;
        const merged = parseRange(c.mergedRange ?? layout.table.mergedRanges?.find(value => { const r = parseRange(value); return r && r.c1 === at.c1 && r.r1 === at.r1; }));
        if (!merged || !limits.some(v => { const a = parseRange(addressOf(v.cell)); return a && a.c1 >= merged.c1 && a.c1 <= merged.c2; })) continue;
        const text = textOf(c).trim(), match = text.match(/^(?:단위|units?)\s*[:：]?\s*\(?([^()]+?)\)?$/i) ?? text.match(/^\(([^()]+)\)$/);
        if (match || /^[A-Za-z%℃°/0-9²³μµ㎎㎏㎜·^.-]+$/.test(text)) { inferredUnit = match ? match[1].trim() : text; unitEvidence = [c]; }
      }
      let rule = ruleCell ? textOf(ruleCell) : minimum && maximum ? `${textOf(minimum)} ~ ${textOf(maximum)}` : minimum ? `>= ${textOf(minimum)}` : maximum ? `<= ${textOf(maximum)}` : '';
      if (!rule) continue;
      const parsed = parseRule(rule, inferredUnit);
      const sourceEvidence = [labelCell, ruleCell, minimum, maximum, unitCell, ...unitEvidence].filter(Boolean).map(c => ({ ...nativeCriteriaCitation(layout.table, c), quote: textOf(c) }));
      const conditions = row.values.filter(v => v.role === 'condition').map(v => textOf(v.cell)).filter(Boolean);
      let label = textOf(labelCell), mapped = false; const mapping = lookups.get(compact(label));
      if (mapping && new Set(mapping.map(m => compact(m.label))).size === 1) { label = mapping[0].label; mapped = true; sourceEvidence.push(...mapping[0].cells.map(c => ({ ...nativeCriteriaCitation(mapping[0].table, c), quote: textOf(c) }))); }
      const comments = row.values.map(v => v.cell.comment).filter(Boolean), commentsUncertain = comments.some(c => /재확인|재검토|확인\s*필요|변경\s*예정|미확정|불확실/.test(c));
      criteria.push({ id: `source-${criteria.length + 1}`, label, ...parsed, needsConfirmation: parsed.needsConfirmation || mapped || commentsUncertain, conditions: [...parsed.conditions, ...conditions], sourceDocumentId: document.id, source: document.name, categoryPath: [], classificationStatus: 'not_applicable', classificationNeedsConfirmation: false, sourceEvidence, evidenceCells: [...sourceEvidence], ...(comments.length ? { sourceComments: comments } : {}) });
    }
    const counts = new Map(); for (const c of criteria) counts.set(compact(c.label), (counts.get(compact(c.label)) ?? 0) + 1); for (const c of criteria) if (counts.get(compact(c.label)) > 1) c.needsConfirmation = true;
    const score = criteria.length * 100 + (layout.roles.some(r => r.role === 'unit') ? 20 : 0) + (layout.roles.some(r => compact(textOf(r)) === '기준') ? 5 : 0) + (/품질|기준|규격|spec|criteria/i.test(layout.table.name) ? 10 : 0);
    candidates.push({ criteria, score, table: layout.table.name });
  }
  const best = candidates.sort((a, b) => b.score - a.score)[0]; return best ? { ...best, status: best.criteria.length ? 'ready' : 'unresolved' } : { criteria: [], status: 'unresolved' };
}

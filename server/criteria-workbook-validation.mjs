import { compact, literalIncludes, parseRange } from './table-records.mjs';
import { parseRule, unitKey, deduplicateCriteria } from './criteria-normalization.mjs';
import { tableLayouts, tableRole } from './conditions.mjs';

// The discovery reader owns I/O and read budgets. This module consumes only its
// accumulated actual-cell map; inventory samples never count as read evidence.
const MAX_CRITERIA = 250;
const MAX_CITATIONS = 64;
const keyOf = (sheet, cell) => `${sheet}\0${cell.replaceAll('$', '')}`;
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Map(values.map(value => [JSON.stringify(value), value])).values()];
const nonempty = value => typeof value === 'string' && !!value.trim();
const single = value => { const r = parseRange(value); return r && !value.includes(':') ? r : null; };
const within = (cell, range) => cell && range && cell.r1 >= range.r1 && cell.r2 <= range.r2 && cell.c1 >= range.c1 && cell.c2 <= range.c2;
const sameComparison = (a, b) => !!a && !!b && a.operator === b.operator && a.value === b.value && a.upper === b.upper;
const numericTokens = text => [...String(text).normalize('NFKC').matchAll(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g)].map(match => Number(match[0].replaceAll(',', '')));
const numeric = text => /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(String(text).trim()) ? Number(String(text).replaceAll(',', '')) : undefined;
const recordOnly = text => /기록\s*(?:만|전용)|record\s+only|for\s+recording\s+only|판정\s*대상\s*아님|비규범/i.test(text);
const negated = text => /(?:폐기|철회|대체|제외)\s*(?:아님|하지\s*않)|not\s+(?:superseded|obsolete|withdrawn|overridden|excluded)/i.test(text);
const revoked = text => !negated(text) && /폐기|철회|obsolete|withdrawn|revoked|superseded/i.test(text);
const current = text => /현행|최신|현재\s*유효|current|latest/i.test(text);
const overridden = text => !negated(text) && /대체|우선\s*적용|override|overrid|replace|supersede/i.test(text);
const crossReference = text => /참조|참고\s*(?:표|시트)|reference|refer\s+to|see\s+(?:sheet|table)/i.test(text);
const outOfScope = text => !negated(text) && /적용\s*(?:대상\s*)?(?:제외|아님)|대상에서\s*제외|out\s+of\s+scope|not\s+applicable|exclude/i.test(text);

function makeIndex(document, inventory, records) {
  const cells = new Map(), sheets = new Map();
  for (const [key, value] of records instanceof Map ? records : []) {
    const at = key.indexOf('\0'), sheet = key.slice(0, at), cell = value?.cell?.replaceAll('$', '');
    if (at < 1 || !single(cell) || typeof value.text !== 'string') continue;
    const entry = { ...value, sheet, cell, address: cell, position: single(cell), key: keyOf(sheet, cell) };
    cells.set(entry.key, entry);
    if (!sheets.has(sheet)) sheets.set(sheet, []);
    sheets.get(sheet).push(entry);
  }
  const roles = new Map(), candidates = [], layouts = [];
  const mark = (entry, role) => { if (!role) return; if (!roles.has(entry.key)) roles.set(entry.key, new Set()); roles.get(entry.key).add(role); };
  const citation = entry => ({ documentId: document.id, sheet: entry.sheet, cell: entry.cell, quote: entry.text });
  for (const [name, entries] of sheets) {
    const rows = new Map();
    for (const entry of entries) { if (!rows.has(entry.position.r1)) rows.set(entry.position.r1, []); rows.get(entry.position.r1).push(entry); }
    const table = { name, documentId: document.id, rows: [...rows].sort((a, b) => a[0] - b[0]).map(([row, values]) => ({ row, cells: values.sort((a, b) => a.position.c1 - b.position.c1) })), mergedRanges: inventory?.sheets?.find(sheet => sheet.name === name)?.mergedRanges ?? [] };
    for (const layout of tableLayouts(table)) {
      layouts.push(layout);
      for (const value of layout.excludedCells ?? []) mark(value.cell, value.role);
      for (const row of layout.rows) {
        const item = row.values.find(value => value.role === 'item')?.cell;
        for (const value of row.values) mark(value.cell, value.role);
        if (!item) continue;
        const conditionCells = row.values.filter(value => value.role === 'condition' && nonempty(value.cell.text)).map(value => value.cell);
        const unitCell = row.values.find(value => value.role === 'unit' && nonempty(value.cell.text))?.cell;
        for (const value of row.values.filter(value => ['rule', 'min', 'max'].includes(value.role))) {
          const cell = value.cell, merge = parseRange(cell.mergedRange);
          if (!nonempty(cell.text) || merge && (merge.c1 !== cell.position.c1 || merge.r1 !== cell.position.r1)) continue;
          let unit = unitCell?.text ?? '', unitEvidence = unitCell ? [citation(unitCell)] : [];
          if (!unit) {
            const embedded = value.header.text.match(/[（(]([^()（）]+)[）)]/);
            if (embedded) { unit = embedded[1].trim(); unitEvidence = [citation(value.header)]; }
          }
          if (!unit) {
            const heading = entries.filter(entry => { const span = parseRange(entry.mergedRange); return span && span.c1 <= cell.position.c1 && span.c2 >= cell.position.c1 && span.r1 < layout.headerLine && layout.headerLine - span.r1 <= 3 && /단위|units?/i.test(entry.text); }).sort((a, b) => b.position.r1 - a.position.r1)[0];
            if (heading) { const match = heading.text.match(/(?:단위|units?)\s*[:：]?\s*[（(]?([^()（）]+)[）)]?$/i); if (match) { unit = match[1].trim(); unitEvidence = [citation(heading)]; } }
          }
          let parsed = parseRule(cell.text, unit);
          if (numeric(cell.text) !== undefined && ['min', 'max'].includes(value.role)) parsed = parseRule(`${value.role === 'min' ? '>=' : '<='} ${cell.text}`, unit);
          const status = row.values.find(v => /^(상태|개정상태|status)$/i.test(compact(v.header.text)))?.cell;
          candidates.push({ key: cell.key, sheet: name, cell: cell.cell, range: cell.cell, label: item.text, rule: cell.text, unit: parsed.comparison?.unit ?? unit, comparison: parsed.comparison, source: cell, item, layout, row, status, conditionCells, unitEvidence, citations: unique([citation(item), citation(cell), citation(value.header), ...unitEvidence, ...conditionCells.map(citation)]) });
        }
      }
    }
  }
  const excludedRole = key => [...(roles.get(key) ?? [])].some(role => role === 'note' || role === 'result');
  // A role identified in either orientation wins over an apparent limit in the other.
  const thresholds = [...new Map(candidates.filter(candidate => !excludedRole(candidate.key)).map(candidate => [candidate.key, candidate])).values()];
  return { document, inventory, cells, sheets, roles, layouts, thresholds, excludedRole, citation };
}

function citations(raw, index, { bodyOnly = false } = {}) {
  const values = list(raw), valid = [], errors = [];
  if (values.length > MAX_CITATIONS) errors.push('인용은 64개 이하여야 합니다.');
  for (const value of values.slice(0, MAX_CITATIONS)) {
    const cell = typeof value?.cell === 'string' ? value.cell.replaceAll('$', '') : '';
    const record = typeof value?.sheet === 'string' && single(cell) ? index.cells.get(keyOf(value.sheet, cell)) : undefined;
    const texts = bodyOnly ? [record?.text] : [record?.text, record?.comment];
    if (!record || value.documentId !== undefined && value.documentId !== index.document.id || !nonempty(value.quote) || value.quote.length > 4000 || !texts.some(text => literalIncludes(text, value.quote))) { errors.push(`실제 셀 인용을 확인할 수 없습니다: ${value?.sheet ?? '?'}!${cell || '?'}`); continue; }
    valid.push({ documentId: index.document.id, sheet: record.sheet, cell, quote: value.quote.trim(), ...(Number.isInteger(value.level) ? { level: value.level } : {}), ...(typeof value.relation === 'string' ? { relation: value.relation } : {}) });
  }
  return { valid: unique(valid), errors };
}
const citedKeys = values => new Set(values.map(value => keyOf(value.sheet, value.cell)));

function hierarchy(raw, anchors, index) {
  const path = list(raw.categoryPath), retained = [], evidence = [], issues = [];
  let previous, rejected = false, uncertain = raw.classificationNeedsConfirmation === true || raw.classificationStatus === 'ambiguous';
  const result = citations(raw.hierarchyCitations, index, { bodyOnly: true });
  for (let level = 0; level < Math.min(8, path.length); level++) {
    const name = path[level], choices = result.valid.filter(value => value.level === level && nonempty(name) && name.length <= 200 && literalIncludes(index.cells.get(keyOf(value.sheet, value.cell)).text, name));
    let selected;
    for (const evidenceCell of choices) {
      const header = index.cells.get(keyOf(evidenceCell.sheet, evidenceCell.cell)), p = header.position, span = parseRange(header.mergedRange) ?? p;
      const supported = anchors.filter(anchor => anchor.sheet === header.sheet).some(anchor => {
        const a = index.cells.get(anchor.key)?.position;
        if (!a) return false;
        if (evidenceCell.relation === 'column-header') return a.r1 > span.r2 && a.c1 >= span.c1 && a.c1 <= span.c2;
        if (evidenceCell.relation === 'row-header') return a.c1 > span.c2 && a.r1 >= span.r1 && a.r1 <= span.r2;
        if (evidenceCell.relation === 'section-header') return a.r1 > span.r2 && (!header.mergedRange || a.c1 >= span.c1 && a.c1 <= span.c2);
        return evidenceCell.relation === 'lookup';
      });
      if (!supported) continue;
      if (previous) {
        if (previous.header.sheet !== header.sheet && evidenceCell.relation !== 'lookup') continue;
        if (evidenceCell.relation !== 'lookup' && (p.r1 < previous.header.position.r1 || p.r1 === previous.header.position.r1 && p.c1 < previous.header.position.c1)) continue;
        if (previous.header.mergedRange && header.mergedRange && !within({ ...span, r1: previous.span.r1, r2: previous.span.r2 }, previous.span)) continue;
      }
      const horizontal = evidenceCell.relation === 'row-header';
      const blockers = (index.sheets.get(header.sheet) ?? []).filter(entry => entry.key !== header.key && nonempty(entry.text) && !tableRole(entry.text) && anchors.some(anchor => {
        if (anchor.sheet !== header.sheet) return false;
        const a = index.cells.get(anchor.key).position;
        return horizontal ? entry.position.c1 > span.c2 && entry.position.c1 < a.c1 && entry.position.r1 === p.r1 : entry.position.r1 > span.r2 && entry.position.r1 < a.r1 && entry.position.c1 === p.c1;
      }));
      if (blockers.some(entry => /\d+\s*(?:종|형|급)|type\s*\d+/i.test(entry.text) && /\d+\s*(?:종|형|급)|type\s*\d+/i.test(header.text))) continue;
      const sameStyleHeader = blockers.some(entry => entry.styleId === header.styleId && entry.mergedRange && header.mergedRange);
      selected = { evidenceCell, header, span, uncertain: sameStyleHeader || evidenceCell.relation === 'lookup' || evidenceCell.relation === 'section-header' && !header.mergedRange };
      break;
    }
    if (!selected) { rejected = true; issues.push(`${level + 1}단계 분류의 원문 관계를 확인해야 합니다.`); break; }
    retained.push(name.trim()); evidence.push(selected.evidenceCell); uncertain ||= selected.uncertain; previous = selected;
  }
  if (path.length > 8) { rejected = true; issues.push('분류 경로가 8단계 한도에 도달했습니다.'); }
  const sample = citations(raw.sampleCitations, index, { bodyOnly: true });
  const sampleEvidence = sample.valid.filter(value => nonempty(raw.sampleName) && literalIncludes(value.quote, raw.sampleName));
  const sampleName = nonempty(raw.sampleName) && raw.sampleName.length <= 300 && sampleEvidence.length ? raw.sampleName.trim() : undefined;
  if (nonempty(raw.sampleName) && !sampleName) { uncertain = true; issues.push('시료명의 실제 원문 인용을 확인해야 합니다.'); }
  if (raw.classificationStatus === 'not_applicable' && (retained.length || sampleName)) uncertain = true;
  return { categoryPath: retained, hierarchyEvidence: evidence, sampleEvidence, ...(sampleName ? { sampleName } : {}), classificationStatus: rejected || uncertain ? 'ambiguous' : retained.length || sampleName ? 'resolved' : 'not_applicable', classificationNeedsConfirmation: rejected || uncertain, classificationReason: issues.join(' '), rejected, droppedHierarchyLevels: path.length - retained.length, classificationLimitReached: path.length > 8 };
}

function groundProposal(raw, proposalIndex, index) {
  const errors = [];
  if (!raw || !nonempty(raw.label) || raw.label.length > 300 || !nonempty(raw.rule) || raw.rule.length > 1200 || typeof (raw.unit ?? '') !== 'string' || (raw.unit ?? '').length > 80 || typeof (raw.scope ?? '') !== 'string' || (raw.scope ?? '').length > 400 || !Array.isArray(raw.conditions ?? []) || (raw.conditions ?? []).length > 15 || (raw.conditions ?? []).some(value => !nonempty(value) || value.length > 400)) return { errors: ['기준 초안의 형식 또는 길이 한도가 올바르지 않습니다.'] };
  const checked = Object.fromEntries(['citations', 'unitCitations', 'conditionCitations', 'scopeCitations'].map(field => [field, citations(raw[field], index)]));
  for (const value of Object.values(checked)) errors.push(...value.errors);
  const source = checked.citations.valid, keys = citedKeys(source);
  const meaningful = source.filter(value => !index.excludedRole(keyOf(value.sheet, value.cell)));
  const anchors = index.thresholds.filter(candidate => keys.has(candidate.key));
  if (!meaningful.length || source.length && !anchors.length && source.every(value => index.excludedRole(keyOf(value.sheet, value.cell)) || ['item', 'unit', 'condition'].some(role => index.roles.get(keyOf(value.sheet, value.cell))?.has(role)))) return { errors: [...errors, '기준값 원문 없이 비고나 결과만 인용한 후보입니다.'] };
  const ignored = source.filter(value => index.roles.get(keyOf(value.sheet, value.cell))?.has('note')).map(value => ({ documentId: index.document.id, sheet: value.sheet, cell: value.cell, text: index.cells.get(keyOf(value.sheet, value.cell)).text }));
  let rule = raw.rule.trim(), scope = (raw.scope ?? '').trim();
  let conditions = [...(raw.conditions ?? [])];
  // Removing a note's authority does not remove identical wording that is
  // independently present in an actual item, limit, or condition cell.
  const authoritativeText = unique([
    ...meaningful.filter(value => {
      const roles = index.roles.get(keyOf(value.sheet, value.cell));
      return !roles?.size || ['item', 'rule', 'min', 'max', 'condition'].some(role => roles.has(role));
    }).map(value => index.cells.get(keyOf(value.sheet, value.cell)).text),
    ...anchors.flatMap(anchor => anchor.row.values.filter(value => ['item', 'rule', 'min', 'max', 'condition'].includes(value.role) && !index.excludedRole(value.cell.key)).map(value => value.cell.text))
  ]);
  const supported = text => authoritativeText.some(value => literalIncludes(value, text));
  for (const note of ignored) {
    conditions = conditions.filter(value => supported(value) || !literalIncludes(note.text, value));
    if (literalIncludes(note.text, scope) && !supported(scope)) scope = '';
    if (!supported(note.text)) rule = rule.split(note.text).join('').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  if (!rule) return { errors: [...errors, '비고를 제외한 기준 원문이 없습니다.'] };
  const alignedConditions = anchors.flatMap(candidate => candidate.conditionCells);
  conditions = [...new Set([...conditions, ...alignedConditions.map(cell => cell.text)])];
  const conditionEvidence = unique([...checked.conditionCitations.valid.filter(value => !index.excludedRole(keyOf(value.sheet, value.cell))), ...alignedConditions.map(index.citation)]);
  const parsed = parseRule(rule, (raw.unit ?? '').trim()), comparison = parsed.comparison;
  const unit = comparison?.unit || (raw.unit ?? '').trim(), unitEvidence = checked.unitCitations.valid.filter(value => !index.excludedRole(keyOf(value.sheet, value.cell)));
  const scopeEvidence = checked.scopeCitations.valid.filter(value => !index.excludedRole(keyOf(value.sheet, value.cell)));
  const evidence = unique([...meaningful, ...unitEvidence, ...conditionEvidence, ...scopeEvidence]);
  const sourceNumbers = new Set(evidence.flatMap(value => numericTokens(value.quote)));
  const groundedNumbers = numericTokens(rule).every(value => sourceNumbers.has(value));
  const comparisons = [...meaningful.map(value => parseRule(value.quote, unit).comparison), ...anchors.map(candidate => candidate.comparison)].filter(Boolean);
  const comparisonGrounded = comparisons.some(value => sameComparison(value, comparison)) || comparison?.operator === 'range' && comparisons.some(value => value.operator === 'gte' && value.value === comparison.value) && comparisons.some(value => value.operator === 'lte' && value.value === comparison.upper);
  const unitGrounded = !unit || [...unitEvidence, ...meaningful].some(value => literalIncludes(value.quote, unit)) || anchors.some(candidate => unitKey(candidate.unit) === unitKey(unit) && candidate.unitEvidence.every(value => citedKeys(evidence).has(keyOf(value.sheet, value.cell))));
  const uncached = evidence.some(value => index.cells.get(keyOf(value.sheet, value.cell)).uncachedFormula);
  const classification = hierarchy(raw, anchors.length ? anchors : meaningful.map(value => ({ ...value, key: keyOf(value.sheet, value.cell) })), index);
  const conditionsGrounded = conditions.every(condition => conditionEvidence.some(value => literalIncludes(value.quote, condition)) || meaningful.some(value => literalIncludes(value.quote, condition)));
  const scopeGrounded = !scope || scopeEvidence.some(value => literalIncludes(value.quote, scope)) || meaningful.some(value => literalIncludes(value.quote, scope));
  const sharedGrounded = !raw.sharedScope || scopeEvidence.some(value => /공통|공동|전체|shared|common|\ball\b/i.test(value.quote));
  if (!conditionsGrounded) errors.push('조건의 실제 원문 인용을 확인해야 합니다.');
  if (!scopeGrounded || !sharedGrounded) errors.push('적용 범위의 실제 원문 인용을 확인해야 합니다.');
  if (!groundedNumbers || comparison && !comparisonGrounded || !unitGrounded || uncached) errors.push('숫자, 비교 연산자, 단위 또는 수식 결과를 원문으로 확인해야 합니다.');
  const mayCompare = comparison && groundedNumbers && comparisonGrounded && unitGrounded && !uncached && !classification.rejected;
  const output = {
    id: nonempty(raw.id) ? raw.id : `workbook-${index.document.id}-${proposalIndex + 1}`,
    label: raw.label.trim(), rule, unit, scope, conditions, required: raw.required !== false,
    source: index.document.name ?? index.document.id, sourceName: index.document.name ?? index.document.id, sourceDocumentId: index.document.id,
    citations: meaningful, evidenceCells: evidence, sourceEvidence: { ...evidence[0], quote: evidence.map(value => value.quote).join(' | ').slice(0, 4000) },
    unitCitations: unitEvidence, conditionCitations: conditionEvidence, scopeCitations: scopeEvidence,
    hierarchyCitations: classification.hierarchyEvidence, sampleCitations: classification.sampleEvidence,
    ...classification, ignoredSourceNotes: ignored, sharedScope: raw.sharedScope === true,
    needsConfirmation: raw.needsConfirmation === true || !!errors.length || classification.classificationNeedsConfirmation || !groundedNumbers || !unitGrounded || uncached || !!comparison && !mayCompare || !comparison && numericTokens(rule).length > 0,
    ...(mayCompare ? { comparison } : {})
  };
  delete output.rejected; delete output.droppedHierarchyLevels; delete output.classificationLimitReached;
  if (unit && !literalIncludes(output.rule, unit)) output.rule += ` · 단위: ${unit}`;
  if (scope && !literalIncludes(output.rule, scope)) output.rule += ` · 적용 범위: ${scope}`;
  const missingConditions = conditions.filter(condition => !literalIncludes(output.rule, condition));
  if (missingConditions.length) output.rule += ` · 조건: ${missingConditions.join(', ')}`;
  return { criterion: output, errors, anchors, classification };
}

function connects(source, target, index) {
  if (source.key === target.key) return true;
  const sameSheet = source.sheet === target.sheet;
  if (sameSheet && source.position.r1 === target.source.position.r1) {
    const rowKeys = new Set(target.row.values.map(value => value.cell.key));
    if (rowKeys.has(source.key)) return true;
  }
  const merged = parseRange(source.mergedRange);
  if (sameSheet && merged && target.source.position.r1 > merged.r2 && target.source.position.c1 >= merged.c1 && target.source.position.c1 <= merged.c2) return true;
  const text = source.text + '\n' + (source.comment ?? '');
  if (text.includes(`${target.sheet}!${target.cell}`) || text.includes(`'${target.sheet}'!${target.cell}`)) return true;
  if (!literalIncludes(text, target.label)) return false;
  const peers = index.thresholds.filter(candidate => compact(candidate.label) === compact(target.label));
  if (peers.length === 1) return true;
  const qualifiers = [...target.conditionCells.map(value => value.text), ...target.row.values.filter(value => value.role === null && value.cell.key !== source.key && value.cell.key !== target.status?.key).map(value => value.cell.text)].filter(nonempty);
  return qualifiers.length > 0 && qualifiers.every(value => literalIncludes(text, value));
}

function resolveContext(criteria, dispositions, index) {
  const signals = [];
  for (const cell of index.cells.values()) {
    const merge = parseRange(cell.mergedRange);
    if (index.excludedRole(cell.key) || cell.uncertain || cell.uncachedFormula || merge && (merge.r1 !== cell.position.r1 || merge.c1 !== cell.position.c1)) continue;
    const text = [cell.text, cell.comment].filter(Boolean).join('\n');
    for (const [kind, matches] of [['non_normative', recordOnly(text)], ['superseded', revoked(text)], ['current', current(text)], ['overridden', overridden(text)], ['cross_reference', crossReference(text)], ['out_of_scope', outOfScope(text)]]) if (matches) signals.push({ kind, sheet: cell.sheet, cell: cell.cell, range: cell.cell, quote: text, key: cell.key, targets: index.thresholds.filter(target => connects(cell, target, index)).map(target => target.key) });
  }
  const criterionKeys = criteria.map(criterion => citedKeys(criterion.evidenceCells)), retainedByKey = key => criteria.filter((criterion, i) => criterionKeys[i].has(key));
  const deterministic = new Set(), covered = new Set();
  for (const signal of signals) for (const target of index.thresholds.filter(candidate => signal.targets.includes(candidate.key))) {
    if (signal.kind === 'non_normative' || signal.kind === 'superseded' && target.status?.key === signal.key) { deterministic.add(target.key); covered.add(`${signal.kind}\0${signal.key}`); }
  }
  const accepted = [], rejectedDispositions = [];
  const reject = (entry, reason) => rejectedDispositions.push({ ...entry, reason });
  for (const raw of list(dispositions)) {
    const kind = raw?.kind === 'context_applied' ? 'applied' : raw?.kind;
    const target = citations(raw?.targetCitations, index), evidence = citations(raw?.evidence, index), replacement = citations(raw?.replacementCitations, index);
    const entry = { kind, targetCitations: target.valid, evidence: evidence.valid, replacementCitations: replacement.valid, reason: raw?.reason ?? '' };
    const targets = index.thresholds.filter(candidate => citedKeys(target.valid).has(candidate.key));
    if (!['non_normative', 'superseded', 'overridden', 'duplicate', 'out_of_scope', 'applied'].includes(kind) || !nonempty(raw?.reason) || target.errors.length || evidence.errors.length || replacement.errors.length || !target.valid.length || targets.length !== target.valid.length || !evidence.valid.length || evidence.valid.some(value => index.excludedRole(keyOf(value.sheet, value.cell)))) { reject(entry, '결정의 종류, 대상 기준 셀 또는 원문 인용이 유효하지 않습니다.'); continue; }
    const sources = evidence.valid.map(value => index.cells.get(keyOf(value.sheet, value.cell)));
    if (sources.some(source => { const merged = parseRange(source.mergedRange); return source.uncertain || source.uncachedFormula || merged && (merged.r1 !== source.position.r1 || merged.c1 !== source.position.c1); })) { reject(entry, '불확실한 셀 또는 병합 연속 셀은 제외 결정의 근거가 아닙니다.'); continue; }
    const connected = targets.every(candidate => sources.some(source => connects(source, candidate, index)));
    const text = evidence.valid.map(value => value.quote).join('\n');
    const replacements = index.thresholds.filter(candidate => citedKeys(replacement.valid).has(candidate.key));
    const linkedSignals = signals.filter(signal => evidence.valid.some(value => keyOf(value.sheet, value.cell) === signal.key) && signal.targets.some(key => targets.some(candidate => candidate.key === key)));
    let valid = connected;
    if (kind === 'non_normative') valid &&= recordOnly(text);
    if (kind === 'out_of_scope') valid &&= outOfScope(text) && targets.every(candidate => literalIncludes(text, candidate.label));
    if (['superseded', 'overridden', 'duplicate'].includes(kind)) {
      valid &&= replacements.length > 0 && targets.every(candidate => replacements.some(next => next.key !== candidate.key && retainedByKey(next.key).length > 0 && compact(next.label) === compact(candidate.label) && (!candidate.unit || !next.unit || unitKey(candidate.unit) === unitKey(next.unit))));
      if (kind === 'superseded') valid &&= revoked(text) && replacements.some(next => sources.some(source => current(source.text) && connects(source, next, index)) || signals.some(signal => signal.kind === 'current' && signal.targets.includes(next.key)));
      if (kind === 'overridden') valid &&= overridden(text);
      if (kind === 'duplicate') valid &&= targets.every(candidate => replacements.some(next => retainedByKey(candidate.key).some(left => retainedByKey(next.key).some(right => deduplicateCriteria([left, right]).length === 1))));
    }
    if (kind === 'applied') {
      valid &&= targets.every(candidate => retainedByKey(candidate.key).length) && linkedSignals.some(signal => ['current', 'cross_reference'].includes(signal.kind));
      const referenceSignals = linkedSignals.filter(signal => signal.kind === 'cross_reference');
      if (referenceSignals.length) valid &&= referenceSignals.every(signal => [...index.sheets.keys()].some(name => name !== signal.sheet && literalIncludes(signal.quote, name) && criteria.some(criterion => criterion.evidenceCells.some(value => value.sheet === name))));
    }
    if (!valid) { reject(entry, '원문 연결 또는 대체 기준의 증명이 부족합니다.'); continue; }
    accepted.push({ entry, targets: targets.map(candidate => candidate.key), replacements: replacements.map(candidate => candidate.key), signals: linkedSignals });
  }
  // A replacement cannot itself disappear through another exclusion or a cycle.
  let validEntries = accepted;
  while (true) {
    const excluded = new Set([...deterministic, ...validEntries.filter(value => value.entry.kind !== 'applied').flatMap(value => value.targets)]);
    const invalid = validEntries.filter(value => value.replacements.some(key => excluded.has(key)));
    if (!invalid.length) break;
    for (const value of invalid) reject(value.entry, '대체 기준도 제외되어 순환 또는 연쇄 대체를 확정할 수 없습니다.');
    validEntries = validEntries.filter(value => !invalid.includes(value));
  }
  const excludedKeys = new Set([...deterministic, ...validEntries.filter(value => value.entry.kind !== 'applied').flatMap(value => value.targets)]);
  for (const value of validEntries) for (const signal of value.signals) covered.add(`${signal.kind}\0${signal.key}`);
  const contextProblems = signals.filter(signal => ['superseded', 'overridden', 'cross_reference', 'out_of_scope'].includes(signal.kind) && !covered.has(`${signal.kind}\0${signal.key}`)).map(({ key, targets, ...signal }) => ({ ...signal, reason: '원문 지시의 적용 또는 제외 관계를 확인해야 합니다.' }));
  const remaining = criteria.filter((criterion, i) => {
    const anchors = index.thresholds.filter(candidate => criterionKeys[i].has(candidate.key));
    return !anchors.length || !anchors.every(candidate => excludedKeys.has(candidate.key));
  }).map(criterion => {
    const keys = citedKeys(criterion.evidenceCells), issues = signals.filter(signal => signal.targets.some(key => keys.has(key)) && contextProblems.some(problem => problem.kind === signal.kind && problem.sheet === signal.sheet && problem.cell === signal.cell));
    if (!issues.length) return criterion;
    const next = { ...criterion, contextNeedsConfirmation: true, needsConfirmation: true, contextIssues: issues.map(({ kind, sheet, cell, quote }) => ({ kind, sheet, cell, quote })) };
    delete next.comparison;
    return next;
  });
  return { criteria: remaining, excludedKeys, contextSignals: signals.map(({ key, targets, ...signal }) => signal), contextProblems, rejectedDispositions };
}

/** Pure CURRENT_REPRODUCTION workbook discovery validation; no provider or oracle access. */
export function validateWorkbookDiscovery({ document, inventory, records, proposals = [], regionAssessments = [], dispositions = [] }) {
  const index = makeIndex(document, inventory, records), grounded = [], validationErrors = [], unresolved = [];
  let droppedCriteria = Math.max(0, list(proposals).length - MAX_CRITERIA), classificationLimitReached = false, droppedHierarchyLevels = 0;
  for (const [at, proposal] of list(proposals).slice(0, MAX_CRITERIA).entries()) {
    const result = groundProposal(proposal, at, index);
    validationErrors.push(...result.errors.map(error => `[${at}] ${error}`));
    if (!result.criterion) { droppedCriteria++; continue; }
    grounded.push(result.criterion);
    classificationLimitReached ||= result.classification.classificationLimitReached;
    droppedHierarchyLevels += result.classification.droppedHierarchyLevels;
    if (result.criterion.needsConfirmation) for (const anchor of result.anchors.length ? result.anchors : result.criterion.evidenceCells) unresolved.push({ sheet: anchor.sheet, cell: anchor.cell, range: anchor.cell, reason: '기준 해석에 확인이 필요합니다.' });
  }
  const context = resolveContext(grounded, dispositions, index), criteria = deduplicateCriteria(context.criteria);
  const omitted = index.thresholds.filter(candidate => !context.excludedKeys.has(candidate.key) && numericTokens(candidate.rule).length > 0 && !criteria.some(criterion => {
    if (!citedKeys(criterion.evidenceCells).has(candidate.key)) return false;
    if (!candidate.comparison) return !criterion.comparison && literalIncludes(criterion.rule, candidate.rule);
    return sameComparison(candidate.comparison, criterion.comparison) || criterion.comparison?.operator === 'range' && (candidate.comparison.operator === 'gte' && candidate.comparison.value === criterion.comparison.value || candidate.comparison.operator === 'lte' && candidate.comparison.value === criterion.comparison.upper);
  })).map(({ sheet, cell, label, rule, comparison }) => ({ sheet, cell, range: cell, label, rule, ...(comparison ? { comparison } : {}), reason: '실제 기준값이 최종 기준에 반영되지 않았습니다.' }));
  const regionProblems = [], examinedRegions = [];
  const retainedKeys = new Set(criteria.flatMap(criterion => [...citedKeys(criterion.evidenceCells)]));
  for (const sheet of inventory?.sheets ?? []) for (const region of sheet.regions ?? []) {
    const assessments = list(regionAssessments).filter(value => value?.id === region.id), assessment = assessments.at(-1), range = parseRange(region.range);
    const reasons = [], checked = citations(assessment?.evidence, index);
    if (!assessment || !['criteria', 'context', 'unrelated'].includes(assessment.classification)) reasons.push('영역 분류가 미확인입니다.');
    if (!nonempty(assessment?.reason) || !checked.valid.some(value => value.sheet === sheet.name && within(single(value.cell), range)) || checked.errors.length) reasons.push('해당 영역 내부의 실제 인용이 필요합니다.');
    if (!Array.isArray(assessment?.criterionCells) || assessment?.classification === 'criteria' && !assessment.criterionCells.length) reasons.push('기준 셀 목록이 필요합니다.');
    for (const cell of list(assessment?.criterionCells)) {
      const key = typeof cell === 'string' ? keyOf(sheet.name, cell) : '';
      if (!single(cell) || !within(single(cell), range) || !index.cells.has(key) || !retainedKeys.has(key) && !context.excludedKeys.has(key)) reasons.push(`기준 셀의 추출 또는 제외 근거가 없습니다: ${cell}`);
    }
    if (reasons.length) regionProblems.push({ id: region.id, sheet: sheet.name, range: region.range, reason: [...new Set(reasons)].join(' ') });
    else examinedRegions.push(region.id);
  }
  return { criteria, omitted, unresolved: unique(unresolved.filter(value => !context.excludedKeys.has(keyOf(value.sheet, value.cell)))), regionProblems, contextSignals: context.contextSignals, contextProblems: context.contextProblems, rejectedDispositions: context.rejectedDispositions, validationErrors: unique(validationErrors), droppedCriteria, classificationLimitReached, droppedHierarchyLevels, examinedRegions };
}

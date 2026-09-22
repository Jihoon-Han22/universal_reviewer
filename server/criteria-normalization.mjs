import { randomUUID } from 'node:crypto';
import { compact, normalizedText } from './table-records.mjs';

export class AlgorithmError extends Error { constructor(message, code = 'INVALID_RESPONSE') { super(message); this.name = 'AlgorithmError'; this.code = code; this.status = 400; } }
export function boundedString(value, label, max, allowEmpty = false) { if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new AlgorithmError(`${label} 형식이 올바르지 않습니다.`); return value.trim(); }
const operators = ['lt', 'lte', 'gt', 'gte', 'eq', 'range'];
export function normalizeComparison(raw) {
  if (!raw || typeof raw !== 'object' || !operators.includes(raw.operator) || !Number.isFinite(raw.value) || typeof raw.unit !== 'string' || raw.unit.length > 80 || (raw.operator === 'range' && (!Number.isFinite(raw.upper) || raw.upper < raw.value))) return undefined;
  return { operator: raw.operator, value: raw.value, unit: raw.unit.trim(), ...(raw.operator === 'range' ? { upper: raw.upper } : {}) };
}
export function safeEvidence(raw, limit = 15, quoteLimit = 4000) {
  const entries = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  return entries.slice(0, limit).filter(e => e && typeof e.documentId === 'string' && typeof e.quote === 'string').map(e => ({ documentId: e.documentId.slice(0, 100), quote: e.quote.slice(0, quoteLimit), ...(Number.isFinite(e.page) ? { page: e.page } : {}), ...(typeof e.sheet === 'string' ? { sheet: e.sheet.slice(0, 200) } : {}), ...(typeof e.cell === 'string' ? { cell: e.cell.slice(0, 100) } : {}), ...(Number.isInteger(e.level) && e.level >= 0 && e.level <= 7 ? { level: e.level } : {}) }));
}
export function normalizeClassification(raw) {
  if (raw.classificationStatus !== undefined && !['not_applicable', 'resolved', 'ambiguous'].includes(raw.classificationStatus) || raw.classificationNeedsConfirmation !== undefined && typeof raw.classificationNeedsConfirmation !== 'boolean') throw new AlgorithmError('분류 확인 상태가 올바르지 않습니다.');
  const categoryPath = raw.categoryPath === undefined ? [] : raw.categoryPath;
  if (!Array.isArray(categoryPath) || categoryPath.length > 8) throw new AlgorithmError('분류 경로는 8단계 이하여야 합니다.');
  const path = categoryPath.map(v => boundedString(v, '분류 경로', 200));
  const sampleName = raw.sampleName === undefined || raw.sampleName === '' ? undefined : boundedString(raw.sampleName, '시료명', 300);
  const has = path.length > 0 || !!sampleName;
  const ambiguous = raw.classificationStatus === 'ambiguous' || raw.classificationNeedsConfirmation === true || (has && raw.classificationStatus === 'not_applicable');
  return { categoryPath: path, ...(sampleName ? { sampleName } : {}), classificationStatus: ambiguous ? 'ambiguous' : has ? 'resolved' : 'not_applicable', classificationNeedsConfirmation: ambiguous };
}
export function validateCriteria(raw, { allowEmpty = false, draft = false } = {}) {
  if (!Array.isArray(raw) || raw.length > 250 || (!allowEmpty && !raw.length)) throw new AlgorithmError('검토 기준은 1개 이상 250개 이하여야 합니다.');
  const ids = new Set();
  return raw.map(c => {
    if (!c || typeof c !== 'object') throw new AlgorithmError('검토 기준 형식이 올바르지 않습니다.');
    if (c.needsConfirmation !== undefined && typeof c.needsConfirmation !== 'boolean') throw new AlgorithmError('기준 확인 상태가 올바르지 않습니다.');
    const id = boundedString(c.id, '기준 ID', 100); if (ids.has(id)) throw new AlgorithmError('중복된 기준 ID입니다.'); ids.add(id);
    const classification = normalizeClassification(c);
    const out = { id, label: boundedString(c.label, '항목', 500, draft), rule: boundedString(c.rule, '기준', 8000, draft), needsConfirmation: !!c.needsConfirmation || classification.classificationNeedsConfirmation, ...classification };
    if (c.required !== undefined) { if (typeof c.required !== 'boolean') throw new AlgorithmError('필수 여부 형식이 올바르지 않습니다.'); out.required = c.required; }
    for (const [key, max] of [['source', 4000], ['sourceDocumentId', 100], ['sourceName', 500], ['scope', 1000], ['classificationReason', 2000], ['overrideSource', 1000]]) if (c[key] !== undefined) out[key] = boundedString(c[key], key, max, true);
    const conditions = c.conditions ?? []; if (!Array.isArray(conditions) || conditions.length > 64) throw new AlgorithmError('조건 형식이 올바르지 않습니다.'); out.conditions = conditions.map(v => boundedString(v, '조건', 1200)).filter(v => !/모든\s*거래|전체\s*문서|각\s*항목|all\s*records|every\s*row/i.test(v));
    const comparison = normalizeComparison(c.comparison); if (comparison) out.comparison = comparison;
    if (c.sourceEvidence !== undefined || c.evidenceCells !== undefined) out.sourceEvidence = safeEvidence(c.sourceEvidence ?? c.evidenceCells);
    if (c.hierarchyEvidence !== undefined) out.hierarchyEvidence = safeEvidence(c.hierarchyEvidence, 24);
    for (const key of ['contextNeedsConfirmation', 'userOverride']) if (c[key] !== undefined) out[key] = !!c[key];
    for (const key of ['contextIssues', 'ignoredSourceNotes', 'sourceNotes', 'handlingNotes']) if (Array.isArray(c[key])) out[key] = structuredClone(c[key]);
    if (draft && c.draftState !== undefined) out.draftState = normalizeDraftState(c.draftState);
    return out;
  });
}
export const normalizeCriteria = validateCriteria;
export function normalizeDraftState(raw) {
  if (!raw || !['numeric', 'qualitative', 'choose'].includes(raw.mode) || !['', ...operators].includes(raw.operator) || !Array.isArray(raw.issues) || raw.issues.length > 20) throw new AlgorithmError('편집 초안 형식이 올바르지 않습니다.');
  return { mode: raw.mode, operator: raw.operator, value: boundedString(raw.value, '숫자 초안', 100, true), upper: boundedString(raw.upper, '상한 초안', 100, true), unit: boundedString(raw.unit, '단위', 80, true), issues: raw.issues.map(x => boundedString(x, '편집 문제', 500, true)) };
}
const numberPattern = '[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const parseUnitKey = value => String(value).toLowerCase().replace(/\s+/g, '').replaceAll('²', '2').replaceAll('³', '3').replaceAll('％', '%');
export function parseRule(text, fallbackUnit = '') {
  const rule = String(text ?? '').trim(), conditions = [];
  let source = rule.replace(/\(([^()]*)\)/g, (all, inside) => {
    if (/(?:\d\s*(?:일령|일|시간|주|개월|분|초|회|℃|°C|°F))|평균|양생|재령|온도|습도|조건|전처리|건조|수중|단,|예외/i.test(inside)) { conditions.push(inside.trim()); return ' '; } return all;
  }).replaceAll('≤', '<=').replaceAll('≥', '>=').replaceAll('～', '~').trim();
  const result = { rule, conditions, needsConfirmation: true };
  if (/^(N\.?D\.?|불검출|미검출|이상\s*없음|적합|양호)$/i.test(source)) return { ...result, needsConfirmation: false };
  const number = s => Number(s.replaceAll(',', ''));
  let m, operator, value, upper, units;
  const unit = '([^\\s<>~=]+(?:\\s*[^\\s<>~=]+)?)?';
  if ((m = source.match(new RegExp(`^(${numberPattern})\\s*${unit}\\s*(?:~|–|—|\\.\\.|\\s-\\s)\\s*(${numberPattern})\\s*${unit}$`)))) { operator = 'range'; value = number(m[1]); upper = number(m[3]); units = [m[2], m[4]]; }
  else if ((m = source.match(new RegExp(`^(${numberPattern})\\s*${unit}\\s*이상\\s*(${numberPattern})\\s*${unit}\\s*이하$`)))) { operator = 'range'; value = number(m[1]); upper = number(m[3]); units = [m[2], m[4]]; }
  else if ((m = source.match(new RegExp(`^(${numberPattern})\\s*(.*?)\\s*(이상|이하|초과|미만)$`)))) { operator = { 이상: 'gte', 이하: 'lte', 초과: 'gt', 미만: 'lt' }[m[3]]; value = number(m[1]); units = [m[2]]; }
  else if ((m = source.match(new RegExp(`^(>=|<=|>|<|==|=|min\\s+|max\\s+)\\s*(${numberPattern})\\s*(.*?)$`, 'i')))) { operator = { '>=': 'gte', '<=': 'lte', '>': 'gt', '<': 'lt', '=': 'eq', '==': 'eq', min: 'gte', max: 'lte' }[m[1].trim().toLowerCase()]; value = number(m[2]); units = [m[3]]; }
  if (!operator || units.some(u => u && (/[()*†‡]/.test(u) || /^[\d.]|^e[+-]?\d/i.test(u)))) return result;
  const presentUnits = [...units.filter(Boolean).map(u => u.trim()), ...(fallbackUnit ? [fallbackUnit.trim()] : [])];
  if (new Set(presentUnits.map(parseUnitKey)).size > 1 || (upper !== undefined && upper < value)) return result;
  return { ...result, needsConfirmation: false, comparison: { operator, value, unit: presentUnits[0] ?? '', ...(operator === 'range' ? { upper } : {}) } };
}
export const unitKey = (unit = '') => String(unit).trim().replace(/\s+/g, '').replaceAll('㎎', 'mg').replaceAll('㎏', 'kg').replaceAll('㎜', 'mm').replaceAll('％', '%').replaceAll('원', 'KRW').toLowerCase();
export function numericVerdict(value, unit, comparison) {
  if (!comparison || unitKey(unit) !== unitKey(comparison.unit)) return null;
  const text = String(value).trim(); if (!new RegExp(`^${numberPattern}$`).test(text)) return null;
  const n = Number(text.replaceAll(',', '')); if (!Number.isFinite(n)) return null;
  const t = comparison.value, answers = { lt: n < t, lte: n <= t, gt: n > t, gte: n >= t, eq: n === t, range: n >= t && n <= comparison.upper };
  return Object.hasOwn(answers, comparison.operator) ? answers[comparison.operator] ? 'pass' : 'fail' : null;
}
const semanticKey = c => JSON.stringify({ rule: normalizedText(c.rule), required: c.required !== false, conditions: [...new Set((c.conditions ?? []).map(normalizedText))].sort(), comparison: normalizeComparison(c.comparison), scope: normalizedText(c.scope), categoryPath: (c.categoryPath ?? []).map(normalizedText), sampleName: normalizedText(c.sampleName) });
export function approveCriteria(serverCriteria, submitted, { draft = false, allowedSourceDocumentIds = [] } = {}) {
  if (!Array.isArray(submitted) || submitted.length > 250 || (!draft && !submitted.length)) throw new AlgorithmError('확정할 기준은 1개 이상 250개 이하여야 합니다.');
  const originals = new Map(serverCriteria.map(c => [c.id, c])), ids = new Set();
  return submitted.map(input => {
    if (typeof input?.id !== 'string' || input.id !== input.id.trim() || ids.has(input.id)) throw new AlgorithmError('기준 ID가 올바르지 않습니다.'); ids.add(input.id);
    const prior = originals.get(input.id); if (!prior && !/^human-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.id)) throw new AlgorithmError('등록되지 않은 기준 ID입니다.');
    const editable = {}; for (const key of ['id', 'label', 'rule', 'required', 'conditions', 'comparison', 'scope', 'categoryPath', 'sampleName', 'classificationStatus', 'classificationNeedsConfirmation', 'draftState']) if (Object.hasOwn(input, key)) editable[key] = input[key];
    const hierarchyChanged = prior && JSON.stringify([prior.categoryPath ?? [], prior.sampleName ?? '']) !== JSON.stringify([input.categoryPath ?? [], input.sampleName ?? '']);
    if (hierarchyChanged && input.classificationStatus !== 'ambiguous') { editable.classificationNeedsConfirmation = false; editable.classificationStatus = (input.categoryPath?.length || input.sampleName) ? 'resolved' : 'not_applicable'; }
    if (input.classificationStatus === 'ambiguous') editable.classificationNeedsConfirmation = true;
    const normalized = validateCriteria([{ ...editable, needsConfirmation: draft ? !!input.needsConfirmation : false }], { draft })[0];
    const allowedSources = new Set([...allowedSourceDocumentIds, 'natural-language', 'unassigned']);
    const result = { ...(prior ? structuredClone(prior) : { source: '사용자 입력', sourceDocumentId: allowedSources.has(input.sourceDocumentId) ? input.sourceDocumentId : 'natural-language' }), ...normalized };
    for (const key of ['comparison', 'sampleName', 'scope', 'draftState']) if (!Object.hasOwn(normalized, key)) delete result[key];
    if (!draft) {
      delete result.draftState;
      const comparison = normalizeComparison(input.comparison);
      if (input.comparatorConfirmed === true && !comparison) throw new AlgorithmError('확정한 수치 비교식이 올바르지 않습니다.');
      if (comparison && (input.comparatorConfirmed === true || (prior?.rule === input.rule && JSON.stringify(normalizeComparison(prior.comparison)) === JSON.stringify(comparison)))) result.comparison = comparison; else delete result.comparison;
      if (prior?.contextNeedsConfirmation && semanticKey(prior) === semanticKey(result)) { result.contextNeedsConfirmation = true; result.needsConfirmation = true; delete result.comparison; }
      else if (prior?.contextNeedsConfirmation) { delete result.contextNeedsConfirmation; delete result.contextIssues; }
      result.needsConfirmation ||= result.classificationNeedsConfirmation;
    }
    if (!prior || semanticKey(prior) !== semanticKey(result)) { result.userOverride = true; result.overrideSource = '사용자 직접 수정'; }
    delete result.comparatorConfirmed;
    return result;
  });
}
export function normalizeHandlingCriteria(criteria) {
  const handling = c => !c.comparison && /빈칸|누락|판독\s*불가|missing|unreadable/i.test(c.rule) && /확인\s*필요|검토|review/i.test(c.rule);
  const substantive = criteria.filter(c => !handling(c)); if (!substantive.length) return criteria;
  const kept = [...substantive];
  for (const c of criteria.filter(handling)) {
    const tokens = c.label.split(/[\s·:(),]+/).filter(t => t.length > 1 && !/처리|누락|판독|지침|확인/.test(t));
    const match = substantive.find(s => tokens.some(t => compact(s.label).includes(compact(t))));
    if (match) { match.rule = `${match.rule} · ${c.rule}`; match.handlingNotes = [...(match.handlingNotes ?? []), c.rule]; }
    else if (/pass|fail|적합|부적합/i.test(c.rule)) kept.push(c);
  }
  return kept;
}
const union = (...lists) => [...new Map(lists.flatMap(v => Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []).filter(v => v && typeof v === 'object').map(v => [JSON.stringify(v), v])).values()];
export function deduplicateCriteria(criteria) {
  const map = new Map();
  for (const c of criteria) {
    const citations = union(c.evidenceCells, c.citations, c.sourceEvidence), documents = [...new Set([c.sourceDocumentId, ...citations.map(e => e.documentId)].filter(Boolean))].sort();
    const comparison = c.comparison ?? parseRule(c.rule, c.unit ?? '').comparison;
    const key = JSON.stringify([documents, compact(c.label), comparison ? [comparison.operator, comparison.value, comparison.upper] : compact(c.rule), unitKey(comparison?.unit ?? c.unit ?? ''), compact(c.scope), (c.categoryPath ?? []).map(compact), compact(c.sampleName), [...new Set((c.conditions ?? []).map(compact))].sort(), c.required !== false]);
    if (!map.has(key)) { map.set(key, { ...c }); continue; }
    const merged = map.get(key); merged.evidenceCells = union(merged.evidenceCells, merged.citations, merged.sourceEvidence, citations); merged.sourceEvidence = [...merged.evidenceCells];
    for (const field of ['hierarchyEvidence', 'hierarchyCitations', 'unitCitations', 'conditionCitations', 'scopeCitations', 'sampleCitations', 'ignoredSourceNotes']) if (c[field] || merged[field]) merged[field] = union(merged[field], c[field]);
    merged.needsConfirmation ||= c.needsConfirmation; merged.classificationNeedsConfirmation ||= c.classificationNeedsConfirmation;
    if (c.classificationStatus === 'ambiguous') merged.classificationStatus = 'ambiguous';
    for (const [field, separator] of [['source', ', '], ['classificationReason', ' ']]) if (c[field]) merged[field] = [...new Set([merged[field], c[field]].filter(Boolean))].join(separator);
    if (c.contextNeedsConfirmation || merged.contextNeedsConfirmation) { merged.contextNeedsConfirmation = true; merged.contextIssues = union(merged.contextIssues, c.contextIssues); if (merged.unit === undefined && merged.comparison?.unit !== undefined) merged.unit = merged.comparison.unit; delete merged.comparison; }
  }
  return [...map.values()];
}

export function criterionSourceGroup(criterion, documents = []) {
  const known = new Set(documents.map(d => d.id));
  if (criterion.sourceDocumentId === 'unassigned') return 'unassigned';
  if (known.has(criterion.sourceDocumentId) || criterion.sourceDocumentId === 'natural-language') return criterion.sourceDocumentId;
  const ids = [...new Set(union(criterion.sourceEvidence, criterion.evidenceCells, criterion.hierarchyEvidence).map(e => e.documentId).filter(id => known.has(id)))];
  if (ids.length === 1) return ids[0];
  if (known.has(criterion.source)) return criterion.source;
  if (typeof criterion.source === 'string' && /사용자\s*입력/.test(criterion.source)) return 'natural-language';
  return 'unassigned';
}
export function applyCriteriaRevision(criteria, patch, { documents = [], documentId, feedback = '', idFactory = randomUUID } = {}) {
  const failure = message => { throw new AlgorithmError(message, 'CRITERIA_REVISION_RESPONSE'); };
  if (!Array.isArray(criteria) || criteria.length > 250 || !Array.isArray(documents) || documents.length > 30 || typeof feedback !== 'string' || feedback.length > 12000) throw new AlgorithmError('기준 수정 입력이 올바르지 않습니다.', 'CRITERIA_REVISION_INPUT');
  const before = new Map(); for (const c of criteria) { if (!c || typeof c.id !== 'string' || !c.id || c.id !== c.id.trim() || c.id.length > 100 || before.has(c.id)) throw new AlgorithmError('기준 ID가 올바르지 않습니다.', 'CRITERIA_REVISION_INPUT'); before.set(c.id, c); }
  const allowedSources = new Set([...documents.map(d => d.id), 'natural-language', 'unassigned']);
  if (documentId !== undefined && !allowedSources.has(documentId)) throw new AlgorithmError('기준 출처 그룹이 올바르지 않습니다.', 'CRITERIA_REVISION_INPUT');
  if (!patch || !Array.isArray(patch.changes) || !Array.isArray(patch.additions) || !Array.isArray(patch.removeIds) || typeof patch.summary !== 'string' || !patch.summary.trim() || patch.warnings !== undefined && (!Array.isArray(patch.warnings) || patch.warnings.some(w => typeof w !== 'string'))) failure('기준 수정 응답 형식이 올바르지 않습니다.');
  const editable = ['label', 'rule', 'required', 'scope', 'conditions', 'comparison', 'categoryPath', 'sampleName', 'classificationNeedsConfirmation', 'classificationStatus', 'needsConfirmation'];
  const changes = new Map(), removals = new Set();
  const checkId = id => { if (typeof id !== 'string' || id !== id.trim() || !before.has(id) || documentId !== undefined && criterionSourceGroup(before.get(id), documents) !== documentId) failure('수정 대상 기준이 선택한 출처 그룹에 없습니다.'); };
  for (const change of patch.changes) {
    if (!change || Object.keys(change).some(k => k !== 'id' && !editable.includes(k))) failure('허용되지 않은 기준 수정 필드입니다.');
    checkId(change.id); if (changes.has(change.id)) failure('같은 기준을 중복 수정할 수 없습니다.'); changes.set(change.id, change);
  }
  for (const id of patch.removeIds) { checkId(id); if (removals.has(id) || changes.has(id)) failure('수정과 제거 대상 기준이 중복됩니다.'); removals.add(id); }
  if (removals.size && !/삭제|제거|빼|제외|대체|remove|delete|replace|drop|exclude/i.test(feedback)) failure('사용자가 기준 제거 또는 대체를 요청하지 않았습니다.');
  const apply = (prior, change, addition = false) => {
    const next = structuredClone(prior);
    for (const key of editable) if (Object.hasOwn(change, key)) {
      if (['required', 'classificationNeedsConfirmation', 'needsConfirmation'].includes(key) && typeof change[key] !== 'boolean') failure(`${key} 값은 boolean이어야 합니다.`);
      if (key === 'comparison' && change.comparison !== null && !normalizeComparison(change.comparison)) failure('수치 비교식이 올바르지 않습니다.');
      next[key] = structuredClone(change[key]);
    }
    if (Object.hasOwn(change, 'rule') && change.rule !== prior.rule && !Object.hasOwn(change, 'comparison') || change.comparison === null) delete next.comparison;
    const semanticChanged = semanticKey(next) !== semanticKey(prior);
    if ((prior.needsConfirmation || prior.contextNeedsConfirmation) && !(semanticChanged && change.needsConfirmation === false)) next.needsConfirmation = true;
    if (prior.contextNeedsConfirmation && semanticChanged && change.needsConfirmation === false) { delete next.contextNeedsConfirmation; delete next.contextIssues; }
    if (Object.hasOwn(change, 'classificationStatus') && change.classificationStatus === 'ambiguous') next.classificationNeedsConfirmation = true;
    if (semanticChanged && change.classificationNeedsConfirmation === false && change.classificationStatus !== 'ambiguous') next.classificationStatus = (next.categoryPath?.length || next.sampleName) ? 'resolved' : 'not_applicable';
    if (['numeric', 'choose'].includes(prior.draftState?.mode) && !next.comparison && change.comparison !== null) failure('미완성 숫자 초안을 명시적으로 확정하거나 정성 기준으로 전환해야 합니다.');
    let normalized; try { normalized = validateCriteria([next])[0]; } catch (error) { failure(error.message); }
    const result = { ...next, ...normalized };
    if (!normalized.comparison) delete result.comparison;
    delete result.comparatorConfirmed; delete result.draftState;
    if (addition || Object.keys(change).some(k => k !== 'id')) { result.userOverride = true; result.overrideSource = '사용자 수정 요청'; }
    return result;
  };
  const result = criteria.filter(c => !removals.has(c.id)).map(c => changes.has(c.id) ? apply(c, changes.get(c.id)) : structuredClone(c));
  for (const addition of patch.additions) {
    if (!addition || Object.keys(addition).some(k => k !== 'sourceDocumentId' && !editable.includes(k)) || !allowedSources.has(addition.sourceDocumentId) || documentId !== undefined && addition.sourceDocumentId !== documentId) failure('추가 기준의 출처 또는 필드가 올바르지 않습니다.');
    const source = documents.find(d => d.id === addition.sourceDocumentId);
    const original = { id: `revision-${idFactory()}`, label: '', rule: '', sourceDocumentId: addition.sourceDocumentId, source: source?.name ?? '사용자 입력', ...(source ? { sourceName: source.name } : {}), conditions: [], categoryPath: [], needsConfirmation: false };
    result.push(apply(original, addition, true));
  }
  try { validateCriteria(result, { allowEmpty: true }); } catch (error) { failure(error.message); }
  return { criteria: result, summary: patch.summary.trim(), warnings: [...(patch.warnings ?? [])] };
}

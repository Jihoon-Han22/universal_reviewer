import { compact, literalIncludes, parseRange, addressOf, textOf, sourceRows, sourceSheets, recordRows, evidenceRecords } from './table-records.mjs';
import { AlgorithmError, boundedString, normalizeClassification } from './criteria-normalization.mjs';
export const isVisual = document => ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(document.kind);
const flattenTable = table => [...(table.rows ?? []).map(r => r.join(' ')), ...(table.nestedTables ?? []).flatMap(flattenTable)];
export function trustedText(document) {
  const p = document.sandboxProfile ?? {};
  return [p.text, ...(p.blocks ?? []).flatMap(b => b.kind === 'table' ? flattenTable(b) : [b.text]), ...(p.supplementaryText ?? []).map(t => t.text)].filter(t => typeof t === 'string').join('\n').replace(/^(?:DOCUMENT_NAME|ROLE|LINE\s*\d+|PARAGRAPH\s*\d+)\s*[:=].*$/gm, '');
}
export function verifiedVisualRegions(document, pageNumber) {
  const t = document.transcription, coverage = t?.coverage, expected = coverage?.expectedPages;
  if (!t || t.quality?.status !== 'verified' || t.quality.issues?.length || t.quality.issueDetails?.length || t.issueDetails?.length || t.warnings?.length || t.requiresConfirmation !== false || coverage.complete !== true || !Number.isInteger(expected) || expected < 1 || coverage.missingPages?.length || !Array.isArray(t.pages) || t.pages.length !== expected || new Set(t.pages.map(p => p.page)).size !== expected) return [];
  if (document.kind !== 'pdf' && isVisual(document) && expected !== 1) return [];
  const count = document.sandboxProfile?.inventory?.pageCount ?? document.analysis?.inventory?.pageCount;
  if (document.kind === 'pdf' && count !== undefined && count !== expected) return [];
  if (!Array.isArray(coverage.transcribedPages) || coverage.transcribedPages.length !== expected || new Set(coverage.transcribedPages).size !== expected || coverage.transcribedPages.some(p => !Number.isInteger(p) || p < 1 || p > expected)) return [];
  if (t.pages.some(p => !Number.isInteger(p.page) || p.page < 1 || p.page > expected || p.complete !== true || p.warnings?.length)) return [];
  const p = t.pages.find(p => p.page === pageNumber); if (!p || !Array.isArray(p.blocks) || !Array.isArray(p.tables)) return [];
  if (p.blocks.some(b => typeof b.text !== 'string' || b.uncertain !== false) || p.tables.some(t => !Array.isArray(t.cells) || t.cells.some(c => typeof c.text !== 'string' || c.uncertain !== false || !Number.isInteger(c.row) || c.row < 1))) return [];
  return [...p.blocks.map(b => b.text), ...p.tables.flatMap(t => { const rows = new Map(); for (const c of t.cells) { if (!rows.has(c.row)) rows.set(c.row, []); rows.get(c.row).push(c); } return [...rows.values()].map(cells => cells.sort((a, b) => a.column - b.column).map(c => c.text).join(' ')); })];
}
export function sourceRegions(document, evidence, { wholeRow = false, visual = true, conditions = false, comments = false } = {}) {
  if (!evidence || evidence.documentId !== document.id) return [];
  if (document.kind === 'xlsx' || document.sourceSheets?.length) {
    const sheet = sourceSheets(document).find(s => s.name === evidence.sheet), range = parseRange(evidence.cell); if (!sheet || !range) return [];
    return (sheet.rows ?? []).filter(r => r.row >= range.r1 && r.row <= range.r2).flatMap(r => { const cells = r.cells.filter(c => { const p = parseRange(addressOf(c)); return p && (wholeRow || p.c1 >= range.c1 && p.c1 <= range.c2); }).sort((a, b) => parseRange(addressOf(a)).c1 - parseRange(addressOf(b)).c1); return [cells.map(textOf).join(' '), ...(comments ? cells.map(c => c.comment).filter(Boolean) : [])]; });
  }
  if (document.kind === 'csv' || document.sourceRows) {
    const range = parseRange(evidence.cell); if (!range || (evidence.sheet !== undefined && evidence.sheet !== document.name)) return [];
    return sourceRows(document).filter(r => r.row >= range.r1 && r.row <= range.r2).map(r => (wholeRow ? r.cells : r.cells.slice(range.c1 - 1, range.c2)).join(' '));
  }
  if (document.kind === 'pdf') {
    const text = (document.verificationPages ?? []).filter(p => p.page === evidence.page).map(p => p.text);
    return [...text, ...(visual && !conditions ? verifiedVisualRegions(document, evidence.page) : [])];
  }
  if (isVisual(document)) return visual && !conditions ? verifiedVisualRegions(document, evidence.page) : [];
  if (conditions) return (document.modelParts ?? []).filter(p => typeof p.text === 'string').map(p => p.text);
  const text = trustedText(document); return text ? [text] : [];
}
export function sourceEvidenceVerified(document, e, options) { return typeof e?.quote === 'string' && !!e.quote.trim() && sourceRegions(document, e, options).some(s => literalIncludes(s, e.quote, options)); }
export function verifyCriterionApplicability(criterion, raw, document, measurementEvidence = []) {
  let classification;
  try { classification = normalizeClassification(criterion); } catch { return { verified: false, reason: '기준의 유형 또는 시료 분류를 확인해야 합니다.' }; }
  if (classification.classificationNeedsConfirmation) return { verified: false, reason: '기준의 유형 분류가 미확정입니다.' };
  const path = classification.categoryPath, sample = classification.sampleName;
  if (!path.length && !sample) return { verified: true };
  const fail = reason => ({ verified: false, reason, ...(Array.isArray(raw?.categoryPath) ? { targetCategoryPath: raw.categoryPath } : {}) });
  if (!raw || raw.matched !== true || raw.uncertain !== false) return fail('대상 유형 또는 시료의 적용성을 확인할 수 없습니다.');
  let target; try { target = normalizeClassification(raw); } catch { return fail('대상 분류 형식이 올바르지 않습니다.'); }
  let index = 0; for (const step of target.categoryPath) if (compact(step) === compact(path[index])) index++;
  if (index !== path.length || (sample && compact(sample) !== compact(raw.sampleName))) return fail('기준의 유형 또는 시료와 대상이 일치하지 않습니다.');
  if (!Array.isArray(raw.evidence) || raw.evidence.length < 1 || raw.evidence.length > 8 || raw.evidence.some(e => !sourceEvidenceVerified(document, e))) return fail('유형 또는 시료의 원문 근거를 확인할 수 없습니다.');
  if ([...path, ...(sample ? [sample] : [])].some(token => !raw.evidence.some(e => literalIncludes(e.quote, token)))) return fail('기준의 유형 또는 시료를 뒷받침하는 인용이 없습니다.');
  if (recordRows(document).length) {
    const records = evidenceRecords(document, measurementEvidence);
    if (records.length !== 1) return fail('측정값의 단일 레코드를 확인할 수 없습니다.');
    const row = records[0];
    if (raw.evidence.some(e => { const r = parseRange(e.cell); return !r || r.r1 !== row.row || r.r2 !== row.row || (row.sheet && row.sheet !== e.sheet); })) return fail('유형 근거와 측정값이 같은 레코드에 있지 않습니다.');
  }
  return { verified: true, evidence: raw.evidence.map(e => ({ documentId: e.documentId, quote: e.quote, ...(e.page !== undefined ? { page: e.page } : {}), ...(e.sheet !== undefined ? { sheet: e.sheet } : {}), ...(e.cell !== undefined ? { cell: e.cell } : {}) })), targetCategoryPath: target.categoryPath };
}
export function completeCriteriaAnalysis(document) {
  const a = document.analysis, c = a?.coverage, p = document.sandboxProfile;
  return p?.coverage?.complete === true && p.status !== 'unsupported' && a?.status === 'complete' && c?.complete === true && c.readerComplete === true && c.contextComplete === true && c.sourceTruncated !== true && c.truncated !== true && p.coverage.truncated !== true && c.visualAnalysisPending !== true && !(Number.isFinite(c.sourceChars) && Number.isFinite(c.contextChars) && c.contextChars < c.sourceChars) && !(Number.isFinite(c.contextSegmentsTotal) && Number.isFinite(c.contextSegmentsRead) && c.contextSegmentsRead < c.contextSegmentsTotal) && !c.missingContextSheets?.length && a.needsConfirmation !== true && (a.quality === undefined || a.quality.status === 'verified') && (a.questions === undefined || Array.isArray(a.questions) && !a.questions.length);
}
function validateAssessmentOrThrow(raw, document, { inputComplete = true } = {}) {
  if (!raw || !['criteria', 'not_criteria', 'uncertain'].includes(raw.status) || typeof raw.hasNormativeContent !== 'boolean' || !Array.isArray(raw.evidence) || raw.evidence.length > 8) throw new AlgorithmError('기준서 자격 응답 형식이 올바르지 않습니다.');
  const reason = boundedString(raw.reason, '자격 판단 이유', 1500);
  if (raw.sourceKind !== undefined && !['standard', 'policy', 'measurement_report', 'ledger', 'mixed', 'other', 'unknown'].includes(raw.sourceKind)) throw new AlgorithmError('문서 유형이 올바르지 않습니다.');
  const evidence = raw.evidence.map(e => {
    if (!e || Object.keys(e).some(k => !['documentId', 'quote', 'page', 'sheet', 'cell'].includes(k)) || e.documentId !== document.id || typeof e.quote !== 'string' || !e.quote.trim() || e.quote.length > 2000) throw new AlgorithmError('자격 판단 인용 형식이 올바르지 않습니다.');
    if (document.kind === 'xlsx' && (typeof e.sheet !== 'string' || !parseRange(e.cell))) throw new AlgorithmError('실제 시트와 셀 인용이 필요합니다.');
    if (document.kind === 'csv' && (!parseRange(e.cell) || (e.sheet !== undefined && e.sheet !== document.name))) throw new AlgorithmError('실제 CSV 셀 인용이 필요합니다.');
    if (isVisual(document) && (!Number.isInteger(e.page) || e.page < 1 || e.sheet !== undefined || e.cell !== undefined)) throw new AlgorithmError('실제 페이지 인용이 필요합니다.');
    if (!isVisual(document) && !['xlsx', 'csv'].includes(document.kind) && ['page', 'sheet', 'cell'].some(k => e[k] !== undefined)) throw new AlgorithmError('텍스트 원문의 위치를 발명할 수 없습니다.');
    if (!sourceEvidenceVerified(document, e, { caseSensitive: true, collapse: true, comments: true })) throw new AlgorithmError('자격 판단 인용을 원문에서 찾을 수 없습니다.');
    return { ...e };
  });
  if (raw.status !== 'uncertain' && !evidence.length) throw new AlgorithmError('확정 자격 판단에는 원문 인용이 필요합니다.');
  if (raw.status === 'criteria' && !raw.hasNormativeContent || raw.status === 'not_criteria' && (raw.hasNormativeContent || ['standard', 'policy', 'mixed'].includes(raw.sourceKind))) throw new AlgorithmError('자격 판단 응답이 서로 모순됩니다.');
  const excludedIncomplete = raw.status === 'not_criteria' && (!inputComplete || !completeCriteriaAnalysis(document));
  return { documentId: document.id, name: document.name, status: excludedIncomplete ? 'uncertain' : raw.status, reason: excludedIncomplete ? '문서 전체 읽기와 문맥 확인이 완료되지 않아 기준서 제외를 확정할 수 없습니다.' : reason, evidence, ...(raw.sourceKind ? { sourceKind: raw.sourceKind } : {}) };
}
export function validateAssessment(raw, document, options = {}) {
  try { return validateAssessmentOrThrow(raw, document, options); }
  catch (error) { if (options.strict) throw error; return { documentId: document.id, name: document.name, status: 'uncertain', reason: error.message, evidence: [] }; }
}

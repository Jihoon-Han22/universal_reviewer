import { compact, literalIncludes, parseRange, sourceRows, sourceSheets, recordRows, evidenceRecords, addressOf, textOf } from './table-records.mjs';
import { isVisual, sourceEvidenceVerified, trustedText } from './criterion-applicability.mjs';
export const absentValue = value => /^(?:|n\/?d|n\/?a|null|none|미검출|판독\s*불가|확인\s*불가|누락|미기재|미제출|미첨부|missing|absent|가려짐|측정\s*불가|-|—)$/i.test(String(value ?? '').trim());
export const missingValue = value => /^(?:|누락|미기재|미제출|미첨부|missing|absent|null|none)$/i.test(String(value ?? '').trim());
export function criterionRequired(criterion) { return typeof criterion.required === 'boolean' ? criterion.required : !/선택\s*(사항|항목|제출)|필수\s*아님|제출\s*의무\s*없음|기재된\s*경우만|값이\s*있는\s*경우만|optional|not\s*required|only\s*if\s*(provided|present)/i.test(criterion.rule); }
export function exactBlankEvidence(document, evidence) {
  if (evidence?.documentId !== document.id) return false;
  const range = parseRange(evidence.cell); if (!range || range.r1 !== range.r2 || range.c1 !== range.c2) return false;
  if (document.kind === 'csv' || document.sourceRows) {
    const rows = sourceRows(document), row = rows.find(r => r.row === range.r1), headers = rows[0]?.cells;
    return !!row && !!headers && range.c1 <= headers.length && typeof headers[range.c1 - 1] === 'string' && !!headers[range.c1 - 1].trim() && range.c1 <= row.cells.length && String(row.cells[range.c1 - 1]).trim() === '';
  }
  const sheet = sourceSheets(document).find(s => s.name === evidence.sheet); if (!sheet || !recordRows(document).some(r => r.sheet === sheet.name && r.row === range.r1)) return false;
  if ((sheet.mergedRanges ?? []).some(m => { const r = parseRange(m); return r && range.r1 >= r.r1 && range.r1 <= r.r2 && range.c1 >= r.c1 && range.c1 <= r.c2; })) return false;
  const record = recordRows(document).find(r => r.sheet === sheet.name && r.row === range.r1);
  if (!record.cells.some(c => c.cell === evidence.cell && c.value.trim() === '')) return false;
  const cell = sheet.rows.find(r => r.row === range.r1)?.cells.find(c => addressOf(c) === evidence.cell);
  return !cell?.formula && !cell?.uncachedFormula && !cell?.cacheMissing && !cell?.mergedRange && (!cell || textOf(cell).trim() === '');
}
const incomplete = /잘림|잘렸|가려짐|판독\s*불가|미읽은\s*페이지|추출\s*한도|truncated|cropped|missing\s*pages|unreadable|extraction\s*limit/i;
export function missingCoverageComplete(document, reviewCoverage) {
  const a = document.analysis, c = a?.coverage, t = document.transcription;
  if (c?.complete !== true || c.readerComplete === false || c.contextComplete === false || c.sourceTruncated || a.needsConfirmation || ['partial', 'failed'].includes(a.status) || reviewCoverage?.complete === false || (document.extraction?.fields?.length ?? 0) >= 300) return false;
  if (isVisual(document)) {
    const expected = t?.coverage?.expectedPages;
    if (!t || t.quality?.status !== 'verified' || !Array.isArray(t.pages) || !t.pages.length || !Number.isInteger(expected) || expected < 1 || t.pages.length !== expected || new Set(t.pages.map(p => p.page)).size !== expected || t.pages.some(p => !Number.isInteger(p.page) || p.page < 1 || p.page > expected || p.complete !== true || (p.blocks ?? []).some(b => b.uncertain !== false) || (p.tables ?? []).some(t => (t.cells ?? []).some(c => c.uncertain !== false))) || !Array.isArray(t.coverage.transcribedPages) || new Set(t.coverage.transcribedPages).size !== expected || t.quality.issues?.length || t.quality.issueDetails?.length || t.issueDetails?.length) return false;
    const actualCount = document.sandboxProfile?.inventory?.pageCount ?? document.analysis?.inventory?.pageCount; if (actualCount !== undefined && actualCount !== expected) return false;
  }
  if (t && (t.coverage?.complete !== true || t.requiresConfirmation || t.coverage?.missingPages?.length || t.quality && t.quality.status !== 'verified' || t.pages?.some(p => p.complete === false))) return false;
  const warnings = [...(a.warnings ?? []), ...(document.extraction?.warnings ?? []), ...(t?.warnings ?? []), ...(t?.pages ?? []).flatMap(p => p.warnings ?? [])];
  return !warnings.some(w => incomplete.test(w));
}
export function evaluateMissingResult(raw, criterion, document, { reviewCoverage } = {}) {
  const candidate = raw.presence === 'missing' || missingValue(raw.value);
  const required = criterionRequired(criterion);
  if (!candidate) return { candidate: false, required, verified: false, omit: false };
  if (!required) return { candidate: true, required: false, verified: false, omit: true };
  const result = { candidate: true, required: true, verified: false, omit: false };
  if (!missingValue(raw.value) || raw.uncertain || ['present', 'unreadable', 'unknown'].includes(raw.presence) || !missingCoverageComplete(document, reviewCoverage)) return result;
  const evidence = raw.evidence ?? [], records = evidenceRecords(document, evidence), one = records.length === 1 ? records[0] : null;
  const related = (document.extraction?.fields ?? []).filter(f => { const a = compact(f.label), b = compact(criterion.label), c = compact(raw.label); return a && (a.includes(b) || b.includes(a) || a.includes(c) || c.includes(a)); });
  if (related.some(f => { if (one) { const rows = evidenceRecords(document, f.evidence); if (rows.length && !rows.some(r => r.row === one.row && r.sheet === one.sheet)) return false; } return f.uncertain || f.verification === 'mismatch' || !missingValue(f.value); })) return result;
  const labelKeys = [criterion.label, raw.label].map(compact).filter(Boolean);
  const matchingCells = one?.cells.filter(c => labelKeys.some(label => compact(c.header).includes(label) || label.includes(compact(c.header)))) ?? [];
  if (matchingCells.some(c => c.value.trim() !== '' || c.formula)) return result;
  const exact = evidence.some(e => (e.blank === true || e.quote === '') && exactBlankEvidence(document, e));
  const recordBlank = !!one && matchingCells.length > 0 && matchingCells.every(c => exactBlankEvidence(document, { documentId: document.id, sheet: one.sheet, cell: c.cell }));
  const source = [trustedText(document), ...(document.verificationPages ?? []).map(p => p.text), ...sourceRows(document).map(r => r.cells.join(' ')), ...sourceSheets(document).flatMap(s => s.rows.map(r => r.cells.map(textOf).join(' '))), ...(document.transcription?.pages ?? []).flatMap(p => [...(p.blocks ?? []).map(b => b.text), ...(p.tables ?? []).flatMap(t => t.cells.map(c => c.text))])].join('\n');
  if (literalIncludes(source, criterion.label) && !exact && !recordBlank) return result;
  if (!exact && !evidence.some(e => sourceEvidenceVerified(document, e))) return result;
  return { ...result, verified: true };
}

import { compact, literalIncludes, sourceRows, sourceSheets, parseRange, textOf } from './table-records.mjs';
import { AlgorithmError, boundedString } from './criteria-normalization.mjs';
import { sourceRegions, trustedText } from './criterion-applicability.mjs';
export function validatePublicEvidence(raw, document, { max = 8, quoteLimit = 2000, allowBlank = false, blankVerifier } = {}) {
  if (!Array.isArray(raw) || raw.length > max) throw new AlgorithmError('근거 배열 형식이 올바르지 않습니다.');
  return raw.map(e => {
    if (!e || e.documentId !== document.id || typeof e.quote !== 'string' || e.quote.length > quoteLimit || e.page !== undefined && (!Number.isInteger(e.page) || e.page < 1 || e.page > 10000) || e.sheet !== undefined && (typeof e.sheet !== 'string' || e.sheet.length > 200) || e.cell !== undefined && (typeof e.cell !== 'string' || !/^[A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?$/.test(e.cell))) throw new AlgorithmError('근거 인용 형식이 올바르지 않습니다.');
    const blank = !e.quote.trim() && allowBlank && blankVerifier?.(document, e);
    if (!e.quote.trim() && !blank) throw new AlgorithmError('비어 있는 인용을 실제 빈 셀로 확인할 수 없습니다.');
    return { documentId: e.documentId, quote: e.quote, ...(e.page !== undefined ? { page: e.page } : {}), ...(e.sheet !== undefined ? { sheet: e.sheet } : {}), ...(e.cell !== undefined ? { cell: e.cell } : {}), ...(blank ? { blank: true } : {}) };
  });
}
export function verifyExtractedField(field, document, allFields = []) {
  let regions = [];
  for (const e of field.evidence ?? []) regions.push(...sourceRegions(document, e, { wholeRow: true, visual: false }));
  if (!regions.length && !['xlsx', 'csv', 'pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(document.kind)) { const text = trustedText(document); if (text) regions = [text]; }
  const lines = regions.flatMap(s => s.split(/\r?\n/)), label = compact(field.label); let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (!literalIncludes(lines[i], label)) continue; found = true;
    let candidate = lines[i];
    if (compact(lines[i]) === label) for (let n = 1; n <= 2 && i + n < lines.length; n++) { if (allFields.some(f => f !== field && compact(f.label) !== label && literalIncludes(lines[i + n], f.label))) break; candidate += ` ${lines[i + n]}`; }
    if (literalIncludes(candidate, field.value)) return 'verified';
  }
  return found ? 'mismatch' : 'unverified';
}
export function normalizeDocumentExtraction(raw, document) {
  if (!raw || !Array.isArray(raw.fields) || raw.fields.length > 300 || !Array.isArray(raw.warnings ?? []) || (raw.warnings?.length ?? 0) > 30) throw new AlgorithmError('독립 추출 결과 형식이 올바르지 않습니다.');
  const out = { referenceNumber: raw.referenceNumber == null ? '' : boundedString(raw.referenceNumber, '성적서 번호', 300, true), documentType: boundedString(raw.documentType ?? '문서', '문서 유형', 200), fields: [], warnings: (raw.warnings ?? []).map(w => boundedString(w, '추출 경고', 2000)) };
  out.fields = raw.fields.map(f => { if (!f || typeof f.uncertain !== 'boolean') throw new AlgorithmError('독립 추출 항목 형식이 올바르지 않습니다.'); const evidence = validatePublicEvidence(f.evidence ?? [], document, { quoteLimit: 2500 }); return { label: boundedString(f.label, '추출 항목', 500), value: boundedString(f.value, '추출 값', 2000, true), unit: boundedString(f.unit ?? '', '단위', 80, true), uncertain: f.uncertain || !String(f.value).trim() || !evidence.length, evidence }; });
  for (const f of out.fields) {
    if (f.unit && f.unit !== '-' && f.value.endsWith(f.unit)) f.value = f.value.slice(0, -f.unit.length).trim();
    f.verification = verifyExtractedField(f, document, out.fields); if (f.verification === 'mismatch') f.uncertain = true;
  }
  const pages = document.verificationPages ?? [];
  const addWarning = message => { if (!out.warnings.includes(message)) { if (out.warnings.length >= 30) out.warnings[out.warnings.length - 1] = message; else out.warnings.push(message); } };
  if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(document.kind) && !pages.some(p => p.text.trim())) addWarning('디지털 텍스트가 없어 독립 텍스트 대조를 수행할 수 없습니다.');
  if (document.kind === 'pdf' && pages.some(p => p.text.trim()) && out.referenceNumber) { out.referenceNumberVerified = pages.some(p => literalIncludes(p.text, out.referenceNumber)); if (!out.referenceNumberVerified) { out.referenceNumber = ''; addWarning('추출한 성적서 번호를 원문에서 확인할 수 없습니다.'); } }
  return out;
}
export const extractDocumentFields = normalizeDocumentExtraction;

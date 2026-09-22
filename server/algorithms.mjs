import { randomUUID } from 'node:crypto';
import { AlgorithmError, boundedString, unitKey, numericVerdict } from './criteria-normalization.mjs';
import { compact, sourceRows, recordRows } from './table-records.mjs';
import { validatePublicEvidence } from './field-extraction.mjs';
import { absentValue, exactBlankEvidence, evaluateMissingResult } from './missing-result.mjs';
import { verifyConditions } from './conditions.mjs';
import { verifyCriterionApplicability } from './criterion-applicability.mjs';
export * from './criteria-normalization.mjs';
export * from './table-records.mjs';
export * from './conditions.mjs';
export * from './criterion-applicability.mjs';
export * from './missing-result.mjs';
export * from './field-extraction.mjs';

/** A fresh UUID is the only nondeterministic output; options.idFactory supports deterministic DI. */
export function normalizeItems(rawItems, document, criteria, { reviewCoverage, idFactory = randomUUID } = {}) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 250) throw new AlgorithmError('검토 결과는 1개 이상 250개 이하여야 합니다.');
  const coverage = rawItems.length >= 250 ? { ...reviewCoverage, complete: false } : reviewCoverage;
  const result = [];
  for (const raw of rawItems) {
    if (!raw || !['pass', 'fail', 'review'].includes(raw.status) || typeof raw.uncertain !== 'boolean' || typeof raw.criterionId !== 'string' || raw.documentId !== undefined && raw.documentId !== document.id || raw.presence !== undefined && !['present', 'missing', 'unreadable', 'unknown'].includes(raw.presence)) throw new AlgorithmError('검토 결과 형식이 올바르지 않습니다.');
    const criterion = criteria.find(c => c.id === raw.criterionId); if (!criterion) throw new AlgorithmError('승인되지 않은 기준 ID입니다.');
    const label = boundedString(raw.label, '판정 항목', 500), value = boundedString(raw.value, '판정 값', 2000, true), unit = boundedString(raw.unit ?? '', '단위', 80, true), explanation = boundedString(raw.explanation, '판정 설명', 4000, true);
    const evidence = validatePublicEvidence(raw.evidence, document, { allowBlank: true, blankVerifier: exactBlankEvidence });
    const normalized = { ...raw, label, value, unit, explanation, evidence };
    const missing = evaluateMissingResult(normalized, criterion, document, { reviewCoverage: coverage }); if (missing.omit) continue;
    const absent = absentValue(value), numeric = numericVerdict(value, unit, criterion.comparison);
    let status = raw.status, detail = explanation, uncertain = raw.uncertain;
    const criterionUncertain = criterion.needsConfirmation || criterion.contextNeedsConfirmation;
    if (missing.verified && !criterionUncertain) { status = 'fail'; detail = '필수 항목이 원문에서 누락된 것으로 확인되었습니다.'; }
    else if (raw.uncertain || !evidence.length || absent || missing.candidate || ['unreadable', 'unknown'].includes(raw.presence) || criterionUncertain) status = 'review';
    else if (criterion.comparison) { status = numeric ?? 'review'; if (numeric) detail = numeric === 'pass' ? '측정값이 승인된 수치 기준을 충족합니다.' : '측정값이 승인된 수치 기준을 충족하지 않습니다.'; }
    const conditions = verifyConditions(criterion, evidence, document);
    if (!conditions.verified) { status = 'review'; uncertain = true; detail = `적용 조건의 원문 근거를 확인해야 합니다: ${conditions.missingConditions.join(', ')}`; }
    const applicability = verifyCriterionApplicability(criterion, raw.applicability, document, evidence);
    if (!applicability.verified) { status = 'review'; uncertain = true; detail = applicability.reason; }
    let extractionMismatch = false;
    if (document.extraction && !absent) {
      const labels = [raw.label, criterion.label].map(compact);
      const candidates = (document.extraction.fields ?? []).filter(f => { const a = compact(f.label); return a && labels.some(b => a.includes(b) || b.includes(a)); });
      const match = candidates.find(f => compact(f.value) === compact(value) && unitKey(f.unit) === unitKey(unit));
      if (!match || match.uncertain || match.verification === 'mismatch') { extractionMismatch = true; status = 'review'; uncertain = true; detail = '독립 추출 결과와 판정 값 또는 단위가 일치하지 않아 확인이 필요합니다.'; }
    }
    if (missing.candidate && status === 'review') uncertain = true;
    let displayLabel = label;
    if (document.sourceRows) {
      const rows = new Set(evidence.filter(e => e.cell && !e.cell.includes(':')).map(e => Number(e.cell.match(/\d+/)?.[0])));
      if (rows.size === 1) {
        const source = sourceRows(document), row = source.find(r => r.row === [...rows][0]), first = row?.cells.find(c => String(c).trim());
        const nameIndex = source[0]?.cells.findIndex(c => /^(이름|성명|직원|업체|업체명|name|employee|subject)$/i.test(String(c).trim())) ?? -1;
        if (first) displayLabel = [first, nameIndex > 0 ? row.cells[nameIndex] : '', criterion.label].filter(Boolean).join(' · ');
      }
    }
    if (document.sourceSheets) {
      const rows = new Set(evidence.filter(e => e.sheet && e.cell && !e.cell.includes(':')).map(e => `${e.sheet}!${Number(e.cell.match(/\d+/)?.[0])}`));
      if (rows.size === 1) { const record = recordRows(document).find(r => `${r.sheet}!${r.row}` === [...rows][0]); if (record) displayLabel = `${record.label} · ${criterion.label}`; }
    }
    result.push({ id: idFactory(), documentId: document.id, label: displayLabel, value, unit, criterionId: criterion.id, criterion: criterion.rule, status, machineStatus: status, explanation: detail, uncertain, evidence, ...(raw.presence !== undefined ? { presence: raw.presence } : {}), ...(missing.verified ? { missingVerified: true } : {}), ...(conditions.missingConditions.length ? { missingConditions: conditions.missingConditions } : {}), ...(extractionMismatch ? { extractionMismatch: true } : {}), ...(criterion.categoryPath?.length || criterion.sampleName ? { applicability } : {}) });
  }
  return result;
}

export function semanticCriteria(criteria) {
  const keys = ['id', 'label', 'rule', 'required', 'comparison', 'conditions', 'categoryPath', 'sampleName', 'scope', 'classificationStatus', 'classificationNeedsConfirmation', 'needsConfirmation', 'contextNeedsConfirmation'];
  return criteria.map(c => Object.fromEntries(keys.filter(k => Object.hasOwn(c, k)).map(k => [k, structuredClone(c[k])])));
}

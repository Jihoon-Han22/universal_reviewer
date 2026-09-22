import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocumentError } from './documents.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'golden');
// Descriptive metadata from the supplied dataset README, never evaluator answers.
const criterionDescriptions = ['기본 표 · 헤더 1행','제목과 안내문 뒤 헤더 8행','C열에서 시작하는 표 · 헤더 12행','2행 병합 헤더','표지·품질기준·변경이력 시트','화학성분·물리성능 구역','중간 소계와 끝 합계 행','메모 셀과 셀 주석','여러 위치에 표시된 단위','다양한 기준 표현','로고 이미지와 기준 표','이미지 안의 기준','아파트 동·호 배치표','비고 열 수식','숨김 행과 숨김 열','중복 항목과 서로 다른 기준','공백과 보이지 않는 문자','AA열부터 시작하는 기준 표','기준 표 뒤 긴 로그','코드표를 참조하는 기준'];
const certificateDescriptions = ['기본 3열 표','결과 셀에 포함된 단위','헤더에 표시된 단위','한 페이지에 두 개 표','시험방법을 포함한 4열 표','천단위 구분기호와 범위 값','N.D.·불검출 값','직인과 시험원 성명','가로 페이지','두 페이지에 걸친 표','괄호가 포함된 항목명','장식 헤더와 각주','원문 확인용 성적서'];
const ledgerDescriptions = ['기본 검토대장','열 위치가 다른 검토대장','중복 성적서번호','합계 행 포함','메모 행 포함','보호된 시트'];
const entries = (prefix, descriptions) => descriptions.map((description,i) => ({id:`${prefix}${String(i+1).padStart(2,'0')}`,description}));
const catalog = {criteria:entries('C',criterionDescriptions),certificates:entries('P',certificateDescriptions),ledgers:entries('L',ledgerDescriptions),maxCertificates:10};
catalog.criteria[11].notice = '기준이 이미지 안에 있습니다. 이미지 내용을 확인해야 합니다.';
catalog.criteria[12].notice = '기준서인지 확인이 필요한 문서입니다.';
catalog.ledgers[2].notice = '같은 성적서번호가 여러 행에 있습니다. 대상 행 확인이 필요합니다.';
catalog.ledgers[5].notice = '시트가 보호되어 있어 자동 반영할 수 없습니다.';
export function goldenCatalog() { return structuredClone(catalog); }
export const getGoldenCatalog = goldenCatalog;
export function validateGoldenRequest(request = {}) {
  const {mode='all',format='pdf',criterionId,certificateIds,ledgerId} = request;
  const fail = () => { throw new DocumentError('golden 문서 선택을 확인해 주세요.'); };
  if (!['all','criteria','target'].includes(mode) || !['pdf','png'].includes(format)) fail();
  const criteria = catalog.criteria.some(e => e.id === criterionId);
  const targets = Array.isArray(certificateIds) && certificateIds.length >= 1 && certificateIds.length <= 10 && new Set(certificateIds).size === certificateIds.length && certificateIds.every(id => catalog.certificates.some(e => e.id === id));
  if (mode === 'criteria' && (!criteria || certificateIds !== undefined || ledgerId)) fail();
  if (mode === 'target' && (!targets || criterionId !== undefined || ledgerId)) fail();
  if (mode === 'all' && (!criteria || !targets || (ledgerId !== undefined && ledgerId !== null && ledgerId !== '' && !catalog.ledgers.some(e => e.id === ledgerId)))) fail();
  return {mode,format,criterionId,certificateIds,ledgerId};
}
export async function loadGolden(documents, request, {root = DEFAULT_ROOT, read = readFile} = {}) {
  const {mode,format,criterionId,certificateIds,ledgerId} = validateGoldenRequest(request);
  const specifications = [];
  if (mode !== 'target') specifications.push({folder:'criteria',id:criterionId,extension:'xlsx',role:'criteria',suffix:'검토기준'});
  if (mode !== 'criteria') for (const id of certificateIds) specifications.push({folder:'certs',id,extension:format,role:'target',suffix:'시험성적서'});
  if (mode === 'all' && ledgerId) specifications.push({folder:'ledger',id:ledgerId,extension:'xlsx',role:'ledger',suffix:'검토대장'});
  const added = [];
  try {
    for (const spec of specifications) { const buffer = await read(path.join(root,spec.folder,`${spec.id}.${spec.extension}`)); added.push(await documents.add({name:`${spec.id}_${spec.suffix}.${spec.extension}`,role:spec.role,buffer})); }
    return {documents:added.map(d => documents.public(d)),criteriaText:'기준서에서 각 성적서의 재료와 시험 항목에 해당하는 기준을 찾아 결과를 비교해 주세요. 읽을 수 없거나 기준 적용이 모호한 항목은 확인 필요로 표시해 주세요.',scenario:'golden'};
  } catch (error) { documents.rollback(added); throw error; }
}

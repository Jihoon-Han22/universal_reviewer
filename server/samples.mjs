import { readGoldenResource } from './sites/resources.mjs';
import { DocumentError } from './documents.mjs';

const EXPENSES = '거래번호,이름,분류,금액,영수증,내용\nEXP-001,김민지,식비,18000,있음,고객 미팅 점심\nEXP-002,박준호,식비,52000,있음,야근 저녁\nEXP-003,이서연,교통비,28000,없음,택시 이동\nEXP-004,최도윤,숙박비,175000,있음,부산 출장\nEXP-005,김민지,교통비,18500,있음,외근 택시\nEXP-006,박준호,식비,판독불가,있음,영수증 금액 훼손\nEXP-007,이서연,숙박비,120000,있음,대전 출장\n';
export async function loadSample(documents, kind, options = {}) {
  if (!['expenses','materials'].includes(kind)) throw new DocumentError('예제 종류를 확인해 주세요.');
  const added = [];
  try {
    let criteriaText;
    if (kind === 'expenses') {
      added.push(await documents.add({name:'출장_경비_검토.csv',buffer:Buffer.from(EXPENSES,'utf8'),role:'target'}));
      criteriaText = '각 거래를 검토해 주세요. 식비는 건당 30,000원 이하, 숙박비는 건당 150,000원 이하여야 합니다. 모든 거래에 영수증이 있어야 합니다. 교통비에는 금액 상한이 없습니다. 금액이 판독 불가이면 숫자를 추측하지 말고 확인 필요로 표시하세요.';
    } else {
      for (const id of ['P01','P07','P13']) added.push(await documents.add({name:`${id}_시험성적서.pdf`,buffer:await readGoldenResource(`certs/${id}.pdf`,options),role:'target'}));
      added.push(await documents.add({name:'C01_검토기준.xlsx',buffer:await readGoldenResource('criteria/C01.xlsx',options),role:'criteria'}));
      criteriaText = '기준서에서 각 성적서의 재료와 시험 항목에 해당하는 기준을 찾아 결과를 비교해 주세요. 읽을 수 없거나 기준 적용이 모호한 항목은 확인 필요로 표시해 주세요.';
    }
    return {documents:added.map(d => documents.public(d)),criteriaText};
  } catch (error) { documents.rollback(added); if(error.code==='RESOURCE_UNAVAILABLE')throw new DocumentError(error.message,error.status);throw error; }
}

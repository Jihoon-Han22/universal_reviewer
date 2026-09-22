# 03. 기준 해석·매칭·판정의 재현 계약

이 문서는 2026-09-21에 고정한 GSPEC 구현을 읽어 작성한 독립 구현 명세다. **현재 동작**과 **알려진 한계**를 구분한다. 알고리즘 이름은 새 구현의 권장 공개 인터페이스이며 원본 파일이 있어야 실행되는 링크가 아니다. 원본 전체 복사는 필요하지 않다. 처리 순서는 `문서 읽기 → 자격 판별 → 기준 탐색 → 문맥 검증 → HITL 편집/확정 → 독립 대상 추출 → 모델 매칭 제안 → 서버 판정 정규화`다. 승인 전에 대상을 판정하지 않는다.

자료구조별 key/소유권/무효화, 계산량, bounded parallelism, 취소와 메모리 예산은 [07. 자료구조·알고리즘·비동기 계약](07-data-algorithms-concurrency.md) §7.1–7.9를 함께 적용한다. 현재 구현에 있는 source grounding/판정 순서를 성능 최적화 명목으로 생략하지 않는다. 이 문서의 기본 프로필은 **CURRENT_REPRODUCTION**이다. 확장 회귀 fixture [algorithm-edge-cases.json](../contracts/algorithm-edge-cases.json)의 `baseline`은 현재 동작을 재현하는 정답이다. 기존 `additional-acceptance` 사례는 모두 **OPTIONAL_FUTURE** 프로필에 속한다. 알려진 한계의 교정 또는 추가 의미 검증 제안이며 현재 재현의 합격 조건이 아니다. 원본에 없는 guard·overlay·수정된 판정 결과를 기본 구현에 추가하지 않는다.

## 1. 모듈 포트와 불변식

| 포트 | 입력 → 출력 | 책임/금지 |
|---|---|---|
| `assessCriteriaDocument` | 읽은 문서 → `criteria/not_criteria/uncertain`, 이유, 인용 | 업로드 이름만으로 자격을 추정하지 않는다. `uncertain`을 비기준서로 자동 제외하지 않는다. |
| `discoverWorkbookCriteria` | 전 시트 inventory + 동일 E2B 세션 → 후보·coverage·문맥 | 단일 표나 앞쪽 일부 셀만 읽고 전체 완료로 보고하지 않는다. |
| `normalizeCriteria` | 모델 후보 → 검증된 Criterion[] | 타입/길이/분류/수치 비교를 구조 검증한다. |
| `preserveSourceConditions` | 기준 + 실제 읽은 셀 → 기준 | 비고 제외를 먼저 적용하고 본래 조건 열을 복구한다. |
| `approveCriteria` | 서버 원본 후보 + 사용자 편집본 → 승인 기준 | 사용자 입력으로 서버 provenance를 덮어쓰지 못한다. |
| `extractDocumentFields` | 단일 대상 문서 → 모든 관측값 | 승인 기준과 독립 추출한다. 기준값을 측정값으로 만들지 않는다. |
| `proposeFindings` | 승인 semantic fields + 대상 + 독립 추출 → 제안 items/coverage | 의미 연결은 모델 역할이다. 정확한 기준 ID와 실제 문서 ID만 반환한다. |
| `normalizeItems` | 제안 + 대상 실제 구조 + 승인 기준 → 최종 machine results | 수치·누락·조건·분류·독립 추출 대조의 서버 guard가 모델 pass/fail을 수정한다. |

공통 원칙: source text/파일명/셀 주석/인용은 untrusted data다. 문서의 업무 기준은 해석 대상일 수 있으나 도구 실행·역할 변경·비밀 공개 지시는 실행하지 않는다. 원문 값, 원문 위치, 모델 제안, 서버 판정, 사람 수정의 의미를 분리한다. **모든 정규화 함수가 순수 함수인 것은 아니다.** `validateCriteria`는 허용 필드로 새 객체/배열을 만들지만, `preserveSourceConditions`는 전달한 criterion의 rule/conditions/sourceNotes/evidenceCells 등을 갱신하고 같은 criteria 배열을 반환한다. `normalizeHandlingCriteria`는 새 kept 배열을 만들 수 있어도 substantive criterion 객체의 rule/handlingNotes를 직접 갱신한다. 입력이 모두 handling이면 원래 배열을 반환한다. 따라서 이 두 helper에는 서버 소유의 mutable draft만 전달한다. 사람 승인 helper는 서버 provenance와 결과를 `structuredClone`하며 제출 객체를 원본 객체로 저장하지 않는다. 구조·근거 정규화와 immutable 승인 스냅샷의 경계를 동일시하지 않는다.

## 2. 자료 구조와 한도

아래 형태는 JSON wire shape다. `?`는 생략 가능하고 `number`는 유한 JS 숫자다. `Evidence`는 문서간 재사용하지 않는다.

```ts
type Verdict = 'pass' | 'fail' | 'review';
type Comparison = {operator:'lt'|'lte'|'gt'|'gte'|'eq'|'range'; value:number; unit:string; upper?:number};
type Evidence = {documentId:string; quote:string; page?:number; sheet?:string; cell?:string};
type IgnoredSourceNote = {
  text:string; documentId:string; sheet?:string; cell?:string;
  page?:number; block?:number; table?:string;
};
type Criterion = {
  id:string; label:string; rule:string; needsConfirmation:boolean; required?:boolean;
  source?:string; sourceDocumentId?:string; sourceName?:string; scope?:string;
  categoryPath:string[]; sampleName?:string;
  classificationStatus:'not_applicable'|'resolved'|'ambiguous'; classificationNeedsConfirmation:boolean;
  conditions:string[]; comparison?:Comparison;
  sourceEvidence?:Evidence[]; evidenceCells?:Evidence[]; hierarchyEvidence?:Evidence[];
  contextNeedsConfirmation?:boolean; contextIssues?:unknown[];
  ignoredSourceNotes?:IgnoredSourceNote[]; userOverride?:boolean;
};
type ExtractedField = {label:string; value:string; unit:string; uncertain:boolean; evidence:Evidence[];
  verification?:'verified'|'mismatch'|'unverified'};
type DocumentExtraction = {referenceNumber:string; documentType:string; fields:ExtractedField[];
  warnings:string[]; referenceNumberVerified?:boolean};
type RawFinding = {
  label:string; value:string; unit:string; criterionId:string; status:Verdict;
  explanation:string; uncertain:boolean; evidence:Evidence[];
  presence?:'present'|'missing'|'unreadable'|'unknown';
  applicability?:{categoryPath:string[]; sampleName?:string; matched:boolean; uncertain:boolean; evidence:Evidence[]};
};
type VerifiedApplicability = {
  verified:boolean; reason?:string; targetCategoryPath?:string[]; evidence?:Evidence[];
};
type Finding = Omit<RawFinding, 'applicability'> & {
  id:string; documentId:string; criterion:string; machineStatus:Verdict;
  missingVerified?:boolean; missingConditions?:string[]; extractionMismatch?:boolean;
  reviewedByHuman?:boolean; applicability?:VerifiedApplicability;
};
type ReviewOutput = {items:RawFinding[]; reviewCoverage?:{complete:boolean;remainingWork:string[]};
  excludedRows?:{row:number;sheet?:string;reason:string}[]};
```

`RawFinding.applicability`는 모델의 matched/uncertain/categoryPath/sampleName 제안이다. 최종 `Finding.applicability`는 `verifyCriterionApplicability`가 반환한 위 검증 결과로 **대체**한다. 기준에 categoryPath 또는 sampleName이 있을 때만 최종 finding에 이 필드를 붙이며, 일반 기준이면 raw 모델이 applicability를 반환해도 필드를 생략한다. 성공은 `{verified:true,evidence,targetCategoryPath}`(분류 없는 helper 성공은 `{verified:true}`), 실패는 `{verified:false,reason,targetCategoryPath?}`다. raw matched/uncertain/sampleName을 공개 정규화 결과에 그대로 남기는 계약이 아니다.

서버 기준 검증 한도: 후보 최대 250개, ID 1~100자/중복 금지, label 1~500자, rule 1~8,000자, source 4,000자, scope 1,000자, 분류 0~8단계/단계당 공백 아닌 1~200자, sampleName 300자, conditions 최대 64개/각 1~1,200자. 분류 없는 문서는 `categoryPath:[]`, `classificationStatus:'not_applicable'`, `classificationNeedsConfirmation:false`가 정상값이다. 샘플만 있으면 resolved다. ambiguous 명시, 분류 확인 true, 또는 not_applicable인데 실제 경로/시료가 있으면 ambiguous로 정규화하고 needsConfirmation도 true다.

`comparison`이 주어져도 operator/유한 value/unit 80자/range upper≥value 검증에 실패하면 비교식을 저장하지 않는다. 기준 자체를 숫자로 발명하지 않는다. sourceEvidence는 최대 15개, hierarchyEvidence는 최대 24개(선택 level 0~7), quote 최대 4,000자로 안전 복사한다.

**검증 경로별 보증은 다르다.** 일반 `validateCriteria`는 shape validator다. 비어 있지 않은 categoryPath/sampleName을 실제 원문에서 증명하지 않고 기본 `resolved`로 분류한다. invalid comparison을 버릴 때 입력 `needsConfirmation:false`를 자동으로 true로 바꾸지도 않는다. XLSX discovery는 §11의 실제 citation/geometry/threshold grounding을 별도로 수행하며, 승인 경로는 §8의 comparatorConfirmed 및 서버 provenance 보존을 수행한다. 예: `{categoryPath:['원문에 없는 유형'],needsConfirmation:false,comparison:{operator:'gte',value:'8',unit:'MPa'}}`는 일반 validator만 거치면 path가 resolved로 남고 comparison은 없어지며 needsConfirmation은 false다. 이를 모든 경로의 안전한 의미 확정으로 표현하면 안 된다. `ALG-X-GROUND-01/02`는 [algorithm-edge-cases.json](../contracts/algorithm-edge-cases.json)의 OPTIONAL_FUTURE 교정 제안이다. 기본 재현에서는 위 관측 결과를 유지하며 교정 fixture의 다른 예상값으로 덮어쓰지 않는다.

대상 추출 한도: fields 300개, warnings 30개/각 1~2,000자, referenceNumber 300자, documentType 1~200자, field label 1~500자/value 2,000자/unit 80자/evidence 최대 8개. 값이 빈 문자열이거나 근거가 없으면 uncertain을 true로 올린다. 발견사항은 문서당 최대 250개이며 label 500/value 2,000/unit 80/explanation 4,000/evidence 최대 8개다. 현재 정규화기는 빈 findings 배열을 문서 오류로 취급한다. 모델 프롬프트의 “적용 항목이 없으면 empty array” 지시와 이 부분은 불일치하며, 재현 테스트는 문서 오류가 실제 동작임을 명시해야 한다.

## 3. 구조 기반 기준 추출

### 3.1 입력 셀

inventory, sourceSheets는 파일의 실제 시트 이름/셀 주소/병합을 유지한다. 기준 탐색용 map key는 `sheet + '\u0000' + cell`이며 값은 최소 `{cell,text}`와 선택 `{formula,uncachedFormula,uncertain,mergedRange,comment}`다. 주소는 절대참조 `$`를 제거한 A1이며 열≤16,384, 행≤1,048,576이다. 병합 continuation은 master(범위 좌상단)와 같은 새 기준으로 세지 않는다. `uncachedFormula`는 누락 숫자가 아니다.

레이아웃 검출은 행 방향과 전치한 열 방향을 모두 실행한다. 헤더는 NFKC, 공백·zero-width 제거, 소문자화 후 비교한다. `측정값/측정결과/시험값/시험결과/추출값/보고값/결과/실측값/판정/근거/비고/참고/메모/results/measurements/actual/verdict/evidence/notes/remarks` 열은 기준 역할에서 제외한다. `항목/시험항목/검사항목/검토항목/측정항목/항목명/시험명/물성/item/testitem/parameter/test`는 항목 헤더, 최소·최솟값·하한/min/minimum/lowerlimit/lowerbound은 하한, 최대·최댓값·상한/max/maximum/upperlimit/upperbound은 상한이다. `기준/품질기준/판정기준/관리기준/허용기준/허용값/허용치/한계/기준값/규격/허용조건/specification/requirement/criterion/criteria/limit`는 rule, `단위/unit/units`는 unit, `조건/시험조건/적용조건/재령/기간/온도/condition/conditions/temperature`는 condition 역할이다.

서로 인접한 헤더의 클러스터를 나눈다. 한 클러스터에 항목 헤더가 하나면 한 표다. 항목 헤더가 여럿이고 첫 헤더가 항목일 때만 각 항목부터 다음 항목 전까지 반복 블록으로 분리한다. 상·하한 모두 있고 그 앞에 이름 모를 차원 헤더 하나만 있으면 그 헤더를 항목으로 사용할 수 있다(수치 크기/시간/온도 행을 domain 사전 없이 지원). 반복 항목들보다 앞에 있는 한도 열의 소속은 추측하지 않는다. 다음 항목 헤더 또는 같은 방향을 가로지르는 병합 섹션에서 표를 끝낸다. 양쪽 방향에서 역할이 충돌하면 명시 result/note 제외 역할이 우선한다. 단위는 같은 표의 unit 셀, 한도 헤더 괄호, 한도 열을 덮는 최대 3줄 위 병합 단위 헤더에서만 얻는다.

독립 정적 adapter는 일반 항목/기준 헤더 표 후보를 만들고 `항목 수×100 + 단위 열 20 + 헤더가 정확히 기준이면 5 + 시트명 품질/기준/규격/spec/criteria면 10`으로 **최고점 표 하나**를 고른다. 현재 파이프라인은 이를 validation context(table/status)로 사용하고 별도로 E2B 기준 탐색을 수행한다. 전 시트 탐색을 이 adapter로 대신하지 않는다. code/name 매핑 표가 있고 한 code가 유일한 label로 연결되면 label을 복구하되 코드 join은 확인을 요구한다. 동일 label이 반복되면 각각의 범위·상하한 확인을 요구한다. 원본 주석에 재확인/재검토/확인 필요/변경 예정/미확정/불확실이 있으면 확인 상태를 올린다. 메인 E2B 탐색은 모든 실제 inventory 영역을 사용한다.

### 3.2 수치 기준 파서

`parseRule(text,fallbackUnit)`은 항상 원문 rule을 보존한다. 괄호 속에 숫자+일령/일/시간/주/개월/분/초/회/℃/°C/°F 또는 평균/양생/재령/온도/습도/조건/전처리/건조/수중/단,/예외가 있으면 그 괄호를 numeric 구문에서만 제거하고 conditions에 보존한다. `≤/≥/～`를 `<=/>=/~`로 치환한다. 숫자 구문은 `[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`다. 과학 표기, 앞자리 생략 소수 `.5`, 주석이 붙은 숫자를 자동 파싱하지 않는다.

인정 구문은 다음뿐이다.

| 입력 | 비교 |
|---|---|
| `5 ~ 10`, `5–10`, `5—10`, `5..10`, `5 - 10` (각 끝 선택 단위) | inclusive range [5,10] |
| `5 이상 10 이하` | inclusive range |
| `5 이상/이하/초과/미만` | gte/lte/gt/lt |
| `>= 5`, `<= 5`, `> 5`, `< 5`, `= 5`, `== 5`, `min 5`, `max 5` | gte/lte/gt/lt/eq/eq/gte/lte |

ASCII `-`는 양쪽 공백이 있어야 range이며 `5-10`은 날짜 등과 혼동하지 않도록 자동 판정하지 않는다. 범위 양끝 단위가 서로 다르거나 embedded/fallback 단위가 다르거나 상한<하한이면 비교식을 만들지 않고 needsConfirmation=true다. 여기의 unit 정규화는 소문자/공백제거/²→2/³→3/％→%다. 판정 시 정규화와 다르므로 의미 변환으로 오해하지 않는다. 정확히 N.D./불검출/미검출/이상 없음/적합/양호는 comparison 없는 정성 기준이며 기본 확인 false다. 대시만 있거나 KS/ISO/ASTM/EN/JIS 참조만 있으면 확인 필요다. 그 외 문장을 정적 파서가 해석하지 못하면 확인 필요이며, 별도 모델은 인용 가능한 명확한 정성 요구를 그대로 추출할 수 있다.

### 3.3 비고와 진짜 조건의 분리

열/행 머리글이 정확히 `비고`, `참고`, `Note(s)`, `Remark(s)`인 위치의 내용 전부는 요구사항·조건·적용 범위·분류·매칭 별칭·경고·판정의 권한이 없다. 원문 뷰에는 그대로 표시한다. “28일”이라는 단어 자체를 전역 삭제하는 방식은 금지한다. 같은 “28일”이 시험조건 또는 기준 본문에 있으면 보존한다.

note index를 전 시트 일반/전치 방향으로 만들고 실제 셀 좌표로 제외한다. 반복 블록은 각 항목 헤더가 소유한 폭을 지킨다. 후보의 label+document+인용 위치가 유일한 원본 행/열을 가리킬 때만 해당 note 텍스트를 조건/rule/scope에서 제거한다. 같은 label만으로 여러 자재 행을 임의 연결하지 않는다. 비고에서만 나온 기간 토큰·별칭·괄호 조건을 제거한다. 제거한 문구는 `{text,...nativeCriteriaCitation}` 형태의 `ignoredSourceNotes`로 보존한다. 이것은 quote가 있는 Evidence 배열이 아니다. XLSX/CSV는 실제 cell(및 XLSX sheet), Word는 block/table, visual은 page/table이 붙으며 실제 원문 형식의 내부 provenance를 유지한다.

**기존 sourceEvidence의 note 인용 삭제는 모든 경로에 보장되지 않는다.** `preserveSourceConditions`는 `criterion.evidenceCells`에 ignored citation이 있으면 그 배열을 필터한다. 그리고 `hadIgnoredCitations && criterion.sourceEvidence && criterion.evidenceCells?.length`가 모두 참일 때만 sourceEvidence를 갱신한다. sourceEvidence가 배열이면 ignored 인용을 필터하고, 객체이면 남은 첫 evidenceCells와 quote 결합(`map(e => e.quote).join(' | ').slice(0,4000)`)을 이용해 다시 만든다. sourceEvidence-only 후보 또는 evidenceCells가 모두 제거되어0개가 된 경우에는 이전 sourceEvidence가 남을 수 있다. 따라서 이것을 source 인용의 전역 완전 제거라고 설명하지 않는다. 자연어 기준 또는 userOverride:true는 사용자의 명시 기준이므로 자동 비고 제거 대상이 아니다.

이후 실제 `조건/적용조건/시험조건/재령/기간/conditions/testconditions/age/duration` 열과 항목 헤더가 있는 행을 찾는다. 후보 predicate는 `!criterion.userOverride && (!criterion.sourceDocumentId || criterion.sourceDocumentId === document.id) && compact(criterion.label) === compact(rowLabel) && (!criterion.evidenceCells?.length || criterion.evidenceCells.some(e => e.sheet === sheet.name && Number(e.cell?.match(/\d+/)?.[0]) === row.row))`다. 여기서 compact는 NFKC/모든 공백 제거/소문자다. **행 제한은 evidenceCells가 있을 때만 적용하며 sourceEvidence를 대신 확인하지 않는다.** 그래서 일반 validator가 evidenceCells를 sourceEvidence로 옮긴 후보는 같은 label의 여러 행에서 조건을 합칠 수 있다. baseline의 이 한계를 숨기지 않는다. 선택된 후보에 조건 셀을 sourceNotes/conditions/rule에 추가하며, 기존 자연어 rule의 기간도 conditions에 보존한다. `모든 거래/전체 문서/각 항목/all records/every row` 같은 전칭 범위는 조건이 아니라 rule의 적용 범위이며 conditions에서 제거한다. `ALG-X-CONDITION-01/02`는 OPTIONAL_FUTURE에서 sourceEvidence-only도 고유한 원본 행을 해석한 경우만 조건을 추가하도록 바꾸는 제안이다. 기본 재현에서는 이 추가 guard 없이 현재 조건 병합 결과를 유지한다.

별도 “빈칸/누락/판독불가 → 확인 필요” 처리 지침은 독립 실질 기준으로 늘리지 않는다. 수치 comparison이 없고 missing+review 문구가 함께 있는 후보를 처리 지침으로 분류한다. label의 실질 토큰으로 기존 기준과 연결되면 기존 rule/handlingNotes에 합친다. 연결이 없지만 pass/fail 상태 매핑이면 유지하고, 전역 unreadable→review 지침만이면 엔진 정책으로 처리한다. 모든 후보가 처리 지침인 경우는 그대로 반환한다.

## 4. 대상의 독립 사실 추출

모델 role `extract`, 출력 토큰 최대 14,000으로 **승인 기준과 무관하게** 전체 실제 대상의 reviewable fact를 먼저 추출한다. 시험성적서 번호 우선순위는 실제 `성적서번호/시험성적서번호/Certificate No/Report No`, 없을 때만 일반 `문서번호`다. 장식 머리글의 양식 번호나 개정 코드를 성적서 번호로 대체하지 않는다. 자릿수·선행 0·구두점은 그대로다. 의뢰자/발행일/기술자/도장/시험 방법 번호/소계/주석은 측정행으로 만들지 않는다. 모든 제공 페이지의 결과 표와 별도 시료를 보존한다.

한 글자 한글 분석항목도 label이며 `N.D.`/`불검출`은 value다. 괄호 별칭, 단위 원문, 소수 끝의 0, 쉼표, 범위, 부등호를 보존한다. 출력 value에서 실제 붙은 단위만 분리한다. 단위가 `-`로 인쇄되어 있으면 `unit:'-'`다. 실제 공란/부재만 `unit:''`다. 이미지 1장이 “1/2”라고 해도 없는 다음 페이지를 채우지 않는다. PDF 텍스트는 동일 업로드에서 얻은 보조 원문일 뿐이다. 전체 PDF 보조 텍스트 한도 150,000자를 순서대로 나누고 잘린 page 항목에 truncated=true를 준다.

독립 텍스트 검증은 NFKC/공백·zero-width 제거/소문자화를 비교용으로만 사용한다. PDF는 인용 page의 텍스트, XLSX/CSV는 인용 row 범위의 실제 행을 이용한다. label이 들어간 행에서 value가 숫자 경계를 지키며 존재해야 verified다. `0.02`는 `0.025`로, `1.2`는 `11.2`로 검증되지 않는다. label만 단독 줄이면 다음 최대 2줄까지 묶되 다른 추출 label을 만나면 멈춘다. label은 실제 영역에서 찾았는데 값이 없으면 mismatch→uncertain true다. label 자체를 못 찾으면 unverified다. 이미지/텍스트 없는 raster PDF의 별도 텍스트 대조는 unverified가 정상일 수 있으며 이를 “확실히 틀림”으로 바꾸지 않는다. PDF 텍스트가 존재할 때 referenceNumber를 실제 어느 page에서도 찾지 못하면 빈 문자열로 지우고 경고한다.

## 5. 의미 매칭과 최종 판정 순서

의미 매칭은 모델이 항목 별칭/문맥을 보고 승인 Criterion.id로 연결한다. 모델에 전달할 기준 뷰는 `id,label,rule,required,comparison,conditions,categoryPath,sampleName,scope,classificationStatus,classificationNeedsConfirmation,needsConfirmation,contextNeedsConfirmation`만이다. 출처 인용이나 ignoredSourceNotes를 추가 기준으로 해석시키지 않는다. 모델은 실제 source subject/row + check를 label에 포함하고, 다른 자재의 기준은 제외하고, 적용성 미확실은 review로 제안한다.

다음 순서를 바꾸면 결과가 달라진다.

1. 기준 ID가 승인 목록에 존재하고 raw shape/문서 ID/evidence 위치 형식이 맞는지 검사한다. 실패는 해당 문서 오류다.
2. `absentValue`를 아래 집합으로 판단한다. `/^(?:|n\/?d|n\/?a|null|none|미검출|판독\s*불가|확인\s*불가|누락|미기재|미제출|미첨부|missing|absent|가려짐|측정\s*불가|-|—)$/i`. absent는 숫자 아님을 뜻하며 **확인된 누락과 같지 않다**. 따라서 ND=0이 아니다. 읽히는 정성 결과 `없음`은 이 집합에 없다.
3. 같은 대상의 실제 빈 셀일 때만 빈 quote를 허용하고 evidence.blank=true를 붙인다. 그 외 quote는 공백 아닌 1~2,000자다. page 정수1~10,000, sheet≤200자, cell은 `^[A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?$` 형식만 검사한다. 물리 bounds·sheet 존재·일반 quote의 원문 존재를 이 admission이 검증하지 않는다. A0·역방향range도 들어오는 현재 한계와 OPTIONAL_FUTURE SOURCE-GROUNDING 제안은 §15에서 구분한다.
4. 수치 후보와 누락 평가를 계산한다. optional missing이면 결과 자체를 생략한다. 확인된 필수 누락이며 기준 문맥 확인 필요가 아니면 fail. 그 외 raw uncertainty/근거 없음/absent/missing 후보/presence unreadable 또는 unknown/기준 확인 필요 중 하나면 review.
5. 아직 결정 가능한 comparison인데 수치 비교가 불가능하면 review. 가능하면 모델 제안과 관계없이 결정론적 수치 결과로 덮어쓴다.
6. 실제 조건 근거를 확인한다. 하나라도 불충족/확인 불가면 review로 덮어쓴다.
7. 유형/시료 applicability 근거를 확인한다. 불확실하거나 불일치면 review로 덮어쓴다.
8. 독립 extraction이 있고 absentValue가 아니면, raw label 또는 criterion label과 extraction label이 정규화 부분문자열 관계인 후보 중 **값 정규화 동등 + 판정 unitKey 동등**인 하나가 있어야 한다. 없거나 그 field.uncertain=true 또는 verification=mismatch이면 extractionMismatch=true, review로 덮어쓴다.
9. `document.sourceRows`가 있으면 evidence 중 `cell`이 있고 `:`가 없는 것만 모아 행 번호 Set을 만든다. Set 크기가1이고 그 행에서 trim 후 비어 있지 않은 첫 원문 값이 있으면 표시 label을 `[firstValue, nameIndex>0 ? sourceRow.cells[nameIndex] : '', criterion.label].filter(Boolean).join(' · ')`로 다시 만든다. nameIndex는 첫 source row에서 `/^(이름|성명|직원|업체|업체명|name|employee|subject)$/i`와 일치하는 최초 헤더의 0-based index다. range evidence/좌표 없는 evidence는 Set 계산에서 제외되며, 함께 존재한다고 이 보정을 막지 않는다. 실제 행/첫 값이 없거나 단일 셀 인용들이 여러 행이면 raw label을 유지한다. 이어 `sourceSheets`가 있으면 sheet+단일cell 인용의 고유 `sheet!row`가1개일 때 실제 record를 찾아 `${record.label} · ${criterion.label}`로 교체한다. 이 보정은 위 판정·독립 추출 대조 뒤에 실행되며, 모든 raw label의 원문 진위를 별도로 증명하는 전역 guard는 아니다.
10. 최종 정규화 status를 machineStatus에도 복사하고 새 UUID를 부여한다. machineStatus는 **raw 모델 제안 status가 아니라 서버의 수치·조건·적용성·추출 대조를 모두 거친 최초 판정**이다. 예를 들어 모델 pass가 수치 비교로 fail이 되면 status와 machineStatus 모두 fail이다. raw 모델 제안용 별도 필드는 이 Item DTO에 추가하지 않는다. 사람 수정은 machineStatus를 유지한 채 status/audit를 별도로 갱신한다.

`uncertain` 최종 플래그는 raw.uncertain, review로 남은 missing 후보, 미검증 조건, extractionMismatch, applicability 불확실의 OR다. 현재 코드는 기준 needsConfirmation만으로 status=review가 된 경우 uncertain까지 반드시 true로 올리지는 않는다. 따라서 UI는 uncertain 하나만 보고 review 수를 계산하면 안 된다.

### 5.1 결정론적 숫자/단위

다음 작은 함수는 현재의 수치 정책을 완전히 표현한다. 단위 환산·반올림 허용오차·상대 오차·표준 지식·LLM 숫자 추정은 없다.

```js
const unitKey = (unit = '') => unit.trim().replace(/\s+/g, '')
  .replaceAll('㎎', 'mg').replaceAll('㎏', 'kg').replaceAll('㎜', 'mm')
  .replaceAll('％', '%').replaceAll('원', 'KRW').toLowerCase();
function numericVerdict(value, unit, comparison) {
  if (!comparison || unitKey(unit) !== unitKey(comparison.unit)) return null;
  const text = String(value).trim();
  if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text.replaceAll(',', ''));
  if (!Number.isFinite(n)) return null;
  const t = comparison.value;
  const answers = {lt:n<t,lte:n<=t,gt:n>t,gte:n>=t,eq:n===t,
    range:n>=t && n<=comparison.upper};
  return Object.hasOwn(answers, comparison.operator) ? (answers[comparison.operator] ? 'pass' : 'fail') : null;
}
```

`92 MPa >=80 MPa` pass, `80`의 gte pass/gt fail, `1,200 원 <=1200 KRW` pass, `1 kg <=1000 g` review, `1e3 mg`, `<0.01 mg`, `0.01±0.002`, `N.D.`, `1..2`, `1.0 (평균)`은 자동 수치 판정 불가다. `㎎`과 mg는 같지만 `cm²/g`와 `cm2/g`는 최종 unitKey에서는 다르다. 파서와 판정기의 단위 정규화가 다르다는 현행 한계를 숨기지 않는다.

### 5.2 실제 조건 근거

기간 토큰 `(숫자)(일령|일|day(s)|시간|hour(s)|hr(s)|주|week(s)|개월|month(s)|년|year(s)|분|minute(s)|초|second(s))`을 day/hour/week/month/year/minute/second로 정규화한다. 단위 간 환산은 없다. 단순 `28일` 조건은 실제 인용에서 동일 28 day가 있어야 한다. `28일 이상`, before/after/within/at least/between, `~–<>≤≥` 등의 관계는 기간 수 하나만 같아도 통과시키지 않고 **조건 전체 문구**가 실제 인용에 있어야 한다. 비기간 조건도 전체 문구가 있어야 한다.

인용 quote가 해당 문서 실제 source에서 존재하는지도 먼저 확인한다. PDF는 같은 verification page, XLSX는 해당 시트의 인용 row, CSV는 인용 row, 텍스트는 실제 modelParts 텍스트다. 현재 condition guard는 이미지에서 false이며 PDF 시각 전사 fallback을 사용하지 않는다. 따라서 이미지의 실제 조건을 모델이 읽었어도 해당 condition이 있으면 review로 남을 수 있다. 이것은 현재 conservative 동작이며 applicability의 검증된 시각 전사 지원과 구별한다.

### 5.3 유형·시료 applicability

기준 분류 미확정은 즉시 review다. 경로≤8, 단계≤200자, 시료≤300자를 검증한다. **경로도 시료도 없으면 모델 applicability 없이 verified=true**다. 경로나 시료가 있으면 raw.matched=true, raw.uncertain=false, 유효 경로, 실제 인용 1~8개가 필요하다. 승인 경로가 대상 경로의 순서가 유지된 부분수열이어야 한다. `[금속, A종]`은 `[제품,금속,A종]`과 맞지만 `[A종,금속]`과 맞지 않는다. 시료는 NFKC/공백·zero-width 제거/소문자 비교로 정확히 같아야 한다. 각 승인 경로 단계와 시료명이 적어도 한 검증된 quote에 있어야 한다. 숫자 경계를 검사하여 1종을 11종에서, A1을 A11에서 얻지 않는다.

XLSX는 실제 지정 rectangle 안의 셀만, CSV는 해당 열/행만, PDF는 지정 page만 확인한다. 파일명/inventory/추정 유형/요약은 증거가 아니다. 텍스트 형식은 reader의 body/blocks/nested tables/supplementaryText만 사용하고 synthetic header와 LINE/PARAGRAPH 위치 마커를 제거한다. 원문 구조가 아닌 modelParts에서 “verified”라고 주장해도 인정하지 않는다.

PDF 텍스트에서 quote가 없거나 이미지이면 서버 소유 VLM 전사를 사용할 수 있으나, quality.status=verified, quality issues/issueDetails/warnings 모두 0, requiresConfirmation=false, coverage.complete=true, expectedPages 유효, 페이지 수·고유 page ID·transcribedPages가 정확히 일치, missingPages=0, 모든 page.complete=true/경고0이어야 한다. 이 전역 검사는 page ID/coverage/경고에 한정된다. **block/table/cell shape와 uncertain=false는 인용한 citedPage만** 재검사한다. citedPage.blocks/tables 배열과 block.text 문자열, 각 cell.text 문자열·양의정수row도 검사한다. 비인용page의block/cell uncertainty는 이 helper에서 다시 확인하지 않는다. 이미지 expectedPages는 1이다. PDF 알려진 실제 page count와 맞아야 한다. 표의 별도 headers metadata만으로 분류를 증명하지 못하며 실제 cell/같은 table row만 근거 영역이 된다.

독립적으로 record table로 식별된 CSV/XLSX에서는 measurementEvidence가 정확히 1개 record row를 가리켜야 한다. 분류 evidence도 그 row와 같은 sheet의 **정확히 같은 단일 row**여야 한다. 헤더/다른 record의 유형을 가져와 측정에 적용하지 않는다. arbitrary XLSX/PDF 전역 metadata는 record table로 확인되지 않았다면 전역 문서 분류일 수 있어 이 row linkage guard를 적용하지 않는다.

## 6. 확인된 필수 누락과 확인 필요

확인된 누락 후보의 exact value 집합은 `''|누락|미기재|미제출|미첨부|missing|absent|null|none`(case insensitive) 또는 presence=missing이다. 값이 이 집합 밖이거나 raw.uncertain 또는 presence=unreadable/unknown/present이면 누락을 확정하지 않는다. `ND`, `N/A`, 인쇄된 `-`, 읽을 수 없는 글자, 식의 cache 없음은 누락 증거가 아니다.

required boolean이 있으면 그대로 사용한다. 없으면 기본 true이며 rule에 명시한 선택 사항/선택 항목/선택 제출/필수 아님/제출 의무 없음/기재된 경우만/값이 있는 경우만/optional/not required/only if provided 또는 present일 때 false다. optional 누락은 fail/review 행을 만들지 않고 생략한다.

필수 누락을 fail로 만들려면 **모두** 만족해야 한다.

1. `analysis.coverage.complete === true`; `coverage.readerComplete !== false && coverage.contextComplete !== false`; `!coverage.sourceTruncated && !analysis.needsConfirmation`; `analysis.status`가 partial/failed 아님; `reviewCoverage?.complete !== false`; `(document.extraction?.fields?.length ?? 0) < 300`. readerComplete/contextComplete/needsConfirmation/sourceTruncated가 생략된 것은 각각 false/true를 명시한 것과 혼동하지 않는다. 앞 두 flag는 literal false만 거절하고, 뒤 두 flag는 truthy일 때 거절한다. 따라서 coverage.complete:true만 있고 선택 flag가 생략된 비시각 문서도 다른 근거 guard를 통과하면 누락을 확정할 수 있다. 제안 items가250 이상이면 상위 normalizeItems가 reviewCoverage.complete를 false로 바꾸므로 이 단계에서 누락을 확정하지 못한다.
2. PDF/이미지는 transcription 존재, `quality.status === 'verified'`, pages nonempty, expectedPages가1이상 정수, pages.length 및 page ID Set 크기가 expectedPages와 동일하고 모든 page ID가1..expectedPages여야 한다. inventory.pageCount가 있으면 expectedPages와 동일해야 한다. transcribedPages는 배열이며 그 Set 크기가 expectedPages여야 한다. quality.issues/issueDetails의 truthy length가 없어야 하고 모든 page.complete가 true, 제공된 각 block/cell의 uncertain이 false여야 한다. 모든 형식에서 transcription이 존재하면 coverage.complete:true, requiresConfirmation falsy, missingPages의 truthy length 없음, quality 생략 또는 verified가 추가로 필요하다. page.complete:false나 page 경고 중 불완전 신호도 거절한다. **이 함수는 transcribedPages 각 값의 범위·pages와의 항목별 동일성, 모든 경고가빈배열인지까지 별도로 검사하지 않는다.** 적용성/자격 전사 검증의 더 강한 검사를 이 함수가 수행한다고 주장하지 않는다.
3. 분석/추출/전사 경고에 잘림/가려짐/판독 불가/미읽은 페이지/추출 한도/truncated/cropped/missing pages/unreadable/extraction limit 같은 불완전 신호가 없어야 한다.
4. 동일 record의 독립 추출이 해당 label의 실제 값을 발견하거나 mismatch/unreadable을 보고하지 않아야 한다. 실제 record 셀 값/수식/병합이 누락 주장을 반박하지 않아야 한다.
5. 실제 source 어디에 그 항목명이 남아 있으면 “독립 추출에 없으니 누락”이라 하지 않는다. 별도로 검증된 정확한 blank cell 또는 같은 record의 해당 blank result가 있어야 한다.
6. evidence 중 실제 검증된 blank=true 또는 원문 위치에서 존재가 검증된 quote가 하나 이상 있어야 한다. “누락되었습니다”라는 가짜 quote를 만들지 않는다.
7. 이후 기준 문맥/조건/유형 guard도 통과해야 최종 fail이다.

CSV exact blank는 해당 actual row/유효 header column의 텍스트가 실제 빈칸일 때다. XLSX exact blank는 known record의 해당 셀이고 text가 빈칸이며 formula가 없고 **어떤 merged range에도 속하지 않아야** 한다. 병합 master라도 merged이면 이 guard는 blank를 확정하지 않는다. formula cache가 비어 있는 셀은 검토 필요다. evidence는 빈 셀 그 자체 `quote:''`나 같은 row의 실제 ID를 가리킬 수 있으나 UI는 ID를 **누락 측정값의 하이라이트로 위장하면 안 된다**. 누락의 확인 위치와 측정값 원문 하이라이트를 별도 표시한다.

## 7. 레코드/검토 coverage

CSV 첫 행은 header, 이후 비어 있지 않은 모든 실제 행이 coverage 대상이다. XLSX는 다음 ID 헤더와 다른 비공백 헤더가 최소 1개 있는 표만 record table로 식별한다: `id/recordid/transactionid/documentid/거래번호/전표번호/성적서번호/문서번호/접수번호/관리번호/식별자/고유번호/번호`. 같은 sheet를 순서대로 읽으며 새로운 헤더를 만나면 바꾸고, ID 값이 있고 합계/소계/총계/주의/참고/비고/안내가 아닌 행을 record로 저장한다. 헤더별 exact cell/value를 만들며 actual empty cell도 `value:''`로 보존한다.

coverage는 items의 올바른 documentId와 evidence row/range로 덮인 실제 rows 집합이다. XLSX는 sheet도 같아야 한다. 검증된 excludedRows를 더한 뒤 나머지를 missingRows로 반환한다. XLSX 제외 이유는 비어 있지 않은 ≤1,000자이고 `제외/적용 않음/적용 없음/대상 아님/not applicable/out of scope` 의미를 명시해야 하며 `빈칸/누락/미기재/판독/missing/blank/unreadable/값 없음/정보 없음`은 제외 이유로 금지한다. CSV의 현재 정적 validator는 기존 실제 row + 비공백 ≤1,000자 이유만 검사한다. 모델 지시는 CSV에도 inapplicable만 제외하도록 요구하지만 같은 강한 서버 검사까지 있다는 주장은 금지한다.

행 coverage=true만으로 모든 (행×적용 기준)이 검토됐다고 증명되지 않는다. 현재 모델 `reviewCoverage.complete`/remainingWork와 결과 수 한도, missingRows를 함께 사용한다. 수치 acceptance에서는 별도 기대 조합 matrix와 비교해야 하며 행 하나의 finding만으로 전체 기준 coverage가 완료됐다고 주장하지 않는다.

## 8. HITL 편집과 승인

일반 확정은 기준 1~250개, draft는 0~250개를 허용한다. 추가 수동 ID는 `human-UUID`(8-4-4-4-12 hex), 기존 ID 중복/공백변형/미등록 임의 ID는 거부한다. editable fields는 label/rule/required/conditions/comparison/scope/categoryPath/sampleName/분류 확인 상태다. provenance/source/hierarchyEvidence는 서버의 기존 객체를 복제하고 클라이언트가 보낸 같은 필드는 버린다. 신규 수동 기준 source는 `사용자 입력`이다.

draft mode는 `numeric/qualitative/choose`, operator `''/lt/lte/gt/gte/eq/range`, value/upper 문자열≤100, unit≤80, issues≤20/각≤500을 유지한다. 공란 숫자를 Number('')=0으로 만들지 않는다. draft label/rule 공란은 저장 후 모델 feedback에 그대로 전달하고 정상 완성처럼 보여주지 않는다. 경로/시료를 실제 수정하면 이전 분류 모호성을 해소할 수 있다. 명시적 ambiguous 변경이 상속 boolean보다 우선한다.

최종 확정은 일반 needsConfirmation를 해소하지만 **미해결 source context는 체크박스만으로 해소되지 않는다**. 기존 contextNeedsConfirmation이 있으면 rule/required/conditions/comparison/scope/categoryPath/sampleName 중 하나의 실제 유효 의미 변경이 있어야 이를 지울 수 있다. NFKC, trim, 반복 공백 접기만 한 변경은 의미 변경이 아니다. conditions는 중복 제거/정렬 후, path는 순서 유지, required는 false 외 true, comparison은 operator/value/unit/upper 구조로 비교한다. 해소하지 않았으면 contextNeedsConfirmation와 needsConfirmation를 유지하고 comparison을 삭제한다.

comparison 생략은 정성 판정 선택이다. rule 또는 비교식이 바뀌었으면 `comparatorConfirmed:true`로 새 수치식을 명시 재확정해야 남긴다. 기존 rule와 식이 정확히 같으면 기존 식을 유지한다. comparatorConfirmed인데 유효 식이 없으면 오류다. 승인 후 이 transient flag는 제거한다.

## 9. 최소 테스트 벡터와 증거 기준

아래는 실행 결과가 아니라 새 구현에서 반드시 실행해야 하는 결정론적 기대다. API/실모델 결과를 이 표를 읽었다는 이유로 통과 처리하지 않는다.

| ID | 입력 변형/조건 | 기대 |
|---|---|---|
| ALG-N01 | 80, MPa, gte80MPa; 모델 fail | server pass |
| ALG-N02 | 80, MPa, gt80MPa; 모델 pass | server fail |
| ALG-N03 | 1kg vs gte1000g | review; 자동 환산 없음 |
| ALG-N04 | ND/−/범위/부등호/잘린 숫자 | numeric=null; review, 0 아님 |
| ALG-C01 | 비고 28일, 기준 ≥80, 실제 92+재령 없음 | 비고 제외; pass 가능 |
| ALG-C02 | 시험조건 28일, 실제 92+재령 없음 | missingConditions 28일; review |
| ALG-C03 | 조건 28일 이상, quote 28일 | review; 관계 전체 근거 없음 |
| ALG-H01 | categoryPath=[]/sample 없음 | 분류 불확실 아님 |
| ALG-H02 | 기준 1종, target 11종 | review; literal boundary 차단 |
| ALG-H03 | A row의 값+B row의 유형 | review |
| ALG-M01 | fully read, required, exact blank, real row evidence | fail+missingVerified |
| ALG-M02 | 동일 blank이나 partial reader/context | review |
| ALG-M03 | formula no cache 또는 merged continuation | review, missingVerified 없음 |
| ALG-M04 | optional exact blank | 결과에서 생략 |
| ALG-M05 | 원문에 항목값 존재, extraction만 누락 | review; fail 금지 |
| ALG-E01 | 추출 0.025, 인용 0.02 | mismatch; review |
| ALG-E02 | source field 수300 또는 result 수250 | 누락 확정 금지/부분 coverage 기록 |
| ALG-R01 | 일반 확정 버튼으로 unresolved revision 승인 | context 유지, comparison 제거 |
| ALG-R02 | 사용자 실제 의미 수정 후 명시 수치 확정 | 수정 기준 사용, 원출처 불변 |

필수 metamorphic: sheet/열/행 이동, 시트/파일명 변경, transposition, 동일 항목의 조건·시료 분리, 다른 값인 인접 행 삽입, 비고와 조건 열 순서 교환, 명시된 단위만 변경, 숫자 경계(1→11, .02→.025). 예상 판정이 변해야 하는 경우(기준/값/적용 조건을 바꾼 경우)와 불변이어야 하는 경우(배치/이름만 바꾼 경우)를 구별한다. 비결정적 모델 추출은 반복 실행 원문 evidence와 structured 결과를 남긴다.

## 10. 알려진 한계와 구현자의 판단 금지

현재 semantics matcher는 모델+독립 label 부분문자열/값·단위 guard이며 완전한 ontology/entity resolution 엔진이 아니다. 독립 추출 일치 검사 자체에는 동일 row 강제 매칭이 없고 유형 applicability의 known-record 연결 guard가 별도 동작한다. generic literal evidence와 위치 형식 검증을 모든 결과의 엄밀한 bbox 검증이라고 부르면 안 된다. CSV 제외 검증은 XLSX보다 약하다. 빈 results 정책과 모델 지시의 차이, 이미지 조건 guard, 단위 파서/판정기 차이는 현재 존재하는 conservative/compatibility 한계다. 재현 패키지가 더 강한 acceptance를 요구한다면 변경 사유·호환 영향·새 검증을 decision 기록에 남기며 현재가 이미 그렇게 동작한다고 주장하지 않는다.

## 11. XLSX 탐색과 동일 E2B repair loop

### 11.1 환경·한도

입력은 `kind:'xlsx'`인 nonempty Buffer다. E2B 작업 폴더는 `/home/user/trace-criteria`, 파일은 서버가 가진 신뢰된 `profile.py`와 업로드 `workbook.xlsx`, 선택 `request.json`이다. 모델이 생성한 코드는 이 기준 탐색 단계에서 실행하지 않는다. **baseline pipeline은 앞선 문서 구조 분석 세션을 종료한 뒤 discovery 전용 `sandboxRunner`를 한 번 연다.** discovery의 모든 plan/read/extract/repair round는 그 하나의 물리 샌드박스를 공유하며, openpyxl 3.1.5 설치도 discovery lifetime당1회다. 이전 `sandboxProfile.criteriaInventory` 재사용은 데이터 재사용이지 이전 물리 샌드박스 재사용이 아니다. 기본 runner `withSandbox`가 생성/finally 종료를 소유한다. 테스트/호출자가 runner를 주입할 수 있지만 기본 pipeline이 세션을 phase간 유지한다는 뜻은 아니다. sandbox 전체 timeout300초, mkdir/profile/read 기본 command timeout45초, 설치60초다. 취소/오류가 나면 추가 모델 호출을 중단하고 이미 읽은 범위와 미완료 상태를 구분한다. 전체 pipeline의 생성·설치·종료는02 §2.8과 동일하게 구현한다.

| 한도 | 값 | 초과 동작 |
|---|---:|---|
| inventory cell-profile 대상 sheet index/저장 셀/영역 | 첫100개 / 200,000 / 300 | sheets metadata 배열 자체는100개로 자르지 않는다. index≥100은cells=[]; 실제nonempty/comment0개면complete=true·해당경고없음, 하나라도있으면incomplete/경고. 다른상한의생략도불완전. genericreader100시트partial와구별 |
| region 표본 | 영역당 ≤24셀 | sampleOnly; 표본으로 읽기 완료 주장 금지 |
| 실제 read rounds | 최대 2회 | 미해결 범위 유지, HITL |
| 회당 selected ranges | 18 | 미선택 범위 기록 |
| 단일 직사각형 좌표 수 | 12,000 | 거절·미완료 |
| 모든 회차 누적 좌표 수 | 24,000 | 재조회도 가산; 미해결 유지 |
| Python details의 고유 `(sheet,cell)` record/그 record 직렬화 길이 합 | 회당6,000개 / 220,000 Python문자(`len(json.dumps(record,ensure_ascii=False))`) | 새로운 고유 record를 추가하면 예산을 초과할 때 그 range를 truncated, details.complete:false로 표시 |
| Node가 수용하는 완성 raw JSON 문자열 | 1,500,000 JS UTF-16 code units(`raw.length`) | typed LIMIT 오류 |
| 후보/계층 | 250 / 8단계 | 손실/분류 한도 플래그·경고 |

Python은 `data_only=False/True, keep_links=False` workbook 2개로 원래 수식과 cached 표시값을 함께 얻는다. sparse stored cells를 조사하여 sheet visibility, hidden row/column, 수식, comment, 이미지, merged range를 inventory한다. 연속 nonempty 행 band를 먼저 나누고 그 band의 연속 nonempty 열 block을 region으로 만든다. 실제 셀 record는 `{cell,text(≤4000),styleId,hiddenRow,hiddenColumn,mergedRange?,formula(≤1000)?,uncachedFormula?,comment(≤4000)?,truncated?}`다. cache 없는 수식은 `[계산 결과 없음: 수식 재계산 필요]` 문자열로 표시한다. workbook의 삽입 이미지는 imagesNotRead/경고로 남긴다. 프로파일이 문서의 기존 sandboxProfile.criteriaInventory에 있으면 inventory는 재사용하되 선택 실제 셀을 읽는 단계를 생략하지 않는다.

Python의220,000은 전체 응답 JSON 크기가 아니다. details 호출 하나의 seen Set에 처음 들어가는 cell record만 count/chars에 가산하고, 겹치는 후속 range에는 이미 본 record도 cells 배열에 다시 넣는다. range/최상위 JSON wrapper와 중복 record는 그 chars 예산에 가산하지 않는다. 예를 들어 긴 문자열50개를 가진 A1:A50과 이를 포함하는 A1:B50을 함께 요청하면 cellsRead는50이어도 반환 배열의 record는100개이며 완성 JSON이220,000자를 넘고 complete:true일 수 있다. 최종 응답의 독립 Node1,500,000 한도를 따로 적용한다. 중복 range가 비용0인 것은 아니다. Node의 누적 좌표24,000 예산에는 선택한 각 직사각형 면적을 계속 가산한다. details의 고유 예산과 전체 JSON cap·누적 좌표 예산은 서로 대체할 수 없다.

### 11.1a region과 sample의 결정 순서

각 sheet는 workbook.worksheets 순서다. 저장된 cell 중 `value is not None or comment`인 것만 모집단으로 삼고 `(row,column)` 오름차순으로 정렬한 뒤 남은 전역 profile cell 예산을 적용한다. 먼저 정렬된 고유 행 번호를 차이가1인 연속 band로 나눈다. 각 band의 고유 열 번호도 오름차순으로 차이가1인 연속 그룹으로 나눈다. band 순서→열 그룹 순서가 region 순서다. 각 region의 실제 cell 배열 block은 다시 `(row,column)` 오름차순이다. 직사각형 내부 빈 셀을 sample 모집단에 넣거나 sheet 전체에서 골고루 고르는 알고리즘이 아니다. 전역 region300개 이후는 region을 만들지 않고 해당 sheet.regionsOmitted를 증가시킨다.

block 길이 N에 대해 `count=min(24,N)`, `indices=sorted(set(round(i*(N-1)/max(1,count-1)) for i in range(count)))`다. 여기서 round는 Python의 nearest/ties-to-even이고 indices는0-based다. indices 순서대로 `record(block[i],cachedSheet,sheet)`를 반환한다. N=1이면 `[0]`, N≤24이면 모든 cell을 원래 순서대로 반환한다. N=25이면 index0..11,13..24의24개(중앙 index12만 생략), N=47이면0,2,4,...,46의24개다. `sampleOnly = N > count`이며 각 region.nonEmptyCells=N, range는 block의 최소/최대 열·행을 감싼 A1 직사각형이다. region ID는 `s<1-based sheet index>-r<그 sheet에서 실제 만든1-based region index>`다.

sample cell도 details와 동일한 record 변환이다. 수식은 cached value를 text로 쓰고 cache가 없으면 `[계산 결과 없음: 수식 재계산 필요]`, 원래 formula는 앞1000 Python문자로 보존한다. text와 comment는 각각 앞4000 Python문자이며 원래 값 text 또는 comment 길이가4000을 넘을 때만 `truncated:true`다. formula 문자열만1000을 넘는다는 이유로 이 flag가 켜지지는 않는다. date/datetime은 ISO 문자열, None은 빈 문자열, 그 외는 Python str을 쓴다. 길이에 따라 sample 위치를 바꾸거나 긴 cell을 다른 cell로 대체하지 않는다. 이렇게 잘린 sample을 전체 실제 셀 읽기의 대체로 사용하지 않는다.

### 11.2 순서와 반환

1. Gemini role explore, maxOutputTokens=5,000으로 `{ranges:[{sheet,range}],regions:[{id,classification,reason}],warnings:[]}`을 제안받는다. classification은 criteria/context/unrelated/uncertain이다.
2. 계획 뒤에 inventory의 아직 포함되지 않은 모든 region을 추가한다. “best table”만 골라도 다른 작은 영역을 자동 생략하지 않는다. A1 bounds와 예산을 검증한다. 절대참조 `$`는 허용하고 역방향·XFD 이후·행1,048,576 이후는 거절한다.
3. 동일 E2B sandbox에 request를 쓰고 신뢰된 reader로 범위를 읽는다. 기록 map에 실제 sheet/셀 key로 누적한다. 모델 요청을 실제 조회 결과인 것처럼 선반영하지 않는다.
4. Gemini role extract, maxOutputTokens=16,000에 inventory, 전 누적 actual cells, 이전 proposal, validation errors, 누락 후보, region accountability 문제, context signals, 이전 disposition을 전달한다. 출력은 `{criteria,followUpRanges,warnings,regionAssessments,dispositions}`다. 구조 schema와 실제 텍스트 템플릿은 `../prompts/criteria-algorithms.catalog.json`에 패키지로 포함한다.
5. `replacesIndex`는 이전과 같은 citation location 또는 이전 제안이 invalid이고 같은 normalized label일 때만 교체한다. 그 외 normalized label/rule/unit + 정렬된 sheet!cell anchor key로 upsert한다. 명시 대체 source threshold는 새 후보+대체 disposition으로 표현하며 옛 숫자를 유지시키려고 source를 변조하지 않는다.
6. grounding → context disposition 검증 → 독립 threshold omission 검사 → 모든 region accountability 검사를 수행한다.
7. 모델 followUpRanges와 미읽은 region을 합친다. omission/region/context 문제가 있고 회차가 남으면 `repeat:true`로 같은 범위를 다시 읽을 수 있다. 재조회도 24,000 좌표 예산에 포함한다. 총 2회 이후에는 멈추고 partial/확인 필요로 남긴다. 빈 followUp 배열은 전체 완료 증거가 아니다.
8. 의미 동등 후보를 dedup하고 coverage와 warnings를 반환한다. activity/handoff는 실제 모델 task→실제 sandbox task가 존재할 때만 발생시킨다. SDK raw 오류나 command/env를 사용자에게 공개하지 않는다.

구조 읽기 완료와 추출/문맥 이해 완료를 따로 계산한다. 다음 boolean 식은 현재 구현 그대로다.

```text
inventoryComplete = inventory.complete === true
allSheetsInventoried = every(sheet.complete)
allRegionsExamined = inventory.complete && detailComplete && every(region.examined)
contextComplete = contextProblems.length === 0 && rejectedDispositions.length === 0
extractedCriteriaComplete =
  omitted.length === 0 && unresolved.length === 0 && regionProblems.length === 0 &&
  contextProblems.length === 0 && rejectedDispositions.length === 0 && detailComplete &&
  inventory.complete === true && droppedCriteria === 0 && !criteriaLimitReached && remainingRanges.length === 0
```

`unresolvedRanges`는 미읽음/omission/region/context 문제의 sheet+range를 중복 제거한 목록이다. criterion 수 250 초과 또는 grounding 탈락을 “검토 완료”로 요약하지 않는다. **현재 extractedCriteriaComplete 식은 imagesNotRead 및 classificationLimitReached를 직접 AND하지 않는다.** 이 boolean만으로 이미지·전체 계층까지 완전 이해했다고 주장하면 안 된다.

위 식은 **criteria discovery report를 생산하는 계산**이며 최종 run.status의 직접 판정식이 아니다. ReviewEngine의 집계는 [01 §3](01-state-api.md#3-run-상태-기계)에 열거한 inventoryComplete/allSheetsInventoried의 strict false, unresolvedRanges/remainingRanges length, imagesNotRead/criteriaLimitReached/droppedCriteria/classificationLimitReached/droppedHierarchyLevels 신호만 직접 본다. `allRegionsExamined`, `extractedCriteriaComplete`, `contextComplete`, `rejectedDispositions`를 직접 검사하는 guard는 없다. producer가 같은 문제로 remaining/unresolved ranges를 채우면 그 별도 필드로 간접 반영되지만, 보고서의 모든 complete 계열 값이 true여야 run completed라는 새 조건을 추가하지 않는다. 이 분리는 현재 집계의 한계와 재현 정답이며, 향후 집계 강화와 구별한다.

모든 regionAssessment에는 `{id,classification,criterionCells:string[],reason,evidence}`가 필요하다. context/unrelated도 실제 해당 region 내부의 원문 인용 ≥1개로 증명한다. criteria region은 criterionCells가 비어 있으면 실패다. 각 criterion cell은 유효 single A1, in-region, 실제 read record이고 retained criterion evidence 또는 검증된 exclusion으로 연결되어야 한다. 한 항목이라도 실패하면 unresolved다. numeric omission은 독립 layout 후보와 최종 인용의 동일 operator/value/upper(또는 합성 range의 대응 lower/upper)를 비교한다. 숫자 없는 정성 의무는 이 숫자 검출기만으로 coverage를 보장하지 않고 region criterionCells accountability가 맡는다.

### 11.3 후보 grounding과 계층

탐색 초안 label≤300/rule≤1,200, unit≤80/scope≤400, conditions≤15/각≤400이다(상위 승인 API 한도보다 작다). 원본 citations≤64/quote≤4,000, 실제 cell text/comment에서 normalized literal substring+숫자 경계를 통과해야 한다. 비고만 근거인 후보 또는 결과/판정/근거/메모의 숫자만 한도로 삼은 후보는 삭제한다. numeric comparison은 실제 인용 parse 결과와 operator/value/upper가 같거나 aligned layout support가 있어야 한다. rule의 모든 숫자가 실제 evidence의 numeric set에 있어야 한다. unit도 인용으로 확인하고 uncached formula가 없어야 한다. 다음 전체가 참일 때만 comparison을 보존한다: `parsed && groundedNumbers && comparisonGrounded && unitGrounded && !uncached && !hierarchyRejected`. `20`만 보고 ≥20을 만들지 않는다. 확인 못 한 숫자·조건은 draft+needsConfirmation으로 보존한다.

실제 aligned condition-role 셀이 있으면 모델이 빠뜨려도 조건에 복구한다. 반환 rule은 원문 rule 뒤에 필요한 ` · 단위: …`, ` · 적용 범위: …`, ` · 조건: …`를 붙인다. evidenceCells와 sourceEvidence(first citation+joined quotes≤4,000), hierarchyEvidence/sampleEvidence, ignoredSourceNotes를 보존한다.

분류 각 단계는 `{level,sheet,cell,quote,relation}`을 가진다. relation은 column-header/row-header/section-header/lookup이다. actual text 본문에 해당 path literal이 있어야 하며 주석만으로 heading을 증명하지 않는다. column-header는 같은 열 또는 merged col span 아래, row-header는 같은 행 또는 merged row span 오른쪽, merged section은 span 안 아래에 anchor가 있어야 한다. 중간에 번호 sibling(1종/2종)이 끼면 reject, 같은 geometry/style header가 끼면 uncertain이다. unmerged section/lookup은 원문 관계를 확정하지 못하므로 uncertain이다. parent→child 순서와 merged span containment도 검사한다. 실패 단계에서 멈춰 검증된 prefix만 남기며 child를 다른 parent 아래로 승격하지 않는다. 공동 기준은 sharedScope=true와 실제 공통/전체/all 텍스트·부모 근거를 유지하고 임의 subtype을 넣지 않는다. sampleName은 별도 actual citation이 없으면 제거+ambiguous다.

오류 코드는 `CRITERIA_SANDBOX_INPUT/READ/LIMIT/FAILED/ABORTED`를 구분한다. 중단 요청은 ABORTED로 전파하며 서비스 오류는 확인된 service/code/status만 안전 메시지로 전달한다. 원문 기반 부분 결과를 서비스 성공으로 위장하지 않는다.

## 12. 개정·대체·참조 문맥

각 실제 source cell에서 `non_normative/superseded/current/overridden/cross_reference/out_of_scope` signal을 추출한다. 폐기 아님/not superseded 같은 부정 표현은 destructive signal을 차단한다. 비고/result role, uncertain, uncached, merged non-master는 권한 있는 signal source가 아니다. **signal 발견은 힌트일 뿐 기준을 자동 삭제하는 이유가 아니다.**

모델은 다음 disposition을 제안한다.

```json
{"kind":"overridden","reason":"특기 규칙이 기존 상한을 대체함",
 "targetCitations":[{"sheet":"표준","cell":"C9","quote":"10 이하"}],
 "evidence":[{"sheet":"특기","cell":"B2","quote":"표준 C9 기준을 아래 한도로 대체한다"}],
 "replacementCitations":[{"sheet":"특기","cell":"C4","quote":"8 이하"}]}
```

허용 kind는 non_normative/superseded/overridden/duplicate/out_of_scope/applied다. compatibility 입력 context_applied는 applied 의미다. reason이 필요하며 모든 citation은 같은 actual document/sheet/single cell의 정확한 text substring이다. target은 실제 기준 threshold anchor여야 한다. evidence와 target의 연결은 같은 row(반복 테이블 왼쪽 label boundary 준수), merged column span, 명시 sheet!cell, 또는 대상 label+자재/시료/조건 qualifier로 증명한다. unrelated note가 비슷한 단어라는 이유로 기준을 삭제하지 않는다.

| 결정 | 추가 증명 |
|---|---|
| non_normative | `기록만/기록전용/record only/for recording only/판정대상 아님/비규범` 직접 문구. 단순 “기록 보관용”으로 삭제 금지. |
| superseded | 다른 실제 anchor의 retained replacement, 동일 label, 양쪽 unit 존재시 일치, replacement가 current임을 보이는 실제 evidence |
| overridden | 다른 retained replacement+같은 label/단위 호환+명시 대체 관계 |
| duplicate | 같은 의미 key 전체, 별도 actual retained anchor |
| out_of_scope | 해당 label을 실제로 제외하는 원문. “all/some/request list” 일반 안내만으로 삭제 금지 |
| applied | retained criterion과 supported non-destructive signal. 참조라면 명시 참조 sheet의 실제 retained criterion까지 연결 |

`record-only` 직접 선언은 결정론적으로 제외할 수 있다. 또 가장 가까운 실제 item+rule 헤더의 전용 status column에서 같은 row가 폐기/철회/obsolete라면 대체가 없어도 결정론적 revoked로 제외한다. 이 두 경우와 일반 모델 superseded replacement 필요 조건을 혼동하지 않는다.

replacement 자체가 excluded가 되면 cycle/chain disposition을 재검증·거절하고 excludedKeys/coveredSignals를 다시 계산한다. 기준의 모든 실제 anchor가 검증된 exclusion에 속할 때만 기준을 제거한다. 연결된 superseded/overridden/cross-reference/out-of-scope signal이 미해결이면 `contextNeedsConfirmation:true, needsConfirmation:true, contextIssues`를 남기고 comparison을 삭제한다. 없는 외부 참조 문서는 읽었다고 가정하지 않는다.

semantic dedup key는 출처 document 집합+normalized label+parsed comparator(operator/value/upper 또는 normalized base rule)+unit+scope+순서 있는 path+sample+정렬한 conditions+required다. 다른 파일/유형/조건은 병합하지 않는다. 같은 의미 key의 첫 기준을 shallow copy하여 유지하고 이후 기준을 다음 allowlist대로 병합한다.

- `evidenceCells`, `citations`, `sourceEvidence`에서 모은 양쪽 citation의 합집합을 evidenceCells와 sourceEvidence에 모두 저장한다. `citations`는 배열/객체를 flatten한 뒤 object만 남기는 helper다. dedup key는 각 객체의 `JSON.stringify` 문자열이며 일반적인 의미 동등성 비교가 아니다.
- 추가로 합집합을 만드는 필드는 `hierarchyEvidence`, `hierarchyCitations`, `unitCitations`, `conditionCitations`, `scopeCitations`, `sampleCitations`, `ignoredSourceNotes`뿐이다. `needsConfirmation`과 `classificationNeedsConfirmation`은 OR하고 classificationStatus는 하나라도 ambiguous이면 ambiguous다. source 문자열은 고유 값들을 `', '`로, classificationReason은 고유 값들을 공백으로 합친다.
- 어느 쪽이든 contextNeedsConfirmation이면 true를 유지하고 contextIssues 합집합을 저장한다. 기존 merged.unit이 undefined이고 comparison.unit이 있으면 unit을 보존한 뒤 comparison을 삭제한다.

**모든 provenance 필드를 합치는 것은 아니다.** XLSX grounding이 만든 정규화 `sampleEvidence`는 이 allowlist에 없어서 첫 criterion의 값만 남는다. 같은 sampleName의 두 기준이 각각 다른 실제 sampleEvidence를 가지고 병합되어도 후속 sampleEvidence는 추가되지 않는다. merged evidenceCells/sourceEvidence와 이 제한을 구분한다. 후속 모든 sample provenance 보존을 요구한다면 별도 강화 acceptance로 기록해야 하며 현재 구현의 보장이라고 쓰지 않는다.

## 13. 기준서 자격과 자연어 수정 loop

### 13.1 자격 판별

자격은 source body에 재사용 가능한 요구/한도/acceptance/obligation가 실제 존재하는지다. measurement report/ledger도 독립 기준을 포함하면 criteria일 수 있다. 그러나 완료된 과거 ledger의 Evidence/판정근거에 나타난 threshold/reference만으로 normative 기준서로 승격하지 않는다. 업로드 역할/파일명/확장자/생성 summary는 증거가 아니다.

```ts
type EligibilityModelProposal = {
  status:'criteria'|'not_criteria'|'uncertain'; hasNormativeContent:boolean;
  reason:string; evidence:Evidence[];
  sourceKind?:'standard'|'policy'|'measurement_report'|'ledger'|'mixed'|'other'|'unknown';
};
type CriteriaAssessment = {
  documentId:string; name:string; status:'criteria'|'not_criteria'|'uncertain';
  reason:string; evidence:Evidence[]; sourceKind?:EligibilityModelProposal['sourceKind'];
};
```

첫 타입은 모델의 raw JSON schema다. `validateAssessment`/`assessCriteriaDocument`의 반환은 두 번째 공개 CriteriaAssessment이며 hasNormativeContent를 노출하지 않는다. 실제 모델 acceptance는 모든 generateJson raw 응답을 별도 캡처해 마지막 성공적으로 검증된 proposal의 hasNormativeContent/status를 검사하고, 반환 DTO는 documentId/name/status/reason/evidence를 별도로 검사한다. transport/schema 실패 때문에 uncertain으로 바뀐 결과는 “외부 규정이 불명확하여 uncertain” fixture의 성공이 아니다. 이 경계를 [algorithm-edge-cases.json](../contracts/algorithm-edge-cases.json)의 expected.rawModel/publicAssessment/validation에 명시했다.

reason≤1,500, evidence≤8/quote≤2,000. criteria/not_criteria는 아래 서버 predicate로 원문 존재가 검증된 evidence≥1을 요구한다. criteria는 normative=true, not_criteria는 false이며 sourceKind가 standard/policy/mixed이면 모순이다. uncertain은 evidence=[] 가능하다. 모델 role extract/maxOutputTokens=4,096. input modelParts≤64/text≤160,000자/binary≤8MiB; 초과하면 부분 잘라 분류하지 않고 uncertain이다. 서버의 DOCUMENT_NAME/ROLE 헤더만 제거하고 실제 body를 읽는다.

첫 호출 후 invalid schema/citation 또는 INVALID_RESPONSE일 때만 **repair 1회(총2호출)**한다. 실제 uncertain/불완전 읽기/인증·쿼터·timeout·transport 실패는 의미 없는 재시도 없이 uncertain으로 보존한다. abort는 전파한다. XLSX는 sheet+A1(가능하면 실제 single cell별 quote), CSV는 A1(sheet 생략, document.name compatibility만 허용), PDF/이미지는 page1-based, text/Word는 page/sheet/cell을 임의 생성하지 않는다.

프롬프트는 single-cell 원문 인용 및 same-row range의 선택 셀 공백 결합과 동일한 인용을 요청한다. **서버 admission은 full-string equality보다 느슨한 정규화 부분문자열 검사다.** source/quote에 NFKC를 적용하고 공백·zero-width 연속을 한 칸으로 접어 trim한다(소문자화하지 않음). 정규화 quote가 원문의 substring이어야 하며, quote가 숫자/쉼표/마침표로 시작하거나 끝나면 해당 끝에 `[\d.,]` 경계를 검사한다. `0.5`는 `0.50`을 증명하지 못하고 `>=`를 `≥`로 바꾸는 것도 허용하지 않는다. XLSX range에서는 선택 범위의 각 실제 행을 열순서대로 공백 결합한 문자열 또는 선택 셀의 실제 comment 중 하나에 quote가 있으면 인정한다. 여러 행을 하나로 결합하지 않는다. CSV는 행별 선택 cell slice만 사용한다. 따라서 선택 행의 부분 인용과 원문 comment 인용도 baseline에서는 유효할 수 있다. filename/generated summary/modelParts는 text/Word의 독립 인용 검증 source가 아니며 trusted reader body text/blocks/supplementaryText만 쓴다.

not_criteria 자동 제외는 `prepareInput(document).complete`와 다음 **exact predicate**를 모두 통과해야 한다. 필수 true와 optional flag 부정 검사를 구별한다.

```js
const a = document.analysis, c = a?.coverage, p = document.sandboxProfile;
const completeAnalysis = p?.coverage?.complete === true && p.status !== 'unsupported'
  && a?.status === 'complete' && c?.complete === true
  && c.readerComplete === true && c.contextComplete === true
  && c.sourceTruncated !== true && c.truncated !== true
  && p.coverage.truncated !== true && c.visualAnalysisPending !== true
  && !(Number.isFinite(c.sourceChars) && Number.isFinite(c.contextChars) && c.contextChars < c.sourceChars)
  && !(Number.isFinite(c.contextSegmentsTotal) && Number.isFinite(c.contextSegmentsRead) && c.contextSegmentsRead < c.contextSegmentsTotal)
  && !c.missingContextSheets?.length && a.needsConfirmation !== true
  && (a.quality === undefined || a.quality.status === 'verified')
  && (a.questions === undefined || Array.isArray(a.questions) && !a.questions.length);
```

source/context 수치가 모두 finite일 때만 해당 count 비교를 실행한다. optional truncated/visual flags, missingContextSheets, quality, questions의 생략을 일괄 불완전으로 처리하지 않는다. 부분 읽기는 “기준이 있다”는 것을 증명할 수 있지만 “전혀 없다”는 것은 증명하지 못한다. 제외 이유와 검증된 인용은 사용자에게 남긴다.

비-XLSX 표는 공통 structured table view를 사용한다. 한 문서는 형식별 representation1개만 사용하고 중복 document ID는 이후 표현을 건너뛴다. 최대2,048표/전체1,000,000셀/nesting8이며 malformed/한도 초과 표는 통째로 생략하고 일부를 provenance 증명에 쓰지 않는다. CSV actual A1, XLSX actual sourceSheets, DOCX `BLOCK{index}`와 nested `/RrCc/Tn`, visual `PAGEp/tableId`는 **내부 indexing**이다. 내부 `nativeCriteriaCitation`은 Word에 `{documentId,block,table}`, visual에 `{documentId,page,table}`를 내지만, 이것은 자격 모델 schema나 공개 Evidence가 아니다.

| 경계 | 정확한 위치 형식 | 예시/변환 |
|---|---|---|
| 내부 표 policy/provenance | `{documentId,block?,page?,table?,sheet?,cell?}`; Word/visual synthetic cell address는 공개하지 않음 | Word 내부 `{documentId:'d1',block:3,table:'BLOCK3/R2C1/T1'}`는 표의 식별자다 |
| eligibility 모델→validator | allowlist는 documentId,quote,page,sheet,cell뿐; 그 외 필드는 거절 | 위 Word는 `{documentId:'d1',quote:'모든 신청서에 서명이 있어야 한다'}`로 실제 body 인용. block/table을 붙이면 invalid citation |
| normalized public source/finding Evidence | documentId,quote와 형식에 맞는 page/sheet/cell만 | PDF는 `{documentId:'d2',page:2,quote:'제출 전 승인 필요'}`; Word는 quote-only. 내부 table/block을 synthetic XLSX 주소로 변환하지 않음 |

따라서 내부 table identity로 조건·비고를 구별하는 알고리즘과 사용자 원문 위치 DTO를 별도로 유지한다. 공개 DTO의 위치 손실을 model metadata 발명으로 메우지 않는다.

### 13.2 자연어 HITL revision

입력 criteria≤250/documents≤30/feedback와 criteriaText≤12,000/scope≤1,000/trim-stable unique ID≤100. 현재 editor draft와 사용자 feedback이 authoritative이며 오래된 원본 추출로 사용자 수정 내용을 되돌리지 않는다. 기존 sourceGroup은 explicit unassigned → 알려진 sourceDocumentId 또는 natural-language → unique known evidence document → source 문자열의 정확 ID → 사용자입력 → unassigned 순이다. 선택 documentId의 group만 수정한다. unassigned를 선택했을 때 다른 원본은 참고로 볼 수 있으나 다른 group 수정은 금지한다.

모델 role extract/maxOutputTokens=16,384를 **정확히 1회** 호출한다. 전체 목록 재작성 대신 최소 patch를 받는다.

```json
{"changes":[{"id":"c1","rule":"강도 85 MPa 이상","comparison":{"operator":"gte","value":85,"unit":"MPa"},"needsConfirmation":false}],
 "additions":[],"removeIds":[],"summary":"강도 하한을 85 MPa로 수정했습니다.","warnings":[]}
```

changes omitted field는 유지한다. rule 변경시 comparison이 생략되면 옛 comparator를 삭제한다. `comparison:null`은 명시적 정성 선택이다. changes/remove는 known+in-scope+unique이며 같은 ID의 change/remove 동시 지정은 오류다. additions는 label/rule/허용 sourceDocumentId가 필요하고 서버가 `revision-UUID` ID를 발급한다. source/evidence/좌표를 발명하지 않는다. 기존 sourceDocumentId를 바꾸지 않는다. 제거는 사용자가 제거/대체를 명시 요청했을 때만 한다.

`required`는 PATCH schema와 `applyFields`에서 허용하는 boolean 편집 필드이며 ambiguity를 해소할 수 있는 semanticFields에도 포함된다. 예: 모델이 `{id:'c1',required:false,rule:'영수증은 선택 제출',needsConfirmation:false}` patch를 반환하면 해당 boolean과 rule이 반영된다. required만 바꾸는 patch도 구조상 허용되어 원래 rule이 남을 수 있다. baseline 프롬프트의 두 열거 목록에는 required가 누락되어 있어 “선택 항목으로 바꿔 줘”라는 feedback에도 모델이 rule만 고칠 수 있고, 이때 required:true가 계속 우선한다. 서버는 이를 자동 교정하지 않는다. **현재 재현 assembly는 [pipeline-prompts.md](../prompts/pipeline-prompts.md)의 원본 카탈로그를 사용하고 versioned required overlay를 append하지 않는다.** overlay 및 `ALG-X-REVISION-01/02`는 OPTIONAL_FUTURE의 별도 개선 제안이다. 동일한 feedback에서 모델이 어느 patch를 만들지는 비결정적이므로 서버가 실제 받은 patch를 적용하는 계약과 모델의 의미 품질을 구별한다.

semantic fields의 실제 변경+확인 false가 있어야 기존 모호성을 해소한다. label이나 status만 바꿔 해소하지 않는다. nonempty hierarchy+not_applicable은 ambiguous, resolved+empty는 not_applicable이다. 결과 전체를 다시 validate하고 count/order/id/comparison 보존을 검증한다. 원래 draft numeric/choose인데 comparison이 없으면 patch가 명시 null로 정성 전환하지 않는 한 완료된 수정으로 간주하지 않는다. 실패/취소 시 기존 draft를 보존한다. 성공한 수정은 userOverride=true, overrideSource=`사용자 수정 요청`, comparatorConfirmed/draftState를 제거하고 **다시 사람 승인 대기**다.

revision 오류는 INPUT(기본400), MODEL(502), RESPONSE(400), ABORTED(400)로 구분한다. validator/service가 제공되지 않으면 INPUT/503이다. 프롬프트 원형과 실제 JSON schemas는 [프롬프트 카탈로그](../prompts/criteria-algorithms.catalog.json)를 사용한다. `$` interpolation은 새 구현이 해당 구조를 JSON 직렬화해서 채울 입력 경계이며 untrusted data를 system 지시문으로 승격시키지 않는다.

## 14. 이번 설계 작성 중 실제 확인한 범위

2026-09-21 현재 고정 원본에서 아래 명령을 실행했다. **319 tests / 319 pass / 0 fail / 0 skipped**, exit 0, Node 보고 duration 1810.7048 ms다. 모델/E2B는 test doubles로 대체되며 일부 golden 파일을 실제 로컬 parser로 읽는다. 따라서 이 기록은 결정론적 코드와 mock pipeline의 회귀 확인이며 실제 Gemini/E2B 또는 신규 빈 프로젝트 재현의 성공 증거가 아니다. 독립 재구현은 아래 원본 파일이 없으므로 9절 벡터와 패키지 acceptance에서 같은 동작의 새 테스트를 작성해야 한다.

```powershell
node --test server/criteria-adapter.test.mjs server/criteria-approval.test.mjs server/criteria-context.test.mjs server/criteria-eligibility.test.mjs server/criteria-generalization.test.mjs server/criteria-layout.test.mjs server/criteria-notes.test.mjs server/criteria-revision.test.mjs server/criteria-sandbox.test.mjs server/criteria-table-sources.test.mjs server/criterion-applicability.test.mjs server/missing-result.test.mjs server/conditions.test.mjs
```

프롬프트 카탈로그는 JSON roundtrip, unique ID 20개, source template literal 일치, placeholder 문서화 29개, call-contract reference 해소, resolved schema의 spread/enum 검사를 별도로 통과했다. 이는 카탈로그의 충실성 검사이며 모델 출력 품질 평가는 아니다.

## 15. 독립 감사: 일반 finding admission과 실제 원문 검증의 경계

OBSERVED_BASELINE: normalizeItems의 evidence는 현재documentId, quote 문자열≤2000자(검증된blank외비공백), page가있으면정수1..10000, sheet가있으면문자열≤200자, cell이있으면 `^[A-Z]{1,3}\d{1,7}(?::[A-Z]{1,3}\d{1,7})?$`만 검사한다. 이 regex는A0/ZZZ9999999/역방향B2:A1도 허용한다. 해당sheet의존재·물리bounds·quote존재를 **일반finding admission에서** 검사하지 않는다. 조건/분류/필수누락helper의 실제원문 검증은 별도다. 무유형·무시료는applicability가즉시verified이므로이분기를source검증으로오인하면안된다.

합성 반례: source 없는 CSV문서D,무조건·무유형 criterion K(gte1 %),raw value2/unit%/statuspass/uncertainfalse, evidence={documentId:D,quote:'원문에없는값',sheet:'없는시트',cell:A0}는baseline에서numericpass가가능하다. B2:A1/ZZZ9999999도동일하다. 문법에맞는객체를받았다는것과독립적으로원문근거가검증됐다는것은다르다. 이관찰은raw모델반례이며실제provider가반드시그입력을생성했다는주장이아니다.

**OPTIONAL_FUTURE SOURCE-GROUNDING**(이전 감사 식별자 P1/G05/G07/G12, NOT_RUN): 일반값의 확정 pass/fail 전에 source hash, document, page/sheet/cell 실재 범위와 quote의 현재 원문 존재를 독립 host가 확인하는 개선안이다. 표는 I9.1의 추가 record/anchor/numeric-boundary 검증, 스캔은 08의 추가 geometry verifier를 적용하고 실패 finding을 review로 바꾸는 제안이었다. 이는 현재 normalizeItems에 없는 판정 변경이므로 CURRENT_REPRODUCTION에 구현하거나 그 예상값을 정답으로 사용하지 않는다. 기본 정답은 바로 위 합성 반례의 numeric pass를 포함한다. 이 제안을 나중에 선택하면 raw model status 보존·설명·highlight·viewer와의 상태 경계까지 별도 변경 계약과 실제 시험이 필요하다. 이 절의 명확성은 현재 검증의 경계를 명확히 했다는 뜻이며 원본 근거의 안전성을 개선했다는 뜻이 아니다.

시각helper의추가반례:2개page의전역complete/ID/warnings/quality가통과해도비인용page2의cell.uncertain=true는page1인용의verifiedVisualRegions가재검사하지않는다. citedPage1의동일uncertain은거부한다. 상위전사/quality검증의책임과helper단독동작을구별한다. source가모순된전사객체를정상pipeline에서생성한다고주장하는반례가아니다. 필수누락helper의다른전역조건은§6대로별도다.

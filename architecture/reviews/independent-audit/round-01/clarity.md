# 독립 문서 명확성 감사 — round-01

평가자: `/root/clarity` (source-blind). 초기 검토 완료. 제품·규범 설계는 수정하지 않았다.

기존 **203개 중 201 PASS / 2 FAIL / 0 UNVERIFIED**. 추가5개 포함 **208개 중 201 PASS / 7 FAIL / 0 UNVERIFIED**.

명확성 **96.634615%**, 모호성 **3.365385%**. 기존203개만의 명확성은 99.014778%다. 제외/미검토 PASS는 없다. 원본정확성 **NOT_ASSESSED**, 실제제품/provider/browser **NOT_RUN**.

모든 질문의 개별 상태·근거·이유와 추가질문 전문은 [clarity.json](clarity.json)에 있다. Input digest: `c445a06fb641720caf13e63e2b996fc47c933e13df0fc58a0802f1a5269d8eb1`.

## 판정 기준과 독립성

PASS는 질문의 구현결정을 문서로 정할 수 있다는 뜻이다. 소스·root package/config/test는 읽지 않았다. 큰 기계 카탈로그는 구조/관련항목과 소유명세를 대조했고 모든 style node/PNG 검증을 주장하지 않는다.

architecture 전체 검색에서 제외 glob이 실패해 과거 main-session health 요약 일부가 노출되었다. 즉시 부모에게 알렸고 현재 다른 독립평가자 결과는 읽지 않았다. 과거 점수/판정은 사용하지 않았다.

## 미해결 쟁점

### CLARITY-001 (medium) — UI-13-C05

질문은 취소 시 서버 변경 없음이라고 하지만 saving 중 취소는 editing=false만 수행하며 in-flight resolve를 abort하지 않는다. INSPECTOR-SAVE도 cancelDisabled=false/abortRequest=false/뒤늦은 성공을 요구한다.

근거: `architecture/decomposition/ui-modules.json`, `architecture/specs/04-ui-motion.md:216`, `architecture/ui/interaction-contract.md I8`, `architecture/ui/interaction-fixtures.json INSPECTOR-SAVE`

수정 제안: 질문 ID를 보존하고 저장 전 취소는 변경 없음, 저장 중 취소는 폼만 닫고 이미 전송된 resolve가 저장될 수 있음을 구분한다. baseline과 필수 개선 여부를 결정하고 변경이력과 두 race fixture를 둔다.

### CLARITY-002 (high) — CORE-17-C03

EF-14는 invalid dashboard plan→validation 실패→세번째 성공을 G11 필수로 연결한다. D05b는 planner#1 오류→planner#2→judge#3 뒤 모델호출 없음이므로 DOM 실패까지 발생한 경로를 세번째 수정 성공으로 요구할 수 없다.

근거: `architecture/specs/05-dashboard-exports.md:133`, `architecture/specs/05-dashboard-exports.md:143`, `architecture/specs/07-data-algorithms-concurrency.md:280`, `architecture/specs/06-verification.md:64`

수정 제안: 구 EF-14를 관찰용 baseline으로 분리한다. REQUIRED_REBUILD에는 정상 planner+judge 뒤 constrained repair#3 성공, invalid planner 뒤 planner#2+judge#3 및 DOM 실패 fallback, #3에서 최초 유효plan인 경우 judge예산 부재 fallback을 각각 지정한다. 질문의 최대3회 계획도 전체 모델호출3회로 정합화한다.

### CLARITY-003 (medium) — UI-01-C07

health DTO와 configured header 문구·E2B 의존 control은 있지만 초기 요청시점·기본값·실패·retry/poll·unmount/stale 수명이 없다. activity observer의 수명으로 대신 추론할 수 없다.

근거: `architecture/specs/01-state-api.md §4.1`, `architecture/specs/04-ui-motion.md:84`, `architecture/contracts/types.ts HealthResponse`

수정 제안: health 단독 lifecycle을 명시한다. mount/요청·초기값·success/error UI·retry 유무·cleanup/late guard와 dashboard gate를 하나의 trace로 고정한다.

### CLARITY-004 (medium) — CORE-16-C06

expenses/materials route 입력·201 documents/criteriaText 출력·UI 전이는 있지만 실제 샘플 파일명/개수/role/MIME/내용/criteriaText 생성계약이 없다. SAMPLE-01의 CA/CB/A.pdf는 상태전이 합성fixture이며 실제 샘플 recipe가 아니다.

근거: `architecture/specs/01-state-api.md /api/samples`, `architecture/ui/interaction-contract.md I1`, `architecture/ui/interaction-fixtures.json SAMPLE-01`

수정 제안: expenses/materials 각각 정확한 바이트 또는 결정론적 생성recipe와 기대 documents/criteriaText manifest를 architecture 안에 제공한다. 가변 ID/timestamp와 고정내용, intro 장식예제와 API 샘플을 구분한다.

### CLARITY-005 (medium) — UI-02-C07

I9의 PDF chip 정수검사·빈 출처 추가상한·activity 최신100·OS motion 일관성·저장중 취소정책은 gate 연결 여부로 필수/선택을 판정하라지만 개별 target policy와 gate/expected fixture가 없다. baseline은 현재한계 재현 또는 별도 deviation으로 기술되어 개선범위를 결정하기 어렵다.

근거: `architecture/DECISIONS.md D16/D18`, `architecture/ui/interaction-contract.md:201`, `architecture/specs/04-ui-motion.md:125`, `architecture/ui/detail-controls.md D1/D2`

수정 제안: 후보별 OBSERVED_ONLY/REQUIRED_REBUILD/OPTIONAL 결정표와 owner·gate·baseline/target fixture·정확한 기대행동을 지정한다. OPTIONAL만 선택 가능이라는 상위규칙과 후보 문구를 정합화한다.

### CLARITY-006 (high) — CORE-06-C06

문서당 VLM30쪽/180초와 >30쪽 unread/partial이 규범이고 G07은8보고서575물리쪽 실제처리 및35필드/105셀 exactPass를 요구한다. 전체원본의 후속모델 첨부는 가능하나 30쪽 이후를 어떤 경로로 판독/검증해 G07 완료를 인정하는지, cap이 baseline인지 target제한인지 결정이 없다. inventory575만으로 전체 시각검증을 주장할 수 없다.

근거: `architecture/specs/02-backend-pipeline.md:253`, `architecture/specs/02-backend-pipeline.md:280`, `architecture/specs/07-data-algorithms-concurrency.md:71`, `architecture/specs/06-verification.md:25`, `architecture/specs/06-verification.md:53`

수정 제안: baseline cap과 G07 target의 관계를 명시한다. 전체페이지 전사/검증이 필요하면 chunk/session·물리페이지 mapping·전체budget/partial semantics를 규정한다. 미지원이면 G07 BLOCKED/NOT_RUN 조건과 필요한 확장을 기록한다. cap 임의상향 또는 partial PASS를 금지한다.

### CLARITY-007 (high) — CORE-14-C06

UI는 image bbox 없음, text-layer 없는 scanned PDF는 fallback chip만이며 OCR bbox 추정엔진을 추가하지 말라고 한다. G07은35필드 actual value/qualifier overlay와 회전/2-up polygon/bbox 검사다. Evidence DTO는 page/sheet/cell/quote이며 raster geometry 전달·좌표변환/tolerance가 없다. fallback이 gate를 만족하는지 별도 필수개선인지 정의되지 않는다.

근거: `architecture/ui/detail-controls.md:58`, `architecture/ui/detail-controls.md:114`, `architecture/ui/detail-controls.md:319`, `architecture/specs/06-verification.md:38`, `architecture/specs/06-verification.md:53`, `architecture/contracts/types.ts Evidence`

수정 제안: source/renderer별 geometry gate 적용조건을 명시하고 scan/image required contract를 추가하거나 미지원 BLOCKED로 기록한다. polygon/bbox 좌표계·rotation/2-up mapping·tolerance·실제근거 provenance를 정의하고 임의bbox는 금지한다.

## 모듈별 확장 모집단

| 모듈 | 전체 | PASS | FAIL | UNVERIFIED | 명확성 % | 모호성 % |
|---|---:|---:|---:|---:|---:|---:|
| CORE-01 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-02 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-03 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-04 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-05 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-06 | 6 | 5 | 1 | 0 | 83.333333 | 16.666667 |
| CORE-07 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-08 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-09 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-10 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-11 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-12 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-13 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-14 | 6 | 5 | 1 | 0 | 83.333333 | 16.666667 |
| CORE-15 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-16 | 6 | 5 | 1 | 0 | 83.333333 | 16.666667 |
| CORE-17 | 5 | 4 | 1 | 0 | 80 | 20 |
| CORE-18 | 5 | 5 | 0 | 0 | 100 | 0 |
| CORE-19 | 5 | 5 | 0 | 0 | 100 | 0 |
| UI-01 | 7 | 6 | 1 | 0 | 85.714286 | 14.285714 |
| UI-02 | 7 | 6 | 1 | 0 | 85.714286 | 14.285714 |
| UI-03 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-04 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-05 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-06 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-07 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-08 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-09 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-10 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-11 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-12 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-13 | 6 | 5 | 1 | 0 | 83.333333 | 16.666667 |
| UI-14 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-15 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-16 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-17 | 6 | 6 | 0 | 0 | 100 | 0 |
| UI-18 | 6 | 6 | 0 | 0 | 100 | 0 |

## 단계별 확장 모집단

각 단계에 연결된 모듈의 모든 질문을 분모에 포함한다. 다중단계 질문은 단계 간 중복되지만 전체208개 분모에서는 한 번만 센다.

| 단계 | 전체 | PASS | FAIL | UNVERIFIED | 명확성 % | 모호성 % |
|---|---:|---:|---:|---:|---:|---:|
| STEP-00 | 31 | 29 | 2 | 0 | 93.548387 | 6.451613 |
| STEP-01 | 47 | 44 | 3 | 0 | 93.617021 | 6.382979 |
| STEP-02 | 88 | 85 | 3 | 0 | 96.590909 | 3.409091 |
| STEP-03 | 67 | 64 | 3 | 0 | 95.522388 | 4.477612 |
| STEP-04 | 57 | 54 | 3 | 0 | 94.736842 | 5.263158 |
| STEP-05 | 106 | 103 | 3 | 0 | 97.169811 | 2.830189 |
| STEP-06 | 147 | 141 | 6 | 0 | 95.918367 | 4.081633 |

## 후속 검증

7개 쟁점 수정 뒤 새 해시로 독립 재평가가 필요하다. 추가5질문도 최종 모집단에 남겨야 한다. 현재 설계를100%로 승인하지 않는다.


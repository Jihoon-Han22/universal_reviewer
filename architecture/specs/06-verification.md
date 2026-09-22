# 06. 현재 제품 재현 검증과 선택 개선 평가

## CURRENT_REPRODUCTION: 유일한 필수 인수 profile

사용자의 목표는 고정된 현재 제품의 재현이다. 성공 기준은 **현재 계약의 동작·화면·상태·오류·지원 한도와 일치**하는 것이며, 기존 제품이 풀지 못하는 모든 문서에 정답을 내도록 개선하는 것이 아니다. [DECISIONS](../DECISIONS.md)의 CURRENT_REPRODUCTION이 기본이다. 아래 `OPTIONAL_FUTURE` 절의 전수 정확도·geometry·접근성 보강·봉인 holdout는 사용자가 별도로 선택한 경우에만 적용한다. 다른 파일의 과거 `REQUIRED_REBUILD` 표현을 현재 재현의 필수 기능으로 해석하지 않는다.

설계 점수와 제품 인수는 독립이다. 고정 질문 모집단의 문서 명확성 PASS/전체×100이 명확성이고 모호성은100−명확성이다. 질문 삭제·미검토 통과·작성자의 자기승인으로100을 만들 수 없다. 별도 평가자, 현재 설계 hash, 질문별 근거, 미해결 이슈0이 필요한 **선언 범위의 설계 판정**이며 모든 입력에 대한 절대 완전성 보장이 아니다. 실제 새 앱·브라우저·provider를 실행하지 않았다면 제품 인수는 NOT_RUN이다.

## 현재 재현의 대조 방법

각 사례는 입력 bytes/hash, 초기 run 상태, 사용자 action/event 순서, 설정(키 값 제외), 기대 결과의 소유 spec/기준 artifact, 실제 결과를 기록한다. deterministic API·DTO·판정·상태는 같은 입력과 주입 응답에서 exact 비교한다. 무작위 ID/시간은 그 계약의 형식·참조 관계·순서로 비교하고 임의 문자열을 고정하지 않는다. 모델 출력은 동일한 고정 응답 replay로 경계·정규화를 비교하며 live 실행에서는 같은 모델명만으로 문장까지 동일하다고 주장하지 않는다. live는 원문 전달·호출 경계·수명·검증·HITL·실제 통합 실행을 별도로 입증한다.

화면은 [04](04-ui-motion.md)의 기준 viewport/state, CSS·font·geometry·motion 및 [reference manifest](../ui/reference/manifest.json)의 origin을 맞춰 비교한다. synthetic replay 캡처는 replay 대조의 기준이며 실제 provider 사용 증거가 아니다. 기준 artifact가 없는 동작은 소유 spec의 source-derived assertion과 입력을 먼저 명시하고 독립 검토한다. 예상 결과를 새 구현의 출력으로 역생성하지 않는다.

기존 cap·미지원·partial/review/오류를 그대로 재현한 것은 일치 사례다. 알려진 기존 한계를 감추거나 새 필드/새 동작으로 바꾸면 불일치다. 예:31쪽 PDF의 VLM30쪽 한도·coverage/stopReason, bbox가 없는 Evidence와 이미지 overlay 부재, 현재 dashboard projection 생략, 현재 키보드/모션 한계는 해당 소유 spec대로 남긴다. 동일한 입력에 대해 원본 한계에 해당한다는 근거 없이 새로운 오류를 "기존 한계"로 처리하면 실패다.

## 현재 재현의 필수 G00..G14

모든15개 gate는 실제 실행 후 selected>0, passed=selected, failed=skipped=0이어야 한다. 각 gate의 사례 수와 목록을 실행 전에 고정하고 registry의 질문→소유 spec→실행 사례 연결을 남긴다. baseline이 실패/partial이어야 하는 음성 사례는 그 결과를 일치하게 관측했을 때 해당 assertion이 PASS다. 실패한 검사나 미실행을 PASS로 이름만 바꾸지 않는다.

| Gate | CURRENT_REPRODUCTION의 실제 범위와 완료 기준 |
|---|---|
| G00 패키지 | 필수 파일·링크·JSON·lock·font·manifest, 검증기 양성/음성 selftest, 이식성. 제품 실행과 구분 |
| G01 환경/설치 | 빈 workspace의 scaffold 후 구현, 양쪽 lock 설치/config/test/build, 현재 지원 환경과 오류 계약, 브라우저 비밀 없음 |
| G02 API/상태 | 01 전체 route/DTO/status/error/SSE/취소/replay/restart. 각 허용·거부 transition을 현재 동작과 대조 |
| G03 reader/context | 실제 Gemini/E2B로 PDF/XLSX/DOCX/CSV/image 지원 경로와 현재 cap/repair/coverage/세션/취소를 실행. 미래 window·완전판독 강제 금지 |
| G04 기준/HITL | 현재 eligibility/discovery/정규화/edit/revise/confirm/version 및 immutable approval snapshot. 동일 주입 응답의 정확한 projection |
| G05 판정/source | 03의 연산·qualifier·단위·missing/uncertainty·source 검증 및 기존 PDF text 강조. 신규 bbox/locator 없음 |
| G06 golden 회귀 대조 | 제공20criteria/26cert paths/6ledger/20rules를 각 경로별 원본 계약과 대조. 평가 oracle 오염 없이 시도·결과·현재 한계를 모두 기록; 원본에서 보장하지 않는 의미 정답100%는 재현 조건 아님 |
| G07 v3 한계/출처 대조 | 8requests/8reports/575물리쪽 inventory를 대조하고 현재 reader/VLM cap·생략·partial를 보존.35field/105writer는 진단 수치이며 완전 일치·새 geometry·전체575쪽 model 판독은 요구하지 않음 |
| G08 변형에서의 재현 | 공개13변형 각각 현재 알고리즘/입력·응답 fixture에 대한 대조. 지원/미지원/불확실 경계를 일치시키고 ID 분기 금지. 봉인3seed/39개 전부 정답은 선택 개선 |
| G09 실제 통합 | 기준→HITL 확정→target→판정→source/export/dashboard와 오류·취소. 실제 Gemini/E2B 각각 call>0 및 모델/template/version/redacted trace |
| G10 시각/모션 | 04 및 전체 reference state/viewport, 실제event→DOM/motion 및 취소/disconnect/unmount. 현재 animation/상호작용/모션OFF 동작을 대조 |
| G11 export/dashboard | 05/05a의 현재 CSV/XLSX/HTML/ledger/plan/snapshot/render/fallback. 기존 projection omission과 offline 외부자원 의존성도 명시·대조하며 선택 DB-H 개선을 강제하지 않음 |
| G12 보안/정합성 | 현재 upload/type/size/path/archive·source·HTML/CSP/resource·error/secret 처리의 허용/거부 분기. 신규 보안 보장을 추가하지 않음 |
| G13 접근성/성능 관찰 | 현재 keyboard/focus/dialog/Escape/ARIA/zoom/reduced/mobile 및 resource lifecycle를 실제 browser에서 대조. 현재 미구현 접근성·미측정 절대p95 목표 달성을 필수화하지 않음 |
| G14 독립 재현 인수 | 구현자와 다른 reviewer가 현재 hash의 모든 모듈/질문/15gate·기준과 실제 artifact·기존 한계/선택 개선 경계를 검토하고 핵심 경로 재실행. 미해결 재현 이슈0 |

G06/G07/G08은 동일 model 응답 replay 등으로 현재 동작을 측정한 `offline_implementation` 또는 실제 provider 사용 `live_implementation`을 허용한다. oracle 정답복사는 실제 구현 실행이 아니며 허용하지 않는다. G03/G09는 반드시 live, G10/G11/G13은 실제 browser다. 07의 EF 항목은 각 원본 동작/지원 한도만 현재 gate에 연결하고 추가 기능·목표 수치는 OPTIONAL_FUTURE다.

CURRENT_REPRODUCTION의 G06에도 공개 데이터의 **입력범위와 oracle 충돌 경계**를 적용한다. P10 PDF는8field 전체, P10 PNG는첫물리페이지에있는4field만진단대조하며26개판독경로분모를유지한다. PNG에서보이지않는나머지4field를누락오류로만들거나추측시키지않는다. P13은원문0.025와제공JSON0.015의기지충돌이므로fixture-conflict를별도기록하고JSON을수정하거나원문에없는0.015를정답으로주입하지않는다. 이경계는아래OPTIONAL_FUTURE §2/독립감사보충에있는평가자자료의해석규칙을현재진단에도적용한다는뜻이며,현재제품에P10/P13 ID전용분기나새충돌감지기능을추가하라는뜻이아니다.

## 실행 증거의 profile 경계

`run-gate.mjs GATE ADAPTER ROOT OUTPUT [TIMEOUT_MS] [CURRENT_REPRODUCTION|OPTIONAL_FUTURE]`의 기본은 CURRENT_REPRODUCTION이다. adapter context와 반환 report에 `acceptanceProfile`을 포함한다. evidence index도 같은 값을 명시해야 한다. 누락·알 수 없는 값·혼합 profile은 checker가 실패한다. 예전 무profile gate를 현재 증거로 재사용하지 않는다. profile별 실행 디렉터리를 분리한다.

현재 profile의 G01..G13은 `observations.reproduction={comparedCases,matchedCases,unexpectedDifferences,baselineLimitationsPreserved,baselineReferences}`를 기록한다. comparedCases는 양의 안전 정수, matchedCases=comparedCases, unexpectedDifferences=0, baselineLimitationsPreserved=true여야 한다. baselineReferences는 기준 spec/source snapshot/관측 artifact의 프로젝트 상대경로+SHA256을1개 이상 포함하고, 상세 artifact에는 각 입력/기대/실제/한계/차이 결과를 넣는다. 파일과 선언만으로 실제 일치를 인증할 수 없으므로 G14가 그 내용을 대조한다.

G14의 CURRENT_REPRODUCTION 관측에는 `openReproductionIssues:0`이 필수다. 이는 모든 심각도의 미해결 재현 이슈가0개라는 주장으로, `openCriticalHigh:0`만으로 대체할 수 없다. 기존 제품에서 확인한 한계와 선택 개선의 부재는 재현 차이가 아니며 그 근거를 기록한다. 독립 평가자는 이슈 목록 전체와 종료 근거를 확인한다.

실행 예·adapter/index 구조는 [validation/README](../validation/README.md)가 소유한다. `acceptance.mjs check`의 exit0은 `ready_for_independent_verification`이며 `completeProductAcceptance:false`다. package/selftest·설계100점은 제품pass가 아니다. 실제 실행 불가·키부재·관측 부재는 not_run/blocked이며 새 mock이나 분모 축소로 치환하지 않는다.

## OPTIONAL_FUTURE: 별도 선택 시에만 적용하는 기존 확장 protocol

**이 절부터 문서 끝까지는 OPTIONAL_FUTURE다.** 아래의 "필수", "모든 gate", "새 구현", "완료"는 이 확장 profile 안에서만 유효하다. 과거 목표를 보존하여 비교할 수 있게 남겼으며 CURRENT_REPRODUCTION의 선행조건이 아니다.575쪽 전수·새 geometry·정답 정확도·sealed holdout·접근성 보강 등을 원할 때 새 범위를 합의한 후 실행한다. 별도 profile 선택 없이 아래 요구를 구현하지 않는다.

이 문서는 **미래 새 앱의 acceptance 계약**이다. 문서가 있거나 검증기 selftest가 성공한 것은 새 앱 통과가 아니다. 범위·우선순위는 [DECISIONS](../DECISIONS.md), 구현 순서는 [PLAN](../PLAN.md), 실제 실행 주장은 [evidence](../evidence/README.md)의 command/exit/artifact에 한정한다. 도구의 정확한 인자·출력은 [validation/README](../validation/README.md)에서 확인한다.

## 1. 세 종류의 사실

| 구분 | 이 패키지에서 확인할 수 있는 것 | 이것만으로 확인할 수 없는 것 |
|---|---|---|
| 원본 관찰 | [source snapshot](../baseline/source-snapshot.json), 기능 계약, 로컬 UI PNG/모션 참조의 origin/viewport | 원본의 모든 입력 정확도, 새 앱의 구현 완료, 원본 접근성/성능 목표 달성 |
| 검증기 실행 | fixture 생성/hash, 올바른 출력 양성대조, 고의 오류 음성대조, 정답 대 정답 비교, package 무결성 | OCR/VLM 성능, 실제 API/E2B 처리, source fidelity, 실제 브라우저 접근성 |
| 새 구현 실행 | 새 코드 digest에 묶인 API/브라우저/provider 결과, 전체 공개 데이터, 봉인 변형, 독립 재검토 | 미실행 입력·다른 모델/환경/코드 hash의 정확도, 임의 문서 완전 이해 |

현재 패키지 자체는 새 앱이 아니다. source screenshot이 synthetic replay라면 `origin:synthetic-source-replay` 등 실제 origin을 보존한다. 과거 성공 보고서·test 갯수·상태 캡처를 현재 새 구현 실적으로 복사하지 않는다. `implementationExecuted:false`, `completeProductAcceptance:false`, `visualBrowser:false` 같은 제한 필드는 그대로 해석한다.

## 2. 공개 데이터의 전체 역할

[dataset-inventory.json](../validation/dataset-inventory.json)은 제공 파일의 inventory/hash 기준이다. 현재 manifest는 golden96파일/1,127,978bytes와 v3 191파일/408,008,421bytes를 기록한다. 재생성 스크립트는 입력을 덮어쓰므로 acceptance 중 실행하지 않는다. 변경된 데이터셋을 쓰면 새 버전·변경 이유·hash를 별도로 승인·기록하고 기존 pass를 재사용하지 않는다.

| 입력군 | 전수 실행 범위와 의미 | oracle/보조 자료 경계 |
|---|---|---|
| golden/criteria | C01..C20 실제 XLSX20개. 헤더 이동·다단계/병합·미끼시트·분리블록·notes/comments·단위 위치·이미지/그리드·hidden·중복/불확실·zero-width·원거리 열/긴 tail·코드표 | 옆 JSON은 평가자 정답. `expect:flag`의 명시적 flag도 성공 사례이며 기준0개를 조용히 성공으로 반환하면 실패 |
| golden/certs | P01..P13 PDF13개와 PNG13개 각각의 판독 경로. multi-page P10 PDF의 모든 페이지 포함. qualifier/N.D./범위/단위/각주/방향/필드 정합성 | PNG는 같은 문서 가족의 다른 관측 경로이지 독립 holdout이 아님. JSON은 모델 입력 금지 |
| golden/ledger | L01..L06 XLSX6개. 키·대상 셀 mapping, 중복키/보호시트 flag, 합계·메모·수식·형식 보존 | target_cells와 duplicate_rows는 평가자 전용. 입력 양식 전체를 재작성하여 출력값만 맞춰도 실패 |
| golden/rules | rules.json20표현의 파서/판정 회귀. inclusive/exclusive/range/qualitative/외부표준/unknown 경계 | item 표현은 단위 테스트 입력, expect/operator는 테스트 oracle. 모델에게 전체 정답 파일 전달 금지 |
| v3/inputs | requests8개에 따라 criteria8개, reports8개 **575물리쪽**, 명시된 templates2개를 처리. B101/B102/I201/I202/P301/P302/N401/N402 전부 | `inputs/`만 문서 처리 경계로 전달. request는 사용자 의도, answers가 아님 |
| v3/golden 등 | 35fields, 105writer cells, verdict24pass/4fail/7review. canonical_answer, native completed forms, integrated output, source geometry/page map은 평가자 대조 | `golden/`, `preview/`, `evaluation/`, failed_predictions, effect atlas, generation recipe, 원본 라벨 비교를 모델/제품에 주지 않음.32효과33쪽 atlas는 시각 참고이며575쪽 실행을 대체하지 않음 |

P13은 알려진 corrupt fixture다. 인쇄0.025와 JSON0.015가 충돌한다. 원문에 없는0.015를 출력하면 실패다. evaluator는 제공된 corrupt_fixture 표시와 원문 증거에 근거해 P13을 **fixture-conflict detected**로 별도 집계하고 실제 읽힌0.025/출처를 확인한다. JSON을 몰래 고치거나 P13을 정상 정확도 분모에서 조용히 제외하지 않는다. 전체26판독 경로 수행 수, 일반 일치 수, 알려진 충돌 감지 수를 함께 보고한다.

v3 B101 thermal/3쪽과 P301 impact/118쪽은 값이 실제로 가려졌다. I201 CBR/21쪽의79와89?는 미확정 충돌이다. 과거 원본값을 복원·추측하여 pass로 만들면 실패다. 해당 review를 uncertainty로 유지하고 그 이유·현재 물리 페이지의 evidence를 기록한다. 특정 ID에 대한 if문을 구현하라는 뜻이 아니며 모든 동등한 가림/충돌 입력에 같은 규칙을 적용한다.

## 3. coverage와 의미 정확도를 분리

각 문서는 `물리 inventory → 읽은 영역 → 문맥에 전달한 영역 → 추출한 기준/값 → 결과에 연결한 영역`의 수량·누락 사유를 각각 저장한다. readerComplete만 true인 것은 contextComplete가 아니다. page/sheet/block의 정확한 분모는 업로드 원문에서 산출하며 oracle에서 복사하지 않는다. 숨긴 시트/행과 멀리 떨어진 block도 inventory에 포함한다. parser limit, token cap, timeout으로 생략된 영역은 그 위치와 원인을 보여야 한다.

`coverage=100%`는 관찰 가능한 영역을 처리했다는 주장이다. 이것만으로 기준·값·단위·적용조건·개정 우선순위·판정이 옳다고 할 수 없다. 결과 평가는 각각 별도 분모를 갖는다: expected criterion recall/extra criteria, field presence/value/unit/qualifier, match/applicability/conditions, verdict, source identity/quote/position, writer cell, unchanged workbook regions. 모든 필수 사례의 exact assertions가 통과해야 하며 평균 점수로 source mismatch·누락·실행 실패를 상쇄하지 않는다.

page/cell 출처는 파일 hash와 좌표를 묶는다. PDF geometry는 [source 타입 계약](../contracts/types.ts)과 [03 알고리즘](03-algorithms.md)의 정규화 방식으로 실제 보이는 현재 페이지와 대조한다. v3 기본 평가기는 bbox를 검사하지 않는다. 별도 브라우저 source gate에서 모든35field의 evidence를 원문에 overlay하고 독립 평가자가 실제 값/qualifier를 포함하는지 검사한다. 가려진 값·확인된 부재는 가짜 값 highlight0개. PDF polygon/bbox는 화면 방향·2-up 변환 후의 물리쪽 기준이며 header·시료명만 맞는 highlight는0점이다. source type별 tolerance/좌표 변환은 소유 contract가 우선한다.

## 4. 필수 gate와 실패 조건

모든 G00..G14가 필요하다. gate 단위 결과에 selected>0, passed=selected, failed=0, skipped=0가 있어야 한다. 최소 카운트를 채워도 아래 기능을 빠뜨리면 실패다. `not_run`/`blocked`/partial/cancelled/timeout/에러는 pass가 아니다. G00은 패키지 검증, G01 이후는 **해당 새 구현**에서 실행한다.

| Gate | 필수 실제 범위 | 성공 기준/증거 |
|---|---|---|
| G00 패키지 | 필수 파일/링크/JSON/lock/font/package hash, 검증기 양성·음성대조 | verify-package exit0 및 selftests 전체 pass. 문서 존재만으로 G01..14 통과 불가 |
| G01 환경/설치 | 빈 작업공간+architecture/golden/v3/.env에서 bootstrap, 양쪽 npm ci, config check, npm test/build, build 산출물 구동 | 설치 lock 유지, 키 누락/invalid 명확, 브라우저 secret0. fresh install 로그·Node/npm/browser 버전·실행된 테스트 이름. bootstrap 직후 앱 없음은 정상이나 G01 완료는 앱 구현 이후 |
| G02 API/상태 | [01](01-state-api.md)의 전체 route/transition/error/SSE 계약과 취소/replay/restart | 승인 전 target 처리0, version stale409, 잘못된 상태 변이0, SSE reconnect/replay 일치, 메모리 restart 소실. 각 성공/실패 경계별 test |
| G03 reader/context | 실제 Gemini/E2B: PDF + multi-sheet XLSX + DOCX + CSV + 이미지, partial/timeout/cancel/repair | 설치1회/문서세션 repair재사용/별도 phase 경계 증거, inventory와 context 분리, limit omissions 노출, late result 무시. E2B local preview 대체 불가 |
| G04 기준/HITL | eligibility, 무유형/다단계/분리·전치·hidden, notes vs conditions, 중복/개정/대체/qualitative, edit/revise/confirm/version | 누락·추가·가짜 유형0, 비고만 제외하고 독립 조건/대체 규칙 보존, 승인 snapshot 불변/사용자 원문·machine draft audit 구분 |
| G05 판정/source | [03](03-algorithms.md)의 전 연산 경계, 단위불일치, N.D./range/qualifier, applicability/condition, 필수부재 vs 불확실, PDF/cell source | 결정적 경계 전부 맞음; 확정 required missing=fail, 관측 불확실=review, 가짜 source0, source 없는 항목 빈highlight |
| G06 golden 전수 | §2의20criteria/26cert paths/6ledger/20rule cases 전부, G03 실제경로 사용 | 모든 기대 flag/정상결과/known corruption 정책 일치; 각 subfamily 수·실행 목록·oracle 미노출·현재 코드hash. 일부 smoke를 전수라 부르지 않음 |
| G07 v3 전수 | 8requests/8reports575쪽의 실제 처리,35fields/105writer cells, source overlay, native 양식 보존 | evaluate-v3 exactPass와 별도 geometry/보존 검사 모두 pass. report count8/page inventory575; 관측 가능한 정보만 사용; elapsed/cost/model/template/version 기록 |
| G08 일반화 holdout | §5의 공개13변형+3개 이상 봉인seed, 독립 PDF/이미지/DOCX/개정/대체/누락/중복 변형 | 최소39개 sealed XLSX/CSV cases+확장 의미/포맷 사례 모두 pass; 이전 실패 수정 뒤 새로운 holdout; oracle 격리/봉인 시각/입력hash/예상관계 증거 |
| G09 실제 통합 | 기준발견→사람 수정→명시확정→실제target→판정→source→export, 실제 dashboard E2B/모델; provider 오류/취소 경로 | Gemini/E2B 각각 실제 call>0, provider 모델/template/SDK/timeout/횟수·redacted trace. fixture/fake/LLM_MODE 문자열로 대체 불가 |
| G10 시각/모션 | [04 UI-01..UI-11](04-ui-motion.md), [로컬 참조 manifest](../ui/reference/manifest.json) 전체 state/viewport | geometry/색/글자/duration/PNG tolerance 전부 소유spec 기준, 실제event→DOM/video timing·burst100·duplicate/history/noevent·disconnect/cancel/unmount·OFF. synthetic replay vs live origin 구분 |
| G11 export/dashboard | CSV/XLSX/HTML, ledger6군,14design fields와baseDesign, 모든layout/chart/theme/motion, 오류repair/fallback, offline download | 확정machine/human audit와 cross-count100%, CSV 수식escaping, workbook 비대상 보존, 원문bytes0, 외부request0, 실제 chart render. DOM stub pass만으로 성공 불가 |
| G12 보안/정합성 | upload extension/signature/size/path, prompt injection 문서·모델값, 잘못된 source/HTML/CSP/resource, API 키/error/log/브라우저bundle | traversal·active content·fake instruction 반영0, 원문/secret 누출0, 불일치 failclosed, local loopback 모델. 외부공개 multi-tenant 보안 보장 아님 |
| G13 접근성/성능 | keyboard/focus/dialog/Escape/ARIA/200%zoom/contrast/OSreduced/mobile+성능 측정 | [04 §8/9](04-ui-motion.md), [05](05-dashboard-exports.md)의 수치; keyboard 완주·모션OFF running animation0·overflow≤1px·cleanup·p95. 원본 미측정 요구는 추가acceptance |
| G14 독립 인수 | 구현자와 별도 reviewer가 현재 hash와 실제 gate artifact를 검토하고 핵심 경로 재실행 | opencritical/high0, 모든 모듈 보고서존재/현재hash/requiredtests수 일치, holdout통제 검토, 해결이력과 reviewer 식별. selfscore/정답복사adapter/문서검토만으로 인수 금지 |

독립 인수는 [core 분해 계약](../decomposition/core-tree.md), [UI 분해 계약](../decomposition/ui-tree.md)의 module 범위 및 [추적표](../traceability.csv)와도 대조한다. 필수 모듈 검사가 어느 gate에도 없으면 누락이다. 지금 존재하지 않는 제품을 문서로 통과시킬 수 없다.

[07 자료구조·알고리즘·동시성](07-data-algorithms-concurrency.md)의 EF-01..EF-16도 필수 실행 범위다. EF-01..04/07/08은 G03의 pool·세션·bounded repair, EF-05/06/09/10은 G04/G05의 sparse inventory·grounding·누락 의미, EF-11/12는 G02의 stale 응답·진행 이벤트, EF-13은 G10의 bounded motion, EF-14/15는 G11의 dashboard/ledger 수명, EF-16은 G13의 실제 브라우저 자원/성능으로 연결한다. [efficiency inventory](../contracts/efficiency-inventory.json)의 자료구조·계산량 설명은 분석과 구현 관찰을 구분하며, 설명이 있다는 이유로 동시성·취소·메모리·성능 시험을 통과시키지 않는다. G14는 이 매핑과 현재 module registry의 모든 질문이 실제 gate에서 검증됐는지도 확인한다.

## 5. 일반화와 oracle 격리

golden과v3는 이미 공개된 회귀자료다. 같은 문서 가족의 PDF/PNG, v2에서 파생한v3, 공개 generator의 기본seed는 독립 holdout이 아니다. 공개 사례의 ID·파일명·좌표·문자열에 따라 예상 verdict를 반환하는 코드, canonical_answer 읽기, evaluator의 expected를 앱/모델에 전달하기는 실패다.

패키지 [fixture-generator](../validation/fixture-generator.mjs)는 새 XLSX/CSV bytes와 평가자 oracle을 만든다. 13변형은 baseline, 큰 row/column shift, columns permutation, transpose, blocks+hidden+미끼시트, renamed, scaled-both, changed-values, incompatible-unit, missing-required, unreadable, condition-mismatch, CSV이다. seed는 값·라벨·위치를 바꾸고 물리 좌표/quote/hash를 갱신한다. 변형 이름·caseID를 제품의 판단 근거로 사용하지 않는다.

예상 관계는 다음과 같다. 이동/전치/순서/이름/hidden/블록 변경은 의미를 보존하므로 verdict 동일이고 source 좌표만 변한다. 기준·값의 단위를 함께 동등 scaling하면 verdict 동일, 한쪽만 다른 단위면 [03](03-algorithms.md)의 conversion 제한에 따라 review이다. 숫자를 한계 반대편으로 이동하면 해당verdict만 변경한다. confirmed mandatory blank는 fail+missingVerified, unreadable는 review, condition mismatch는review다. 비고의 미끼999/습윤을 condition/criterion으로 끌어오면 실패다.

이13변형은 유용한 시작점이며 보편 일반화 증명은 아니다. 자체 generator에는 PDF/이미지 왜곡, DOCX, header병합/댓글, 다중시료, 개정/대체 우선순위, 진짜 행 부재/unknown, 모호한 매칭, 공격 문서, ledger형식 보존 전체가 없다. G08의 독립 평가자는 이 누락군을 각각 최소1개의 양성 및 대응 음성/반례 가족으로 추가한다. 앱소스를 freeze한 뒤 secret random seed3개이상으로 기본39case와 추가 families를 생성·봉인한다. seed 선택은 구현자가 하지 않으며 frozen code를 평가 전 수정하지 않는다.

봉인 기록은 생성도구 hash, 구현 digest, 생성시각, case 수/가족 목록, 입력·oracle hash, seal commitment와 담당 평가자를 포함한다. seed/oracle은 평가자 전용 저장소에 두고 앱에는 해당 입력문서와 자연어 요청만 복사한다. harness child process는 보안격리가 아니므로 **같은 filesystem의 oracle을 볼 수 있는 실행을 holdout 격리라고 주장하지 않는다**. 별도 OS계정/컨테이너/원격 evaluation boundary로 oracle 읽기를 차단하고 모델 payload를 검사한다. 평가 후 seed/입력/oracle은 재현용으로 공개할 수 있지만 다음 수정판의 holdout으로 재사용하지 않는다.

실패 시 어떤 family/관계가 깨졌는지 보고하고 일반규칙을 수정한다. 다음 run에는 새로운 seed·입력과 독립 봉인을 사용한다. 단순 이름변경이나 한계값 변경만 반복해 unseen 문서의 의미 이해를 증명했다고 말하지 않는다.

## 6. 실행 명령과 증거 계약

패키지 도구는 다음 명령을 지원한다. 명령은 프로젝트 root 기준이다. 먼저 [validation/README](../validation/README.md)의 adapter를 **실제 새 구현에 연결해 작성**해야 한다. 해당파일이 없으면 실패하는 것이 정상이다. 아래는 현재 새 앱이 이미 존재한다는 주장이 아니라 M8/M9에서 그대로 쓸 실행 protocol이다.

```powershell
node architecture/tools/verify-package.mjs
node architecture/tools/test-bootstrap.mjs
node --test architecture/validation/selftest.mjs architecture/validation/acceptance-selftest.mjs architecture/validation/package-validator-selftest.mjs
node architecture/validation/evaluate-v3.mjs ralph-golden-v3 --selftest
npm ci
npm --prefix integrations ci
npm --prefix integrations run check
npm test
npm run build
node architecture/validation/fixture-generator.mjs .cache/rebuild/public-suite public-regression-v1
node architecture/validation/harness.mjs .cache/rebuild/public-suite ./scripts/acceptance-adapter.mjs .cache/rebuild/public-contract live
node architecture/validation/run-gate.mjs G00 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G01 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G02 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G03 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G04 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G05 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G06 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 21600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G07 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 21600000 OPTIONAL_FUTURE
node architecture/validation/evaluate-v3.mjs ralph-golden-v3 .cache/rebuild/v3/prediction.json
node architecture/validation/run-gate.mjs G08 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 21600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G09 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G10 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G11 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G12 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G13 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/run-gate.mjs G14 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 3600000 OPTIONAL_FUTURE
node architecture/validation/acceptance.mjs snapshot . .cache/rebuild/implementation-manifest.json
node architecture/validation/acceptance.mjs check . .cache/rebuild/evidence-index.json
```

`test-bootstrap.mjs`는 원본 소스 없는 복사 패키지에서 scaffold 생성, 가짜 환경파일·데이터 sentinel 보존, 멱등성, 기존 파일 충돌 시 쓰기 전 전체 검사와 부분쓰기0을 확인한다. 실제 `.env`를 읽거나 앱을 build/실행하지 않는다. [bootstrap portability 증거](../evidence/bootstrap-portability.json)의 `implementationExecuted:false`와 `completeProductAcceptance:false`를 유지하며 G00의 패키지 이식성 근거로만 사용한다.

adapter runGate는 해당 gate의 전체 구현 테스트를 수행하고 [evidence.schema.json](../validation/evidence.schema.json)의 관측·파일참조를 반환한다. 예를 들어 G07은 파일을 실제로 읽고prediction.json을 작성한 뒤evaluate-v3와geometry/출력보존 검사를 실행한다. 원본 source repository의 미포함 test script를 복사해야 하는 전제는 없다. G14는 별도 reviewer의 실제 결과를 수집하며 구현자가 independentReviewer:true만 쓰는 것은 독립검토가 아니다. Node exit0을 임의 state 필드로 덮지 않는다.

`run-gate`는 성공·실패 모두 code/adapter hash, nonce, command, 시간, exitCode, 관측 및 artifact참조를 기록한다. frozen code를 실행 중 바꾸면 실패한다. full suite 실행 시 report overwrite를 피하려면 run별 output directory를 사용한다. `.cache/rebuild/evidence-index.json`은 acceptanceProfile:"OPTIONAL_FUTURE"와 정확히G00..G14 report15개 및 package/implementation manifest를 실제 SHA-256으로 참조한다. 필수 input/artifact가 하나라도 없거나 달라지거나 현재 code hash와 다르거나 test0/skip>0이면 checkerexit1이다. 브라우저 캡처/trace/download/provider log 등 실제 산출물의 hash를 남기고 전체 업로드원문이나 비밀키·Authorization헤더를 로그에 붙이지 않는다.

gate의 `observations`에는 tests외에도 implementationExecutionVerified/oracleAccess, live gate의 providerCalls.gemini/e2b, holdout의 sealedBeforeExecution/generatedAfterImplementationFreeze/independentEvaluator/heldoutSeedCount, 인수의 independentReviewer/reviewerId/openCriticalHigh를 기록한다. 이는 검증할 주장이지 암호학적 실행 증명이 아니다. checkerexit0은 **증거 묶음의 구조·hash 일관성만** 통과한 것이며 `completeProductAcceptance:false`를 유지한다. 독립 평가자가 각 artifact의 내용·실행 진위·의미 정확도를 검토해야 최종 완료를 선언할 수 있다.

## 7. 중단·재실행·최종 보고

provider 제한/키부재/환경오류는 해당 gate를blocked 또는not_run으로 기록한다. 임의의 mock으로 바꾸거나 expected item분모를 줄이거나 golden파일을 수정하여 통과시키지 않는다. parser/context/match/evaluator/source/UI/infra 중 실패원인을 나누고 해당case→해당gate→영향인접gate 순서로 재검증한다. 코드 변경 후 기존pass는 현재digest와 다르므로 그대로 인수할 수 없다.

최종 보고는 원본 조사, 패키지 검사, 검증기 selftest, 새 구현 공개전수, 독립holdout, live통합, 브라우저/접근성/성능, 독립검토를 각 실행여부와 함께 분리한다. 입력범위·환경·총수/실패/skip·hash·독립review·남은 한계를 보여준다. 모든requiredgate 실제pass 및critical/high0일 때만 PLAN M9 완료다. 데이터셋 일부만 맞춘 결과, docs만 있는 디렉터리, oracle 복사adapter, 정답과정답비교, stale해시, 누락모듈보고서는 전체제품pass가 될 수 없다.

## 독립 감사 보충: 누락된 평가 분기

P10은평가자전용expected projection을형식별로분리한다. PDF는전체8field,PNG는첫물리페이지에존재하는앞4field만대조한다. 같은JSON의뒤4field를단일PNG에서누락으로감점하거나모델이보지못한값을추측하도록요청하지않는다.26개판독경로분모는그대로유지하고P10 PDF/PNG각실행범위와필드분모를기록한다. 이는scripts/verify-golden.mjs의expectedCertificate와같은평가정책이며제품에P10 ID분기코드를넣으라는뜻이아니다. P13의원문0.025와corruptJSON0.015충돌정책도그대로다.

G07의575쪽과스캔좌표요구는[08의 OPTIONAL_FUTURE](08-rebuild-coverage-geometry.md)를따른다. baseline30쪽cap/이미지bbox없음을숨겨G07 pass로계산하지않는다. 전체35field를검사하되확인된부재/가려진값에는값box0이정답이다. baselineEvidence타입에bbox가존재한다는주장도하지않는다.

[이전 독립 감사](../reviews/independent-audit/README.md)의점수·모집단·validate.mjs는당시중단된감사의역사적자료다. 현재CURRENT_REPRODUCTION의설계평가또는최종점수로재사용하지않는다. 현재감사의모집단·검토·입력hash·최종판정은[current-reproduction 감사](../reviews/current-reproduction/README.md)와[현재 감사 도구](../reviews/current-reproduction/audit.mjs)에서확인한다. 기존main-session/evidence의과거pass도변경후설계평가가아니다. [source-trace.json](../decomposition/source-trace.json)은baseline소스210파일+server/README.md1개=211파일을분류한다. 파일추적률은실행경로검증률이아니다.

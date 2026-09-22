# Dashboard / ledger / exports 현재 재현 감사

감사자/수정자: `/root/audit_exports`. 기준일 2026-09-21. 최초에 `DECISIONS.md`, `reviews/independent-audit/PROTOCOL.md`, `CHECKPOINT.md`를 읽었으며 과거 점수·승인을 이번 결과로 재사용하지 않았다. 사용자 목표는 현재 프로젝트 그대로의 재현이고, 활성 프로필은 `CURRENT_REPRODUCTION`이다. 제품 `src`, `server`, `integrations`는 수정하지 않았다.

## 범위와 근거

현재 `server/dashboard.mjs`, `dashboard-plan.mjs`, `dashboard-plan-validation.mjs`, `dashboard-fallback.mjs`, `ledger.mjs`, `app.mjs`, `src/components/LedgerModal.tsx` 및 대응 05/05a 명세·dashboard contracts/prompts/reference를 대조했다. 이 감사는 문서 계약과 결정론적 source 대조이며 실제 Gemini/E2B, 브라우저, 새 재구현 실행을 포함하지 않는다. UI 전체 픽셀/모션·근거 selector는 UI 담당의 별도 감사 범위다.

| 질문 ID | 현재 재현에서 결정해야 하는 사항 | 근거 | 감사 결과/수정 |
|---|---|---|---|
| EXP-A01 | DB-H01/02/03가 현재 기능인가 | `server/dashboard.mjs:184`, `server/dashboard-plan.mjs:62`, `server/dashboard.mjs:297` | 현재 없음. OPTIONAL_FUTURE로 분리; 05 D02/D05/D11 및 JSON oracle 정정 |
| EXP-A02 | 계획 응답 형식과 실제 호출 예산 | `server/dashboard-plan.mjs:3`, `server/dashboard.mjs:174` | bare design schema, 전체 최대 3 plan calls. judge/envelope/notices를 현재에 추가하지 않음 |
| EXP-A03 | 5개 필드의 새 생성 응답도 허용하는가 | `server/dashboard-plan.mjs:43`, `server/dashboard.mjs:188` | 허용. 공급자 14필드 schema 요청과 host의 공용 permissive parser를 구분하도록 정정 |
| EXP-A04 | 현재 prompt의 subtitle 제한 안내 문구 | `server/dashboard-plan.mjs:40`, `server/dashboard-plan.mjs:94` | 원문 system prompt 보존. notices로 대체하라는 기존 재구현 지시를 미래안으로 분리 |
| EXP-A05 | 미요청 필드의 성공/실패 경로 보존 | `server/dashboard.mjs:188`, `server/dashboard.mjs:329` | 성공은 모델 plan+override, fallback은 baseDesign+override. 각 observed oracle 유지 |
| EXP-A06 | 자연어 matcher의 범위 오해·색 누락 | `server/dashboard-plan.mjs:62` | 10 preference case를 실제 helper와 대조. `빨간 파이`는 cobalt 유지, light-blue는 theme=light 등의 현재 한계를 oracle로 명시 |
| EXP-A07 | snapshot에 missing flag/pending이 남는가 | `server/dashboard.mjs:37`, `server/dashboard.mjs:62`, `server/dashboard.mjs:297` | presence/missingVerified 누락, pending→review. DB-H01 기대값으로 현재를 바꾸지 않음 |
| EXP-A08 | 공개 job 필드와 fallback 의미 | `server/dashboard.mjs:265`, `server/dashboard.mjs:320` | ready sourceItems/design, generated/standard 구분. 현재 notices는 없음 |
| EXP-A09 | 대장 analyze의 key/run/context 검사 순서 | `server/ledger.mjs:215`, `server/ledger.mjs:228` | source→context→ensureAnalyzed→mapping/key→truthy runId OR sourceDocumentId로 proposal. 문서의 “전달됐으면”을 truthy로 정정 |
| EXP-A10 | workbook relationship Target 해석 | `server/ledger.mjs:75` | absolute형은 첫 slash만 제거, relative형만 posix normalize; 정확히 External 거절. 일괄 정규화로 과장한 문장 정정 |
| EXP-A11 | 대장 결과/fingerprint의 변경 경계 | `server/ledger.mjs:196`, `server/ledger.mjs:244` | 여섯 proposal 필드의 JSON만 hash. humanNote/audit 변경 자체는 무효화 아님. 기존 §4/4.1과 일치 |
| EXP-A12 | 두 셀 이외 원본 보존의 의미 | `server/ledger.mjs:149`, `server/ledger.mjs:167` | 대상 외 uncompressed bytes 동일, ZIP 전체 bytes 동일 아님. 기존 §5와 일치 |
| EXP-A13 | 일반 export의 상태·형식·11열·4시트 | `server/app.mjs:28`, `server/app.mjs:36`, `server/app.mjs:120` | failed도 items 있으면 가능; JSON/CSV/XLSX, BOM/CRLF/injection quote, 원판정/이력 보존. §7과 일치 |
| EXP-A14 | 현재 대장 UI 메모/재분석/race 상태 | `src/components/LedgerModal.tsx:169`, `src/components/LedgerModal.tsx:223`, `src/components/LedgerModal.tsx:313` | 재분석 메모 유지, clearAnalysis 초기화, 메모 변경 mapping 유지. §6과 일치 |

이 14개 질문은 이 담당자의 명시적 검토 범위이며 프로젝트 전체 질문 모집단을 대체하지 않는다. 전부 수정자 대조 완료 상태이고, 최종 독립 승인/점수는 다른 평가자가 현재 변경본에 대해 결정해야 한다. 여기서 “모호성 0/명확성 100”을 자체 승인하지 않는다.

## 수정한 산출물

- `specs/05-dashboard-exports.md`: 활성 재현 프로필, projection 손실, 실제 parser, 현재 layout과 미래 judge 예산 절 경계, D11 oracle, 비관측 성능 목표 분리.
- `specs/05a-ledger-export.md`: 현재 프로필, analyze의 truthy 조건/검사 순서, worksheet Target의 실제 처리 분기.
- `prompts/dashboard-system.md`, `prompts/dashboard-loop.md`: 현재 exact prompt 활성화, future override의 비활성화, schema 요청과 host 검증 차이.
- `contracts/dashboard-customization-cases.json`: 현재 targetExpected=observedExpected, 기존 원하는 결과는 futureExpected로 보존. 성공/fallback oracle, 파서 공용 사용, OPTIONAL_FUTURE 구간 명시.
- `contracts/dashboard-examples.json`: requiredRebuildAcceptance라는 역사적 키는 유지하되 OPTIONAL_FUTURE로 표시.
- `reviews/current-reproduction/dashboard-future-options.md`: 과거 judge/envelope/notices의 상세 설계를 보존했다. 활성 spec/prompt에는 링크만 남겨 미래 기능의 지시가 현재 구현 요구 사이에 섞이지 않게 했다.

## 실행 증거와 한계

`.cache/architecture-current-reproduction/check-exports.mjs`에서 현재 source를 import하여 20개 검사 통과: preference 10, parser 5, baseDesign 성공/fallback 2, system prompt exact 1, generation schema exact 1, missing/pending snapshot 1. 출력은 `.cache/architecture-current-reproduction/exports-contract-checks.json`이다. 각 preference의 targetExpected와 observedExpected 일치도 함께 assert했다. 외부 공급자 또는 브라우저 성공을 의미하지 않는다.

기존 7개 source test 파일의 일반 `node --test` 실행은 Windows sandbox의 child `spawn EPERM` 때문에 제품 테스트 본문 진입 전에 실패했다. 이를 제품 회귀 실패나 통과로 세지 않는다. `--test-isolation=none` 재시도는 출력 없이 완료되지 않아 이 감사가 생성한 해당 세션만 중단했다(exit 1, 결과 미확정). 최초 오류 출력은 `.cache/architecture-current-reproduction/exports-source-tests.txt`, 재시도의 빈 출력은 `exports-source-tests-no-isolation.txt`에 보존했다. 이 두 실행은 NOT_COMPLETED이며 20개 직접 대조 결과에 합산하지 않는다.

남은 경계: 현재 명세가 외관을 정의하는 브라우저 matrix는 여전히 NOT_RUN이다. LLM이 같은 자연어에서 같은 design을 매번 내놓는다는 보장은 없다. CURRENT_REPRODUCTION은 고정 renderer/후처리/실패 흐름과 같은 model request를 보존하며, 실제 provider 결과는 별도 통합 실행으로 평가한다. 이 감사에서 구현을 보강해 이러한 차이를 숨기지 않았다.

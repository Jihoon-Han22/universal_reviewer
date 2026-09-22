# 현재 제품 재현 UI 계약 감사

검토자: `/root/audit_ui`. 날짜: 2026-09-21. 사용자 목표는 architecture만으로 **현재 프로젝트 그대로** 재현하는 것이다. 이 보고서는 설계 수정자의 원본 대조 기록이며 최종 독립 승인이나 실행 성적표가 아니다.

## 범위와 방법

- `DECISIONS.md`, 독립 감사 `PROTOCOL.md`/`CHECKPOINT.md`, `specs/04-ui-motion.md`, `ui/interaction-contract.md`, `ui/detail-controls.md`, `ui/auxiliary-contract.md`, `ui/VISUAL-CONTRACT.md`, UI registry/tree/합성 fixture를 읽고 재현 정답의 충돌을 조사했다.
- 원본 대조는 `src/App.tsx`, `src/motion-preference.tsx`, `src/components/GoldenPicker.tsx`, `LiveReviewFlow.tsx`, `ResultsVisuals.tsx`, `FileReviewResults.tsx`, `DocumentPreview.tsx`, `ItemInspector.tsx`의 해당 분기와 `live-review-flow.css`의 focus/반응형 규칙을 중심으로 했다. 전체 소스의 모든 실행 경로를 새로 전수 실행했다는 주장이 아니다.
- Dashboard/Ledger의 제품 동작은 다른 담당자 범위다. 이 변경은 공통 UI 명세의 current/future 참조만 정리하며 대시보드/대장 알고리즘을 새로 승인하지 않는다.
- source·기존 PNG·DOM 참조·style catalog·component style map·motion catalog·폰트 자산은 수정하거나 재생성하지 않았다. 실제 브라우저, 제품 build, provider, 시각/타이밍 실측은 NOT_RUN이다.

## 발견·수정 추적

모든 행의 상태는 `AUTHOR_FIXED / INDEPENDENT_REVIEW_PENDING`이다. 후속 독립 평가자가 현재 고정 입력에서 해당 질문과 회귀를 확인해야 해결 완료로 집계한다.

| ID | 발견과 원본 근거 | 보완 위치/기대값 | 연결 질문 |
|---|---|---|---|
| UI-R01 | 현재 tooltip은 280px/좌우12px 계산, 세로 clamp·Escape listener 없음(`src/components/ResultsVisuals.tsx:64`, `:120`, `:128`). 기존 설계는 276px/8px, scroll·Escape 개선을 필수로 덮어써 현재 재현과 충돌 | 04 §6, interaction I8/I8.1, TOOLTIP-LIMIT을 current oracle로 유지. TOOLTIP-G13-REBUILD는 OPTIONAL_FUTURE | UI-14-C05, UI-02-C09 |
| UI-R02 | 전역 preference는 저장된 app on/off만 사용하고 MotionConfig never/always를 선택(`src/motion-preference.tsx:12`, `:23`). ResultsVisuals만 app/OS를 합성(`src/components/ResultsVisuals.tsx:42`). 전역 OS 합성 요구는 현재 제품에 없음 | 04 §8/§10, I9.2에서 current 컴포넌트별 차이와 OPTIONAL_FUTURE를 분리. OS reduce만으로 전역 JS queue clear라고 읽히던 문장 정정 | UI-02-C03/04/09 |
| UI-R03 | LiveReviewFlow의 done은 completed/partial일 때만이며 failed/cancelled/null도 진행 중 문구(`src/components/LiveReviewFlow.tsx:43`, `:71`) | auxiliary A5의 baseline을 current 정답으로 명시. ARIA-TERMINAL은 OPTIONAL_FUTURE, UI-07-C07 문구 일치 | UI-07-C07 |
| UI-R04 | PDF 요청 prop은 정수 검사(`src/components/DocumentPreview.tsx:284`), chip은 truthy/범위만 검사(`:334`). 기존 chip 정수 보강을 current 필수로 적용하면 다른 앱이 됨 | I9.2 current/future 분리. PREVIEW-PDF-FRACTION 유지, 기존 문서에 이름만 있던 PDF-PAGE-INTEGER의 명시적 OPTIONAL_FUTURE fixture 추가 | UI-11-C03/06, UI-02-C09 |
| UI-R05 | 삭제 요청은 pending/uploading을 올리거나 epoch/abort/dedupe하지 않고 시작 시 preview closure를 사용(`src/App.tsx:104`). A 삭제 중 B를 열면 A 성공이 B preview도 닫음. 업로드 input은 바로 value=''(`:173`)이고 append 시 filename/bytes dedupe 없음(`:100`) | I1에 실제 경쟁을 규정, INPUT-DELETE-RACE에 늦은 성공·실패·동일 파일 재업로드 기대값 추가 | **신규 UI-04-C08** |
| UI-R06 | App 분석/결과는 sourcePreview 우선 조건식으로 pane을 실제 교체(`src/App.tsx:193`, `:197`), 기준 재수정의 confirmation만 동일 run key로 hidden 유지(`:60`, `:182`). 탭마다 preview clear 여부도 다름(`:192`, `:196`) | I1.1 mount/대입 행렬, APP-PANE-LIFECYCLE 추가. 하위 local filter/scroll 소멸과 App selectedItemId 보존, 같은 mount의 목록복귀 scroll 복원을 구분 | **신규 UI-01-C08**, UI-12-C03 |
| UI-R07 | export menu는 exportOpen toggle 및 링크/ledger 선택에서만 닫음. 외부 클릭/Escape 닫기 listener 없음(`src/App.tsx:195`). 탭 이동은 exportOpen을 바꾸지 않음(`:196`) | I1.1과 APP-PANE-LIFECYCLE의 Escape/외부 클릭/탭 이동/다운로드 기대값 추가 | 신규 UI-01-C08 |
| UI-R08 | LiveReviewFlow 파일 상태 문구는 terminal file→active reviewing/pending→count→analyzed→processing→busy/done/idle 순. focus는 React unmount가 아니라 CSS display:none(`src/components/LiveReviewFlow.tsx:61`, `:74`; `src/components/live-review-flow.css:13`) | I2에 정확한 문구 우선순위·is-processing 독립 조건·counts 0 표시·source action 및 focus 동안 timer 유지 추가 | UI-07-C01/03, UI-08-C03 |
| UI-R09 | 표 추가 witness, image/scanned-PDF geometry, 성능 p95 새 상한은 기존 설계가 스스로 baseline과 다르다고 기록한 새 기능/목표 | 04, detail-controls, interaction I9에서 current의 좌표 우선/overlay 없음 및 별도 OPTIONAL_FUTURE를 유지. source-cell-check 알고리즘의 독립 정확성은 해당 담당자 범위 | UI-11-C06, UI-02-C09, UI-15-C06 |

기존 질문을 삭제하지 않았다. 목표와 충돌하던 UI-02-C09/UI-07-C07/UI-13-C05/UI-14-C05의 표현을 current/future 구별로 바꿨고, 원래 반례·미래 개선 요구·fixture는 남겼다. 초기 108이라는 UI tree의 고정 분모를 현재 분모인 것처럼 읽지 않도록 registry 전수 계산 규칙을 추가했다. UI source-blind 평가자에게 새 계약/질문 위치를 전달했다.

## 독립 정확성 사전검토 후속 수정

후속 평가자가 D2.1의 “메타데이터가 없으면” 조건이 원본과 다름을 발견했다. `src/components/criteria-groups.mjs:49`의 resolveSourceIds는 metadata 존재가 아니라 **해석된 destinations.size===0**일 때 문자열 ID→고유 파일명 fallback을 수행한다. `:72`의 hasSourceMetadata는 암묵적 human-/revision-/text 자연어 fallback에만 사용된다. 이를 D2.1에 정확한 순서와 unknown ID 예제로 정정하고 CRITERIA-TREE.sourceResolutionEdgeCases에 7개 독립 입력/기대값을 추가했다. 기존 질문/사례 수는 유지되며 하위 사례는 NOT_RUN이다. source helper 원문 대조만 수행했으며 fixture를 실행한 것으로 기록하지 않는다.

## 실제 정적 확인

- JSON parser로 UI registry/fixtures를 로드하고 질문 ID·case ID 중복 없음을 확인했다.
- UI registry는 **18모듈/119질문**이다(이번 신규 2개 포함). 모든 specFiles 참조가 존재한다.
- UI fixture는 **48사례**, 전부 NOT_RUN이다. 기존 사례를 삭제하지 않았다. OPTIONAL_FUTURE는 TOOLTIP-G13-REBUILD/TABLE-HIGHLIGHT-REBUILD/PDF-PAGE-INTEGER 3개이며, 현재 baseline의 이전 `supersededProductExpectation`은 `optionalFutureAlternative`로 바꿔 정답 대체를 금지했다.
- 소유 UI Markdown에서 REQUIRED_REBUILD/필수 개선/필수 확장이라는 현행 요구 표현을 제거했다. fixture의 `previousContractClass`는 과거 분류 추적용이며 현재 acceptance가 아니다.

## 남은 검증과 한계

알려진 위 충돌/공백은 문서에 보완했지만 이 수정자가 자신의 변경을 독립 승인하지 않는다. root가 전체 population을 새 registry와 동기화하고 freeze한 뒤 source-blind 명확성 및 별도 source 정확성 평가를 받아야 한다. 브라우저의 실제 unmount·focus·늦은 응답·CSS animation·시각 bounds와 provider 연결은 실행되지 않았으며 문서 PASS로 대체할 수 없다. 이 보고서만으로 명확성100/모호성0 또는 UI 전 실행 경로의 정확성100을 선언하지 않는다.

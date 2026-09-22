# UI 분해 지도 — GSPEC 현재 구현

이 문서는 **현재 소스에 근거한 분해·검토 기준**이다. 상세 구현 설계의 완성이나 동작 검증 통과를 주장하지 않는다. `ui-modules.json`의 현재 18개 모듈과 120개 질문은 독립 검토자가 상세 설계 문서만 보고 답할 수 있어야 한다. 초기 108개에 추가 질문을 포함한 수이며, 이후 변경 시 registry 전수 계산값을 따른다. 질문에 답할 근거가 없으면 미정/누락으로 남기며, 임의로 명확성 100점이라고 부르지 않는다.

현재 제품은 React SPA이다. 페이지 URL 라우터가 아니라 `App`의 `page` 상태로 화면을 교체한다. 기록된 사용자 요구 전체를 한 화면에 쌓는 앱이 아니다. **소개 → 기준 입력 → 분석 → 사람 확인 → 검토 파일 입력 → 실시간 검토 → 파일별 결과**를 순차 제공한다.

## 1. 범위와 근거

- 분석 기준일: 2026-09-21. 파일 내용·정적 import graph를 읽은 결과이며 이 문서 작성 과정에서는 서버·실 API·브라우저를 변경하지 않았다.
- 조사 시작점: `src/main.tsx` → `App.tsx`의 정적 및 `lazy(() => import(...))` 경로.
- `src/` UI 자산 전체: **TSX 23개 + CSS 33개 = 56개**.
- 진입점에서 도달: **TSX 22개 + CSS 26개 = 48개**.
- 미도달: **TSX 1개 + CSS 7개 = 8개**. 파일이 존재한다고 현재 화면에서 사용된다고 간주하지 않는다.
- `ReviewItems.tsx`는 파일로는 도달하지만 `StatusIcon`, `statusLabels`, `VerdictBadge`만 사용한다. 예전 `ReviewItems` 목록/보드 렌더 함수는 현재 App에서 호출되지 않는다.
- `server/dashboard-*.mjs`와 `scripts/dashboard-chart-entry.jsx`는 생성 HTML의 UI 동작을 결정하므로 UI-16에 포함했다. 앱 TSX/CSS 56개 집계에는 포함하지 않는다.
- `sourceFiles`는 조사 provenance이다. 재구현 에이전트에게 소스 접근을 요구하지 않는다. 모듈 질문에 답하는 규범 내용은 `specFiles` 문서 안에 있어야 한다.
- 일부 `specFiles`는 전체 설계 패키지의 정해진 목적지다. 링크 존재 여부와 내용 충족 여부는 별도로 확인해야 하며, 이 지도는 해당 상세 설계가 이미 완성됐다는 증거가 아니다.

## 2. 사용자 단계와 내부 페이지

독립 설계·검토에서 아래 STEP ID를 공통 사용한다. App의 사용자 표시 단계 번호는 4개지만 내부 페이지는 7개다.

| STEP ID | 실제 page | 사용자 표시 단계 | 진입 조건/조작 | 다음 정상 목적지 | 핵심 UI |
|---|---|---|---|---|---|
| STEP-00 | intro | 진행 표시 없음 | 최초 진입 / 새 검토 | 시작→STEP-01 file; 경비 예제→STEP-01 text | UI-03, UI-08 preview |
| STEP-01 | criteria-input | 01 기준 입력 | 소개 CTA / 기준 입력으로 | 정리 요청 성공→STEP-02 | UI-04 |
| STEP-02 | criteria-analysis | 02 기준 확인·확정 | 기준 정리 / 기준 피드백 재분석 | awaiting_confirmation→STEP-03 | UI-09/10 또는 UI-06 |
| STEP-03 | criteria-confirm | 02 기준 확인·확정 | 서버 확인 요청/재분석 완료 | 확정→awaiting_documents→STEP-04; 피드백→STEP-02 | UI-05, UI-11 |
| STEP-04 | targets | 03 검토 파일 입력 | 기준 확정 완료 | 대상 검토 요청 성공→STEP-05 | UI-04 + 승인 기준 요약 |
| STEP-05 | review | 04 파일별 결과 | 승인 기준에 대상 파일 연결 | completed/partial→STEP-06 | UI-07/08/09/10 또는 UI-06 |
| STEP-06 | results | 04 파일별 결과 | 실제 검토 완료/부분 완료 | 새 검토→STEP-00 | UI-12~18 |

`awaiting_criteria`는 상태 코드에 남아 있으나 현재 주 흐름은 `criteria_first`다. `useReview.start(..., criteriaFirst=false)`는 legacy API 호환 함수이고 현재 App은 `startCriteria`를 호출한다. 재현하려는 사용자 흐름에 legacy 전체동시입력을 다시 끼워 넣지 않는다.

### 전이·취소·스냅샷 규칙

- App `pending`: connecting, pendingAction 또는 run.status가 running/queued/awaiting_criteria. `locked`는 pending 또는 uploading/sampleLoading.
- `awaiting_confirmation`을 App pending에 넣지 않는다. 사람은 이때 기준을 조작할 수 있다. hook의 `busy` 계산과 App의 `pending` 계산은 서로 다르다.
- 기준 정리 실패는 STEP-01, 피드백 요청 실패는 STEP-03, 대상 검토 요청 실패는 STEP-04로 복귀한다. 요청 epoch가 바뀌었으면 이전 응답으로 이동하지 않는다.
- 작업 중지는 cancel이다. 화면에 pause/resume 버튼은 없다. 취소는 즉시 로컬 cancelled/idle, SSE 닫기, pending 해제, 원격 cancel 요청으로 연결된다. 취소를 일시정지로 설명하지 않는다.
- 분석 중 취소/실패는 해당 분석 화면과 마지막 관측 결과를 남긴다. pending이 끝나면 상단에 ‘기준 입력으로’가 나온다. 자동으로 성공 결과 화면을 열지 않는다.
- `reset`은 epoch 증가, run/SSE/선택/preview/모달/파일/기준/예제 상태를 비우고 intro로 돌아간다. `backToCriteria`는 run을 초기화하되 기준 파일만 남긴다.
- 늦은 POST, 이전 run의 SSE, 더 오래된 snapshot, 항목별 resolve 응답을 gate/sequence/token으로 차단한다.
- 마지막 실제 연출은 backend를 완료 상태로 둔 채 잠깐 표시한다. live+모션 ON에서 판정 패킷이 남으면 1800ms, 핸드오프만 남으면 1600ms, 그 외120ms. 전체 연출 queue가 끝날 때까지 backend 실행을 늘리지 않는다.
- 새로고침 후 run을 복원하는 URL/deep-link/persistent app state는 현재 App에 없다. reload persistence를 현재 기능으로 서술하지 않는다.

## 3. 화면·모듈 계층

```text
UI-01  App shell
├─ UI-02  공통 테마 / 모션 환경
├─ header: GSPEC / 기준부터, 근거까지. / 모션 ON·OFF / 새 검토 / 연결 상태
├─ 4단계 진행 표시 (intro 제외)
├─ global error banner + 역할별 숨김 file input
├─ STEP-00  UI-03 LandingIntro
│  └─ UI-08 ReviewTheater (EXAMPLE)
├─ STEP-01  UI-04 기준 입력
│  ├─ 기준 파일 OR 자연어 (서로 다른 두 옵션)
│  ├─ 업로드/파일 행/샘플 CTA
│  └─ 선택한 파일 원문 UI-11 (선택됐을 때만)
├─ STEP-02  기준 분석
│  ├─ 실시간: UI-09 activity → UI-10 handoff/phase scene
│  └─ 읽은 문서와 구조: UI-06
├─ STEP-03  UI-05 기준 확인
│  ├─ source tabs → category tree → compact criteria rows → 펼친 편집
│  ├─ feedback + history + coverage/exclusion disclosures
│  └─ UI-11 원문/자연어 원문
├─ STEP-04  UI-04 검토 파일 입력
│  ├─ 대상 업로드/파일 행/대상 golden 선택
│  └─ 승인 기준의 파일별 요약 OR UI-11 선택 원문
├─ STEP-05  UI-07 LiveReviewFlow
│  ├─ 실제 milestone / 활성 파일
│  ├─ UI-08 실제 추출/판정 theater
│  ├─ LiveReviewContext: 확정 기준 후보·추출값·구조
│  └─ UI-09 activity → UI-10 handoff/phase scene
│     (다른 탭은 UI-06 구조 지도)
└─ STEP-06  결과
   ├─ 파일별 결과: UI-12
   │  ├─ 원문 UI-11 (파일 전체 판정 유지)
   │  └─ 항목 목록 OR UI-13 즉시 상세 / 적용 기준 탭
   ├─ 전체 요약: UI-14 (Recharts)
   ├─ 분석 범위: UI-06
   ├─ 나만의 대시보드: UI-15 dialog
   │  ├─ 요청 입력 / 4개 제안 / 구성 수정
   │  ├─ 생성중 UI-09 → UI-10
   │  ├─ UI-16 생성 React 차트 HTML (react-chartjs-2)
   │  └─ UI-17 host 원문·판정 → UI-11
   └─ 내보내기: xlsx/csv/json + UI-18 ledger dialog
      ├─ XLSX 대장/성적서/번호 입력
      ├─ 기입 위치 분석중 UI-09 → UI-10
      └─ 기존값·새값·대상셀 확인 → 새 사본 다운로드

UI-04 GoldenPicker dialog는 STEP-01(criteria), STEP-04(target)에서만 진입.
```

상단 결과 CTA는 한 곳에 둔다. App은 ResultsVisuals의 별도 dashboard 버튼을 `showDashboardButton=false`로 숨긴다. 기준 분석/검토 실시간 작업실은 페이지 내부다. Dashboard/Golden/Ledger는 실제 native dialog이고 작업실 popup과 혼동하지 않는다.

## 4. 모듈 책임과 연결

| ID | 경계/책임 | 데이터를 받는 곳 | 사용자에게 내보내는 동작 |
|---|---|---|---|
| UI-01 | 순서·상태·run 연결 | useReview + API/SSE | 페이지 전이, 취소/reset, export |
| UI-02 | 모든 화면의 시각/모션 규칙 | 앱 preference·CSS cascade | 테마/초점/반응형/모션 토글 |
| UI-03 | 첫 인상·명확한 시작점 | 고정 제품 문구 | 기준 입력 또는 경비 예제 |
| UI-04 | 역할별 입력과 샘플 | file/text/catalog | 업로드/삭제/원문/분석 시작 |
| UI-05 | 사람의 기준 승인 | criteria/source/assessment/discovery | draft 직렬화/피드백/확정 |
| UI-06 | 분석 범위 설명 | analysis inventory/quality/activity | 파일·구조·전사·원문 탐색 |
| UI-07 | 실제 검토의 전체 맥락 | run/documents/observed operation | 현재 파일·진척·후보기준 |
| UI-08 | 문서→항목→판정 시각화 | preview fixture 또는 실제 변경 item | 판정 패킷/레인/항목 선택 |
| UI-09 | 실제 작업 관측 | activity snapshot/SSE | elapsed/output/current task/접기 |
| UI-10 | 런타임 사이 인과 전달 | 명시된 parent/handoff/phase | 한 번의 방향성 light pulse |
| UI-11 | 원문/정확한 근거 위치 | doc.preview/url/evidence/highlights | page/sheet/zoom/항목 선택 |
| UI-12 | 결과의 파일 scope | documents/items/criteria | filter/list/detail/적용기준 |
| UI-13 | 판정 근거와 사람 수정 | 선택 item 및 source links | resolve(status,note) |
| UI-14 | 전체 집계/시각 탐색 | 실제 items/documents | filter/tooltip/해당 항목 이동 |
| UI-15 | 대시보드 생성 orchestration | run + frozen snapshot + job.design | natural-language 생성/수정/취소/HTML |
| UI-16 | 계획→독립 HTML | 검증된 design + snapshot | 조합 가능한 실차트/상세 |
| UI-17 | host에서 원본 연결 | 생성 당시 sourceSnapshot | 파일별 원문/근거/선택 |
| UI-18 | 결과를 외부 파일로 | run + ledger mapping/proposal | 표준export/검토 반영 사본 |

초기 acceptance 질문은 각 모듈당 behavior/contract/states/visual-motion/failure/verification 6개였다. 독립 감사와 현재 재현 감사의 추가 질문도 모두 유지하며 현재 전체 모집단은 `ui-modules.json`의 acceptanceQuestions를 전수 계산한다. 예: UI-08-C02는 실제 판정 패킷의 생성 계약, UI-11-C06은 renderer별 highlight 한계, UI-15-C06은 modal 성능, UI-16-C01~06은 범용 디자인 조합을 담당한다. UI-01-C08은 App pane 수명주기·내보내기, UI-04-C08은 삭제 경쟁·같은 파일 재선택을 추가 검토한다.

## 5. UI 상태 행렬

| 영역 | Empty/Idle | Active/Pending | Human/Ready | Failure/Cancelled | 숨김/정리 |
|---|---|---|---|---|---|
| 기준 입력 UI-04 | 파일0/빈text→시작disabled | 업로드 spinner·수정잠금 | 업로드 원문 확인 | error banner; 재입력 가능 | STEP-02에 입력card 사라짐 |
| 기준 분석 UI-09/10 | 실제작업 수신대기 | 실제phase·elapsed·handoff | 마지막 실제전달 | failed→확인필요, cancelled→중단 | 승인화면 이동시 작업실 사라짐 |
| 기준 확인 UI-05 | 선택0→확정금지 | revise→분석화면, 보존된confirm hidden | 파일별편집·피드백·확정 | invalid draft 펼침; 제외/불확실 이유 | 기록/coverage는 disclosure |
| 대상 입력 UI-04 | 대상0→시작disabled | 업로드spinner | 승인기준 version·파일별요약 | 업로드/시작실패 | review 시작시 입력card 사라짐 |
| 실시간 검토 UI-07/08 | 수신전 skeleton/count0 | 실제 추출/분류 packet·side operation | terminal까지현재값 유지 | 일부문서실패/연결불안/취소 표시 | 완료후결과로전이, context기본접힘 |
| 구조 지도 UI-06 | 문서/analysis없음 | phase rail/실제coverage | 맥락·전사·검증내용 | limited/partial/needs_review | busy끝나면logs접힘 |
| 원문 UI-11 | 문서선택안됨 | PDF로딩/render | 페이지/시트/근거 | 원본열기+오류/잘림/위치확인 chip | render취소/worker파괴 |
| 파일결과 UI-12/13 | 판정없음/필터0건 | resolve저장중 | 목록↔즉시상세; 모든원문색상 | 문서error/기준ID미연결 | 목록복귀시scroll/focus복원 |
| 전체요약 UI-14 | 항목0/문서0 | 숫자·차트등장 | 클릭필터/tile→파일상세 | 긴라벨tooltip/빈필터 | exit tile pointer/focus제거 |
| 대시보드 UI-15 | 요청/제안/empty art | queued→generating→building/repairing | ready+적용된구성, 차트↔원문 | failed/emptyHTML/poll오류/취소 | 완료기록접힘; close하면pending취소 |
| 생성 HTML UI-16 | 실제0건 | 수신snapshot으로정적집계 | 필터/파일/상세/디자인14축 | fallback기본구성안내 | graph instance cleanup |
| 원문연결 UI-17 | sourceSnapshot없음→disabled | lazyviewer준비 | 생성당시파일·판정 | 원본없음/근거없음 | chart state를보존한view전환 |
| 대장 UI-18 | ledger/source/key없음 | upload/analyze/export 중잠금 | ready mapping2cells +proposal | blocked/잘못된파일/stale basis | close AbortController, 원본보존 |

‘모션 재생 대기’와 ‘backend 작업 대기’를 구별한다. 작업실의 +N은 이미 수신한 전달의 연출 queue다. 완료된 backend를 계속 실행중으로 보이게 만들기 위한 인위적 진행률·가짜 step·가짜 LLM 내부 생각은 없다.

## 6. 라이브러리·렌더 방식의 정확한 구분

다음 버전은 root package-lock의 실제 설치 기준이다. package.json의 caret 범위만 복사하면 다른 버전이 설치될 수 있다.

| 도구 | 실제 버전 | 현재 사용 |
|---|---|---|
| React / ReactDOM | 19.3.0 / 19.3.0 | 앱과 생성 차트 함수컴포넌트 |
| TypeScript / Vite | 5.9.3 / 7.3.6 | 앱 타입검사·번들·lazy chunk |
| Motion | 12.43.0 | `motion/react` 진입·전환·layout·숫자 |
| lucide-react | 0.468.0 | 선형 SVG 아이콘 |
| Recharts | 3.10.1 | UI-14 전체요약, UI-17 host 원문연결의 소형 Pie |
| react-chartjs-2 | 5.3.1 | UI-16 생성HTML의 Doughnut/Pie/Bar/PolarArea React 컴포넌트 |
| Chart.js | 4.5.1 | 위 React chart의 실제 canvas 엔진 |
| pdfjs-dist | 6.3.289 | 원본 PDF canvas/text 좌표·같은버전 worker와자산 |
| esbuild | 0.28.2 | 독립 대시보드 React/Chart runtime bundle |
| CSS / inline SVG | 브라우저 | 빛·scan·phase diagram·상태색·grid·전달경로 |
| native dialog/EventSource/ResizeObserver | 브라우저 | modal·SSE·원문폭/차트측정 |

‘chart-js2’는 이 프로젝트에서 **react-chartjs-2**를 뜻한다. Chart.js 2.x가 아니다. 메인 요약을 이미 react-chartjs-2로 교체했다고 서술하지 않는다. GSAP/Lottie/Rive/Three.js는 현재 UI 모션의 구현 라이브러리가 아니다.

## 7. 모션은 정보 구조의 일부

- 소개 theater는 의도적으로 반복되는 예시다. 실제 theater는 새로 수신한 nonpending 판정만 최대6개 sampling해서 전달한다. 실제 counts는 sampling되지 않는다.
- source→engine과engine→결과의 빛 경로·chip은 SVG 정규좌표 기준이다. chip은 고정 CSS 크기라 전체무대가 커져도 과도하게 두꺼워지지 않는다.
- 핸드오프는 runtime의 인과관계가 있어야 생성된다. 시간상 가까운 작업 두 개를 임의로 연결하지 않는다. 요청/결과의 방향도 구분한다.
- 큰 작업실과 작은 현재작업 문구 모두 같은 observer 데이터에 연결된다. 긴 install/LLM 대기에는 실제phase/경과시간/새출력대기를 보여준다.
- 손으로 로그를 읽으면 autoscroll은 멈춘다. 완료기록은 접고 최종 결과의 시야를 차지하지 않는다.
- app motion OFF는 localStorage `trace-demo-motion`, `html[data-motion=reduced]`, MotionConfig always-reduced로 연결된다. 기본 tween은280ms, ease[.22,1,.36,1]다.
- **현재 OS reduced-motion 한계**: 전역 JS preference는 app 토글만 읽는다. 일부 CSS와 ResultsVisuals/DashboardEvidence는 OS설정을 따르지만 모든 모션이 OS설정에 따라 사라지는 것은 아니다. 개선을 요구하려면 현재 재현과 구분한 신규 acceptance로 적고 검증해야 한다.
- **현재 disconnect 한계**: SandboxActivityDock/Workroom은 시간·CSS를 freeze하지만 ReviewTheater는 connectionLive prop이 없어 busy ambience가 계속될 수 있다. 모든패널이동시에멈춘다고 주장하지 않는다.
- **현재 cancel 한계**: 취소상태는 새 실행을 멈추지만, 이미수신해재생중인 handoff는 끝날 수 있다. cancel을모든pulse즉시clear로명세하려면별도변경이다.

## 8. 활성 파일 전수 inventory

아래 각 파일은 하나 이상의 UI module에 연결되어 있다. 공통 CSS는 여러 module에 영향을 주므로 UI-02에 주 소유를 둔다. 이 표의 ‘활성’은 import도달 기준이지 CSS 모든selector가 실제 DOM에 사용된다는뜻은아니다.

### TSX 23개

| 파일 | 모듈 | 상태 |
|---|---|---|
| src/main.tsx | UI-01 | 활성 root mount |
| src/App.tsx | UI-01/04/18 | 활성 workflow orchestration |
| src/motion-preference.tsx | UI-02 | 활성 provider/hooks |
| src/components/LandingIntro.tsx | UI-03 | 활성 lazy |
| src/components/UploadVisual.tsx | UI-04 | 활성 |
| src/components/GoldenPicker.tsx | UI-04 | 활성 dialog; all mode는 미호출 |
| src/components/CriteriaConfirmation.tsx | UI-05 | 활성 |
| src/components/DocumentAnalysis.tsx | UI-06 | 활성 |
| src/components/LiveReviewFlow.tsx | UI-07 | 활성 lazy |
| src/components/LiveReviewContext.tsx | UI-07 | 활성 |
| src/components/ReviewTheater.tsx | UI-08 | 활성 landing/live 공유 |
| src/components/SandboxActivityDock.tsx | UI-09 | 활성 |
| src/components/SandboxWorkroomScene.tsx | UI-10 | 활성 lazy |
| src/components/SandboxWorkScene.tsx | UI-10 | 활성 |
| src/components/DocumentPreview.tsx | UI-11 | 활성 공통 viewer |
| src/components/FileReviewResults.tsx | UI-12 | 활성 lazy |
| src/components/ReviewItems.tsx | UI-12/13 | 상태 helper만 활성; ReviewItems 함수 미호출 |
| src/components/ItemInspector.tsx | UI-13 | 활성 compact; noncompact 현재미호출 |
| src/components/ResultsVisuals.tsx | UI-14 | 활성 lazy |
| src/components/DashboardModal.tsx | UI-15 | 활성 lazy+hover/focus preload |
| src/components/DashboardEvidence.tsx | UI-17 | 활성 source탭 lazy |
| src/components/LedgerModal.tsx | UI-18 | 활성 lazy |
| src/components/ExtractedFields.tsx | 없음 | 미도달 legacy 컴포넌트 |

### CSS 33개

| 파일 | 모듈 | 상태 |
|---|---|---|
| src/styles.css | UI-02 | 활성 global; 이전sidebar selector도 혼재 |
| src/cinematic.css | UI-02 | 활성 global |
| src/presentation.css | UI-02 | 활성 global |
| src/motion-system.css | UI-02 | 활성 global |
| src/workflow.css | UI-02 | 활성 global |
| src/workflow-polish.css | UI-02 | 활성 global |
| src/workspace-colors.css | UI-02 | 활성 차콜토큰/화면override |
| src/components/charcoal-surfaces.css | UI-02 | 활성 표/결과/분석/viewer overrides |
| src/components/charcoal-dialogs.css | UI-02 | 활성 modal overrides |
| src/components/charcoal-workroom.css | UI-02 | 활성 activity/workroom overrides |
| src/components/landing-intro.css | UI-03 | 활성 |
| src/components/golden-picker.css | UI-04 | 활성 |
| src/components/criteria-confirmation.css | UI-05 | 활성 |
| src/components/document-analysis.css | UI-06 | 활성 |
| src/components/live-review-flow.css | UI-07 | 활성 flow/context |
| src/components/review-theater.css | UI-08 | 활성; 후반 charcoal overrides |
| src/components/sandbox-activity-dock.css | UI-09 | 활성 |
| src/components/workroom-current-operation.css | UI-09 | 활성 |
| src/components/sandbox-workroom-scene.css | UI-10 | 활성 |
| src/components/sandbox-work-scene.css | UI-10 | 활성 |
| src/components/document-preview.css | UI-11 | 활성 |
| src/components/file-review-results.css | UI-12/13 | 활성; 집중상세 후반override |
| src/components/results-visuals.css | UI-14 | 활성 |
| src/components/dashboard-modal.css | UI-15 | 활성 |
| src/components/dashboard-evidence.css | UI-17 | 활성 |
| src/components/ledger-modal.css | UI-18 | 활성 |
| src/components/dashboard-sky.css | 없음 | 미도달 이전 밝은테마 |
| src/components/dialogs-sky.css | 없음 | 미도달 이전 밝은테마 |
| src/components/document-analysis-sky.css | 없음 | 미도달 이전 밝은테마 |
| src/components/review-sky.css | 없음 | 미도달 이전 밝은테마 |
| src/components/theater-sky.css | 없음 | 미도달 이전 밝은테마 |
| src/components/workroom-sky.css | 없음 | 미도달 이전 밝은테마 |
| src/components/extracted-fields.css | 없음 | ExtractedFields에서만 참조; 앱미도달 |

main의 전역 CSS 순서는 아래대로다. 나중에 있는 규칙의 우선순위와 selector specificity까지 함께 해석해야 현재 모양이 나온다.

```text
styles → cinematic → presentation → motion-system → workflow
→ workflow-polish → workspace-colors
→ charcoal-surfaces → charcoal-dialogs → charcoal-workroom
```

active 컴포넌트는 자신의 CSS를 직접 import한다. 저장소의 모든 CSS를 glob으로 불러오면 sky theme가 재활성화되어 현재 제품과 달라질 수 있다. 재구현은 cascade의 결과를 의미있는 설계 토큰으로 재현해도 되며, 과거 덮어쓰기 파일을 모두 그대로 복사해야 한다는 뜻은 아니다.

## 9. 검토자에게 남기는 명시적 확인 과제

이 목록은 버그수정 지시가 아니라 **현재사실·설계완성·향후보장**을 혼동하지 않기 위한 경계다.

1. 일부 UI CSS는 이전 sidebar/board 레이아웃 selector를 포함한다. import활성만으로이전레이아웃도현재사용한다고판정하지않는다.
2. 서류 preview는 전체내용분석과다르다. XLSX는 HTML table이며 병합/Excel스타일을완전렌더하지않고, DOCX는text preview, image는현재bbox하이라이트없다.
3. 현재원문에없는missing 항목을 PDF header/제목/시료명 위치에색칠하지않는다. chip의‘항목누락’은실제원문좌표가있다는뜻이아니다.
4. criteria 보강highlight는정확한같은행인용과항목열header로확인되는경우에만item label셀을추가한다. 원래서버근거나판정을고치지않는다.
5. 주 app의기본theme는dark다. 생성대시보드의light/dark요청은별도UI-16 디자인축이다.
6. 생성대시보드‘자유로운커스터마이징’은14개명시축의조합이다. 임의새차트·실시간데이터·없는추세·임의React코드를무제한지원한다는뜻이아니다.
7. 독립HTML다운로드는차트와검토근거를담는다. host원본뷰어/원본파일/메시지bridge는포함하지않는다.
8. native dialog로열리는Golden/Dashboard/Ledger는실제기능이다. 사용자가거슬려했던분석팝업을없앴다는요구를‘모든dialog금지’로확장하지않는다.
9. “전단계스크롤없음”은desktop의주흐름배치를목표로한다. 긴문서/긴목록은내부스크롤,모바일은세로stack이다. 모든화면크기·무한항목을스크롤없이보인다고주장하지않는다.
10. 전역OS reduced-motion, theater disconnect freeze, cancel pulse즉시clear는현재제한이다. 미래설계가이를개선하려면기준구현의관찰값과신규acceptance를분리한다.
11. 검토대장 UI는현재‘성적서번호·판정·비고’열의2개쓰기셀을확인하는기능이다. 모든종류의대장을임의writeback하는편집기가아니다.
12. 초기 108개와 이후 추가한 모든 질문은 검증 청사진이다. 특정 질문에 답할 명세·fixture·예상값이 없으면 독립 평가에서 미해결로 남긴다. 현재 질문 수는 registry를 계산하며 초기 분모로 되돌리지 않는다. 실제 browser/API 검증을 실행한 것처럼 통과율을 작성하지 않는다.

## 10. 독립 평가 방법

1. 검토자는 원본소스를열지않고 `ui-modules.json`의질문과 `specFiles`의설계만읽는다.
2. 현재 평가는 [독립 감사 프로토콜](../reviews/independent-audit/PROTOCOL.md)의 PASS / FAIL / UNVERIFIED를 사용한다. 질문을 미검토 상태로 남기거나 적용 제외를 이유로 분모에서 빼지 않는다. 과거 초안의 GAP/CONTRADICTION은 현재 FAIL의 사유이며 NOT-APPLICABLE은 현재 평가 상태가 아니다.
3. PASS에는 설계 문서의 section·필수 숫자·fixture·기대값을 인용한다. 구현자가 추측해야 하는 값이나 문서 모순이 남으면 FAIL, 근거를 확인하지 못했거나 평가가 완료되지 않았으면 UNVERIFIED다. 둘 다 PASS로 세지 않는다.
4. FAIL/UNVERIFIED 피드백은 `UI-xx-Cxx`, 누락·모순·확인 불가 조건, 영향을 받는 step, 필요한 예시 입력/출력으로 보낸다.
5. 작성자는상세spec을수정한다. 질문자체를느슨하게바꿔점수를올리지않는다.
6. 재검토시같은질문과회귀관련질문을다시확인한다. 서로모순되는명세가없는지교차확인한다.
7. CURRENT_REPRODUCTION은 현재 관찰값을 필수 정답으로 삼는다. OPTIONAL_FUTURE 개선의 범위·입력·예상값도 검토하지만 해당 구현을 현재 재현 성공 조건에 섞지 않는다. 문서 충족률과 실제 구현/브라우저/LLM 검증률은 별도로 집계한다. 현재 모집단의 모든 명세 질문을 채워도 ‘모든 미지 문서100%정확’ 또는 ‘픽셀 완전 동일’의 증명이 아니다.


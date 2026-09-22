# 독립 UI·모션·차트 정확성 감사 — round 01

실제 평가자: `/root/ui_accuracy` (collaboration canonical agent ID). 설계 동결 상태에서 원본 대비 정확성을 독립 평가했다.

기존 질문 122/123 PASS, 1 FAIL. 신규 8개는 모두 FAIL이며 모집단에 추가했다. 확장 정확성 **122/131 (93.13%)**. 미해결 이슈 **8개**.

PASS는 설계 계약의 정확성이다. 브라우저·서버·provider·새 재구현 앱 실행은 모두 NOT_RUN이며 문서의 실행 계획이나 기존 합성 screenshot을 새 실행 통과로 계산하지 않았다. 이미 명시된 원본 한계와 REQUIRED_REBUILD 개선 요구는 서로 구분했다.

## 독립 증거

- 활성 CSS와 컴포넌트 카탈로그를 원본에서 cache로 재추출하고 생성시각/파생해시 외 semantic JSON 완전 일치 확인. CSS 5942 rules, 17366 declarations; 전체 수치는 JSON checks에 보존.
- root lockfile와 환경 문서 package version 전부 일치. React/Motion/Recharts와 react-chartjs-2/Chart.js 역할을 별도 확인.
- source 함수만 AST 추출한 probe에서 숫자 formatter 차이, 보호 토큰, 서로 다른 context parent-child가 동일 그룹으로 묶이는 반례 확인.
- 모든 src 파일 포함 108개 source inventory, 131개 입력의 SHA256과 readMode를 JSON에 기록. 테스트명/타입 interface 목록화는 실행 통과가 아니다.
- .env 미접근, 앱·서버·브라우저 미조작, 제품/설계 본문 무수정.

## 지적 사항과 수정 제안

### UIA-001 (medium) — UI-02-C07

공통 값 포맷 두 함수의 비동등 경계가 설계에서 누락되었다.

수정: formatter 두 개를 별도 표/정규식/예시로 명세하고 null,empty,+1234,001234,공백,16자리,13소수 fixtures를 추가한다. Number 계산/원문 보존과 화면표시를 혼동하지 않는다.

근거 파일: `src/format.ts`, `src/components/CriteriaConfirmation.tsx`, `architecture/ui/interaction-contract.md`

### UIA-002 (medium) — UI-02-C08

활동 표기 formatter의 변환 대상·보호 기술토큰 경계가 없다.

수정: 정확한 regex 또는 동일 결과를 보장하는 단계 알고리즘,사용호출부와 금지 필드,대소문자/URL/코드/path/filename/env-key 양성·음성 예시를 제공한다.

근거 파일: `src/display-names.ts`, `architecture/specs/04-ui-motion.md`

### UIA-003 (low) — UI-04-C07

두 file-size formatter의1MiB 임계값 차이와 반올림이 누락되었다.

수정: App >1MiB/ledger >=1MiB,KB max1·round/MB fixed1을 각각 명시하고0/1023/1048576/1048577bytes의 기대값을 준다.

근거 파일: `src/App.tsx`, `src/components/LedgerModal.tsx`, `architecture/ui/detail-controls.md`

### UIA-004 (medium) — UI-07-C07

실패·취소·idle의 live announcement가 실제로 진행 중으로 남는 한계가 누락되었다.

수정: done식과 aria-live 텍스트 분기표를 observed baseline으로 기록한다. 개선을 원하면 failed/cancelled/idle 문구와 실제 count 유지에 대한 REQUIRED_REBUILD를 별도 표시하며 현재 소스가 이미 개선됐다고 쓰지 않는다.

근거 파일: `src/components/LiveReviewFlow.tsx`, `architecture/ui/interaction-contract.md`

### UIA-005 (medium) — UI-11-C07

raw quote <mark>는 status matcher와 다른 느슨한 경계/상한을 갖지만 세부 계약이 없다.

수정: fallback 적용 조건과 indexOf·30회·nonoverlap·merge 규칙을 명시하고 5 in15 및31회 반복 fixture를 추가한다. raw mark는 판정 witness가 아님을 분명히 하고 I9.1 개선 범위를 구분한다.

근거 파일: `src/components/DocumentPreview.tsx`, `architecture/ui/detail-controls.md`

### UIA-006 (medium) — UI-09-C07

모바일 작업실의 group선택/flow-log탭 상태전이가 본문에 빠져 있다.

수정: container1050/680 조건,초기flow,scope reset dependencies,탭 버튼/aria-selected/data-pane/숨는 panel과 group select handler의 selection reset을 명시한다. 1051/1050/681/680px container 사례를 제공한다.

근거 파일: `src/components/SandboxActivityDock.tsx`, `src/components/sandbox-activity-dock.css`, `architecture/ui/interaction-contract.md`

### UIA-007 (medium) — UI-09-C01, UI-09-C08

I4 parent grouping에 존재하지 않는 document/context guard를 사실로 명시한다.

수정: I4의 잘못된 문장을 제거하고 own document→dashboard→parent순환guard→task fallback을 정확히 기술한다. 사전scope 필터 및 actualTransfers의 양측scope 검사를 별도로 설명하고 same-run/context-mismatch parent-child 반례를 추가한다.

근거 파일: `src/components/SandboxActivityDock.tsx`, `architecture/ui/interaction-contract.md`

### UIA-008 (medium) — UI-01-C07

health 요청의 초기화·실패·재시도/cleanup 부재가 header boolean 계약 밖에 누락되었다.

수정: mount GET lifecycle과 실패null/header 연결확인중/dashboard disabled,reset 비재조회·StrictMode 개발 재실행을 명시한다. retry/abort를 개선한다면 baseline과 REQUIRED_REBUILD를 나누고 거짓 현재 기능을 추가하지 않는다.

근거 파일: `src/App.tsx`, `src/api.ts`, `src/main.tsx`, `architecture/specs/04-ui-motion.md`

## 신규 질문

- **UI-02-C07 — FAIL**: 공통 formatValue와 기준 편집 numberLabel의 서로 다른 정규식·trim·null·15자리·12소수·선행0·부호·과학표기 표시 규칙이 자족적으로 정의되는가?
  문서는 formatValue 호출명을 언급할 뿐 구현 계약이 없다. formatValue는 null/undefined→확인 불가, String후 무trim /^-?\d{1,15}(\.\d+)?$/만 Number/ko-KR/maxFraction12. numberLabel은 trim하고 +/-·무제한자리·선행0·모든소수를 문자열로 보존한다.

- **UI-02-C08 — FAIL**: 짧은 활동 title/phase의 Gemini→LLM·E2B→샌드박스 변환과 코드/URL/path/filename/config token 보호, 원문·로그·오류body 무변환 경계가 명시되는가?
  브랜드 표기는 곳곳에 있지만 formatter의 보호토큰/단어경계/대소문자 처리가 없다. 소스 주석이 금지한 원문·명령·로그/에러-body까지 무차별 치환하는 재구현을 막을 수 없다.

- **UI-04-C07 — FAIL**: 업로드와 대장 파일 크기의 KB 반올림·최소1KB·MB1소수 및 정확히1MiB에서 서로 다른 > / >= 분기를 정의하는가?
  파일크기 표시 존재만 지정했다. App은 >1048576일 때 MB여서 정확히1MiB=1024 KB, Ledger는 >=여서1.0 MB. 둘 다 작은값 max1KB·반올림이다. 현재 차이를 임의 통일하면 재현 차이다.

- **UI-07-C07 — FAIL**: LiveReviewFlow의 aria-live 문구가 completed/partial 외 failed/cancelled/idle에서도 검토 진행 중으로 남는 observed baseline과 개선 요구를 명확히 구분하는가?
  done은 !busy&&completed/partial뿐이므로 busy=false의 failed/cancelled/null에서도 진행 중이라고 알린다. 문서는 context의 idle 문구는 적지만 이 screen-reader 상태 분기/한계는 누락한다. 현재 정상 안내인 것처럼 해석하면 안 된다.

- **UI-11-C07 — FAIL**: 판정색 highlight와 별개 raw <mark> fallback의 호출 조건·case/whitespace·숫자경계 부재·quote당30개 비중첩 검색·범위병합이 정의되는가?
  단순 <mark>의 존재만 적혀 있다. raw indexOf는 numeric-boundary와 공백정규화가 없고 quote당30 nonoverlap,전체 sort 후 overlap/touch 병합이다. 판정색 matcher나 TABLE-HIGHLIGHT-REBUILD의 witness로 재사용하면 안 된다는 세부 구분이 부족하다.

- **UI-09-C07 — FAIL**: 작업실의 container≤1050px group select 및 ≤680px 처리흐름/실행내역 탭, flow초기값·scope reset·aria-selected·data-pane에 따른 내용 가시성이 정의되는가?
  CSS/JSX 카탈로그에는 class와 조건만 있고 event handler와 state 초기화 계약이 없다. runId/contextId/startedAfter/defaultExpanded 변화시 flow로 reset; flow는 detail/log-empty 숨김,log는 exchanges 숨김. viewport media와 container query를 구분해야 한다.

- **UI-09-C08 — FAIL**: groupTasks parent identity 상속은 별도 document/run/context 호환 guard 없이 순환만 막고, actualTransfers의 양측 scope guard와 다르다는 현재 동작을 정의하는가?
  I4는 parent 연결에 양쪽 document/context 일치검사가 있다고 잘못 쓴다. 실제 parent에 도달하는 child는 own document/dashboard identity가 없으며 contextB child도 contextA/documentD parent 그룹을 상속한다. 전처리 scope filter 및 전달 허용함수와 혼동했다.

- **UI-01-C07 — FAIL**: health 최초 호출 effect의 시점·실패 null·header/dashboard gate·재시도/timeout/abort/cleanup 부재·reset 비갱신·개발 StrictMode 재실행 가능성을 정의하는가?
  header의 boolean 의미만 명세되어 있고 호출 lifecycle은 없다. mount effect [] plain GET이며 실패는 null,재시도/timeout/abort/unmount guard가 없고 reset도 재조회하지 않는다. 성공 둘 다 true에만 connected,대시보드는 e2bConfigured 필수이다. (제안 /root/clarity → 전달 /root → 원본 검증 /root/ui_accuracy)

## 기존 질문별 판정

### UI-01 앱 셸·단계 전이·검토 상태 연결

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-01-C01 | PASS | 7 page와 pageStep 4단계, awaiting_confirmation/awaiting_documents/completed·partial 목적지가 App과 일치한다. |
| UI-01-C02 | PASS | run ID/epoch/sequence/expectedCriterionVersion과 useReview stale gate를 구분하고 sample-load 등 보호되지 않는 현재 경로를 I1에 따로 기록했다. |
| UI-01-C03 | PASS | pending/locked 식, 중지와 reset의 다른 소유 상태, 취소 뒤 resume 부재를 명시한다. reset이 모든 App state를 비운다는 잘못된 주장이 없다. |
| UI-01-C04 | PASS | live page·ON·목적지 조건과 1800/1600/120ms 분기, 의존성 변화 시 타이머가 다시 시작한다는 실제 한계를 일치시켰다. |
| UI-01-C05 | PASS | stream recovery snapshot/terminal close/실패 안내와 start 실패 원래 page 복귀를 명령 결과와 구분한다. |
| UI-01-C06 | PASS | §9의 page·취소·partial·stale 응답 시나리오와 DOM/상태 oracle이 있다. 이는 설계 검사 PASS이며 새 브라우저 실행 PASS가 아니다. |

소스: `src/App.tsx App/pageStep/reset/navigation effect`, `src/useReview.ts request gate/sequence/recovery`, `src/review-state.ts`

계약: `architecture/specs/04-ui-motion.md §3/5.4/9`, `architecture/ui/interaction-contract.md I1`, `architecture/specs/01-state-api.md`

### UI-02 공통 시각 토큰·반응형·모션 환경

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-02-C01 | PASS | 최종 charcoal cascade와 theater/summary의 서로 다른 fail/review 색을 보존한다. 독립 CSS 재추출 결과 semantic JSON이 일치한다. |
| UI-02-C02 | PASS | main 10 import와 eager/dynamic graph, 로컬 font 자산/원본 원격 font 차이, React/Motion/Recharts/react-chartjs-2/Chart.js lock 버전이 명시된다. |
| UI-02-C03 | PASS | off만 OFF, storage 실패 기본ON, html data-motion full/reduced, MotionConfig never/always 및 저장값 on/off가 소스와 일치한다. |
| UI-02-C04 | PASS | 기본 tween .28/[.22,1,.36,1]과 개별 Motion override, CSS pseudo/focus/disabled, app와 OS reduced 범위 차이를 보존한다. |
| UI-02-C05 | PASS | media/container query·짧은 화면·내부 scroll과 제외된7 CSS를 활성 cascade와 구분한다. JSX/CSS 재추출에 차이가 없다. |
| UI-02-C06 | PASS | §8/9/10에 contrast/focus/OFF/OS gap·viewport·zoom 검증 oracle이 있다. 현재 전체 OS OFF 보장을 허위로 부여하지 않는다. |

소스: `src/main.tsx CSS imports`, `src/motion-preference.tsx MotionPreferenceProvider`, `package-lock.json`, `src/styles.css`, `src/workspace-colors.css`

계약: `architecture/ui/VISUAL-CONTRACT.md`, `architecture/specs/04-ui-motion.md §1/2/8/10`, `architecture/environment/versions.json`, `architecture/ui/style-catalog.json`, `architecture/ui/component-style-map.json`

### UI-03 소개 페이지·일관된 체험 진입

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-03-C01 | PASS | start와 sample CTA의 목적지 및 소개 copy가 LandingIntro/App과 일치한다. |
| UI-03-C02 | PASS | EXAMPLE 문서/경비3개를 live documents/items와 분리하며 example packet 반복을 실제 run으로 세지 않는다. |
| UI-03-C03 | PASS | sampleLoading 잠금·spinner·실패 banner·sampleTargets 임시 보관 후 확인 단계에서만 target 반영이 일치한다. |
| UI-03-C04 | PASS | hero700ms/CTA120ms/badge220ms+45ms/theater200ms와 reduced 분기를 inline Motion map과 문서 양쪽에서 확인했다. |
| UI-03-C05 | PASS | intro 조건부 mount·샘플 실패 후 기존 입력 상태 보존·재시도 가능을 명시한다. |
| UI-03-C06 | PASS | GSPEC/지원 형식/자연어/동일 경비 예시를 §9 intro fixture와 catalogue text에서 검사할 수 있다. |

소스: `src/components/LandingIntro.tsx`, `src/App.tsx loadSample`, `src/components/ReviewTheater.tsx exampleDocuments/exampleItems`

계약: `architecture/specs/04-ui-motion.md §2.3/3/5.3`, `architecture/ui/interaction-contract.md I1`

### UI-04 기준·대상 입력·샘플 선택

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-04-C01 | PASS | file/text와 target awaiting_documents gate, approvedGroups 오른쪽 요약이 App 조건과 일치한다. |
| UI-04-C02 | PASS | accept 확장자,20MB 안내,12000자,role별 POST/DELETE,목록 preview가 명시된다. 별도 추가 질문은 sizeLabel 경계 세부값 누락만 다룬다. |
| UI-04-C03 | PASS | drag/drop·업로드잠금·파일삭제·viewer·모드변경·sampleTargets 상태를 I1에서 분리하며 늦은 delete/sample 한계를 적었다. |
| UI-04-C04 | PASS | UploadVisual SVG 및 row y6/stage y12, 반응형 cascade가 CSS/component 재추출과 일치한다. |
| UI-04-C05 | PASS | GoldenPicker load/catalog 오류, loading close 금지,P10 notice,target0 disable가 D5와 일치한다. |
| UI-04-C06 | PASS | criteria/target dialog 및 file/text 전송 배타성 입력/기대값이 D5/D6/§9에 있다. 실행 여부는 NOT_RUN이다. |

소스: `src/App.tsx upload/removeDocument/loadGolden/input branch`, `src/components/GoldenPicker.tsx`, `src/components/UploadVisual.tsx`

계약: `architecture/ui/interaction-contract.md I1`, `architecture/ui/detail-controls.md D5`, `architecture/specs/04-ui-motion.md §3/9`

### UI-05 기준 확인·계층 편집·사람 피드백

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-05-C01 | PASS | 문서 provenance→명시 categoryPath→sampleName 계층과 일반 기준 fallback,unknown/중복 filename 처리가 source helper와 일치한다. |
| UI-05-C02 | PASS | 편집 모드/operator/range/unit/condition 및 final/revision 직렬화의 comparator 제거/보존 규칙이 명시된다. |
| UI-05-C03 | PASS | 문서·항목 선택/제외/assessment/feedback/hidden confirmation 수명과 서버 revision 기반 draft 초기화를 구분한다. |
| UI-05-C04 | PASS | 조밀한 행·펼침 editor·오른쪽 전체 sourceHighlights 및 선택동기화가 컴포넌트/CSS와 일치한다. |
| UI-05-C05 | PASS | 불완전 수치/역전/빈문자/조건초과를 행 표시하고 revision 실패를 로컬 success로 바꾸지 않는 제약 및 알려진 cap bypass를 기록한다. |
| UI-05-C06 | PASS | 동명 출처/다중sheet/유형없음/제외/revision fixture와 계층·개수·위치 판정 근거가 D2/D6 및 helpers tests에 있다. |

소스: `src/components/CriteriaConfirmation.tsx`, `src/components/criteria-draft.mjs`, `src/components/criteria-groups.mjs`, `src/components/criterion-preview-evidence.mjs`

계약: `architecture/ui/detail-controls.md D2/D6`, `architecture/ui/interaction-contract.md I9.1`, `architecture/specs/07-data-algorithms-concurrency.md`

### UI-06 문서 이해·구조 지도·분석 범위

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-06-C01 | PASS | 파일탭/region map/구조·맥락/quality/전사·원문/접힌 기록을 서로 독립적인 표시 상태로 정의한다. |
| UI-06-C02 | PASS | readerComplete/contextComplete/coverage.complete,preview.truncated와 실제 coverage를 분리한다. arc의 두 번째 complete가 contextComplete라는 원본 특이점도 기록한다. |
| UI-06-C03 | PASS | running/ready/partial/failed와 limited/needs_review/attempt/maxAttempts/no-data를 D3와 I7에서 재현할 수 있다. |
| UI-06-C04 | PASS | phase550ms/region520ms+최대5×75ms/drawer400ms 및 실제 active 조건이 Motion catalogue와 일치한다. |
| UI-06-C05 | PASS | strict <28px follow·수동 scroll 보존·완료 로그접기·전사/미확인 안내를 I7에서 정확히 구분한다. |
| UI-06-C06 | PASS | hidden sheets/회전PDF/header·region/coverage의 관측 데이터와 이동 기대값이 D3/D6/§9에 있다. |

소스: `src/components/DocumentAnalysis.tsx`, `src/components/document-analysis.css`

계약: `architecture/ui/detail-controls.md D3/D6`, `architecture/ui/interaction-contract.md I7`

### UI-07 실시간 검토 무대·현재 비교 맥락

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-07-C01 | PASS | 3 milestone count와 theater/context/workroom 계층 및 실제 documents/items 데이터 경계가 LiveReviewFlow와 일치한다. |
| UI-07-C02 | PASS | operation→최근 processing event→처리중 file→analysisActivity→첫target 우선순위와 approvedCriteria 우선이 I2와 일치한다. |
| UI-07-C03 | PASS | 실제 fields 또는 analysis structure, busy 강제펼침/idle 자동접힘과 두 개씩 modulo 탐색·파일변경 미초기화를 명시한다. |
| UI-07-C04 | PASS | 240/160ms, busy&&observing bridge/status 2.2/2.6s를 컴포넌트와 CSS에서 확인했다. |
| UI-07-C05 | PASS | 끊김 context의 마지막 수신 안내와 theater에 connection prop이 없어 배경모션이 남는 한계를 명시한다. |
| UI-07-C06 | PASS | extract-before-verdict/interleave/burst/quiet 시나리오를 실제 이벤트 기반 fixture로 검증하도록 하며 임의 per-item 진행률을 만들지 않는다. |

소스: `src/components/LiveReviewFlow.tsx`, `src/components/LiveReviewContext.tsx`, `src/components/live-review-flow.css`

계약: `architecture/ui/interaction-contract.md I2`, `architecture/specs/04-ui-motion.md §4.1/9`

### UI-08 문서 자동 검토 theater·판정 패킷

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-08-C01 | PASS | 1120×300 경로·세 레인·수평 fail line과 gradient userSpaceOnUse 좌표가 component catalogue에 동일하게 보존된다. |
| UI-08-C02 | PASS | example/live 분리,document context와 item JSON signature,status pending 제외,field signature를 I3에서 명시한다. |
| UI-08-C03 | PASS | 처음/문서집합변경/자료초기화 baseline과 최종 packet≤6, 전체 실제 counts 및 status별 sampling을 구분한다. |
| UI-08-C04 | PASS | decision1.8s/extract1.3s/75ms delay/120ms expiry 여유/350ms interval과 chip CSS 수치가 소스와 일치한다. |
| UI-08-C05 | PASS | ambience와 arrival 분리, 초기·빠른 작업이 replay 안 될 수 있음,OFF packet 제거 및 mobile layer 숨김이 문서화된다. |
| UI-08-C06 | PASS | lane count/현재latest item 클릭·세색·수신시점 모션을 정적 완료 screenshot과 별도 oracle로 검사한다. |

소스: `src/components/ReviewTheater.tsx useArrivalPackets/FlowingPacket`, `src/components/review-theater.css`

계약: `architecture/ui/interaction-contract.md I3`, `architecture/specs/04-ui-motion.md §5/9`

### UI-09 샌드박스 활동 관측·현재 작업·실행 로그

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-09-C01 | FAIL | observer와 call-site scope는 정확하지만 I4가 groupTasks parent 상속에 document/context 일치 검사가 있다고 잘못 명시한다. 실제 parent 상속에는 해당 guard가 없으며 순수 source probe로 반례를 확인했다(UIA-007). |
| UI-09-C02 | PASS | running&&!waitingForTaskId와 active/queued count, slice(-100)/events(-200)/history omitted 보존이 일치한다. newest-first에서 오래된100이 남는 한계도 기록한다. |
| UI-09-C03 | PASS | scope reset/manual selection/active 시작 펼침/autoCollapse800ms와 presentation·live 조건, freeze/reconnect가 소스와 일치한다. |
| UI-09-C04 | PASS | currentOperation 우선과 phase/title/detail,live active1초 clock,nonheartbeat 마지막출력3초 quiet가 I4와 일치한다. |
| UI-09-C05 | PASS | observer quiet15초/request10초/retry4..60초/dispose 및 frozenAt,TaskDetail strict28px와 최신내용 버튼이 명시된다. |
| UI-09-C06 | PASS | 다중run/context/waiting parent/terminal/quiet/collapse/manual log 관측 fixture가 있다. 다만 신규 parent identity 반례는 추가 질문으로 분리했다. |

소스: `src/components/SandboxActivityDock.tsx groupTasks/readTasks/TaskDetail`, `src/activity-observer.mjs`, `src/activity-scope.mjs`

계약: `architecture/ui/interaction-contract.md I4`, `architecture/specs/04-ui-motion.md §4.2/9`, `architecture/specs/07-data-algorithms-concurrency.md`

### UI-10 LLM↔샌드박스 핸드오프·단계별 작업 장면

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-10-C01 | PASS | 실제 runtime chambers/방향/title/caption·최근3 비로그 단계 이력과 executing/waiting/idle scene을 정의한다. |
| UI-10-C02 | PASS | actualTransfers parent첫nonlog running 또는 명시handoff,런타임/양쪽 present scope 불일치 거부가 정확하다. groupTasks identity와는 별개 함수다. |
| UI-10-C03 | PASS | session Map30/seen512/visited100,live/history baseline,disconnect remaining time,terminal은purge 아님,OFF clear+seen보존을 정확히 적었다. |
| UI-10-C04 | PASS | 1400ms hold/1300ms beam/.28,.18,.44,1/70ms trail 단회 인계와 장면 ambience를 구분한다. |
| UI-10-C05 | PASS | queue8+active1/seen256,시간+sequence정렬/oldest pending overflow/omitted/dedupe와 실제 결과 보존을 명시한다. |
| UI-10-C06 | PASS | document와 dashboard phaseIndex 및 read/reread/transcribe/structure/context/quality/repair/install/build/validate/complete SVG들을 I6/catalogue에서 각각 찾을 수 있다. |

소스: `src/components/SandboxWorkroomScene.tsx actualTransfers/presentation effects`, `src/handoff-queue.mjs`, `src/components/SandboxWorkScene.tsx`, `src/components/sandbox-workroom-scene.css`

계약: `architecture/ui/interaction-contract.md I5/I6`, `architecture/specs/04-ui-motion.md §4.3/9`, `architecture/ui/component-style-map.json`

### UI-11 공통 원문 viewer·근거 하이라이트

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-11-C01 | PASS | PDF→image→sheet table→text→원본 링크,PDF page·zoom/sheet hidden/original link 경계가 D1과 일치한다. |
| UI-11-C02 | PASS | document evidence scope,missing contextual evidence 제외,anchor 증명 및 selected/fail/review/pending/pass 우선순위를 별도 정의한다. |
| UI-11-C03 | PASS | document change reset·유효page/sheet/zoom1..2 step.25/중첩선택·unlocated chip이 source와 일치한다. |
| UI-11-C04 | PASS | DPR cap2/resize min140/render cleanup/internal scroll/ON smooth·OFF 즉시 이동 수치가 있다. |
| UI-11-C05 | PASS | loadingTask/document/renderTask의 destroy/cancel과 generation cleanup,PDF text/image 오류 및 truncated 안내를 구분한다. |
| UI-11-C06 | PASS | PDF witness/missing header 방지,반복값·sheet·quote/item label fixture가 있고 표 baseline permissive와 I9.1 REQUIRED_REBUILD를 명확히 분리한다. |

소스: `src/components/DocumentPreview.tsx`, `src/components/source-highlights.mjs`, `src/components/item-source-highlights.mjs`, `src/components/criterion-preview-evidence.mjs`

계약: `architecture/ui/detail-controls.md D1/D6`, `architecture/ui/interaction-contract.md I9/I9.1`, `architecture/specs/07-data-algorithms-concurrency.md`

### UI-12 파일별 결과·즉시 상세 workspace

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-12-C01 | PASS | 파일선택·집계·원문·items/criteria탭 순서,항목 상세가 목록을 대체하는 현재 DOM 구조를 명시한다. |
| UI-12-C02 | PASS | 정확한 document/criterion ID scope와 filter와 독립된 파일 전체 highlights가 file-review-model 및 component에 일치한다. |
| UI-12-C03 | PASS | 파일 변경 reset,목록 scroll/focus restoration,필터내 이전다음 및 human status 변경시 all 복귀가 I8과 일치한다. |
| UI-12-C04 | PASS | entry200ms/x12/bar350ms/≤780px 상세 우선·workspace scrollTop0이 catalogue 및 I8에 있다. |
| UI-12-C05 | PASS | document error/no results/filter0/no applied criterion/unmapped ID 각각의 empty UI와 original 접근을 분리한다. |
| UI-12-C06 | PASS | A→fail→detail→source→criteria→back의 header/reason 즉시가시성/복원 oracle이 §9/I8에 있으며 실행 증거와 구분한다. |

소스: `src/components/FileReviewResults.tsx`, `src/components/file-review-model.mjs`, `src/components/file-review-results.css`

계약: `architecture/ui/interaction-contract.md I8`, `architecture/specs/04-ui-motion.md §7/9`

### UI-13 판정 근거 inspector·사람의 판정 수정

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-13-C01 | PASS | compact title/status→value/criterion→reason→quote→edit 순서가 ItemInspector와 일치한다. |
| UI-13-C02 | PASS | resolve(itemId,status,note),3status,source location,reviewedByHuman/humanNote를 전달 계약과 연결한다. |
| UI-13-C03 | PASS | item change editor/error/note reset,compact heading preventScroll focus,pending·saving disable가 정확하다. |
| UI-13-C04 | PASS | full220ms/y14,compact initial false와 두 열 layout/긴설명 내부scroll을 visual catalogue가 보존한다. |
| UI-13-C05 | PASS | trim note 필수/max1000/inline 저장실패/cancel의 무요청과 in-flight cancel의 알려진 한계를 I8에서 분리한다. |
| UI-13-C06 | PASS | resolve 이후 live counts/highlight 재계산과 생성 대시보드 frozen snapshot 불변을 D02/D10 및 I8에서 검증한다. |

소스: `src/components/ItemInspector.tsx`, `src/components/ReviewItems.tsx verdict helpers`, `src/useReview.ts resolve`

계약: `architecture/ui/interaction-contract.md I8`, `architecture/specs/04-ui-motion.md §7/9`

### UI-14 전체 요약 차트·항목 탐색

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-14-C01 | PASS | KPI3/distribution/document chart/named tile와 onSelect를 통한 해당 파일+item 상세 진입이 일치한다. |
| UI-14-C02 | PASS | 전체/완료/주의/pending,document order·empty·동명 ID grouping과 zero chart 처리가 일치한다. |
| UI-14-C03 | PASS | legend/status toggles,hover/focus tooltip,hidden tile pointerEvents/tabIndex 제거와 empty branch를 명시한다. |
| UI-14-C04 | PASS | number650/donut850/bar800/tile300+22×min(index,8),hover−2/tap.98 및 app OR OS reduced가 일치한다. |
| UI-14-C05 | PASS | 현재 tooltip 가로 clamp·세로overflow 결함을 I8.1에서 baseline으로 명시하고 tooltip.height 기반 REQUIRED_REBUILD 수식/음성 사례를 제공한다. 현 원본에서 이미 해결됐다는 주장은 아니다. |
| UI-14-C06 | PASS | Recharts(기본)와 react-chartjs-2+Chart.js(standalone)의 책임 및 locked version을 명확히 분리한다. |

소스: `src/components/ResultsVisuals.tsx`, `src/components/results-visuals.css`, `scripts/dashboard-chart-entry.jsx`

계약: `architecture/ui/interaction-contract.md I8/I8.1`, `architecture/specs/04-ui-motion.md §6/9`, `architecture/specs/05-dashboard-exports.md D10b`

### UI-15 나만의 대시보드 생성 dialog·수정·성능

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-15-C01 | PASS | configuration/sample4/fullworkroom/ready/refine/source switch/download UI 분기와 버튼 문구가 D09a에 있다. |
| UI-15-C02 | PASS | POST body와 frozen snapshot,ready sourceItems override,token·knownIds와 module cache5/HMR 정리가 일치한다. |
| UI-15-C03 | PASS | queued/generating/building/repairing/ready/failed,cancel/old preview/retry/applied tag/standard warning을 구분한다. |
| UI-15-C04 | PASS | shell240ms/content260ms,lazy source viewer,memo iframe 및 이미방문한 source switch iframe 보존,app-only motion 범위가 정확하다. |
| UI-15-C05 | PASS | immediateGET→1200ms,연속3실패 종료,AbortController+sequence,late POST DELETE/emptyHTML/closecleanup/1600ms hold가 명시된다. |
| UI-15-C06 | PASS | cold/reopen/switch/refine의 mount/selection/frame와 token 주입 없는 HTML download·blob URL revoke1000ms 검증 oracle이 있다. |

소스: `src/components/DashboardModal.tsx`, `src/components/dashboard-bridge.mjs`, `src/App.tsx loadDashboard/preloadDashboard`

계약: `architecture/specs/05-dashboard-exports.md D03/D07/D09/D09a/D11`

### UI-16 생성 대시보드 React 차트·디자인 조합

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-16-C01 | PASS | 14 presentation axes의 allowlist/default/DOM attrs/CSS/config mapping이 D05/D06과 schema에 일치한다. |
| UI-16-C02 | PASS | 현재 keyword preference heuristic 및 부분수정 baseline과 의미중심 REQUIRED_REBUILD DB-H02/H03를 구분한다. 모델 HTML/JS/수치 공급을 허용하지 않는다. |
| UI-16-C03 | PASS | focus 초기선택/filter·layout4·file/status/detail/empty/single/multi/long/batch100 disclosure를 D05/D07에 명시한다. |
| UI-16-C04 | PASS | light 전체 token/axis/tooltip,cutout78% 대0,chartSize/emphasis와 legend/motion/corner mapping이 실제 renderer와 일치한다. |
| UI-16-C05 | PASS | 없는 trend 발명금지/snapshot값불변,standard fallback은 custom 검증완료가 아님을 job/UI와 함께 명시한다. |
| UI-16-C06 | PASS | 독립 compound request와18개 matrix의 count/type/theme/legend/size/detail/viewport/OS oracle이 있다. matrix status NOT_RUN을 실제 실행 PASS로 올리지 않았다. |

소스: `server/dashboard-plan.mjs`, `server/dashboard-fallback.mjs`, `scripts/dashboard-chart-entry.jsx`, `server/dashboard-plan-validation.mjs`

계약: `architecture/specs/05-dashboard-exports.md D05/D05a/D05b/D06/D11`, `architecture/contracts/dashboard-customization-cases.json`

### UI-17 대시보드 원본·판정 연결 view

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-17-C01 | PASS | file tabs/count/source picker/all highlights/compact item reason·value·rule·quote와 bridge selection 전환 위치가 D10a에 있다. |
| UI-17-C02 | PASS | frozen snapshot files/items,선택source ID 전체 highlight,primary file grouping/pending 별도 count가 helper와 일치한다. |
| UI-17-C03 | PASS | file reset와 item선택 source preference/unknown fallback/동일item selectionVersion이 D10a 상태표에 정확히 있다. |
| UI-17-C04 | PASS | entry320ms/y6,app OR OS reduce,3row grid와 독립source/map/inspector scroll·전체색상유지가 명시된다. |
| UI-17-C05 | PASS | legacy preview sourceSnapshot 부재시disabled/rebuild안내,unknown ID reject/누락 source/근거없음을 추정 없이 처리한다. |
| UI-17-C06 | PASS | 2file 동명항목/cross evidence/filter/same-selection fixture를 file-scope/bridge tests 및 D10a/D11에서 검사할 수 있다. |

소스: `src/components/DashboardEvidence.tsx`, `src/components/dashboard-file-scope.mjs`, `src/components/dashboard-bridge.mjs`

계약: `architecture/specs/05-dashboard-exports.md D10a/D11`, `architecture/ui/detail-controls.md D1`

### UI-18 검토대장 사본·표준 결과 내보내기

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| UI-18-C01 | PASS | export menu xlsx/csv/json과 ledger flow 업로드→source/key→분석→ready 위치확인→새사본이 App/D4와 일치한다. |
| UI-18-C02 | PASS | ready+2cells+fingerprint+basis 4tuple 일치 gate가 LedgerModal canExport와 일치한다. 서버 셀쓰기 검증 자체는 CORE16 담당이다. |
| UI-18-C03 | PASS | operationRef 직렬화/AbortController+sequence,입력변경 invalidation/key자동추출/메모/blocked 상태가 D4와 일치한다. |
| UI-18-C04 | PASS | dialog230ms/.985/y14/분석중dock/현재값 대기입값/모바일 cascade가 catalogue와 D4에 있다. |
| UI-18-C05 | PASS | xlsx/빈file/20MB/one-drop/duplicate mapping/closeabort/emptyexport/error branch와 메시지를 D4에 기록했다. |
| UI-18-C06 | PASS | wrong/duplicate key/source/basis/stale proposal 및 정상2cells/원본bytes불변 사본 검증이 D4/D6에 있다. backend acceptance 실행을 주장하지 않는다. |

소스: `src/components/LedgerModal.tsx`, `src/App.tsx result export menu`, `src/components/ledger-modal.css`

계약: `architecture/ui/detail-controls.md D4/D6`, `architecture/specs/04-ui-motion.md §3/5.3`

### CORE-14 원문 근거 연결과 하이라이트 무결성

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| CORE-14-C01 | PASS | criterion/item source ownership과 PDF label witness/페이지·cell·quote/결과ID 연결을 helper별로 명확히 구분한다. |
| CORE-14-C02 | PASS | file-level all highlights는 filter와 무관하고 source selection에 따라 documentId scope하며 파일변경으로 cross-file 오염을 막는다. |
| CORE-14-C03 | PASS | missing flags/sentinel의 explanatory evidence 제외와 criterion label/rule/unit source-cell 보강을 명시한다. dashboard missing flag projection 한계도 DB-H01로 구분한다. |
| CORE-14-C04 | PASS | 현재 표좌표만 채색할 수 있는 baseline을 숨기지 않고 I9.1의 좌표·quote·row witness·number-boundary REQUIRED_REBUILD 및 반례가 있다. 원본 자체의 안전성 PASS라는 뜻은 아니다. |
| CORE-14-C05 | PASS | sourceWindow/opaque null origin/channel/type/token/knownID 확인,nonce script·trusted action·targetOrigin 및 다운로드 원본bytes 미포함이 source와 일치한다. |

소스: `src/components/source-highlights.mjs`, `src/components/item-source-highlights.mjs`, `src/components/criterion-preview-evidence.mjs`, `src/components/DocumentPreview.tsx`, `src/components/dashboard-bridge.mjs`

계약: `architecture/ui/detail-controls.md D1`, `architecture/ui/interaction-contract.md I9/I9.1`, `architecture/specs/05-dashboard-exports.md D07`

### CORE-17 대시보드 의미 설계·사용자 취향·수정 루프

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| CORE-17-C01 | PASS | deep frozen snapshot과14field presentation plan,ready sourceItems/publicJob,legacy7field parser defaults 및 instruction/baseDesign이 일치한다. |
| CORE-17-C02 | PASS | 14축 combination·부분수정保留와 source heuristic 한계/필수 의미검사 개선을 나누어 명시한다. |
| CORE-17-C03 | PASS | 원본 model loop≤3/sandbox1회설치/diagnostic repair/cleanup과 ready generated/standard/failed/DELETE204를 분리한다. 새semantic budget도 별도 REQUIRED_REBUILD이다. |
| CORE-17-C04 | PASS | 모델이 데이터/코드를 공급할 수 없고 enum/input/baseDesign bounds,CSP/HTML신뢰경계 및 fallback label이 정확하다. |
| CORE-17-C05 | PASS | green/light/large doughnut→pie partial/semantic bright request의 독립 fixture 및 추후 judge/runtime 검증을 NOT_RUN으로 명시한다. |

소스: `server/dashboard.mjs snapshotRun/createDashboardRouter/generateDashboard`, `server/dashboard-plan.mjs`

계약: `architecture/specs/05-dashboard-exports.md D02/D03/D04/D05a/D05b/D11`

### CORE-18 신뢰 대시보드 렌더러·오프라인 차트·검증

| 질문 | 판정 | 개별 근거 요약 |
|---|---|---|
| CORE-18-C01 | PASS | design→dataattrs/CSSvars/Chart config/HTML과 registry root mount/update/unmount 함수,offline IIFE build가 연결되어 있다. |
| CORE-18-C02 | PASS | type/cutout/size/surface/axis/tooltip/legend·file/filter/detail 변경과 real snapshot count/id를 D06/D07 및 matrix에 명시한다. |
| CORE-18-C03 | PASS | focus별 initial file/filter,detail-open 강조 크기회복,OS 또는 design motion OFF와 update/destroy 수명이 정확하다. |
| CORE-18-C04 | PASS | nonce CSP/escaping/no external network/allow-scripts-only iframe와 bridge,exit0에 더해 fixed validator report+exact html bytes 검사를 명시한다. |
| CORE-18-C05 | PASS | 11 DOM checks(input/syntax/csp/offline/kpis/charts/files/findings/filters/details/escaping)와 실제browser geometry/visibility를 분리하며 JSDOM을 browser 증거로 올리지 않는다. |

소스: `server/dashboard-fallback.mjs`, `scripts/dashboard-chart-entry.jsx`, `scripts/build-dashboard-chart-runtime.mjs`, `server/dashboard-chart-runtime.mjs`, `server/dashboard-plan-validation.mjs`, `src/components/dashboard-bridge.mjs`

계약: `architecture/specs/05-dashboard-exports.md D06/D07/D08/D11`, `architecture/contracts/dashboard-customization-cases.json`

## 역방향 source inventory

각 파일의 세부 기능·모듈·계약 연결·입력 SHA256은 ui-accuracy.json에 있다. 연결된 계약이 없는 formatter 두 개와 기존 파일에 숨어 있던 모바일/health/announcement/raw-mark/size/grouping 분기를 신규 질문으로 승격했다. 미사용 CSS와 unmounted legacy component는 활성 시각 계약으로 잘못 포함하지 않았다.

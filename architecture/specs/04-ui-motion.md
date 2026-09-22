# UI·모션 재현 계약

기준은 2026-09-21의 현재 구현이다. 이 문서는 기존 소스가 없는 구현자를 위한 기능·치수·상태·모션 계약이다. 정확한 시각 정본은 [`../ui/VISUAL-CONTRACT.md`](../ui/VISUAL-CONTRACT.md)가 규정하는 `style-catalog.json`의 cascade와 `component-style-map.json`의 inline/SVG 값이다. `ui/tokens.json`은 요약 탐색 자료이며 전체 선언을 대체하지 않는다. 상태·수명주기 정본은 본 문서와 [`../ui/interaction-contract.md`](../ui/interaction-contract.md), 합성 검증 입력은 [`../ui/interaction-fixtures.json`](../ui/interaction-fixtures.json)이다. fixture는 실행 결과가 아니다. `ui/tokens.json`의 수치는 최종 차콜 테마, `ui/library-effects.csv`는 기술 추적표, `ui/motion-catalog.json`은 실제 CSS 애니메이션의 keyframe/selector/조건/시간 데이터다. `ui/detail-controls.md`는 기준 편집·원문·문서 분석·검토대장·예제 선택의 상세 부록이다. 원래 소스 경로는 출처 설명일 뿐 실행 의존성이 아니다.

**재현 범위:** CURRENT_REPRODUCTION에서는 아래 baseline과 합성 참조가 정답이다. tooltip 재설계, 표 원문 추가 검증, image/OCR bbox, OS 모션 전역 합성, 실패·취소 live announcement 개선은 OPTIONAL_FUTURE이며 현재 앱에 추가하지 않는다. 각 반례와 미래 검증안은 삭제하지 않고 분리 보관한다.

## 1. 기술 선택과 실제 의존 버전

UI는 **React + ReactDOM** 함수형 컴포넌트, **TypeScript**, **Vite**다. HTML 정적 페이지나 Python UI가 아니다. 앱은 React StrictMode 아래 MotionPreferenceProvider → App으로 마운트된다. App은 외부 라우터 없이 현재 `page` 상태를 렌더한다. Redux/Zustand/Next.js/Tailwind/GSAP/Lottie/Three.js는 현재 UI의 필수 도구가 아니다. 장식은 이미지 생성물 대신 CSS/inline SVG/lucide-react로 만든다.

|역할|package.json 선언|lockfile 실제|API/책임|
|---|---|---|---|
|React UI|react `^19.2.0`|19.3.0|상태/effect/memo/ref/lazy/Suspense; 모든 화면|
|DOM 렌더|react-dom `^19.2.0`|19.3.0|createRoot; 요약 항목 tooltip의 createPortal|
|타입 검사|typescript `^5.9.3`|5.9.3|ES2022, ESNext, Bundler resolution, strict, noEmit, react-jsx|
|개발/번들|vite `^7.2.2`|7.3.6|ES modules, dynamic chunks, PDF worker URL import|
|React 빌드 플러그인|@vitejs/plugin-react `^5.1.0`|5.2.0|react()|
|React 모션|motion `^12.23.24`|12.43.0|`motion/react`: motion, AnimatePresence, MotionConfig, animate, useMotionValue, useTransform, useReducedMotion|
|아이콘|lucide-react `^0.468.0`|0.468.0|ScanLine, FileText, FileSpreadsheet, Check, X, HelpCircle 등 SVG|
|전체 요약 차트|recharts `3.10.1`|3.10.1|ResponsiveContainer, PieChart/Pie/Cell, BarChart/Bar/XAxis/YAxis/Tooltip|
|Recharts 호환성|react-is `19.3.0`|19.3.0|React 요소 타입 판단 의존성|
|맞춤 대시보드 wrapper|react-chartjs-2 `5.3.1`|5.3.1|검증된 별도 renderer. Chart.js 2.x라는 뜻이 아님|
|맞춤 대시보드 engine|chart.js `4.5.1`|4.5.1|맞춤 그래프/오프라인 HTML runtime. 상세는 대시보드 명세|
|PDF 원문|pdfjs-dist `^6.2.108`|6.3.289|getDocument, worker, render canvas, getTextContent|
|XLSX 서버 파서|exceljs `^4.4.0`|4.4.0|브라우저는 서버 preview JSON을 HTML table로 표시|
|DOCX 서버 파서|mammoth `^1.11.0`|1.12.3|브라우저에는 구조화된 문서 텍스트|
|CSV 서버 파서|csv-parse `^7.0.2`|7.0.2|브라우저 HTML table|

프로젝트 Node 최소는 `>=22.13.0`. Vite/plugin 요구 `^20.19.0 || >=22.12.0`, pdfjs-dist 요구 `>=22.13.0 || >=24`이므로 최소 프로젝트 버전을 지킨다. 선언 범위로 새로 resolve한 버전을 기준 버전이라고 부르지 않는다. 정확한 설치 기준은 패키지의 dependency lock 자료다.

### 1.1 렌더·코드 분할

App에서 DocumentPreview, FileReviewResults, ResultsVisuals, DashboardModal, LedgerModal, LandingIntro, LiveReviewFlow를 `lazy()` 한다. CriteriaConfirmation과 SandboxActivityDock은 eager지만 내부 DocumentPreview/SandboxWorkroomScene은 lazy다. DashboardModal은 결과 화면의 버튼 `pointerenter`/`focus`에서 import만 preload한다. 실제 모달은 `dashboardOpen && run`일 때만 mount한다. 닫힌 모달에서 차트를 계속 렌더하지 않는다. 화면 로딩 fallback은 Loader2 22px + “화면을 준비하고 있습니다”; 최상위 모달 Suspense fallback은 null이다.

React가 layout/transform을 소유하는 요소에 CSS transform transition을 중첩하지 않는다. CSS는 native controls의 색/그림자/상태 변화, SVG 그림, beam을 담당한다. Recharts는 SVG 기반 요약 차트, Chart.js는 맞춤 대시보드 canvas 기반 차트다. 양쪽 역할을 합치거나 Recharts를 미사용 의존성으로 제외하지 않는다.

## 2. 테마·화면 기하

### 2.1 테마와 CSS 우선순위

브랜드 표기는 `GSPEC.`이며 점은 민트다. ScanLine 23px이 들어간 32×32px, radius 9px 코발트 mark. 배경 `#111318`, 패널 `#1b2029`, 상위 패널 `#222936`, 선택 `#243554`, 선 `#343d4d`, 본문 `#eff3ff`, 보조 `#a0abc1`, 행동 `#315fe9`, 액센트 `#3d6dff`, 성공/빛 `#70f3c4`다. 전체 요약/파일 결과는 fail `#ff8f91`, review `#ffd080`; theater는 fail `#ff9189`, review `#f3cb7c`를 쓴다. 같은 의미의 색이 근소하게 다른 것은 관측된 사실이다.

원본의 초기 연두/보라/청록 테마를 최종 테마로 복원하면 안 된다. 원본 global import 순서는 styles → cinematic → presentation → motion-system → workflow → workflow-polish → workspace-colors → charcoal-surfaces → charcoal-dialogs → charcoal-workroom이고, lazy component CSS가 나중에 로드된다. 최종 차콜 override는 `.app-shell.workflow-shell` 같은 높은 specificity로 lazy CSS보다 우선한다. 초기 eager CSS 5개(golden-picker, criteria-confirmation, document-analysis, sandbox-activity-dock, workroom-current-operation)가 main의 10개 import보다 앞선다. dynamic CSS의 구체적 평가 순서는 VISUAL-CONTRACT §3이 정본이다. 단일 stylesheet로 재작성하더라도 전체 카탈로그의 선택자·상태·media·inline·중요도 우선순위와 같은 computed 결과를 입증해야 한다. 미사용 sky CSS 6개(dashboard/dialogs/document-analysis/review/theater/workroom-sky)와 extracted-fields.css는 포함하지 않는다. `motion-catalog.json`은 효과 색인이며 활성 조건·최종 cascade를 단독 결정하지 않는다.

폰트 stack은 `'DM Sans','Noto Sans KR',sans-serif`; font-synthesis none, 기본 weight 400. 원본은 Google Fonts 원격 CSS를 import한다. DM Sans 400/500/600/700, Noto Sans KR 400/450/500/550/600/650/700을 요청한다. 브랜드 29px/700/-1.7px, 일반 control 13px. 영어 세부 지표는 ui-monospace/SFMono-Regular/Consolas. 원격 폰트 부재 시 글꼴이 달라지는 한계는 §10에 명시한다.

### 2.2 데스크톱 뷰포트

viewport 기준 shell `height:100dvh; min-height:600px; overflow:hidden`, 세로 flex. header 고정 flex basis 62px, 좌우 30px. introduction 외에는 header 아래 단계 nav 65px: “01 기준 입력 → 02 기준 확인·확정 → 03 검토 파일 입력 → 04 파일별 결과”. badge 27×27px/radius9, 글자 10px, step label12px/500, 각 connector76px+좌우23px. 완료 badge는 Check14px, 현재 `aria-current=step`. 단계는 정보 표시이며 임의 단계로 이동하는 링크가 아니다.

main 최대 1700px, 가운데 정렬, `flex:1; min-height:0; overflow:hidden`, padding25px 34px 24px, gap12px. 페이지 전체 대신 파일 목록/원문/편집 pane 안에서 스크롤한다. 1366×768과 1440×900의 기본 화면에서는 header, 네 단계, 현재 주 작업과 CTA가 body 스크롤 없이 보여야 한다. 긴 원문/250개 기준을 한 화면에 억지로 축소하지 말고 pane scroll을 사용한다. 600px 미만 높이 및 모바일은 이 무스크롤 계약의 예외다.

기준 입력은 preview 없으면 width min(760px,100%) 중앙 카드. preview 있거나 대상 입력이면 2열 `minmax(390px,.91fr) minmax(0,1.09fr)`, gap24px. input 카드 radius20, body padding22, options padding17/gap12, option padding16px 14px/radius12. 업로드 영역 radius14/min-height238px; 업로드 파일 있으면178px. 버튼은 min-height41px/padding12px17px/12px 글자. 카드 footer padding17px22px. h1 clamp(24px,2.8vw,40px), weight550, letter-spacing -1.7px, line-height1.3. 자연어 textarea15px/line-height1.9/padding20px.

### 2.3 소개

소개에는 단계 nav가 없다. Hero 두 열 `minmax(0,1.2fr) minmax(330px,.85fr)`, gap35px, 아래 theater가 남은 높이를 차지. heading “어떤 문서든, / 당신의 기준으로.”는 clamp(46px,5.1vw,76px), weight720, line-height1.035, letter-spacing -.072em. 설명 13px/1.7. CTA “검토 기준부터 시작하기”, “경비 예제로 체험”는 54px 높이/radius11/padding14px20px. PDF/Word/XLSX/CSV/이미지 badges와 자연어 기준 설명. theater는 radius22, header47px/footer43px, scene min300px, 카드 전체 min310px. `EXAMPLE`, 각 결과 `예시` 표기를 유지한다. 고정 예시 식비 한도30,000원, 점심18,000 적합, 저녁52,000 부적합, 영수증 금액 판독 불가 확인 필요다. 예시는 실제 처리를 주장하지 않는다.

### 2.4 주요 작업 pane

기준 확인은 전체 페이지 내 panel이며 팝업이 아니다. header(제목/선택된 기준 수), 파일 nav, 원문 pane, 기준 tree/table/editor pane, feedback composer, footer의 취소·명시적 확정이 고정된다. 기준 compact row columns는 `18px minmax(84px,1.15fr) minmax(64px,.9fr) minmax(35px,.45fr) minmax(65px,.95fr) 26px 20px`: 포함 checkbox/항목/기준값/단위/조건/원문/편집. 최소34px row, label12px, 숫자14px, 조건·단위10px, line-height21px. 모호한 유형은 경고이며 없는 유형을 강제로 만들지 않는다. 원문과 사람이 편집하는 draft는 나란히 보인다.

검토 live workspace는 `minmax(0,1.85fr) minmax(335px,1fr)`/gap13px: 왼쪽 실제 milestone39px+입력 문맥+theater+파일 상태, 오른쪽 작업실. “작업 크게 보기”로 workroom focus; “검토 흐름과 함께”로 복귀. 기준 분석은 같은 작업실을 주 panel로 쓴다. `읽은 문서와 구조`는 read/understand/quality 상태를 별도로 표시하는 DocumentAnalysis다.

결과는 상단 파일탭(가로 scroll), 파일 overview와 status filter, 원문/상세 2열 `minmax(0,1.58fr) minmax(330px,1fr)`, gap12. 파일탭 min225/max330px, padding13px14px/radius10. 원문/상세 panel radius11. 결과 row나 원문 highlight 클릭 시 우측 목록을 상세로 **대체**하여 즉시 값·기준·판정이유·출처·사람 수정 UI를 보인다. 목록 밑에 상세를 추가해 스크롤해야 보이는 동작은 동등하지 않다. 목록 복귀 시 이전 scrollTop과 선택 항목 focus를 복원한다.

### 2.5 반응형 계약

|조건|변경|
|---|---|
|761px 이상, height≤760px|main top19/bottom17, steps54px, input h1 31px, options/body/footer compact|
|761–1080px|main20px23px, 입력2열 min350px/.95:1.05 gap17; connector40px;margin15px; stage heading22px|
|761px 이상, height≤850px review|milestone33px, theater min220px, header29px, scene157px, footer26px; stations 숨김, lane max62px/track33px/card padding5px7px|
|761–1120px review|주영역+310px workroom; 761–1120px이면서 height≥1100px이면 상하 두 영역|
|width≤780px 결과|평상시 원문/상세 한 열 rows minmax(410px,55dvh) / minmax(420px,65dvh). items 탭에서 상세 선택 시 상세 order:-1, rows minmax(420px,65dvh) / minmax(410px,55dvh), workspace top으로 이동. 파일탭 min215px|
|width≤760px 전체|shell auto height/overflow visible, header height 선언58px이나 flex-basis62px이 유지되며 width≤680px에서는 min-height64px도 적용; padding0 17px; tagline/divider/connection label 숨김; steps 세로 badge+label, connector 숨김; main22px15px; 입력 한 열; body max470px; 세로 스크롤 허용|
|width≤760px 소개|hero 한 열, h1 clamp(37px,10.5vw,56px), CTA43px/10px; theater405px min; 문서·엔진 위, 3결과 가로 아래; 긴 SVG 분기·packet layer·scene stations 숨김|
|width≤760px review|theater350px, workroom430px(확대560px), single-column; 실제 상태/결과 텍스트 보존|
|width≤680px 기준확인|제외/불확실 공지는 접을 수 있음; 모든 파일 제외면 안내는 계속 표시; 기준row33px, compact columns|
|criteria container≤800px|row columns15px minmax(68px,1.05fr) minmax(50px,.9fr) minmax(28px,.45fr) minmax(51px,.9fr)20px17px, gap4px|

## 3. 페이지·상태·사용자 동작

`page = intro | criteria-input | criteria-analysis | criteria-confirm | targets | review | results`.

`pending = connecting || pendingAction || run.status∈{running,queued,awaiting_criteria}`. `locked = pending || uploading || sampleLoading`. terminal 결과 UI는 completed/partial. health 양쪽 geminiConfigured/e2bConfigured true일 때 header “LLM + 샌드박스”, 아니면 “연결 확인 중”. health 값은 비밀 키를 포함하지 않는다.

|화면/trigger|동작·조건|다음 화면/실패|
|---|---|---|
|intro 시작|기준 입력 이동|criteria-input|
|intro/입력의 경비 예제|expenses sample 요청, mode=text, 기준문서만 현재 documents로, 대상 예제는 보관|criteria-input; 오류 banner|
|기준 file/text 전환|locked일 때 disabled; preview 닫기; file/text 데이터는 유지|현재 입력 pane 변경|
|파일 추가|다중 file picker/drag-drop. accepted `.pdf,.docx,.xlsx,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp`; 20MB/파일은 화면 안내이며 App은 받은 File들을 용량 검사 없이 전송한다(서버에서 검증). FormData files 반복+role|file row 추가; 오류 banner|
|기준 자연어|textarea maxLength12000, 공백만이면 CTA disabled|입력 유지|
|file row click/delete|click 원문 aside; delete unlocked일 때 요청 성공 후만 제거, 해당 preview 닫기|실패하면 파일 유지+banner|
|golden 기준/대상|역할별 선택 dialog, 반환 문서 중 해당 role만 append|현재 페이지|
|기준 정리하기|locked 또는 mode에 맞는 입력 없음이면 disabled. epoch 증가, file모드면 criteriaDocs만 저장, text면 documents 비움|criteria-analysis; 시작 실패 criteria-input|
|awaiting_confirmation 수신|pending 끝나면 confirmationRunId 저장|criteria-confirm; 마지막 실제 전달 짧게 표시 가능|
|기준 feedback 재정리|현재 draft와 feedback, 선택 documentId 제출, live tab으로|criteria-analysis; 실패 criteria-confirm|
|기준 명시 확정|편집 validation 및 포함 항목 제출; 사용자 버튼 동작 필수|awaiting_documents→targets|
|대상 업로드|run awaiting_documents일 때만 허용; 기준 확정 수/버전과 승인기준 보임|targets|
|예제 검토 파일 불러오기|보관한 sampleTargets append하고 보관목록 비움(중복방지)|targets|
|이 기준으로 검토하기|target≥1+unlocked; startedAfter 갱신; 선택/preview 해제|review; 시작 실패 targets|
|작업 중지|epoch 증가; hook은 즉시 로컬 run.status=cancelled/stage=idle, pending=false, SSE 닫기. cancel POST의 snapshot은 적용하지 않음|현재 작업 페이지에서 중단 상태. 서버 취소 실패는 별도 오류이며 completed로 바꾸지 않음|
|completed/partial|pending 종료 후 실제 queue의 짧은 여운만 허용|results files tab|
|결과 전체 요약|정확한 run.items 기반 분포, 파일별 bar, 항목 map|항목 click→files 상세|
|분석 범위|run.analyses/analysisActivity; analyses.some(a=>a.quality && a.quality.status!=='verified')이면 amber dot; quality 객체 없는 analysis만 있으면 dot 없음|범위/오류/원문 링크|
|내보내기|XLSX/CSV/JSON download, 검토대장 dialog|run id별 export endpoint|
|나만의 대시보드|terminal+e2bConfigured일 때 버튼 enabled; hover/focus preload|lazy dialog|
|새 검토/브랜드|locked이면 disabled. epoch 증가, review.reset, documents/text/sampleTargets/선택 및 dashboardOpen·ledgerOpen·exportOpen/기본 탭 초기화(I1의 정확한 대입 목록 참조; 모든 App 상태를 비우는 것은 아님)|intro|
|기준 입력으로|review.reset, criteria role 문서만 유지, 선택/preview/작업연출 초기화|criteria-input|

입력 epoch는 느린 비동기 업로드/시작/수정의 응답이 새 검토 상태를 덮지 못하게 하는 generation guard다. 오류 banner는 `role=alert`, 닫기 버튼. 페이지는 URL bookmark/history/persistent session 복원이 아닌 메모리 상태다. 새로고침 복원 기능이 있다고 문서화하지 않는다.

## 4. 진실한 처리 시각화

### 4.1 LiveReviewFlow의 자료와 milestone

문서 읽기 수=대상 documentId 중 analysis.status complete/completed/ready 수. 항목 추출 수=대상 document.extraction.fields 길이 합. 기준 대조·분류 수=전체 run.items 중 status≠pending 수(대상 ID 필터 없음). 임의 percent progress나 예상 결과를 만들지 않는다. active file은 실행중 operation.documentId → processing 문서의 최신 run event → processing 문서 → 최신 analysisActivity 문서 → 첫 대상 순서.

operationActive=busy && operation.status=running && operation.documentId가 대상 ID일 때(연결 상태 조건 없음). phase verify/review→reviewing, extract→extracting, read/files/structure/context/transcribe/reread/quality→analyzing_targets, 그 외 run.stage||analyzing. 기준 배열은 approvedCriteria?.criteria || run.criteria || []; 승인 배열이 빈 배열이면 초안으로 되돌아가지 않는다. 입력 문맥 pane은 실제 fields(있으면) 또는 analysis.structure를 왼쪽, 승인기준 후보를 오른쪽 표시한다. 각 페이지2개, prev/next wrap-around. 기준 후보 표시가 실제 매칭 확정을 뜻하지 않는다. busy이면 펼침, 완료되고 해당 파일 판정이 있으면 기본 접힘, 자료 보기로 재열기. 연결이 끊기면 “마지막으로 확인한 검토 자료”로 바꾸고 working beam을 멈춘다.

### 4.2 activity 관찰과 작업실

서버 `/api/activity` initial GET 뒤 `/api/activity/events`의 `activity` SSE snapshot을 관찰한다. 관찰은 작업을 시작/취소/변경하지 않는다. GET timeout10s, quiet15s; quiet 동안 busy/running/queued가 있을 때만 재연결. 첫 SSE error는 bounded GET으로 즉시 reconciliation 후 새 stream. 15s 안 반복 SSE 오류는4s→8s→…최대60s backoff. 이력만 남은 idle일 때 주기적 HTTP 재조회하지 않는다. online event는 연결/수신시각/in-flight 조건을 검사한다. `trace:activity-refresh`는 조건 없이 reconnect하여 진행 중 요청을 abort하고 교체한다(disposed 제외). dispose는 EventSource listener/stream, request AbortController, retry/quiet timeout 전부 정리하고 generation을 증가시켜 늦은 callback을 무시한다.

task status queued/running/completed/failed/cancelled만 받고 유효 task를 slice(-100), task별 events를 slice(-200)한 뒤 유효 제목을 제한한다. **현재 서버 task snapshot은 최신순이므로 task가 100개를 넘으면 오래된 100개가 남는다.** 이를 최신 100개 보존이라고 재해석하지 않는다. 최신 100개로 개선하려면 명시적 deviation과 별도 시험이 필요하다. 제목180자, detail600자, event detail1500자, attempt/maxAttempts1–10, issueCount0–10000. 파일 grouping은 `document:contextId-or-runId:documentId`; dashboard는 자체 context/dashboard/run; parentTaskId는 parent의 identity 상속; 나머지는 task.id. 문서 분리·실행 맥락 필터는 interaction-contract §I4의 순서를 따른다. 부모 identity 상속은 grouping에만 적용하며 scope 필터에서 누락된 run/context를 보충하지 않는다.

실행은 status=running **그리고 waitingForTaskId 없음 그리고 connection live**일 때만 `is-running`이다. waiting은 “응답 대기”, SSE 비연결은 “상태 확인 중”. 경과시간은 active+live에서만1초 tick; 연결 끊기면 frozenAt 기준 정지. 완료는 updatedAt 사용. executing+live이며 마지막 non-log 또는 stdout/stderr event 이후 3000ms를 초과하면 LLM은 “LLM 응답 기다리는 중”, 그 밖은 “새 출력 기다리는 중”를 표시한다. status heartbeat는 이 시각을 갱신하지 않는다. 로그는 원본 event chronology, stdout/stderr/status 구분, 생략된 history는 “최근 실행 기록”으로 명시한다. 바닥과의 거리<28px에서만 새 로그를 따라가며 ≥28px이면 위치를 보존하고 “최신 내용” 버튼을 표시한다. 버튼은 바닥으로 이동하고 follow를 켠다. 선택 task 변경은 follow=true/outputOnly=false로 재마운트한다.

active가0→양수면 자동 펼침, manual task selection 초기화. 기본 선택=최근 executing→active→마지막 task. 사용자 선택 뒤 자동 선택이 덮지 않음. 완료 자동접힘은 `autoCollapse && !busy && activeCount=0 && !presentationBusy && connectionLive && tasks.length>0`가800ms 유지될 때. 새 활동, 연결 변동, unmount는 타이머 cleanup. autoCollapse 기본값은 false다. 기준 분석·대시보드·대장 호출은 false, 대상 review만 true다. 접힌 뒤에도 기록 펼치기 가능.

### 4.3 샌드박스↔LLM handoff의 자격과 큐

빛은 **명시적인 서버 인계**에만 연결한다. 단지 시간이 가깝거나 양쪽 작업이 실행중이라는 이유로 왕복을 만들지 않는다.

1. source/target task가 존재하고 runtime이 e2b/gemini로 서로 다르다. 양쪽 documentId/runId/contextId가 있으면 각각 같아야 한다.
2. parentTaskId + 수신 task의 첫 non-log running event, 또는 non-log event.handoff `{fromTaskId,toTaskId}`를 인정한다. 수신 task의 parent가 송신 task면 canonical key `parent:${from.id}:${to.id}`로 parent/event를 dedup한다. 부모 관계 없는 explicit event는 `handoff:${event.id}`이며 endpoints 변경만으로 새 key가 되지 않는다.
3. e2b→gemini는 forward(왼쪽→오른쪽), gemini→e2b는 backward(오른쪽→왼쪽). e2b 대상 reread/requery/explore는 “추가 조회 요청”, source read/profile complete 후 gemini context/structure/transcribe는 “원문 구조 전달”. 나머지 제목은 서버 wording 유지.
4. 시간순 정렬, 같은 timestamp는 수신 순서 안정 정렬. 새 key, 유효 timestamp만 enqueue. 현재 재생과 pending은 별개. pending max8, 초과 시 **가장 오래된 pending을 버리고 최신8** 유지, omittedCount 증가. internal queue seen max256은 enqueue/take/clearPending 시 delete+add로 최근 사용 순서를 갱신한다. 큐를 빠르게 만들기 위한 가짜 이벤트/중간 상태 금지.
5. presentation memory: session Map max30, seen Set max512, visitedGroups Set max100은 삽입 순 FIFO이며 조회로 순서를 갱신하지 않는다. session마다 liveSince 유지. eligible는 event.time≥liveSince, 현재시각 대비 과거15s 이내·미래5s 이내. 처음 보는 live file은 이미 완료된 handoff도 한번 보여줄 수 있다. 이력/다른 파일 선택은 baseline만 설정하고 과거 인계를 재생하지 않는다.
6. 각 실제 handoff hold1400ms. beam 본체 travel1300ms/easing cubic-bezier(.28,.18,.44,1), 동반꼬리 delay70ms. front packet width24/height5px, 꼬리32/2px. forward left -32px→100%; backward right -32px→100%; opacity0→1(12–82%)→0. pending 숫자 `+N`은 실제 표시대기 수.
7. 연결 끊기면 남은 재생시간을 저장하고 clock를 pause; live 복귀 후 남은 시간만 재생. 실제 dock의 :not([data-connection=live]) 아래 모든 descendant/pseudo CSS animation-play-state도 paused!important이므로 동일 packet 위치에서 정지한다. sibling theater에는 이 CSS가 적용되지 않는다. 파일변경/OFF는 pending/현재 pulse/timer를 비움. unmount timer와 busy callback 정리. StrictMode effect cleanup으로 보관된 seen을 지워 중복 인계하지 않는다.

실패/중단/완료 task 상태만으로 기존 handoff queue를 비우지 않는다. OFF와 파일 변경은 비운다. OS reduce CSS는 모양만 멈추며 JS queue/busy를 비우지 않는다. scene/선택/history/20-event overflow의 정확한 규칙은 interaction-contract §I5–I6 및 fixture HANDOFF-20을 따른다. runtime chamber는 e2b·gemini 각각 선택된/실행/대기/이력 task를 보여준다. 없는 runtime은 disabled “작업 없음” 그림일 뿐 실행을 주장하지 않는다. source read beam은 live+running+phase upload/read/reread/transcribe일 때만. output 완성표시는 선택 task completed, 실패는 attention icon.

## 5. 문서→추출/대조→3판정 theater

### 5.1 좌표와 외형

SVG viewBox `0 0 1120 300`, preserveAspectRatio none. input path `M226 150 L314 150 Q334 150 346 150 L434 150`; pass `M556 150 L598 150 Q618 150 632 130 L671 75 Q681 60 702 60 L782 60`; fail `M556 150 L782 150`; review `M556 150 L598 150 Q618 150 632 170 L671 225 Q681 240 702 240 L782 240`. stroke1.2px, animated dash1.7px/pathLength100/dasharray9 91. classifier node(610,150), r10. source left약3.5%/width25%, engine left33–34%/width22%, lanes left64–65%/right2.5–3%. pass/fail/review의 순서는 위→중간→아래다.

입력 gradient scene 좌표(226,150)→(434,150), cobalt #3d6dff opacity.35→mint #70f3c4 .8. 출력(556,150)→(782,150), mint .75→cobalt .65→#94adff .65. 결과 카드는 status별 icon+이름+criterion+value/unit+상세 화살표. 문서 stack는 최대3개를 기본 표시하되 active 문서를 뒤에 추가할 수 있고 hidden 수를 표기. 실제 document.extraction.fields가 있으면 앞3행을 보이고, 없으면 장식 인쇄선을 표시한다(추출 결과라고 표기하지 않음).

### 5.2 실제 도착 packet

동일 문서 집합 ID를 sorted join한 context를 기억한다. item signature=`JSON.stringify([status,value,unit,label])`, field key=`documentId:index:label`, field signature=`[value,unit]`. 최초 snapshot, context 변경, 데이터가 비워짐은 baseline이며 arrival를 만들지 않는다. 다음 snapshot에서 signature 바뀐 decided item과 field만 후보. counts/cards는 항상 최신 데이터에서 즉시 계산하며 animation 종료를 기다리지 않는다.

새 결과는 pass/fail/review 각각 최신1개를 먼저 확보하고 changed 마지막6개를 합쳐 id dedup, fields 변화 있으면 slot1개를 마지막 field에 예약한다. 최대6 packet. 이전 packet 중 미만료이고 item signature 여전히 일치하는 것+신규를 합친 뒤 마지막6개만 유지한다. 따라서 과부하 때 모든 이벤트가 완전 재생된다고 주장할 수 없다. 데이터/결과는 생략되지 않으며 시각 샘플만 제한된다.

verdict packet1.8s linear, extraction1.3s linear, additions index×.075s delay. expires=now+(delay+1.8+.12)s;350ms interval로 만료 제거. verdict normalized x=[224,322,420,500,574,618,658,696,755], y=[150,150,150,150,150,150,150+(laneY-150)*.52,laneY,laneY], time=[0,.14,.29,.43,.57,.65,.77,.87,1], laneY pass60/fail150/review240. extraction x=[224,282,348,414,457], y150, time[0,.25,.5,.8,1]. DOM packet left=x/1120×100%, top=y/300×100%, opacity first/last0 others1; label remains CSS pixels, 최대7글자 + ellipsis; title full label:value. packet dimensions height30px/max-width126/padding0 9/radius7/font10px. width≤760px에서는 packet layer와 scene stations 자체가 숨겨진다. 내부 packet state/timer와 counts는 계속 갱신된다.

lane 카드는 해당 status의 latestIds에 일치하는 항목, 없으면 matching.at(-1)를 선택한다. busy 빈 lane은 “분류 대기”, idle 빈 lane은 “—”. live 카드 click은 하단 파일 nav를 인라인 근거 상세로 대체한다. 예시 카드는 비상호작용 div이며 packet은 pointer-events:none/aria-hidden으로 클릭 동작이 없다. failed/cancelled가 되어 busy=false인 것만으로 packet은 지워지지 않고 만료된다. 연결 상태는 theater prop에 없으므로 activity 연결 단절만으로 busy 배경 스캔이 멈추지 않는다.

**Live** output branch's ambient path trace/particle are disabled: verdict traffic comes only from received packets. Input scan/breathing represents currently active processing, not new extracted data. **EXAMPLE** explicitly loops 3 known packets with delay .4+index×1.55s and repeatDelay4.6s. This separation prevents marketing animation being mistaken for activity.

### 5.3 주요 Motion transitions

|Effect/trigger|초기→종료|duration/delay/easing|정지/cleanup|
|---|---|---|---|
|전체 default|tween|280ms, [.22,1,.36,1]|OFF0ms|
|intro copy/actions/badges/theater mount|opacity0/y16→1/0|700ms; copy0, actions120ms, badge220+i45ms, theater200ms; same ease|OFF initial=false|
|입력 page mount|opacity0/y12→1/0|기준400ms; 대상 default280ms|epoch prevents stale navigation|
|file row added|opacity0/y6→1/0; layout|default280ms|삭제 후 unmount|
|paper enter|opacity0/y25/rotateX15→1/0/0|650ms; index130ms; [.2,.75,.2,1]|OFF0ms|
|latest token change|opacity0/y7→1/0; exit0/-7|220ms; AnimatePresence wait|OFF0ms|
|lane count change|opacity.4/y4→1/0|200ms|actual live count immediately|
|real result card change|opacity0/x-24/y5/scale.985→1/0/0/1|520ms; exit180ms y-4; [.22,1,.36,1]|AnimatePresence popLayout|
|arrival glow|opacity[0,.85,0]|620ms delay packet.delay+1.6s easeOut|only arrivals; OFF none|
|context collapse|height0/opacity0↔auto/1|240ms|busy stays expanded|
|context 2-row pagination|opacity0/x-6→1/0; exit0/+6|160ms wait|OFF0ms|
|result focus detail|opacity0/x12→1/0|200ms|focus heading preventScroll|
|file status distribution width|previous→count/total percent|350ms|OFF0ms|
|summary KPI count|0→value rounded ko-KR|650ms same ease; parent opacity/y7 280ms|animation.stop effect cleanup|
|summary panels|opacity0/y10→1/0|500ms delays0/40/80/120/160ms|OFF0ms|
|summary item tile/filter|opacity0/scale.96↔1/1; layout position|300ms, delay min(index,8)22ms; hovery-2/tapscale.98|leaving tile disabled, tabIndex-1, aria-hidden|
|summary portal tooltip|opacity0↔1|120ms|hover/focus only; scroll clears|
|native module/row entrance|opacity0/y8 or y4→1/0|520ms; row nth2 40/3 80/4+120ms|global reduced CSS disables|
|native interaction|color/background/border/shadow|160ms or280ms [.22,1,.36,1]|CSS reduced disables|

`ui/motion-catalog.json` supplies precise CSS keyframe declarations for upload hover scan(2s), upload plus(.6s), theater scan(6.4s), float(12s), light path(6.4s/input5.6s), theater core scan/extract/check(3.2s), workroom source scan(4.8s), chamber scan(6s), live breathe(2.8s), SandboxWorkScene phase artwork and all delays. It is parameter reference, not permission to run animations unconditionally. 정확한 stage 우선순위는 completed status 또는 phase complete/cleanup→4, 그 외 queued status→0, 그 외 kind별 phase map이다. dashboard: install1, model/build/repair/work2, validate/verify3, 기타0. 문서: read/reread/transcribe1, structure/profile/explore2, context/model/extract/quality/verify/validate/repair/retry/work3, 기타0. failed/cancelled를 stage4로 간주하지 않는다. artwork는 install phase의 우선 분기 등 stage와 추가 조건이 있으므로 interaction-contract §I6의 완전한 표를 따른다. Only `status=running` runs phase loops; waiting/nonlive is passed as queued.

### 5.4 Terminal navigation

After pending=false and status awaiting_confirmation/completed/partial, navigate to confirmation/results. On analysis/review page + live tab + app motion ON, timer is1800ms if reviewFlowBusy, else1600ms if presentationBusy, else120ms. This does **not** extend server execution or drain the entire queue. Timer is effect-cleaned and restarted when run.id/run.status/pending/page/analysisTab/presentationBusy/reviewFlowBusy/preference.enabled dependencies change; epoch checks before navigation. 따라서 최초 terminal event부터 2.3초라는 절대 상한은 없다. 마지막 관련 dependency 변화 이후 선택된 delay가 경과하면 이동하며, TIMER-01 fixture로 재시작 시각을 검증한다. Other tab/OFF/targets destination navigates immediately. Wording changes to “끝났습니다 / 마지막 전달을 보여드린 뒤 결과를 엽니다.” while briefly finishing; do not claim computation is ongoing.

## 6. 전체 요약(Recharts)의 정확한 계약

별도 맞춤대시보드가 아닌 결과→전체 요약이다. `items`는 원본 review state를 그대로 사용. counts=pass/fail/review/pending 각각 수, completed=pass+fail+review, attention=fail+review. target documents는 판정0이어도 bar 데이터 row에 포함하고 orphan item의 documentId는 “검토 문서”로 row를 추가한다.

- 3 KPI: 검토 문서 개수, 판정한 항목 completed/items.length, 확인할 항목 attention. sr-only 텍스트에 최종 정수 제공, animated count는 aria-hidden.
- donut: ResponsiveContainer100%×100%, minWidth0/minHeight0, PieChart accessibilityLayer; dataKey value/nameKey name, cx/cy50%, innerRadius68%, outerRadius90%, start90/end-270, paddingAngle 복수 positive slices일 때4 아니면0, stroke none, cornerRadius5. animation850ms ease-out. status count0 slice는 제외. items0일 때 중립색 #263943 값1 ring 하나+center0, tooltip 없음/클릭 무효/animation 없음. 실제0을1이라고 세지 않는다.
- donut slice click은 해당 status filter toggle, 재클릭 all. 선택 아닌 slice opacity.26; 중앙 수=all이면 items.length 아니면 filter count. legend는 button, aria-pressed; pending0이면 legend 숨김.
- 문서별 stacked horizontal bar: ResponsiveContainer100%×100%, BarChart layout vertical; margin top4/right12/bottom0/left0; barSize14; height max(104,documentCount×37+22). XAxis number/integer, no axis/tick lines, tick fill #859eaa/font10, minTickGap16. YAxis category/name width105, name13자 축약, fill #c6d7de/font11. four Bar stackId verdicts, radius[2,2,2,2], animation800ms ease-out, selected 아닌 상태 opacity.23. tooltip은0보다 큰 series만, full file label. 많은 문서는 내부 scroll.
- 항목 map: status filter, 값/단위/status/human stamp. click은 onSelect(id)로 파일별 상세. hover와 keyboard focus tooltip은 createPortal(document.body), width280px에 좌우12px clamp, rect.top<220이면 below(rect.bottom+9) 아니면 above(rect.top-9). 원문/기준/설명과 클릭 안내. map scroll 시 닫음. **세로 clamp/max-height는 구현에 없어 긴 설명이나 낮은 viewport에서 tooltip이 넘칠 수 있다.** 이는 BASELINE_OBSERVATION이며 이미 해결된 기능으로 문서화하지 않는다. 현재 재현은 원본280px/12px와 TOOLTIP-LIMIT을 따른다. interaction-contract I8.1의 clamp·내부 scroll·재측정·Escape 및 width cap276px/margin8px은 OPTIONAL_FUTURE이며 별도 변경 없이 적용하지 않는다. 항목0/선택상태0이면 전용 empty 안내.
- reduced = app motion OFF **또는** Motion `useReducedMotion()`(OS) true. 두 chart animation/숫자 tween/tile 이동이 모두 OFF. 이 화면의 OS 지원은 전체 앱의 OS 지원과 다르다.

## 7. 원문·상세·사람 수정

상세 부록 `../ui/detail-controls.md`가 문서유형별 preview·선택 및 기준 편집의 정본이다. 다음은 결과 화면에서 반드시 지켜야 할 연결 계약이다.

0. 전체 선택 전이·빈 상태·목록 내 이전/다음의 경계 및 compact/full inspector 차이는 interaction-contract §I8 정본을 따른다. 이전/다음은 현재 visibleItems 안에서만 이동하고 양끝은 disabled(순환 없음).
1. 대상 파일만 파일탭 구성; 파일 변경 시 local selection/source/filter/tab/page를 초기화(page1, items/all). 외부 selectedItemId는 그 item.documentId 파일을 열고 filter all, items tab, 해당 대상 evidence로 원문 이동.
2. 결과 filter는 **목록**만 바꾼다. 원문 highlights는 활성 파일 전체 item 기반으로 유지. click한 highlight는 연결된 item 상세를 즉시 연다.
3. 기준 원문 source 선택은 왼쪽을 해당 기준 문서로 교체하며 “연결된 기준 원문”, “검토 대상으로” 복귀 버튼을 보여준다. 오른쪽 item context 유지.
4. 위치 없는 item은 칩/누락 또는 위치 확인 안내. 머리글/시료명/항목명 같은 가짜 근거 하이라이트를 누락 항목의 fallback으로 만들지 않는다. 이 보호는 missing 전처리와 PDF item-name witness에 대한 것이다. 표는 유효 좌표가 주어지면 quote 대조를 우회하므로 잘못된 셀 좌표를 모두 거부한다고 보장하지 않는다(D1.3/interaction-contract §I9). 잘못된 표 좌표까지 차단하는 검증은 interaction-contract I9.1과 TABLE-HIGHLIGHT-REBUILD의 OPTIONAL_FUTURE다. 현재 재현은 D1.3의 좌표 우선 경로와 PREVIEW-WRONG-CELL 기대값을 따른다. 항목이 원문에 없으면 `missing` 표시를 하되 채색 box는 없을 수 있다. 원본 존재가 확인되지 않은 bbox를 임의 생성하지 않는다.
5. 상세 값, criterion rule, explanation, 모든 source quote+file/page/sheet/cell, humanNote와 reviewedByHuman stamp. linked criterion을 못 찾으면 빈 기준을 꾸며내지 않고 “적용할 기준을 확인해 주세요.”. 유형 applicability 상세는 targetCategoryPath/criterion.categoryPath 있을 때만.
6. 사람 판정 수정: pending 또는 busy/resolve 미연결이면 disabled. status pass/fail/review dropdown, note textarea max1000, trim note 비어있으면 save disabled, saving 중 재저장 disabled. 실패는 편집창 유지+role alert. 성공 시 편집을 닫으며 사용자의 취소 버튼도 즉시 local editing=false로 닫는다. 저장 중 취소·select·textarea는 disabled가 아니고 취소가 in-flight resolve를 abort하지 않는다. item/status/humanNote 변화 시 폼 상태 갱신. 판정이 필터 밖으로 바뀌면 all로 전환하여 선택 상세를 잃지 않음.

## 8. 접근성·모션 OFF·성능

상단 “모션 ON/OFF”는 aria-pressed. localStorage key `trace-demo-motion`: 저장이 'off'일 때만 초기 false, 기본 true; html data-motion full/reduced, 저장 on/off, storage 오류 무시. MotionConfig full일 때 reducedMotion='never', OFF일 때 'always', transition duration0. CSS reduced는 descendants/pseudo/backdrop animation:none!important; transition:none!important; scroll-behavior:auto!important. useAppReducedMotion는 app preference만 본다. **OS의 prefers-reduced-motion은 global default에 반영되지 않는다**; Workroom/SandboxWorkScene/LiveReviewContext CSS 및 ResultsVisuals는 별도 OS 대응하지만 모든 Motion transition이 OS에 따라 꺼진다고 주장하지 않는다. 재현 acceptance는 ON/OFF 계약과 OS에서 남은 움직임을 각각 측정하며 OS 통합을 추가하면 명시적 개선으로 기록한다.

role alert는 오류, role status/aria-live polite는 작업 요약과 결과 도착. 모든 source/result filter/button은 문서명/항목명/판정 의미가 accessible name에 들어간다. current step, toggle pressed, accordion expanded, tabs selected/tabpanel, live counts용 sr-only 최종값을 제공한다. native dialog의 close/Escape/focus behavior는 각 modal 명세 따른다. 색 외에 Check/X/HelpCircle/문구로 판정을 구별한다. 원본 tiny caption은7–10px까지 있으므로 WCAG 준수 측정 없이 접근성 완료라고 주장하지 않는다. 새 구현의 고정 desktop 시각 기준을 유지하면서 확대200%, keyboard, contrast 결과를 증거로 남긴다.

실제 성능 상한: arrival6/pending handoff8/tasks100/events200/presentation session30; 파일별 데이터 useMemo; lazy screen/modal; GPU 친화적 opacity/transform 위주지만 theater packet은 left/top도 애니메이션한다. 이를 compositor-only라고 잘못 설명하지 않는다. animation clock는 화면 데이터의 source of truth가 아니며 effect timeout/interval cleanup과 PDF render cancellation 필수. app preference가 OFF로 바뀌면 queue 즉시 clear. OS reduce 변경만으로 전역 JS queue가 비워지지는 않는다. dialog 닫으면 chart unmount, event/source observer dispose.

**측정 항목과 미래 성능 목표(원본 실측 아님)**: 정상 desktop reference 뷰포트에서 사용자 click→선택 제목 visible p95≤100ms, 100개 items filter p95≤150ms, 30초 motion recording에서 main-thread long task>200ms 0회(LLM/network 대기는 제외), 5회 modal open/close 후 chart canvas/ResizeObserver/active SSE 수 원래 수준으로 복귀, 모션 OFF에서 document.getAnimations().filter(running).length=0(외부 브라우저 자체 UI 제외), 100 rapid events에서 DOM packet≤6, pending≤8, 결과 counts100% 일치. p95≤100ms/150ms와 long task0회는 OPTIONAL_FUTURE 성능 목표이며 현재 재현 합격을 위해 원본 기능을 변경하는 근거가 아니다. 현재 필수는 실제 상한·cleanup·counts·모션 분기의 동등성 및 같은 환경의 측정 결과 기록이다. 실행하지 않은 수치는 NOT_RUN이다.

## 9. 검증 사례·정량 gate

이 절 ID는 `ui/library-effects.csv`와 전체 requirements traceability가 공유한다. 검증 구현은 semantic role/name + data-testid를 새 구현에 부여해도 되지만 파일명/고정 좌표에만 의존하는 click 테스트로 완료하면 안 된다. 고정 뷰포트에서 PNG 비교는 위치 검증을 보완한다. main test fixture는 가짜 업무 데이터를 사용하고 실제 실행과 fixture replay를 분리한다.

|ID|검증 입력/절차|성공 증거|
|---|---|---|
|UI-01|intro→기준 file/text→분석→확인→대상→review→results; 1366×768/1440×900|모든 상태 screenshot; GSPEC/4steps 정확; desktop body scrollHeight≤innerHeight+1, CTA bounds viewport 내. 긴 내부 pane 스크롤은 허용|
|UI-02|file/text 전환, blank/12000자, 업로드중, 늦은 upload 뒤 reset, start 실패|button enabled 규칙 일치, stale response가 새 상태 덮지 않음, role alert|
|UI-03|numeric/qualitative editor, exclude/include, 한 파일 feedback, validation, explicit confirm|명시 확정 전 targets 불가; 선택/출처/비고/조건 보존; 이전 draft version 비교|
|UI-04|2page PDF, 2sheet XLSX, 이미지, text, source 없는 missing item|page/sheet 이동, 진짜 근거만 highlight; absent evidence로 가짜 box0; preview failure 독립처리|
|UI-05|0/1/100 items, four verdicts, 0/1/50 documents, human status change|count/filter/chart dataset 수치100% 일치, 0 donut은 neutral, click immediate detail, 필터와 무관한 전체 원문 highlights|
|UI-06|actual activity fixture: e2b→gemini→e2b, 잘못된 문서/run/context, history select, duplicate|정당 handoff만, 방향 정확,1400ms±80ms hold,8pending 이하, history no replay, 연결 freeze clock|
|UI-07|빠른100item+fields snapshots, 동일 snapshot2회, 초기 snapshot existing result|DOM packet≤6; counts immediate; initial/same snapshot new packets0; 75ms stagger; 마지막 effect dependency 변화 후 선택 delay1800/1600/120ms±80ms에 이동, 상태 불변(TIMER-01)|
|UI-08|completed/partial/failed/cancelled, live queue 후 완료, connection failure|실패를 성공으로 표시하지 않음; autoCollapse 조건 충족 후800ms±100; reconnect4..60s, source dispose|
|UI-09|Tab/ShiftTab/Enter/Space/Escape, focus detail/back, ON/OFF, OS reduce,200% zoom|명세된 native control 동작과 실제 focus 복원 지점 재현; OFF animation0; OS gap·tooltip Escape 미지원·분석 drawer trigger focus 미복원 보고. 모든 상호작용의 접근성 개선 완료를 요구하지 않음|
|UI-10|cold intro 네트워크, hover dashboard, open/close5회, target100items|비관련 lazy modules 뒤늦게 로드; 닫힌 modal의 charts0/미방문 hidden iframe의 새 mount0. 이미 본 대시보드 iframe은 source 탭에서 의도적으로 유지되며 중복 mount0(05 D09); p95/long task/observer 측정 로그|
|UI-11|390×844,768×1024,1080×760,1280×800,1440×900,1600×960|모바일 세로스크롤 허용, body horizontal overflow≤1px; no overlap/cut CTA; results detail visible after click|

추가 필수 desktop reference는 1600×960과1280×800이다. 현재 전달된 추가 캡처는 두 viewport의 intro/기준확인/결과상세이며 실제 manifest를 확인한다. 두 viewport의 live-review/결과목록은 **추가 acceptance / NOT_RUN**으로 분리하며 전달됐다고 주장하지 않는다. 각 viewport에서 intro, 기준확인, live review, 결과목록/상세의 OFF screenshot+DOM bounds를 수집한다. reference/manifest.json에 해당 상태/viewport/실제 측정이 없으면 NOT_RUN이며 기존1440×960/390×844 PNG로 대체 통과시킬 수 없다. 보관된 PNG는 합성 fixture replay이며 provider 실동작 증거가 아니다.

단위 없이 `보기 좋음 10/10`은 gate가 아니다. geometry는 reference bounding box 위치/크기차≤4px(해당 viewport/font profile), 색은 평면 background RGB채널차≤2, 주요 글자 font-size차≤1px, transition delay/duration차≤80ms 또는10% 중 큰 값. PNG perceptual diff 목표≤1.5% changed pixel(동일 browser/DPR/font, anti-alias tolerance, animation off; 텍스트·키 데이터 mask 금지). 실제 live motion은 static PNG 대신 이벤트timestamp/video/DOM sampling을 함께 저장한다. 목표 충족 여부가 미측정이면 `NOT_RUN`이다. 원본의 미지원/버그와 개선 요구가 충돌하면 §10 deviation을 승인기록에 남기며 몰래 동일하다고 주장하지 않는다.

## 10. 관측된 한계와 재현 결정

- 현재 원본의 사용자 모션 OFF는 전역이지만 OS reduced-motion은 컴포넌트별로 다르다. 재현기본은 명시 OFF 동등성, OS 통합은 개선 후보로 별도 기록. full default에서 움직임이 전부 사라져야 한다는 원본 사실 주장은 금지.
- 원본은 외부 Google Fonts를 사용한다. 설계 패키지는 ui/fonts의 WOFF2/manifest/licenses를 제공하므로 재구축은 해당 자산과 fonts-ready 상태를 기록한다. 운영체제 rasterization 또는 fallback 혼입까지 동일하다고 보장하지 않는다.
- desktop no body scroll은 정상 높이≥600px/width>760px 전제다. 모바일/높이가 더 낮은 환경에서 세로스크롤은 정상.
- PDF/표 원문 위치는 데이터에 따라 불확실할 수 있다. UI의 잘못된 fallback highlight보다 위치 확인 안내가 우선한다. 이미지 원본은 preview는 되지만 좌표 overlay 기능이 없다는 범위를 유지(부록 참조).
- 실제 activity dock은 연결 끊김 시 elapsed/UI running/presentation timer와 descendant CSS를 pause한다. Theater는 별개 sibling이며 connection prop이 없어 busy 배경 모션이 남을 수 있다. 이 차이를 혼동하지 않는다.
- 원본 App은 새로고침/다른 URL의 session 복원을 하지 않는다. 새로운 영속 복원은 scope 확장이며 필수 동등 기능이라고 세지 않는다.
- motion-catalog는 과거 부분 색인이다. 활성 전체 선언/inline 표현/폰트와 cascade는 VISUAL-CONTRACT 및 style/component catalog를 따른다. 이번 패키지의 fonts/manifest.json 자산을 쓰더라도 font readiness와 플랫폼 rasterization을 측정한다. 상태·이벤트·구조는 본 계약과 interaction-contract로 새로 구현한다.


## 독립 감사 추가 정본

[공통표시·health·mobile·rawmark](../ui/auxiliary-contract.md),[현재재현/미래개선결정](../ui/interaction-contract.md#i92-감사에서-확정한-개선-범위),[스캔geometry선택확장](08-rebuild-coverage-geometry.md)을함께읽는다. 기존스타일/SVG/모션카탈로그의값은변경하지않는다. terminal aria 보강은 현재 코드에 없으며 OPTIONAL_FUTURE/NOT_RUN이다. 현재 재현에서는 auxiliary A5의 실제 live 문구를 유지한다.

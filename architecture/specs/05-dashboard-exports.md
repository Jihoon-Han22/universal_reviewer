# 05. 맞춤 대시보드, 검토 시각화, 다운로드 계약

이 명세의 활성 프로필은 **CURRENT_REPRODUCTION**이다. 현재 소스의 데이터·UI·호출 순서·오류·한계를 그대로 재현한다. DB-H01/02/03, semantic judge, notices와 별도 성능 수치 목표는 **OPTIONAL_FUTURE**이며 현재 재현에 적용하지 않는다. 과거 추가 요구를 보존한 절의 “필수”는 그 미래 프로필 안에서만 유효하다. 새 앱의 구현 경로는 자유지만 데이터와 상태, 사용자 결과 및 시각 기준은 보존한다. 코드 경로명은 책임의 이름일 뿐 빈 프로젝트에서 원본을 읽어야 한다는 뜻이 아니다. 검토대장/일반 XLSX·CSV 출력은 [05a-ledger-export.md](05a-ledger-export.md)에 분리한다. 대시보드는 검토 상태를 변경하는 기능이 아니다.

## D01. 라이브러리와 책임 추적

| 화면/효과 | 라이브러리 API | 선언 → lock 실제 | 구현 책임/설정 | 검증 |
|---|---|---|---|---|
| 앱 대시보드 dialog, 상태, lazy 화면 | React hooks/lazy/Suspense/memo, ReactDOM | react/react-dom ^19.2.0 → **19.3.0** | DashboardModal, ChartPreview, DashboardEvidence | 즉시 dialog 표시, 260ms 뒤 iframe 생성, 숨겨진 원본 뷰어 초기화 금지 |
| 다운로드 HTML count chart | react-chartjs-2 Doughnut/Pie/Bar/PolarArea | **5.3.1 → 5.3.1** | trusted bundled chart-entry | TraceCharts.inspect로 실제 type/data 검증 |
| 해당 canvas 렌더 | Chart.js | **4.5.1 → 4.5.1** | 아래 D06 등록/설정 | Chart.js 2.x 아님; 4개 차트 모두 동작 |
| 결과 화면 donut/파일별 stack bar; 원본 탭 미니 donut | Recharts Pie/PieChart/Cell, ResultsVisuals의 BarChart/Bar/ResponsiveContainer/Tooltip/XAxis/YAxis | **3.10.1 → 3.10.1** | ResultsVisuals, DashboardEvidence | 다운로드에 Recharts를 넣지 않음 |
| dialog entrance, 증거 선택, 결과 타일/숫자 | motion/react motion, animate, useMotionValue, useTransform, AnimatePresence | ^12.23.24 → **12.43.0** | D09 shell은 앱 motion 설정만, D10 원본 탭은 앱 설정 OR OS reduced | 실제 적용 범위를 분리해 검증, unmount 정리 |
| UI 아이콘 | lucide-react | ^0.468.0 → **0.468.0** | LayoutDashboard, Sparkles, FileText, X, Check, HelpCircle, ChevronDown 등 | 아이콘만으로 상태 구분하지 않음 |
| standalone CSS entrance/hover | CSS keyframes/transitions | browser native | 동봉 reference CSS; 외부 font/network 없음 | motion full/subtle/none 및 OS reduced |
| 단일 파일 HTML 라이브러리 번들 | esbuild build | **0.28.2 → 0.28.2** | IIFE, browser, es2020, minify, production React | offline 로드와 런타임 inspect |
| E2B HTML DOM 검증 | jsdom JSDOM/VirtualConsole; node:vm Script | 로컬 dev **26.1.0**; sandbox exact **26.1.0** | 고정 validator, Chart adapter | 픽셀·canvas 애니메이션 검증과 구분 |

### 구현 자산

- [dashboard-design.schema.json](../contracts/dashboard-design.schema.json): 정확히 **14개 필드** generation schema.
- [dashboard-design.default.json](../contracts/dashboard-design.default.json): authoritative 기본값.
- [design-functions.reference.mjs](../reference/dashboard/design-functions.reference.mjs): 정규화/명시 요청 override/palette의 필요한 정확한 알고리즘 발췌. 전체 앱 구현은 포함하지 않는다.
- [standalone-reference.css](../reference/dashboard/standalone-reference.css): HTML 대시보드 수치·반응형·CSS motion 원본 참조값. class와 data attribute는 아래 renderer 구조와 연결한다.
- [chart-entry.reference.jsx](../reference/dashboard/chart-entry.reference.jsx): 필요한 고정 chart wrapper; 모델이 생성하면 안 된다.
- [dashboard-system.md](../prompts/dashboard-system.md), [dashboard-loop.md](../prompts/dashboard-loop.md): 자체 포함 prompt/repair 계약.
- [dashboard-dom-validator.cjs](../validation/dashboard-dom-validator.cjs): 실제 사용된 고정 DOM/data 검사기. 별도 브라우저 QA를 대체하지 않는다.
- [dashboard-examples.json](../contracts/dashboard-examples.json): 비밀/사용자 업로드가 없는 합성 snapshot/API 정상·오류 예시.

## D02. 데이터 스냅샷과 불변성

생성 가능한 run.status는 `completed|partial`. items는 1..2000개. 그 밖에는 HTTP409. snapshot은 run 객체와 분리한 allowlist 새 객체를 재귀 Object.freeze한다. 모델은 판정/수치/근거/원문을 수정하거나 코드·HTML·CSS·새 점수를 생성할 수 없다.

`snapshot = {runId,createdAt,criterionVersion,partial,summary,documents,items,numericGroups}`. createdAt ISO 현재시각, criterionVersion 정수이면 그 값 아니면1, partial은 run.status===partial. documents는 `{id,name}`만. id 최대100 UTF-16, name240. 파일 bytes, 원본 URL, 문서 body, credentials는 제외한다. 원문 전체 제외는 **짧은 evidence quote도 전혀 없다는 뜻이 아니다**: 스냅샷/HTML에는 판정 근거 발췌 quote가 포함된다.

각 snapshot item:

| 키 | 변환/최대 길이 |
|---|---|
| id,documentId,criterionId | 문자열100 |
| documentName | documents에서 item.documentId 일치한 name, 없으면 빈 문자열 |
| label / value / unit / criterion | 문자열240 /400 /100 /800 |
| status | pass/compliant/적합→pass; fail/noncompliant/부적합→fail; 나머지→review |
| explanation / humanNote | 문자열1600 /800 |
| reviewedByHuman | `===true` |
| sourceEvidence | 배열 evidence 또는 단일 object를 배열로; 처음30개에서 object만; documentId 기본 item.documentId 최대100, page number만, sheet/cell120, quote||text800 |
| evidence | sourceEvidence[0]에서 page(number아니면 null),sheet/cell/quote 문자열; 나머지 근거는 host sourceItems에 보존 |

null/undefined 문자열값은 ''. 문자열 길이 제한은 UTF-16 slice. summary는 items에서 재계산: `{total,pass,fail,review,humanReviewed,documents}`. documents는 snapshot documents 수이고 HTML reviewed file count와 다를 수 있다. HTML file list는 항목이 있는 파일만 표시하고 누락된 문서 id도 item.documentName 또는 `문서 정보 없음`으로 그룹화한다.

`sourceItems`는 snapshot.items의 `{id,documentId,label,value,unit,criterionId,criterion,status,explanation,reviewedByHuman,humanNote,evidence:sourceEvidence}`를 따로 deep freeze하여 ready 응답에만 제공한다. UI는 요청 시 파일 목록의 structuredClone/deepFreeze를 보관하고 server sourceItems와 결합한다. 생성 이후 HITL 변경이 있어도 기존 HTML/원본 snapshot 판정은 바뀌지 않는다. 다시 구성을 요청해야 새 판정이 들어간다.

**현재 projection의 한계(재현 사실):** `pending`은 `review`로 정규화되며 rawStatus/pendingItemIds는 보내지 않는다. 따라서 정상 `/api/dashboards` ready→원본 탭 경로의 pending count는0이다. D10의 미완료 문구는 raw pending을 직접 주입한 component/legacy 입력에서만 나타난다. UI가 live items를 섞어 이를 복원하면 snapshot 불변성을 위반한다. 또한 `presence`/`missingVerified`는 현재 allowlist에서 빠진다. value가 `누락` 등 누락 정규식에 맞으면 기존 호환 경로로 보호하지만 `{value:null,presence:'missing',missingVerified:true}`는 `{value:''}`가 되어 보호 근거를 잃는다. 이 경우 문맥용 target evidence가 highlight 후보로 남는 알려진 결함이 있다. **모든 missing 입력이 보호된다고 주장하지 않는다.** **DB-H01은 OPTIONAL_FUTURE이며 현재 재현 gate가 아니다.** 다음 필드 보존·강조 보호는 향후 개선안이다: 새 snapshot item과 ready sourceItems는 입력의 presence(present|missing|unreadable|unknown)와 missingVerified(boolean)를 모두 보존한다. false도 유지하고 입력에 없는 필드는 생략하며 새 값을 추정하지 않는다. frozen snapshot에서 만든 두 projection에만 적용하고 live merge하지 않는다. value null→빈 문자열이 되어도 missing=true인 target contextual evidence는 하이라이트 후보에서 제외한다. CURRENT_REPRODUCTION에서는 위 allowlist와 필드 손실까지 관찰대로 재현한다. 미래안의 예상 결과를 현재 projection oracle로 쓰지 않는다. [구체적인 왕복 예제](../ui/dashboard-interaction-cases.json)의 `projectionCases` 참조.

수치 비교 준비 데이터는 criterionId,label,unit이 모두 비어있지 않고 value가 `^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$`인 경우만 인정한다. 쉼표 제거 Number가 finite여야 한다. `[criterionId,label,unit,criterion.trim()]`이 같은 그룹, 값2개 이상, 최대12그룹·각100값이며 total은 자르기 전 수다. `<5`, `≥2`, `N/A`, 혼합단위는 수치 plot 대상이 아니다. **현재 fixed renderer는 이 numericGroups를 그리지 않고 3개 판정의 실제 개수만 그린다.** 트렌드/완료율(pass/total)을 지어내지 않는다.

## D03. HTTP와 작업 상태

### POST /api/dashboards

JSON body `{runId:string,instruction?:string,baseDesign?:DashboardDesign}`. runId string 길이≤100; instruction 생략 또는 string 길이≤1500. 서버는 빈 runId를 별도로 금지하지 않으며 찾지 못하면404; UI는 빈 trim instruction 생성 버튼을 disable한다. baseDesign은 generation plan과 동일 parser를 거친다. schema/default와 구형 필드 허용 차이는 prompt loop 참고.

| 조건 | status/body.error |
|---|---|
| router 전체에서 미종료 active job 존재 |409 `대시보드를 생성하고 있습니다. 잠시 후 다시 시도하세요.`|
| runId/instruction type·length 위반 |400 `검토 ID와 1,500자 이내의 화면 요청을 입력하세요.`|
| run 없음 |404 `검토 결과를 찾을 수 없습니다.`|
| run completed/partial 아님 |409 `검토를 완료한 후 대시보드를 만들 수 있습니다.`|
| item0개 또는 >2000 |409 `대시보드에는 1~2000개의 검토 항목이 필요합니다.`|
| baseDesign parse 실패 |400 `이전 대시보드의 디자인 구성이 올바르지 않습니다.`|
| 수락 |202 publicJob queued; 비동기 실행 시작 |

공개 job: `{id,status,message,attempt,logs,criterionVersion,sourceItems?,presentation?,design?,html?,error?}`. id UUID. statuses `queued→generating→building→(repairing→building)*→ready|failed`. initial attempt0; plan 호출 직전1..3. `ready`에서 sourceItems/presentation(기본 generated)/design 노출. html이 존재하면 status와 관계없이 노출하며 error도 존재하면 노출. validation은 내부 성공 결과에 저장하지만 publicJob에는 포함하지 않는다.

서버 jobs는 메모리 Map; 10개 이상일 때 새 job 직전에 가장 오래된 terminal 하나를 제거한다. disk 영속화 아님. 전역 active는 ready/failed 또는 finally에서 해제된다. 서로 다른 run이라도 병렬 생성 1개만 허용된다.

### GET /api/dashboards/:id / DELETE /api/dashboards/:id

GET200 publicJob, `Cache-Control:no-store`; 없으면404 `{error:"대시보드를 찾을 수 없습니다."}`. DELETE는 AbortController.abort, Map에서 삭제,204 빈본문. 없으면 동일404. 삭제/취소 뒤 fallback 생성 금지. active는 비동기 finally가 끝나기까지 잠시 잠금 상태일 수 있다.

UI POST 후 즉시 GET, nonterminal 뒤1200ms에 다시 GET. 연속 GET 실패2번까지 1200ms 재시도(총3실패 때 종료/DELETE); 성공 응답 뒤 오류 카운트는0. 진행 중 cancel, ESC, 닫기, unmount는 poll timer/GET AbortController를 정리하고 DELETE best effort. POST 응답이 늦게 도착한 뒤 sequence가 변했으면 응답 id도 DELETE. 생성 실패가 기존 성공 preview를 지우면 안 된다.

## D04. LLM↔E2B 생성/repair

1. snapshot → bounded JSON plan(최대3모델 호출 총합). role explore, output 2000 tokens, prompt에는 summary/partial/최대12파일명/최대12item label만.
2. parse→normalize→명시 preference override. 모델 provider IntegrationError는 즉시 실패; 다른 parse 오류만 남은 budget으로 repair. rawPlan≤8000/diagnostic≤3000 재입력.
3. **한 E2B 세션** `/home/user/review-dashboard`, lifecycle timeout240000ms. package.json에는 jsdom **26.1.0**만, 고정 validate.cjs/data.json 먼저 write. `npm install --no-audit --no-fund --ignore-scripts` timeout60000ms를1회 수행.
4. host fixed renderer로 HTML 생성, JS 문자열 길이1000..8000000 확인. HTML와 plan.json을 같은 sandbox에 write. `node validate.cjs` timeout20000ms.
5. exit0만으로 통과 금지. validation.json 검증(D08) 및 sandbox에서 읽은 dashboard.html 문자열이 host가 보낸 HTML과 완전히 같은지 확인한다.
6. 검사 실패는 sanitized diagnostic→동일 plan 함수→같은 세션 HTML/plan 교체→재검사. attempts>=3이면 실패. install 재실행/새 sandbox로 repair하지 않는다.
7. finally cleanup activity를 만들고 withSandbox 종료 결과를 반영. `CLEANUP_FAILED`는 실패 제목; 준비 전에 실패하면 prepare failed. checkAbort가 끝에서도 필요하다.

repair catch는 validate command/report/동일 HTML 확인 단계에 적용된다. install 실패, host renderer 크기 오류, files write 실패는 그 repair catch 밖이므로 자동 모델 재시도가 아니라 전체 생성 실패→fallback 경로다. 실패 종류와 무관하게 무한 ping-pong하거나3회씩 새로 계산하지 않는다.

생성 오류이고 signal이 abort되지 않은 경우 서버는 `applyDashboardPreferences(baseDesign||{}, instruction)`으로 deterministic 기본 디자인을 만든다. 반환 `ready,presentation:"standard"`, message `요청한 구성을 완성하지 못해 기본 자동 시각화로 표시합니다.`. log에는 `맞춤 구성의 샌드박스 검사는 완료되지 않았습니다.` 명시. fallback도 만들 수 없으면 failed `대시보드 표시 파일을 준비하지 못했습니다. 기본 검토 결과에서 판정을 확인해 주세요.`. 취소의 failed message는 `대시보드 생성을 취소했습니다.`지만 DELETE로 조회에서는404가 될 수 있다. fallback의 ready는 맞춤 생성 성공/시각 검증 성공으로 기록하지 않는다.

activity steps `model,prepare,files,install,build,validate,repair,cleanup`; status `running,completed,failed,info`. 로그 마지막80개. `{id:UUID,time:ISO,step,status,title≤160,detail?≤500,output?≤1500}`; title/detail/output sanitize. ANSI 삭제, 지정 비밀값 redaction, key/authorization/process.env/environ/GEMINI_/E2B_/password/secret/token 또는 ENV 할당이 포함된 행은 민감 진단 숨김, AIza/e2b_/Bearer masking, URL→[url], 제어문자 삭제. 모델↔sandbox activity observe task에는 runId/contextId=jobId,parentTaskId,attempt,maxAttempts 및 실제 handoff fromTaskId/toTaskId를 보낸다. wrapper가 command 시작/종료를 소유하고 command observer의 info만 forward하여 설치 두 번처럼 보이지 않게 한다. SSE activity 연결은 공통 activity 명세를 따른다; dashboard 상태 자체는 polling이다.

## D05. 독립 디자인과 레이아웃

공급자에게 보내는 generation schema의 모든 필드는 required/extra properties false다. host parser의 실제 생략 허용은 D05a를 따른다. title max64/subtitle120 parser; normalize는 control/연속공백 제거 뒤 비어있으면 default, **Unicode codepoint**60/100으로 자른다. accent는 named8 또는6자리hex; lower case normalize. 나머지 enum/default는 JSON contract가 단일 기준이다. baseDesign으로 기존 선택을 prompt에 전달한다. 성공 경로는 모델의 전체 plan을 사용하며 **baseDesign과 기계적으로 merge하거나 비요청 필드 보존 여부를 검증하지 않는다**. 명시 요청 중 regex로 인식한 필드만 후처리로 override한다. fallback은 baseDesign에 override하므로 인식하지 못한 변경 외의 필드는 결정적으로 보존된다. negation/동의어/마지막 positive match 규칙의 동봉 JS는 원본 관찰용이다. CURRENT_REPRODUCTION은 이 동일 helper를 사용하며, D05a/b의 새 의미 검사·필드 보존은 OPTIONAL_FUTURE이다.

bounded matcher는 일반 자연어 의미 해석기와 같지 않다. `Keep the dark page; make the charts light blue.`는 theme=light, `전체는 파이, 파일별 결과는 비교 막대로`는 distribution=bar/fileVisualization=bars가 된다. 기존 light에서 `밤 테마`만 요청하면 light가 유지된다. `파일만 막대로`는 distribution=bar/fileVisualization=cards가 된다. 이는 정상 의미대로 처리했다고 볼 수 없는 **baseline 한계**다. [dashboard-customization-cases.json](../contracts/dashboard-customization-cases.json)에 입력/14필드 전체출력/바라는 의미 차이를 분리한다. **DB-H02(문맥 scope), DB-H03(비요청 필드 보존 검증)은 OPTIONAL_FUTURE**이다. CURRENT_REPRODUCTION의 결정론적 oracle는 observedExpected이다. 이는 helper의 알려진 한계를 포함하며, desired/futureExpected와 D05a/b는 현재 성공 조건이 아니다. 모델의 의미 이해와 helper의 실제 출력은 서로 다른 평가 범위이다.

renderer 구조: `main#dashboard-root[data-dashboard=root] → header, kpis(4개), charts(distribution-panel+files-panel), findings`. root data attribute는 designFocus,density,accent,layout,distribution,theme,emphasis,chartSize,legend,motion,corners,fileVisualization,reviewTotal,chartPalette,activeDocument,activeFilter. 세부 selector는 validator와 reference CSS가 실행 가능한 계약이다.

### D05a. 현재 공용 파서와 OPTIONAL_FUTURE 변경 계약

**저장된 design/baseDesign을 읽는 호환 파서:** generation의14필드 required schema와 호환 read parser를 구분한다. read parser의 필수5필드는 `title,subtitle,accent,focus,density`. 생략 가능한9필드와 기본값은 `layout=balanced`, `distribution=doughnut`, `theme=dark`, `emphasis=balanced`, `chartSize=standard`, `legend=right`, `motion=full`, `corners=rounded`, `fileVisualization=cards`다. 따라서 예전7필드(title/subtitle/accent/focus/density/layout/distribution)뿐 아니라 필수5필드만 있는 객체도 허용한다. 생략은 undefined/키없음이며 null·빈문자열·잘못된enum은 기본값으로 숨기지 않고 거절한다. title/subtitle은 문자열이어야 하며 빈문자열은 허용 후 normalize에서기본문구; accent/focus/density 누락·extra key는거절한다. 공급자에게 보내는 generation schema는14필드전체를 요구하지만, host는 생성 응답과 baseDesign에 **동일한 호환 parser**를 사용한다. 따라서 새 모델 응답도 필수5필드만 있으면 host에서 허용되어9개기본값으로 채워진다. 생성 응답의14필드누락을 별도로 거절하는 검증은 현재 없다. legacy 사례의 실제 입력/출력과 오류 기대는 customization-cases의 `legacyParserCases`다.

DB-H02/03의 envelope/semantic judge 설계는 **OPTIONAL_FUTURE**이다. [보관본](../reviews/current-reproduction/dashboard-future-options.md)은 현재 구현 지시가 아니다. 위 공용 parser 이후 현재 경로는 D04의 applyDashboardPreferences→고정 renderer→동일 sandbox 검증으로 이어진다.

### D05-layout. 현재 레이아웃 — CURRENT_REPRODUCTION

기본 desktop root max-width1900px,height100dvh,min-height660px,padding24px28px,gap16px. grid rows `auto auto minmax(180px,.9fr) minmax(176px,1fr)`. charts columns `.88fr 1.35fr`. KPI4열 gap12px. 패널 radius16/small9; square는 둘다0. comfortable row9px18px, compact6px18px; file comfortable12px13px compact vertical8px; KPI15px18px compact vertical11px.

layout findings-first: findings row3/charts row4. charts-first: charts row2/KPI row3. files-first 또는 focus documents: files를 왼쪽(order-1), columns1.35fr/.88fr. emphasis charts: distribution order-2, columns1.3fr/1fr; row weights1.65/.7. chartSize large: min243px, weights1.35/.85; charts+large weights2/.65. findings emphasis weights .65/1.65. detail open이면 min220px/weights .55/1.85로 상세에 공간을 준다. fileVisualization bars는1열 strip, icon숨김, border-bottom, bar높이10px(기본5px), 두번째 줄에 bar/counts. legend right는 plot/legend columns1fr/.7fr(최소100px), bottom은 plot+3column legend, hidden은 legend만 숨기고 총계/aria-label 유지.

글꼴은 `Inter,Pretendard,'Malgun Gothic',Arial,sans-serif`, 외부 font를 로드하지 않는다. h1 clamp23px/2.25vw/35px, line-height1.15, letter-spacing-1.1px; subtitle11px/1.5; panel heading13px/1.4; KPI metric clamp30px/3.25vw/47px line1 weight720; file title12px/1.4, row12px, criterion10px/1.55, detail11px/1.75. 정확한 모든 수치는 reference CSS로 확인/이식한다.

### D05b. OPTIONAL_FUTURE 분리 위치

semantic judge, 승인 mask, notices, 변경된 호출 예산은 현재 구현에 없다. 상세 개선안은 [미래 대시보드 설계 보관본](../reviews/current-reproduction/dashboard-future-options.md)에만 남긴다. CURRENT_REPRODUCTION은 D04의 최대 3회 plan 호출과 현재 prompt/renderer를 사용한다.

### D05-breakpoints. 현재 반응형 — CURRENT_REPRODUCTION

breakpoints: width≤759px는 height auto/min100dvh, padding20px14px, root flex-column, KPI2열, charts1열, 판정 목록 max620px/min340px 내부스크롤, 원문 상세1열. 기본 plot270px, large350/charts330/둘다390px. legend bottom min310. files max340. 760..1099px는 좁은 columns/font/legend; width≥1500 & height≥800px는 padding30px40px/gap20px·폰트 확장. desktop height≤740px는 min620px/padding16px20px/gap12px로 줄인다. 모든 조합의 화면 전체가 무조건 무스크롤이라는 계약은 아니다: 지원 desktop 높이 이상에서 root 단계가 보이고 긴 file/findings만 내부스크롤, 작은 mobile은 페이지스크롤이다.

## D06. 차트 등록, palette, dataset

`Chart.register(ArcElement,BarElement,CategoryScale,LinearScale,RadialLinearScale,Tooltip,Legend)`를1회 호출한다. typed react-chartjs-2 components가 해당 DoughnutController/PieController/BarController/PolarAreaController를 등록한다; 별도 `chart.js/auto`를 혼합할 필요 없다. wrapper는 `{bar:Bar,pie:Pie,polarArea:PolarArea,doughnut:Doughnut}` mapping. unknown이면 Doughnut. WeakMap element→controller, ReactDOM createRoot; flushSync root.render. update 재사용; destroy cancel RAF→flushSync unmount→WeakMap.delete. render 뒤 연속2RAF 후 chart.reset/update로 ResizeObserver 첫 sizing이 entrance를 끊지 않게 한다.

options 공통: responsive:true,maintainAspectRatio:false,chart container size100% width/height, animation full `{duration:1100,easing:"easeOutQuart"}`, subtle240/easeOutQuad, none|OS reduced|host reduced meta는 false. wrapper fallback 애니메이션은900/easeOutQuart지만 정상 renderer가1100을 전달한다. plugin native legend display:false: legend right/bottom/hidden은 HTML legend다. tooltip background/text/border는 palette, borderWidth1,padding12,cornerRadius9(square0),displayColors true. label=` ${context.label} ${bar?parsed.x:polar?parsed.r:parsed}개`.

chart config는 labels `['적합','부적합','확인 필요']`, dataset 1개 data `[counts.pass,counts.fail,counts.review]`. doughnut cutout78%,pie0; bar indexAxis y, x beginAtZero integer precision0/grid palette.grid, y ticks palette.secondary/grid숨김; polar r beginAtZero/integer ticks/backdrop palette.panel/grid+angleLines palette.grid. borderColor palette.panel; borderWidth bar0/doughnut4/other2. borderRadius square0/rounded bar7/doughnut5/other0. hoverOffset none0/subtle2/full5. spacing doughnut1/other0; barThickness standard22/large32.

Palette named base: cobalt#3d6dff,lime#b7ed62,cyan#55d9ed,violet#aa8aff,red#f56377,rose#f68bc9,orange#ffac65,mint#70f3c4. 차트 3색은 선택 accent의 파생색이며 **판정 semantic badge 색과 다르다**. 간이 밝기 ΣRGB/255×[.2126,.7152,.0722]; light에서 >.58이면 #17334f 쪽으로 .43 mix, dark에서 <.35이면 white 쪽으로 .32 mix한 값이 visible이다. light charts=[visible,mix(visible,white,.38),mix(visible,#17243b,.4)]; dark=[visible,mix(visible,white,.48),mix(visible,#111318,.4)]. 각 channel Math.round. 정확한 알고리즘은 동봉 참조.

| token | dark | light |
|---|---|---|
|background/panel/surface|#111318/#1b2029/#202734|#f3f6fc/#ffffff/#f7f9fe|
|hover/detail/ink|#283448/#171d27/#eef2f8|#edf2fc/#f4f7fd/#17243b|
|muted/secondary|#9ba9be/#b8c6dc|#51617b/#394b67|
|border/grid/tooltip|#343d4d/#303a4b/#252f41|#d8e1ef/#e2e8f3/#ffffff|
|semantic pass/fail/review|#70f3c4/#ff8494/#f6cc7e|#187c5c/#c23751/#94610c|

zero status는0으로 남기고 가짜 wedge를 더하지 않는다. dataset 순서3개와 aria-label 숫자를 보존. 정상 생성은 total0을 거절한다. renderer 단위 검사는 empty상태도 처리하며 empty file에는 division 수행 안 함; 파일그룹 total0은 HTML 목록 제외. 많은 items는 선택파일/필터 결과100개부터 보여주며 `100개 더 보기`마다100 증가한다. 전체 counts에는 모든2000항목이 반영되어야 한다.

## D07. 선택, 상세, 원본 보안, standalone HTML

첫 파일은 exceptions focus이면 fail+review>0 첫 파일, 아니면 첫 파일. exceptions의 initial filter는 attention(비pass), 아니면all. sort priority exceptions fail0/review1/pass2; 나머지review0/fail1/pass2; 같은 status는 입력 index 안정 정렬. focus overview/documents는 파일 정렬 자체를 바꾸지 않는다.

파일/필터 변경은 상세 닫기+limit100. all/pass/fail/review 및 exceptions attention 버튼은 현재파일의 개수를 보여준다. finding button은 항목명/값+단위/요약기준/판정/화살표. 요약기준은 `\s*·\s*(?:단위|적용 범위|조건)\s*:` 첫 분리 앞부분만; 전체기준은 상세에 보존. row 클릭 즉시 같은 row 아래 상세를 append(모달 아님). 같은 row 재클릭 닫기. 상세 설명 없으면 `이 항목의 추가 설명이 기록되어 있지 않습니다.`, 기준없으면 `연결된 기준이 없습니다.`. evidence.page/sheet/cell 및값/단위/quote, humanNote 표시. `근거 접기` 또는 Escape 닫으며 원래 row focus 회복. 파일/필터 변경은 focus 강제 회복하지 않는다.

HTML은 `<!doctype html><html lang=ko>`, title `${design.title} · GSPEC`, UTF-8/viewport, inline CSS, exactly2script(embedded chart runtime+trusted interaction runtime). nonce는 randomBytes18→base64이며 양쪽 script/CSP 동일. CSP:

```text
default-src 'none'; script-src 'nonce-{nonce}'; script-src-attr 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'
```

HTML 문자열 escape `&<>"'`; embedded JSON `<>&U+2028U+2029`→Unicode escapes; chart bundle `</script`→`<\/script`, `<!--`→`<\!--`. 사용자가 입력한 document name/title/quote를 HTML나 script로 실행하지 않는다. 모델 출력은 schema로 제한된다.

bundle 재현: 동봉 `chart-entry.reference.jsx`를 build input으로 작성. esbuild `{bundle:true,minify:true,format:'iife',platform:'browser',target:['es2020'],define:{'process.env.NODE_ENV':'"production"'},legalComments:'inline'}`. output `server/assets/dashboard-chart-runtime.js`, app build 전에 실행. runtime source host readFileSync1회 cache. 현재 npm script `build:dashboard-charts`; prebuild가 호출하지만 새 초기화를 `npm run start`만 하는 경우 빌드 자산이 없을 수 있으므로 반드시 먼저 생성한다. CDN/외부font/network 없어야 offline file://에서도 chart/filter/detail이 작동한다.

host iframe은 `sandbox="allow-scripts"`, referrerPolicy no-referrer, srcDoc. allow-same-origin 없음. host만 삽입하는 bridge는 첫 script nonce와 CSP nonce 일치/targetOrigin가 `^https?://[^/]+$`일 때 추가. channel=`trace-dashboard-evidence-v1`, randomUUID token, known itemIds allowlist(각 id의 문자열 길이1..200; 항목 개수200이라는 뜻이 아님). trusted click 또는 keydown Enter/space의 `[data-review-source]`만 parent.postMessage `{channel,type:'select-item',token,itemId}`를 정확 targetOrigin으로 보낸다. parent 수신은 event.source===해당 iframe.contentWindow, event.origin==='null', channel/type/token 및 item membership 모두 확인. document bytes/URL을 iframe에 넣거나 임의 navigation capability를 주지 않는다.

wire에 runId는 없다. 성공 preview마다 생성한 random token은 해당 preview의 frozen sourceSnapshot과 묶이고, listener는 그 preview token/knownItemIds/current frame을 closure로 사용한다. preview 교체/모달 unmount 때 이전 listener를 제거한다. 이전 iframe, 이전 token, 다른 origin, 다른 channel/type, 없는 itemId는 각각 거절한다. 같은 runId라는 이유만으로 메시지를 허용하지 않는다.

`원본 보기` 버튼은 기본 standalone에서 display:none. bridge가 html.dataset.traceSourceAvailable=true를 세운 앱 미리보기에서만 보인다. 유효 message 수신 즉시 원본과 판정 탭 전환/선택item 갱신/다음 RAF focus. 다운로드는 **bridge 삽입 전 motionHtml** Blob(text/html;charset=utf-8), filename `gspec-dashboard-${runId에서[a-zA-Z0-9_-]만남긴앞16}.html`; click후1s objectURL revoke. 원본파일/원본viewer/bridge token은 export에 포함하지 않는다. 검토요약/짧은 quote는 포함한다.

## D08. 검증 보고서와 거짓 완료 방지

validator cwd에 dashboard.html,data.json,plan.json을 쓴다. `node architecture/validation/dashboard-dom-validator.cjs` 실행은 **cwd가 fixture output directory**일 때 수행한다(절대경로로 script 실행 가능). 각 input size>0/HTML와data≤12MiB, plan≤16000. 이 상한은 host HTML문자수8000000과 다른 단계의 검사다.

report `{version:1,ok:true,engine:'node-dom',visualBrowser:false,checks:{input,syntax,csp,offline,kpis,charts,files,findings,filters,details,escaping},diagnostics:[],totals:{total,pass,fail,review},files}`; checks11개 모두 true, totals는 **현재 snapshot 재계산과 정확 일치**, files는 item.documentId unique count. report 문자열 비어있음/>32000/JSON불가/diagnostics한개라도 있으면 실패. unique nonempty item.id, allowed status, documentId string 필수.

검사기는 jsdom outside-only/pretendToBeVisual; chart bundle를 vm.Script syntax만 검사한다. 실제 dashboard interaction script를 vm timeout2000으로 실행하면서 TraceCharts adapter로 실제 config를 캡처한다. fetch/XMLHttpRequest/WebSocket/EventSource/Worker/sendBeacon/open 호출을 오류로 처리한다. root1개, 정확2scripts, nonce CSP, 외부리소스/inline event/stylesheet url 없음, 4KPIs, chart type/count/palette/options, 파일 선택/필터/100개확장/행label·값·기준·status/상세 펼침·닫기·escaping 등을 확인한다. stdout 성공표시만으로 통과시키지 않는다.

실제 Canvas, ResizeObserver, 오프라인 Chromium, 화면 겹침, 대비, 애니메이션은 jsdom으로 증명되지 않는다. 브라우저에서4distribution×dark/light×none/full, 대표composed designs, many/empty statuses, 1600×900/1440×900/1280×720/390×844, keyboard+OS reduced, malicious strings를 별도로 검증한다. `TraceCharts.inspect(host)`는 `{type,labels,datasets:[{label,data}],animated,cutout,colors}`를 반환하여 canvas동작 증거를 제공한다. HTML SHA 및 snapshot SHA를 evidence에 남긴다. DOM validator는 본 패키지 검증 도구지만 원래 모든 historical tests 통과를 주장하지 않는다.

## D09. modal lifecycle, lazy loading, 모션

대시보드 생성은 검토 본체 workflow와 달리 현재 구현에서 native `<dialog>.showModal()`이다. 내부 생성작업은 panel/inline SandboxActivityDock이고 또다른 popup이 아니다. 원래 workflow page requirement를 대시보드dialog 금지로 오해하지 않는다.

dialog mount 즉시 작은 shell; 260ms timer 뒤 contentReady→HTML 문자열 처리/iframe. dashboard shell Motion initial opacity0,y14,scale.985→1,0,1 duration.24 easeOut; **앱 motion OFF**면 initial=false. shell은 useAppReducedMotion만 사용하며 OS reduced를 별도로 OR하지 않는 baseline이다. DashboardEvidence React.lazy는 원본탭 첫 사용에만 import. ChartPreview memo를 써 타이핑/상태 갱신으로 iframe reload 금지. chart탭 한 번 mount된 뒤 source탭 전환하면 hidden상태로 남겨 파일/필터 상태 유지; 처음부터 숨긴 chart는 mount하지 않는다. 생성 중에는 preview DOM 대신작업 panel만 표시하고 mountedChartId reset. `숨긴 chart 0` 검증은 새로 숨겨진 iframe을 초기화하지 않음/모달 닫힌 뒤 iframe0이라는 뜻이며 이미 본 iframe을 source탭 동안 유지하는 것과 모순되지 않는다.

preview cache는 runId별 Map, 성공시 현재 key 지우고 맨뒤 set, >5면 oldest삭제. HMR dispose data에 보존, 새브라우저/서버 재시작의 영속 저장은 아니다. cached preview 열면 구성sidebar closed; sourceSnapshot이 없으면 원본버튼 disabled/다시구성 안내. 생성 ready→builder/logs닫기, resultView charts. 실제 마지막 handoff animation이 남아있으면 finishingPresentation최대1600ms; 종료 callback 또는 `결과 보기`로 즉시종료. 완료후 logs는 `작업 과정 보기` 접힌버튼으로 남는다. 중지 시 `생성을 취소했어요. 원하는 구성을 적고 다시 시작할 수 있어요.`.

상태로그 원문은 서버실행 이벤트만. terminal scroll bottom에서36px미만일 때만 follow latest; 사용자가 위로보면 강제스크롤 금지. running monitor icon은 busy && latest non-info.status===running때 opacity[1,.5,1],1.7s easeInOut Infinity, reduced는정지. task activity beam/queue는 공통 activity 명세의 실제 observed handoff만 사용한다.

standalone motion full: KPI reveal450ms ease opacity0/y5→1/y0; KPI2/3/4 delay60/120/180ms. detail reveal240ms ease. legend fill900ms cubic-bezier(.2,.7,.2,1), file-segment1000ms same, scaleX0→1 left origin. file border/background/transform180ms; row background160ms; arrow180ms0→180deg. subtle: all CSS duration180ms delay0,transition120ms; KPI/detail opacity.6→1 fade only; bar-grow off. none all animations/transitions off. OS prefers-reduced-motion suppresses CSS and chart regardless model request. host app motion OFF inserts reduced meta+CSS even into download. Older cached preview without design uses host entrance fallback320ms KPIs stagger45/90/135, charts420ms delay120/190; modern plan must use own motion values.

Unmount clears content/poll/presentation timers, aborts GET, DELETEs activejob, removes message listener and dialog.close. Chart wrapper cancels pending frame and unmounts React root. Current design has no measured universal FPS budget. OPTIONAL_FUTURE only (not a CURRENT_REPRODUCTION gate): the proposed target is frame work p95≤16.7ms on stated QA machine for ordinary≤200items, no hidden duplicate PDF init, no task timer afterclose, >200items must keep button response≤150ms with recorded hardware/browser/version. Do not call these targets historical measured facts.

### D09a. 요청 입력과 실제 적용 상태표

정확한 defaultInstruction과 네 버튼의 label/full payload는 [dashboard-interaction-cases.json](../ui/dashboard-interaction-cases.json)의 `defaultInstruction`/`suggestions`가 단일 기준이다. 첫 입력은 `라이트 테마에 도넛 차트를 크게 배치하고 차트를 강조해 주세요. 파일별 결과를 비교하고, 파일을 선택하면 항목·측정값·기준·판정과 확인이 필요한 이유를 볼 수 있게 해 주세요.`다. 버튼은 `라이트 · 큰 도넛`, `다크 · 차트 중심`, `촘촘한 파일 비교`, `확인할 항목 먼저`. 클릭은 textarea **전체 교체**, 자동 생성 없음, busy일 때 disabled. selected style은 전체 문자열이 preset과 정확히 같은지 비교한다. 요청은 trim하고1500 UTF-16자로 제한한다. baseDesign은 버튼 클릭 때가 아니라 generate 실행 시 최신 preview.job.design이 있을 때만 함께 보낸다. input 변경이 기존 적용 tag/preview를 바꾸지 않는다.

`showingWorkroom = busy || finishingPresentation`. `job`은 새 실행 상태이고 `preview`는 마지막 성공이다. 두 상태를 합쳐 예전 성공 화면을 잃으면 안 된다.

| 사건 | busy / finishing | builder / logs | 보이는 내용·선택 |
|---|---|---|---|
| cache 없는 첫 mount | false/false | true/false | 입력, empty art; chart 기본 탭, source 미선택 |
| cache 있는 mount | false/false | false/false | 260ms 후 기존 preview; chart 기본 탭; iframe 내부 선택은 새 mount 기본값 |
| generate 시작, POST 전 | true/false | true/true 값은 유지되나 sidebar 숨김 | preview 보존, job=null, error/notice 초기화, activityContextId=null; workroom만 표시 |
| POST id 도착 | true/false | true/true | job queued, contextId=job.id; 실제 동일 job activity만 연결 |
| generating/building/repairing | true/false | true/true | message 표시, 취소 버튼; charts/source DOM unmount |
| ready+nonblank HTML | false/전달 중이면 true | false/false | 새 preview/cache 저장, selectedSourceItemId=null, charts 선택; finishing은 최대1600ms후 해제 |
| ready+HTML 누락/공백 | false/false | true/true | error `생성된 화면이 비어 있어요. 다시 구성해 주세요.`; job은 ready 그대로, old preview/cache 보존; 자동 DELETE/자동 재생성 없음 |
| failed 응답 | false/false | true/true | error 우선 next.error→next.message→기본문구; old preview 보존 |
| 세 번째 연속 GET 오류 | false/false | true/true | 해당job DELETE best effort, error 표시, old preview 보존; timer 종료 |
| 생성 취소 | false/false | 현재값 유지(보통 true/true) | sequence 증가/GET abort/timer 정리/DELETE; error 비움, 취소 notice; job을 임의 failed로 바꾸지 않음; old preview 복귀 |
| 결과 보기 또는 presentation drain | false/false | false/false | 새 preview 표시; contextId=null |
| 구성 수정/접기 | false/false | toggle/현재값 | preview 유지; iframe을 입력 변경만으로 reload하지 않음 |

적용 tag는 오직 `preview.job.presentation !== standard && preview.job.design`에서 계산하며 생성 중과 source탭에는 숨긴다. 순서는 theme(`라이트/다크`), distribution(`도넛/파이/막대/극좌표`), emphasis(`차트 강조/검토 항목 강조`; balanced이면 layout 이름), detail 하나다. layout 이름은 `균형 구성/파일 먼저/검토 항목 먼저/차트 먼저`. detail 우선순위: chartSize large `큰 차트` → fileVisualization bars `파일 막대 비교` → motion none `애니메이션 없음` → legend hidden `범례 숨김` → legend bottom `아래쪽 범례` → corners square `각진 모서리` → motion subtle `잔잔한 움직임`. 여러 조건이 있어도 첫 하나만 표시한다. standard fallback은 적용tag를 숨기고 제한 안내를 표시한다.

재열기 cache는 HTML/job/frozen sourceSnapshot/token만 보존한다. iframe browsing context와 source component 로컬 filter/referenceIndex는 저장하지 않는다. 열린 modal 내 charts→source→charts는 이미 본 iframe을 유지하지만 source 컴포넌트는 source 탭을 나가면 unmount된다. host selectedSourceItemId/selectionVersion은 modal 생명주기 동안 유지되어 source 재진입 시 선택 항목의 preferred evidence를 다시 정한다. 이 차이는 `modalCases`의8개 oracle로 검증한다. 네트워크 응답은 해당sequence/alive가 유효할 때만 적용하며 늦은 POST id는 삭제한다.

## D10. 기본 결과 시각화와 원본 탭

### D10a. 원본 탭 상태·배치·관찰 지점

다음의 상태 전이는 **원본 탭** 계약이다. standalone HTML의 row/filter 계약(D07)과 혼동하지 않는다. source 탭은 `data-review-document-id`, `data-source-document-id`, `data-selected-item-id`, `data-status-filter`, `data-selected-evidence-index`로 관찰한다. null은 attribute 생략이다.

| 사용자 입력 | review file | source document | selected item / reference | filter |
|---|---|---|---|---|
| 처음 진입 | 첫 target/item-owned file | 그 파일 | 없음/null | all |
| parent item 선택 또는 같은item+selectionVersion 증가 | item.documentId | known 같은파일 evidence→known target→known doc→item 자체 known doc 순 | 선택item; preferred evidence index, unknown밖에 없으면 index0, evidence없으면 null | 기존filter가 item status를 숨기면all; 아니면유지 |
| file tab 클릭 | 클릭file | known file면file, 아니면null | parent selectedItemId는 지우지 않음; 다른file이므로 detail은null. 같은file이면 기존selected 유지. reference=null | all |
| source dropdown: 다른 reviewed target | 그 target(file select와 같음) | 그 target | 위 file tab 규칙 | all |
| source dropdown: criteria/현재target/기타 | 유지 | 선택doc | 유지; 선택item evidence에서 doc 일치 첫 index, 없으면null | 유지 |
| evidence 버튼 클릭 | 유지 | doc이known일때만그doc, unknown이면기존source유지 | index는클릭값 | 유지 |
| statusfilter 클릭 | 유지 | 유지 | **기존 detail을 지우지 않음**, map만필터링 | 같은status면all, 다르면그status |

파일 건수는 item.documentId에만 귀속한다. 같은 label이라도 item.id가다르면선택을분리한다. criteria를인용해도 criteria file tab/건수를추가하지않는다(단,실제item.documentId이면별도). highlight집합은 active source에연결된 **모든 items**, 필터/선택과독립이다. 현재 누락 projection 한계(D02)와 형식별 anchor 한계는 별도로 적용한다. 두파일 같은label/교차근거/반복선택/필터/원본변경의 정확한11단계입력·data-* 기대값은 `sourceFixture`/`sourceTrace`를 사용한다.

배치는 width100%/height100%, min-width/min-height0, overflow:hidden인 3행grid(파일tab/overview/body)다. 파일tab height56,max56px,tab min175/max260,height39. overview49px(파일tab있음). body desktop columns `minmax(0,3fr) minmax(280px,2fr)`,gap/padding10px. source는flexcolumn/overflowhidden,header min37px; DocumentPreview compact=true, stage=complete. viewer heightauto!important,min0,maxnone,PDF/image/textpadding14,textarea-paper20px,font12/line1.9,tablefont11,원문 evidence strip숨김,warning/truncated max45px 내부scroll. map max-height31%,min82; inspector는남은높이flex1. map/inspector-scroll/source viewport는 **각각 독립 스크롤**, parent overflow로 잘라내지 않는다.

width≤1000: source/right `3fr:minmax(265px,2fr)`,bodygap/padding8,source-count숨김. width≤760: body1열,rows `minmax(250px,1fr) minmax(260px,1fr)`와body overflowauto; results 내부는 `minmax(90px,.7fr) minmax(0,2.3fr)`;map max제거/height100%;sourceheader33px;filetab53px,tabmin155/max225,height37. desktop height≤760,width≥761:tab52px/height37,overview43,mini donut40px(scale.833333),bodygap/padding8. source/inspector entrance app OR OS reduced로 정지한다.

최종색은 lazy dashboard-evidence.css의옛teal값이아니라 higher-specificity `.dashboard-modal.dashboard-modal ...`다: bg#111318,panel#1b2029,line#343d4d,ink#eff3ff,muted#a0abc1; sourceheader#222936; selectedfile bg#3d6dff1a/border#6589ff70/inset underline#6589ff; pass#70f3c4/fail#ff8f91/review#ffd080. 모든최종selector값/순서는 UI style catalog를 따른다.

### D10b. 집계와 차트 모션

ResultsVisuals uses four raw statuses `pass,fail,review,pending` rather than snapshot's pending→review. Colors #70f3c4/#ff8f91/#ffd080/#a0abc1. KPI documents counts target docs plus any item.documentId; completed=pass+fail+review; attention=fail+review. Count Motion0→value .65s [.22,1,.36,1], unmount animation.stop; screenreader immediately reads true number via visually-hidden, animatedtext aria-hidden. section enter y10/opacity0→0/1 .5s easing same; delays header0,KPI.04,donut.08,filechart.12,itempanel.16.

Recharts main Pie: responsive100%,innerRadius68%,outer90%,start90/end-270,paddingAngle4 if>1slice,stroke none,cornerRadius5, animation850 ease-out disabled reduced/empty. nonzero statuses only. empty fallback1 slice#263943 visually decorative, center0, tooltip absent. slice click toggles status filter; others opacity.26. File BarChart vertical, height max(104,files×37+22), margins top4/right12/bottom0/left0,barSize14, stacked statuses radius2,animation800ms ease-out,reducedoff. X number no decimals, Y name width105/shorten13, full label tooltip; nonactive series opacity.23. Charts are overview and do not silently omit pending.

ResultTile Motion position layout and AnimatePresence popLayout; enter/exit opacity0 scale.96→1 .3s, stagger min(index,8)×.022; hover y-2,tap.98; exiting elements pointerEventsnone/disabled/tabIndex-1/aria-hidden. Click closes tooltip and selects item in main original+evidence view. Tooltip fixed portal left clamp12..windowWidth-292 and top below when tile.top<220; transitionopacity.12, scroll hides. Chart DOM is not the source of verdict truth.

DashboardEvidence file scope is item.documentId only: citing criteria document does not duplicate counts. tabs start all target docs plus item-owned IDs. raw component 입력의 pending maps review but title says `확인 필요 · 미완료` and pendingcount tooltip; **실제 ready projection은 D02대로 pending을 이미 review로 변환한다**. 48×48 Recharts mini donut inner14/outer21,start90/end-270,padding3 if>1,corner2,animation700 ease-out disabledreduced/empty; empty1slice#343d4d decorative. selectedstatus dimothers.25. Entries use accessible buttons/names.

Selection synchronizes file and source: preferred evidence same document as reviewed item, else first target evidence, else any known doc, else first unknown or none. selected filters reset toall if they would hide item. Each new click increments selectionVersion so repeated same item resets source selection properly. highlights derive **all source-linked items**, independent of selected item/statusfilter; highlight fabrication prohibition inherits source preview contract. No evidence→no arbitrary source highlight. Evidence chooser can select cross-file/criteria evidence; review file counts remain original file. item map entrance opacity0/scale.75→1 .22s,ease[.22,1,.36,1], delaymin(index,20)×.008, hovery-2/tap.92. source panels entranceopacity0/y6→1/0 .32s, delays overview0/source.05/map.09. Clicking a different item immediately replaces detail; avoid exit-before-enter lag. Original tab is read-only snapshot visualization; human editing remains main review workflow.

## D11. 완료 acceptance

1. 합성 fixture POST는 202. 현재 snapshot 검증 보고서와 HTML 일치 검사를 거친 경우만 `ready/generated`; provider/validator 오류 주입은 정직하게 `ready/standard`; 취소는 fallback 없음.
2. 4 distribution × 2 theme의 실제 inspect counts가 정확히 일치. cutout 0/78%, 수평 bar, polar r scale 확인. 범례 위치와 accent 변경이 실제 표시되며 판정 숫자는 불변.
3. [customization cases](../contracts/dashboard-customization-cases.json)의 baseline 14필드 결과와 semantic hardening 결과를 구분한다. 성공 경로 baseDesign 보존은 모델 준수에 의존하며 host가 비요청 필드를 보존하도록 merge하지 않는다. baseDesignCase의 observedSuccessfulExpected와 observedFallbackExpected를 각각 검사한다. DB-H03는 현재 gate가 아니다. 결정적인 fallback 보존 및 현재 인식하는 부정/정정/복합 요청은 baseline 회귀로 검증한다.
4. 파일 간 인용이 건수를 늘리지 않음. 100개 이상 목록을 끝까지 로드 가능. 파일/상태/상세/ESC/버튼 focus 동작. 현재 source selector가 보호하는 빈 출처/누락문자열과 D02의 missing flag 손실 경로를 분리하여 검사한다. DB-H01의 필드 보존 개선을 현재 구현 사실로 가정하지 않는다.
5. 저장 HTML은 embedded script 2개, 외부 요청 0으로 offline 동작. 원본 viewer/bridge/secret 없음. 공격 문자열을 이름/quote에 넣어도 escaping 유지. 짧은 evidence quote 포함 사실을 문서화.
6. 실제 canvas/브라우저 시각 QA와 jsdom 결과를 분리하여 증거화. layout/reduced motion/unmount/lazy 제약 검증. fixture screenshot을 실제 모델 실행 완료의 증거라고 부르지 않음.

7. [18개 browserMatrix](../contracts/dashboard-customization-cases.json)는 case마다 완전한14필드 plan, snapshot, viewport, OS 설정, canvas type/count/cutout/palette, body/panel/ink 색, legend 실제 배치, 크기·반응형·detail·export 검사를 명시한다. DB-V01..08은4차트×2theme,09..18은 독립설정 조합/작은화면/OS reduced다. DB-V01과18은 **1600×900 실제 viewport**로 실행하여 width≥1500 AND height≥800 분기를 검사한다. 두 case의 root padding30px40px/gap20px, panel-heading padding20px24px0/font15px, file-list padding16px20px20px/gap12px, file-card padding16px/title14px/count11px, file-bar7px, distribution padding16px28px22px/gap24px, legend label13px/count29px를 computed style로 검증한다. DB-V01은full motion, DB-V18은OS reduced로standalone CSS animation과Chart.js animation이모두꺼져야한다. 이 검사는 iframe/export HTML 범위이며 host modal shell의 app-only motion 범위(D09)를 OS reduced로 바꿨다고 해석하지 않는다. DB-V13/14는1280×720, DB-V15/16은390×844이며 나머지1440×900도유지한다. 1440px캡처로1600px분기검증을대체하지않는다. bar/polarArea의 inspect.cutout은null, pie는0,doughnut은78%다. body의배경색을검사하고 transparent root를실패로보지않는다. source package만으로브라우저실행을완료했다고할수없으므로 상태는 **NOT_RUN/evidence:null**이며 실행후별도증거파일에 브라우저버전/viewport/DOM/canvas/스크린샷/실패진단을기록한다. 예전18번의부분확인기록을 이새matrix의통과증거로대체하지않는다.

## D12. 자료구조·알고리즘·비동기 효율 계약

기호: I=검토항목(최대2000), D=문서수, E=보존근거수(항목당최대30), F=검토파일수, H=HTML문자수(1,000..8,000,000), K=표시목록limit(100부터100씩증가). 아래 비용은 현재 소스의 실제 구조이며 `async`가 CPU 병렬화를 뜻하지 않는다.

| 단계 | 현재 구조/시간/메모리 | 유지할 순서·경계 |
|---|---|---|
| snapshot | allowlist 객체/배열, documentName은 item마다 documents.find이므로 O(I×D+E), freeze는객체크기에선형 | 원래item순서,문서순서,처음30근거;문자수절단;비밀/원본bytes불포함 |
| 수치그룹 | composite key의 Map, O(I)기본순회와문자열검사; 최대12그룹×100값을결과에보유 | criterionId+label+unit+trim기준 동일,각그룹2개이상;이데이터를임의trend로변환금지 |
| server job | insertion-ordered Map, active single job id, job별AbortController; terminalprune는O(job수) | 서로다른run도1생성;최대3모델시도공유,로그마지막80개;오래된terminal1개제거 |
| client preview cache | runId Map,성공key delete/set으로recent순서,5개초과시oldest삭제 | cache는DOM이아님;HTML/고정데이터/token만;새탭세션영속저장아님 |
| 원본파일 집계 | docMap Map O(D), fileId Set O(D+I), file마다items.filter라O(F×I) | target순서+처음등장item문서순서;인용기준서는건수중복없음 |
| source 선택/표시 | knownItemIds Set 평균O(1),requestedItem find O(I),memoizedfile/filter/highlight 배열 | input객체identity변경시에만memo재계산;selectionVersion 반복선택허용;id와label혼동금지 |
| standalone | 고정3개status데이터,파일별그룹/안정status정렬,선택파일filter 후처음K개DOM | 전체counts는I전체;DOM100개씩;세부텍스트escape;실제없는wedge/항목생성금지 |
| chart instance | WeakMap<Element,controller>,React root당canvas1,RAF취소handle | update는reuse,destroy시RAF취소+unmount+delete;source탭동안이미본iframe만유지 |

비동기 순서는 plan await→sandbox create await→고정files write await→install await→[HTML render 동기→write await→validate command await→report read await→sameHTML read await→실패시 plan await]다. 모델과 검증은 데이터 의존성이 있으므로 같은 job의 두모델호출/두검증을병렬로돌리지않는다. repair는 같은sandbox/files/data를 재사용하며설치1회; 새사용자요청은새job/새sandbox. poll은 setInterval이아닌 **GET완료뒤 setTimeout1200**이므로 동일modal의GET중첩없음. fetchAbort,aliveRef,sequenceRef,busyRef는취소·닫기·재요청race를차단하는각각의역할을가진다. 요청중sequence가바뀌면 late결과를버리고latePOST id만DELETE한다.

대형 HTML생성/JSON.parse/stringify/clone/freeze는현재호스트동기CPU작업이다. 중간마다AbortSignal을확인하는worker구조가아니므로 이미실행중인동기함수의즉시취소를보장하지않는다. 260msgate는초기shell렌더와HTMLparse시작을분리하는기법이며전체비용을제거하지않는다. H규모HTML원본/motionHtml/bridgeHtml/iframeDOM이동시에존재할수있어실제메모리는문자열1개크기보다크다. 캐시5개가바이트상한이라는주장도하지않는다.

미래최적화는 docMap/itemByDocument/precomputedsourceIndex로O(I×D),O(F×I)를O(D+I+E)로줄이거나byte-aware cache/worker를도입할수있다. 이것을현재구현이라고설명하지않는다. 채택시스냅샷순서/first30/fallback/selection11단계/iframelife8단계/18시각case가동일해야하고,동일fixture/브라우저/기계에서baseline과p50/p95입력응답·longtask·heap을비교한다. D09의성능목표는OPTIONAL_FUTURE이며현재동등성gate가아니다. 알고리즘/자료구조를변경해빨라졌다는주장을측정없이통과시키지않는다.

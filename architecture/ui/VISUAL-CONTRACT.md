# 정밀 시각 재현 계약

이 부록은 **같은 화면·색·글꼴·간격·선·그림자·벡터·움직임을 재구축**하기 위한 선언형 설계 자산의 사용법이다. 비슷한 다크 테마를 새로 디자인하는 요구가 아니다. 원본 애플리케이션의 구현 파일은 재구축 시 필요하지 않다. 제공된 JSON, 폰트, 합성 fixture와 PNG/DOM 참조로 자신의 컴포넌트와 상태 연결을 구현한다. 생성된 CSS를 사용해도 앱의 상태·API·승인·근거 연결·오류 처리는 별도로 구현해야 한다.

## 1. 정본과 충돌 해결

| 정보 | 정본 | 적용 방식 |
| --- | --- | --- |
| 상태·행동·모션 트리거·큐·수명주기 | [04-ui-motion.md](../specs/04-ui-motion.md), [detail-controls.md](detail-controls.md), [상태·API](../specs/01-state-api.md) | 실제 상태가 화면을 결정한다. 애니메이션의 진행도를 업무 상태로 사용하지 않는다. |
| 모든 활성 CSS의 선언·선택자·중첩·순서 | [style-catalog.json](style-catalog.json) | 아래 cascade 모델과 실제 렌더 조건으로 브라우저가 계산한 값이 최종 스타일이다. |
| JSX inline 스타일·Motion·SVG·차트 속성·아이콘 소유권 | [component-style-map.json](component-style-map.json) | `sourceId`, node ID, owner, tag, 클래스, 조건, 순수 값 recipe를 대응시킨다. 표현식을 임의로 `eval`하지 않는다. |
| 고정 상태의 관측 결과 | [reference/README.md](reference/README.md), 배포된 `reference/manifest.json`과 `reference/measurements.json`, 각 PNG | manifest에 존재하고 측정된 상태만 baseline이다. 캡처 조건이 다르면 먼저 조건을 맞춘다. |
| 폰트 바이트·font-face 범위 | [fonts/fonts.css](fonts/fonts.css), [fonts/manifest.json](fonts/manifest.json) | 폰트 manifest의 파일·해시와 라이선스를 보존한다. |
| 요약 토큰·기존 모션 색인 | [tokens.json](tokens.json), [motion-catalog.json](motion-catalog.json) | 탐색용 요약이다. 전체 CSS·inline 스타일을 이 요약으로 대체하지 않는다. |

같은 선언에 대한 문서 요약과 전체 카탈로그가 다르면 **전체 카탈로그의 정확한 값**을 사용한다. 렌더된 결과가 예상과 다르면 먼저 CSS 로드 순서, 상위 클래스, pseudo state, media, inline 값, 폰트와 데이터 조건을 조사한다. PNG에서 색을 눈대중으로 추출해 정상 선언을 덮어쓰지 않는다. 관측 오류나 의도적 개선은 화면 ID·조건·차이·결정 이유를 evidence에 남긴다.

이번 부록에서 확인하고 명시적으로 해결한 충돌은 다음과 같다.

1. native module/row entrance의 확정값은 `motion-module-arrive`의 **translateY(8px)**와 `motion-row-arrive`의 **translateY(4px)**다. 현재 `04-ui-motion.md`, `motion-catalog.json`, 전체 스타일 카탈로그가 이 값으로 일치한다. 이는 LandingIntro의 y16, ResultsVisuals의 y10, DashboardEvidence의 y6 진입과 별개다.
2. 기존 모션 카탈로그의 50개 keyframe/148개 규칙은 전체 활성 스타일 목록이 아니다. 전체 스타일 카탈로그는 부모 문서 CSS의 **67개 keyframe 선언/66개 이름**, iframe 전용 **3개 keyframe 선언**을 보존한다. `stage-glow`는 `styles.css`와 뒤의 `cinematic.css`에 중복 정의되며 덮어쓰기 순서를 유지한다.
3. 전역 main import 10개 앞에 eager 컴포넌트의 CSS 5개가 평가된다. React.lazy 문자열만으로 모든 컴포넌트 CSS를 마지막에 묶지 않는다. `DashboardModal → DashboardEvidence`의 중첩 lazy 경계도 포함한다.
4. `04-ui-motion.md`의 “최종 토큰으로 단일 테마” 허용은 요약 토큰만으로 미세 색·치수를 생략해도 된다는 뜻이 아니다. 단일 stylesheet로 재작성하려면 아래 모든 reference 상태와 조건에서 동일한 computed style을 입증해야 한다. 선언형 CSS 생성 경로가 기본이다.
5. `04-ui-motion.md`의 외부 폰트 부재 한계는 폰트를 준비하지 않았을 때의 조건이다. 이 패키지는 별도 폰트 CSS·WOFF2·manifest를 제공한다. 같은 자산을 로드하고 실제 font readiness를 확인한다. 플랫폼 간 rasterization이 같아진다는 보장은 아니다.

## 2. 전달 범위와 스키마

현재 snapshot은 `src/main.tsx`의 runtime import graph를 TypeScript AST로 따라가서 수집했다. type-only import는 실행 그래프에서 제외하고 local dynamic import를 포함한다. 파일명 glob으로 테마를 추측하지 않는다. 원본 경로와 SHA-256은 작성 시 출처이며 재구축의 파일 배치 요구가 아니다.

| 범위 | 수량 | 의미 |
| --- | ---: | --- |
| 도달 가능한 runtime 모듈 | 38 | 외부 라이브러리의 소스 자체는 포함하지 않는다. |
| JSX 소스 / visual node | 22 / 2,353 | tag·상위 node·class·visual attribute·반복·조건의 설계 지도다. 전체 TSX를 복사한 것이 아니다. |
| 순수 값 recipe | 142 | 팔레트, SVG 경로·좌표, default transition, 진입 helper, 시각식의 선언값이다. |
| 부모 문서 CSS asset | 26 | 이 안의 모든 선언을 보존한다. 현재 DOM에 매칭되지 않는 선택자도 임의 삭제하지 않는다. |
| iframe 전용 CSS | 2 | `previewReducedMotionCss`, `previewMotionCss`의 별도 scope다. |
| rule / declaration / at-rule | 5,942 / 17,366 / 167 | keyframe 내부 rule/선언도 포함한다. CSS 중요 선언은 150개다. |
| 초기 CSS / dynamic 경계 | 15 / 10 | 같은 파일을 공유하는 경계가 있으므로 15+10을 파일 수로 해석하지 않는다. |

`style-catalog.json.sources`의 배열은 검색하기 편하도록 정렬되어 있으며 cascade 순서가 아니다. 각 source는 `id`, `sourcePath`, `outputPath`, `scope`, 원본 `sha256`, `semanticSha256`, `generatedCssSha256`, ordered `rules`를 갖는다. CSS가 TSX template에서 나온 경우 template 이름·시작 줄·부모 소스 해시·적용 조건을 추가한다.

각 노드는 다음 방식으로 보존된다.

- `rule`: `selector`를 그대로 보존하고 `children`을 순서대로 적용한다. 쉼표 선택자·복합 선택자·`:is`·`:where`·`:has`·pseudo-element·속성 선택자를 단순 class로 바꾸지 않는다.
- `declaration`: `property`, `value`, 선택적 `exactValue`, `important`, 선택적 `importantSyntax`. 같은 속성이 반복되어도 배열 항목을 유지한다. shorthand/longhand 순서를 바꾸지 않는다.
- `at-rule`: `name`, `parameters`, 선택적 ordered `children`. `@media`와 `@keyframes` 중첩, block 없는 `@import`, 사용자 속성, vendor 선언을 유지한다.
- `id`, `order`, `line`, `endLine`: source별 stable lookup과 출처다. source 편집 후에는 새 hash와 ID 대응을 검토한다. template CSS 내부 줄 번호는 template 상대값이며 `templateStartLine`이 TSX 위치다.

RGBA/8자리 hex alpha, gradient의 모든 stop·각도·위치, 다중 그림자 순서, blur/drop-shadow, opacity, border 폭·색·스타일, radius, transform-origin, overflow, z-index, font stack·weight·line-height·letter-spacing, padding/margin/gap, `calc/min/max/clamp`, 반응형 조건, transition property·easing·duration·delay, animation direction/fill/play-state까지 **원문 값**을 보존한다. CSS 단위가 생략된 숫자와 `px`, `%`, `rem`, `dvh`, `s`, `ms`를 임의 통일하지 않는다. 읽기 좋게 표현한 공백과 독립 주석은 정본 값에 포함하지 않는다.

`component-style-map.json`의 `candidateRuleIds`는 검색용 클래스 토큰 매칭이다. 완전한 CSS selector 엔진이 아니며 cascade 결과도 아니다. `staticTokens`가 비었더라도 class template에 동적 클래스가 있을 수 있다. `literalCandidates`의 `stage-`, `row-`, `is-` 같은 조각은 완성된 클래스가 아니다. `expression`, `renderConditions`, `repetitions`와 상태 계약으로 조합하고 브라우저에서 확인한다. 전역 `button`, `body`, `svg`, 상위 선택자와 pseudo 규칙은 candidate 목록에 없어도 적용된다.

`selector-state-or-lifecycle`은 `hidden/disabled/checked/selected/open`, ARIA 상태, tabIndex와 React key를 기록한다. 숨겨진 패널을 mount 목록만 보고 표시하거나 disabled 스타일을 빠뜨리지 않는다. `visual-component-property`에는 preview/reduced/gradient/reread/verify/complete/kind/phase/status 같은 시각 helper 인자가 포함된다. 하위 SVG 장면에 같은 인자와 기본값을 전달해야 같은 그림이 선택된다. 업무 이벤트 handler나 함수 본문은 지도에 포함하지 않는다.

모듈 도달 가능성은 모든 export가 화면에 mount된다는 의미가 아니다. 예를 들어 `ReviewItems` 모듈은 `StatusIcon/statusLabels` 도움값 사용으로도 도달한다. 설계 지도에 나온 모든 JSX를 한꺼번에 렌더하면 잘못된 화면이다. 화면 트리와 상태 계약이 활성 컴포넌트를 결정한다.

## 3. CSS 로딩과 최종 색

초기 적용 순서는 `cascade.eagerCssSourceIds`가 정본이다. 현 snapshot의 순서는 다음과 같다.

```text
golden-picker.css
criteria-confirmation.css
document-analysis.css
sandbox-activity-dock.css
workroom-current-operation.css
styles.css
cinematic.css
presentation.css
motion-system.css
workflow.css
workflow-polish.css
workspace-colors.css
charcoal-surfaces.css
charcoal-dialogs.css
charcoal-workroom.css
```

`cascade.explicitMainCssSourceIds`는 이 중 마지막 10개다. dynamic boundary의 `newCssSourceIds`는 **초기 15개 대비** 필요한 순서다. 이전 화면에서 이미 로드한 source는 다시 삽입하지 않는다. 실제 사용 순서에 따라 DOM에 남아 있는 stylesheet 집합이 달라진다. 번들러가 shared chunk를 생성했다면 브라우저의 `<link>/<style>` 순서와 loaded chunk를 evidence에 함께 기록한다.

| 활성 경계 | 처음 필요해지는 CSS 순서 |
| --- | --- |
| DocumentPreview | document-preview |
| FileReviewResults | document-preview → file-review-results |
| ResultsVisuals | results-visuals |
| DashboardModal, hover/focus preload 포함 | dashboard-modal |
| LedgerModal | ledger-modal |
| LandingIntro | review-theater → landing-intro |
| LiveReviewFlow | review-theater → live-review-flow |
| CriteriaConfirmation 내부 원문 | document-preview |
| SandboxActivityDock 내부 작업실 | sandbox-work-scene → sandbox-workroom-scene |
| DashboardModal 내부 원본과 판정 | document-preview → dashboard-evidence |

상위 `.app-shell.workflow-shell`과 반복 클래스 `.dashboard-modal.dashboard-modal`, `.golden-picker.golden-picker`, `.ledger-modal.ledger-modal`은 실제 specificity에 영향을 준다. 높은 specificity의 charcoal 규칙은 나중에 로드한 component CSS보다 우선할 수 있다. 이를 “항상 마지막 CSS가 이긴다”로 바꾸지 않는다. inline style, `!important`, media 조건, inherited custom property를 모두 적용해야 최종 색이 결정된다. 새 cascade layer를 도입하거나 selector를 축약하면 우선순위가 바뀔 수 있다.

색을 한 global semantic 팔레트로 합치지 않는다. 예를 들어 일반 판정의 fail, theater packet의 fail, Recharts의 fail이 조금 다른 값인 경우 그대로 유지한다. 문서 종이, 원문 셀, SVG scanner의 literal gradient와 dashboard iframe의 light/dark 표현은 workspace panel 색과 다를 수 있다. 모든 카드에 같은 panel background를 칠하는 방식은 동등하지 않다. 정본 색은 복제한 토큰 표가 아니라 **해당 상태의 effective CSS/inline/SVG 값**이다.

`excludedUnreachableCss`의 7개 파일은 활성 그래프 밖이다. `dashboard-sky`, `dialogs-sky`, `document-analysis-sky`, `review-sky`, `theater-sky`, `workroom-sky`, `extracted-fields.css`를 glob으로 추가하지 않는다. 파일이 존재하거나 과거 motion 색인에 언급되었다고 활성 테마로 취급하지 않는다.

## 4. 원본 소스 없이 CSS 생성

아래 경로는 **전달받은 architecture 패키지**를 기준으로 한 예다. Node만 필요하다. 재구축 환경에서 `--export`를 실행하지 않는다.

```sh
node architecture/tools/export-visual-contract.mjs --generate --catalog architecture/ui/style-catalog.json --out generated-visual
node architecture/tools/export-visual-contract.mjs --check-generated --catalog architecture/ui/style-catalog.json --out generated-visual
```

생성 결과는 28개 CSS asset, `eager.css`, `load-plan.json`이다. 출력의 `src/...css` 경로는 논리적 source 이름을 보존한 **새로 생성한 CSS**이며 원본 `src/`를 읽지 않는다. 기존 앱 디렉터리를 출력 대상으로 지정하지 말고 새 디렉터리를 쓴다. 도구는 지정한 출력 밖의 경로를 거부하며 무관한 파일을 삭제하지 않는다.

1. 자신의 앱에 생성된 `eager.css`를 초기에 로드한다. CSS `@import`를 쓰지 않는 빌드 환경에서는 `load-plan.json.eager` 순서대로 처리한다.
2. 자신의 lazy 화면 경계에 `load-plan.json.dynamic`을 대응시킨다. 내부 컴포넌트 이름은 달라도 되지만 스타일을 추가하는 시점과 누적 순서를 유지한다. 공유 CSS는 한 번만 로드한다.
3. `embedded/previewMotionCss.css`, `embedded/previewReducedMotionCss.css`는 부모 문서에 import하지 않는다. 아래 iframe 조건에 따라 iframe 문서 head에 주입한다.
4. HTML 구조·클래스·상위 scope·CSS 변수·inline 값·SVG geometry를 component map과 화면 계약으로 구현한다. 다른 class 이름을 사용할 수 있지만 모든 selector/상태 연결을 함께 번역하고 대응표를 남긴다.
5. 기준 PNG/DOM과 비교하여 누락된 DOM, SVG, CSS 적용 조건을 수정한다. CSS 파일 생성 성공은 시각 동등성 통과가 아니다.

생성기는 의미상 동일한 CSS를 만든다. 작성 시 PostCSS로 원본과 생성본을 각각 파싱해 selector·at-rule·순서·중첩·property·value·important의 ordered AST가 모두 같은지 검증했다. 원본 주석·들여쓰기·줄바꿈을 복제하지 않으므로 원본 파일 바이트 SHA와 생성 CSS SHA는 다를 수 있다. 생성 모드는 카탈로그 semantic hash와 생성문 hash를 확인하며 `--check-generated`는 산출물 30개를 다시 대조한다.

`--export --root <원본 저장소>`는 **패키지 작성/갱신자 전용**이다. 해당 모드만 원본 runtime graph와 PostCSS/TypeScript를 읽는다. 원본 저장소나 이 도구의 author 모드를 받는 것이 재구축 전제는 아니다. 새 snapshot을 작성하면 두 JSON의 hash 연결·문서 수량·reference provenance를 함께 갱신한다.

## 5. 폰트와 재현 환경 고정

`fonts/fonts.css`와 인접 WOFF2 전체를 동일 origin에서 제공하고 manifest 해시와 라이선스를 유지한다. 본문 font stack은 제공된 CSS 선언의 값이며, font-synthesis도 그대로 적용한다. weight 450/550/650/720을 가까운 정수 weight로 반올림하지 않는다. 실제 사용 가능한 font-face와 브라우저 보간 결과를 확인한다.

원래 `styles.css`의 Google Fonts `@import`는 CSS 의미 동일성 때문에 생성물에 보존된다. 독립 구현에서는 다음 중 하나를 명시적으로 선택한다.

- 참조 캡처: [capture-flow.js](reference/capture-flow.js)의 font interception 규칙으로 원래 폰트 stylesheet 요청에 로컬 `fonts.css`를 응답한다. CSS 안의 WOFF2도 로컬 origin으로 연결한다.
- 제품 배포: 원래 remote `@import` 한 개를 로컬 font stylesheet URL로 치환한다. `load-plan`/배포 evidence에 그 치환을 기록한다. 그 외 선언을 변경하지 않는다. 수정한 배포 파일은 생성본 byte 검사와 별개다.

매 캡처는 browser engine/build, OS, locale, timezone, viewport CSS px, DPR, zoom, `prefers-color-scheme`, `prefers-reduced-motion`, app motion/localStorage, scroll 위치, hover/focus/active, 입력 fixture hash, loaded CSS 순서와 font load 결과를 보관한다. scrollbar와 native form/dialog 렌더가 달라지면 원인을 기록한다. `document.fonts.ready` 이후 캡처하고 `document.fonts.status`, family/weight check, computed family/size/weight/line-height를 남긴다. 한 family의 check=true만으로 모든 한글 glyph가 같은 파일에서 렌더됐다고 단정하지 않는다.

현재 reference의 기본 desktop은 1440×960, mobile은 390×844다. 실제 파일별 조건은 manifest가 우선한다. 기존 UI acceptance의 1366×768, 1440×900, 768×1024, 1080×760도 추가로 검증한다. 각 CSS media 경계는 `indices.media`에서 찾고 경계 바로 전·정확한 경계·바로 후의 CSS px를 검사한다. width와 height 조건을 함께 만족시키며 모바일을 desktop PNG를 축소한 이미지로 구현하지 않는다.

## 6. Motion·CSS·SVG·차트의 역할

component map의 `attributes`, `visualSpreads`, `valueRecipes`, `parameterDefaults`, `imperativeMotionCalls`가 inline 정밀값을 제공한다. JSX에 직접 적힌 transition뿐 아니라 `appear(delay)`, `enter(delay)`, `defaultMotionTransition`, packet 좌표·시간배열, route path·음수 delay도 포함한다. TypeScript 식의 `as const` 등은 reference 표기이며 새 구현에 문자열로 삽입할 CSS가 아니다.

| 소유자 | 재현할 설계/실행 책임 |
| --- | --- |
| Motion | initial/animate/exit, transition, layout, hover/tap, AnimatePresence mode, 기본 transition, 숫자 tween. css transform과의 충돌을 방지한다. |
| 브라우저 CSS | keyframes, transition, media/pseudo state, scan/beam/hover 장식, reduced 규칙. 모든 animation shorthand 인자를 유지한다. |
| native SVG | path `d`, viewBox, preserveAspectRatio, gradient/stops/opacity, geometry, mask/filter, stroke/dash/pathLength. useId 기반 참조는 instance별 고유 ID다. |
| Lucide | import 이름·size·strokeWidth·추가 클래스. 다른 icon family나 emoji로 치환하지 않는다. 동적 Icon은 해당 palette/icon map을 따른다. |
| Recharts | ResultsVisuals 요약 chart와 DashboardEvidence 48×48 mini donut. layout·radius·angle·bar/axis geometry와 animation duration을 각각 보존한다. |
| 별도 dashboard renderer | 맞춤 iframe 내부 Chart.js/HTML은 [대시보드 계약](../specs/05-dashboard-exports.md)과 전달된 dashboard 참조를 따른다. 부모 Recharts와 같은 renderer로 뭉개지 않는다. |

CSS keyframe의 `from/to`와 중간 percentage, easing, delay, duration, repetition, direction, fill-mode, transform-origin을 모두 비교한다. SVG scene은 278×80 또는 theater 1120×300 등 각 recipe의 좌표계를 그대로 따른다. theater packet은 CSS pixel label과 정규화된 left/top 이동을 결합한다. 모든 motion을 transform-only라고 기록하지 않는다. DOM 그림을 PNG background로 바꾸는 것은 동등한 동적 구현이 아니다.

상태 의미는 [04-ui-motion.md §5](../specs/04-ui-motion.md)의 실제 활동·도착·handoff 규칙을 유지한다. 첫 snapshot, 동일 snapshot, history 선택, 새 run/context, 실패/취소, 연결 끊김에서 불필요한 새 packet을 만들지 않는다. MAX_PACKETS, stagger, expiry, queue cap, terminal navigation은 행동 계약의 값으로 검증한다. motion이 끝났다고 결과 데이터를 늦게 반영하지 않는다.

### iframe motion의 독립 scope

`DashboardModal`의 CSS template는 `style-catalog`에서 별도 `scope=dashboard-preview-iframe`이다. `contentReady`와 preview HTML이 있어야 적용한다. app OFF 또는 `preview.job.design.motion === 'none'`이면 reduced stylesheet를 head에 추가하고 `trace-reduced-motion` meta를 표시한다. 그 외에는 design 객체가 없는 과거 cached preview에만 host entrance stylesheet를 추가한다. design 객체가 있으면 그 renderer가 motion을 소유한다. `presentation` 이름만으로 이 분기를 바꾸지 않는다.

host entrance CSS의 `prefers-reduced-motion:no-preference` 블록과 reduce 블록은 서로 다른 조건이다. panel/plot/bar의 320/420/450/650/700ms, nth-child delay와 selector 제외 조건, `!important`를 모두 보존한다. 부모 html의 `data-motion` CSS는 iframe 경계를 넘어 전파되지 않는다. iframe ON/OFF와 chart 실제 unmount를 별도 확인한다.

## 7. 관측 가능한 시각 parity gate

아래는 재구축의 acceptance 목표이며 원본이나 새 구현이 이미 통과했다는 주장이 아니다. 실제 측정 기록 없이 PASS를 쓰지 않는다. 각 reference 화면의 fixture·viewport·DPR·폰트·모션·스크롤·focus 조건을 맞추고 DOM measurement와 PNG를 함께 비교한다.

| 검사 | gate | 증거 |
| --- | --- | --- |
| 주요 요소 위치·크기 | baseline bounding box x/y/width/height 차 각각 ≤4 CSS px | shell/header/steps/title/CTA/panel/modal/preview/chart 등의 source·new box와 delta |
| 평면 색상 | 각 RGB channel 차 ≤2 | 동일 selector/pseudo의 computed foreground/background/border와 샘플 영역. alpha는 원래 값/합성 배경도 확인 |
| 글꼴 | family/weight/line-height/letter-spacing은 선언과 computed 결과를 대응; 주요 font-size 차 ≤1px | font manifest hash, loaded fonts, 텍스트 wrap/행 수, box와 computed typography |
| 간격·선·곡률·그림자 | catalog의 effective padding/margin/gap/border/radius/shadow/filter 값에 대응 | 상태별 computed style; 선언을 편의상 spacing scale로 반올림하지 않음 |
| 정적 PNG | 동일 browser/DPR/fonts, 동일 motion OFF 조건에서 허용된 anti-alias tolerance 적용 후 changed pixel ≤1.5% | diff 이미지·비율·tolerance 알고리즘/설정. 제목·데이터·텍스트 영역을 mask해 통과시키지 않음 |
| overflow | 해당 정상 desktop의 body 수직 overflow ≤1px; mobile 가로 overflow ≤1px | viewport/scrollWidth/scrollHeight, 내부 scroll container 크기, 잘린 CTA 확인 |
| 시간 | transition duration/delay 차 ≤80ms 또는 기준값의 10% 중 큰 값 | trigger timestamp, 실제 시작/완료, playback rate, effect timing |
| 모션 최종 상태 | 최종 위치·opacity·count·focus와 cleanup이 행동 계약과 일치 | 종료 DOM과 animation/observer/timer 수, modal 반복 open/close |

PNG가 match하더라도 버튼/필터/원문 연결이 동작하지 않으면 완료가 아니다. DOM 수치만 맞고 글자가 잘리거나 frame 밖으로 나가도 실패다. 화면 ID별로 `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED`, `DEVIATION`과 이유를 분리한다. integrity hash와 CSS AST roundtrip은 패키지 보존 검사이며 pixel parity 검사가 아니다.

모션 ON baseline PNG는 장식 loop의 우연한 위상을 포함할 수 있다. 그 한 장에 모든 frame을 억지로 맞추지 않는다. 정적 비교용으로 양쪽을 같은 OFF 조건에서 다시 캡처하거나, 해당 animation의 정해진 local time을 동일하게 설정한 **별도 파생 baseline**을 만든다. 원래 reference 파일을 덮어쓰지 않는다.

## 8. 모션 트리거·frame·접근성·수명주기 검증

각 효과마다 source/node ID, trigger, 상태 입력, 요소 수, 주기/지연, 재생 조건, interruption, reduced 분기를 trace에 기록한다. CSS 효과는 `getAnimations()`와 `effect.getComputedTiming()`/keyframes, Motion/차트 효과는 이벤트 시각과 DOM sampling 또는 영상을 함께 사용한다. requestAnimationFrame sample은 wall clock과 연결한다. CSS animation만 검사하고 Motion 숫자 tween까지 모두 검증했다고 쓰지 않는다.

1. 진입은 trigger 직전, 시작, delay 직후, 진행률 25/50/75%, 종료 직후를 샘플한다. 비선형 easing이 있으므로 중간 좌표를 선형 보간으로 추정하지 않는다. source recipe의 easing으로 계산하거나 같은 renderer의 reference frame과 비교한다.
2. 반복 효과는 첫 주기와 다음 주기를 확인하고 음수 delay의 초기 위상, alternate/reverse, repeatDelay, fill-mode를 유지한다. hover/tap/focus는 pointer 및 keyboard로 각각 켜고 끈다. pseudo-element도 관측 대상이다.
3. 실제 결과 fixture의 도착, 같은 결과 재수신, 빠른 100개 이벤트, context 교체, history 선택, 연결 중단/복귀, 실패·취소·완료에서 packet 수/방향/색/이동시간과 즉시 counts를 검증한다. 장식적 예제 반복은 실제 검토 진행과 구분한다.
4. app motion ON/OFF × OS no-preference/reduce의 **네 조합**을 각각 실행한다. 기본 app ON은 MotionConfig `reducedMotion='never'`, OFF는 `'always'`와 duration 0이다. 원본 전역 기본이 OS reduce를 자동 반영한다고 주장하지 않는다. ResultsVisuals/DashboardEvidence와 일부 CSS는 별도 OS 분기를 갖는다.
5. 실행 중 OFF 전환 시 queue/packet 정리와 정적 최종 상태를 확인한다. ON 복귀 시 과거 이벤트를 새 도착처럼 재생하지 않는다. localStorage `trace-demo-motion`의 on/off, reload 초기값, 저장 실패도 검사한다. 두 설정을 동시에 끈 PNG 한 장으로 네 조합을 검증했다고 쓰지 않는다.
6. CSS는 pseudo/backdrop을 포함해 OFF 효과를 검사하고 iframe은 별도 문서에서 검사한다. Motion tween, count animation, ResizeObserver, PDF render 작업, event source, timeout/interval의 종료·취소도 확인한다. StrictMode의 mount/cleanup 반복에 중복 timer가 남지 않아야 한다.
7. modal을 5회 열고 닫은 후 chart/canvas·observer·SSE 수가 원래 수준으로 돌아오고 focus가 호출 컨트롤로 돌아오는지 기록한다. 결과 tile exit 동안 pointerEvents/disabled/tabIndex/aria-hidden의 의미를 보존한다.

작업실 handoff의 연결 단절 정지는 원본 baseline에 포함된다. [interaction-contract.md §I5](interaction-contract.md)와 `04-ui-motion.md`대로 `connectionLive=false`가 되면 남은 hold 시간을 저장하고 JS timer를 정지한다. 예를 들어 1400ms hold를 500ms 진행한 시점에 단절되면 remaining은 900ms이고, 복귀 후 남은 900ms를 진행한다. 실제 dock의 `.sandbox-activity-dock:not([data-connection='live'])` 아래 descendant와 `::before/::after`에는 `animation-play-state: paused !important`가 적용되어 CSS packet도 같은 위치에서 정지한다. 이는 검증되지 않은 개선 후보가 아니라 재현할 동작이다.

Theater는 dock의 별도 sibling이고 connection prop을 받지 않으므로 위 CSS 정지 규칙이 적용되지 않는다. 연결 단절만으로 Theater의 busy 배경 모션까지 정지한다고 확대 해석하지 않는다. 이 범위 차이와 OS reduce의 컴포넌트별 대응은 [04-ui-motion.md §10](../specs/04-ui-motion.md)의 baseline 한계로 유지하고, Theater 연결 정지나 OS 전역 통합을 추가하면 별도 deviation으로 남긴다. requestAnimationFrame 스케줄링·실제 네트워크 도착·브라우저 글꼴 rasterization·비결정적 생성 결과까지 모든 환경의 모든 frame이 100% 동일하다는 보장을 하지 않는다. 대신 고정 입력/시간/환경의 측정 가능한 parity와 실제 상태 의미를 입증한다.

## 9. 합성 참조·검증 범위

[reference](reference/README.md)는 실제 사용자 문서 대신 합성 기준·시험 결과를 사용한다. 모의 API의 Gemini/E2B configured 값과 진행 이벤트는 화면을 그리는 입력이며 실제 외부 서비스 실행이나 모델 품질 증거가 아니다. 생성기는 `.env`, 사용자 업로드, 기존 서버 또는 외부 API를 읽지 않는다. 제공된 source 경로·해시만으로 원본 앱이 배포 패키지에 들어 있다고 해석하지 않는다.

기준 화면 01–28의 실제 PNG/환경/측정 존재 여부는 reference manifest를 따른다. 여러 파일·PDF 페이지·Excel sheet·empty/error/cancel/reconnect·200% zoom·키보드·긴 내용은 별도 상태로 확장한다. 확장 fixture는 synthetic임을 유지하고 기준 reference의 입력을 몰래 바꾸지 않는다. dashboard renderer가 만든 새 결과는 별도 content 변형이며 baseline light/dark 화면과 혼동하지 않는다.

작성 검증 기록(2026-09-21): PostCSS로 28개 CSS source의 ordered semantic AST roundtrip이 모두 통과했다. Node **v24.13.1**에서 원본 working directory 밖의 새 임시 디렉터리에 **이 도구와 style-catalog.json 두 파일만** 복사한 뒤 `--generate`와 `--check-generated`를 실행하여 CSS 28개와 보조 파일 2개를 생성·대조했다. 두 실행 모두 PASS였고 원본 `src/` 및 `node_modules`가 필요하지 않았다. 이 기록은 선언형 자산의 이식성과 생성 일관성을 검증하며, 아직 작성되지 않은 독립 앱의 시각 gate 통과를 뜻하지 않는다.

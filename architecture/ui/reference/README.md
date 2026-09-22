# 합성 UI 시각 참조

이 디렉터리는 GSPEC의 주요 화면을 같은 데이터로 비교하기 위한 **합성 데이터 기반 시각 참조**다. PNG는 화면의 배치·색·문구·상태를 보여 주며, 실제 Gemini/E2B 실행, 실제 파일 추출, 모델 정확도 또는 내보내기 성공의 증거가 아니다. 재현 구현은 [UI·모션 계약](../../specs/04-ui-motion.md), [세부 컨트롤 계약](../detail-controls.md), [토큰](../tokens.json)을 함께 따른다.

## 데이터와 실행 경계

- [synthetic-fixture.json](synthetic-fixture.json): `fixtureId=architecture-visual-v1`, `synthetic=true`. 기준 문서 1개, 대상 문서 1개, 기준 3개, 판정 3개를 고정한다. 압축강도 28.4 MPa는 적합, 흡수율 6.2%는 부적합, 판독 불명확한 외관은 확인 필요다. 완료 분포는 `pass=1, fail=1, review=1, pending=0`이다.
- [mock-api.mjs](mock-api.mjs): 브라우저의 `/api/` fetch와 EventSource를 가로채는 참조 전용 모의 전송 계층이다. 요청을 `window.__visual.requests`에 기록하며, 정의하지 않은 API는 404를 반환한다. 실제 백엔드와 연결하지 않는다.
- [synthetic-dashboard.html](synthetic-dashboard.html)과 `synthetic-dashboard-dark.html`: 같은 합성 판정의 light/dark 대시보드 미리보기 콘텐츠다. GSPEC의 번들된 결정적 designer로 준비한 기본 자동 시각화이며 모의 job의 `presentation=standard`다. 모델 또는 런타임 생성 API를 호출한 결과가 아니다. 이 HTML의 표현은 재현할 화면 참조이며 새 구현의 모델 생성 결과를 강제하는 템플릿은 아니다.
- [capture-flow.js](capture-flow.js): Playwright `page`를 받는 비동기 캡처 함수다. 클릭·입력과 모의 이벤트를 조합하여 화면을 전환하고 PNG와 DOM 측정값을 수집한다. 제품 서버나 모델 실행 스크립트가 아니다.

모의 health 응답의 `geminiConfigured/e2bConfigured=true`는 연결된 상태의 UI를 그리기 위한 입력일 뿐이다. 합성 작업 로그에 E2B/Gemini라는 명칭이 보이더라도 실제 외부 실행으로 집계하지 않는다. 업로드는 모의 응답의 구조화된 미리보기를 돌려주므로 업로드한 바이트를 읽고 분석했다는 뜻도 아니다. 검토대장 매핑 미리보기와 실제 XLSX 사본 생성 검증은 별도다.

## 화면 범위

아래 번호는 화면 상태 식별자이며 테스트의 통과 번호가 아니다. 실제 배포된 PNG 목록, viewport, 해시, 캡처 상태는 `manifest.json`을 기준으로 확인한다.

| ID | 화면 | 고정 입력 또는 관찰 대상 |
| --- | --- | --- |
| 01 | 데스크톱 랜딩 | 내장 예시, 업로드 없음, 1440 × 960 |
| 02 | 모바일 랜딩 | 390 × 844 반응형 배치 |
| 03 | 모바일 랜딩 모션 OFF | 앱 OFF와 OS reduced motion을 모두 적용 |
| 04 | 기준 입력, 빈 파일 모드 | 업로드 전 기본 입력 화면 |
| 05 | 자연어 기준 입력 | 압축강도·흡수율·외관 조건의 합성 문구 |
| 06 | 기준 파일 입력 | 합성 기준 문서와 표 미리보기 |
| 07 | 기준 원문 읽기 | 합성 read 활동과 진행 중 화면 |
| 08 | 기준 맥락 확인 | 합성 context 활동 |
| 09 | 기준 확인 | 기준 3개, 수정 컨트롤, 원문 패널 |
| 10 | 기준 HITL 편집 | 흡수율 기준의 편집 영역 열기 |
| 11 | 대상 입력, 빈 상태 | 기준 확정 후 대상 업로드 전 |
| 12 | 대상 파일 입력 | 합성 시험성적서 추가 |
| 13 | 검토 진행 | 적합·부적합·확인 필요 이벤트 도착 |
| 14 | 완료 결과 | 파일별 원문과 판정, 분포 1/1/1 |
| 15 | 부적합 항목 상세 | 흡수율의 측정값·기준·설명·근거 |
| 16 | 확인 필요 항목 상세 | 판독 불명확한 외관의 근거와 사람 확인 컨트롤 |
| 17 | 적용 기준 | 선택한 파일에 실제 적용된 기준 목록 |
| 18 | 기준 원문 연결 | 적용 기준에서 기준 문서의 근거로 이동 |
| 19 | 대시보드 입력 | 지시문·구성 제안·초기 미리보기 |
| 20 | 대시보드 생성 중 | 합성 job 진행 상태 |
| 21 | 밝은 대시보드 | 고정된 light 디자인의 기본 자동 시각화 |
| 22 | 대시보드 재구성 입력 | 기존 미리보기에서 지시문 변경 |
| 23 | 어두운 대시보드 | 고정된 dark 디자인의 기본 자동 시각화 |
| 24 | 대시보드 작업 기록 | 합성 job 로그 펼침 |
| 25 | 대시보드 원본과 판정 | 고정된 검토 snapshot의 원문·판정 |
| 26 | 검토대장 빈 상태 | 대장 업로드 전 연결 입력 |
| 27 | 검토대장 매핑 | 합성 대상 셀·현재 값·기입할 값 미리보기 |
| 28 | 모바일 결과, 모션 OFF | 390 × 844 결과 화면의 reduced 상태 |
| 29–30 | 필수 데스크톱 랜딩 | 각각 1600 × 960 / 1280 × 800 |
| 31–32 | 필수 데스크톱 기준 확인 | 각각 1600 × 960 / 1280 × 800 |
| 33–34 | 필수 데스크톱 부적합 상세 | 각각 1600 × 960 / 1280 × 800 |

최종 파일명·존재 여부·캡처 성공은 `manifest.json`을 확인한다. 이 표에 없는 상태를 자동으로 지원·통과한 것으로 간주하지 않는다. 오류, 취소, 재연결, 다중 파일, PDF 페이지 전환, Excel 다중 시트, 실제 다운로드, 키보드 접근성, 200% 확대 및 장시간 모션은 별도의 acceptance와 실행 증거가 필요하다.

## 원본 소스 없이 캡처하는 구현 어댑터

이 패키지는 앱 소스를 포함하지 않는다. 재현 에이전트는 `architecture/` 계약으로 **자신의 앱과 진입점**을 구현한다. 캡처를 위해 원본 `src/`, 원본 `main.tsx`, 원본 CSS, 원본 컴포넌트 이름 또는 원본 `.cache/` 디렉터리를 확보할 필요가 없다. 원본의 임시 캡처 진입점이 기록에 남아 있더라도 이는 참조를 만든 provenance일 뿐 재현의 전제 조건이 아니다.

구현 어댑터의 계약은 다음과 같다.

1. 구현자가 제공하는 테스트 HTML은 `lang=ko`, viewport meta, 앱 마운트 지점을 갖는다. 자신의 번들러로 앱을 제공하고 같은 로컬 origin에서 `architecture/` 정적 파일도 읽을 수 있게 한다.
2. 앱이 API를 읽거나 EventSource를 만들기 **전에** `installVisualMock(fixture, dashboardHtml, darkDashboardHtml)`를 한 번 호출한다. 모의 전송 계층을 설치한 다음 자신의 앱 진입점을 동적으로 import한다. 프로덕션 진입점에는 이 mock을 설치하지 않는다.
3. 앱은 [상태·API 계약](../../specs/01-state-api.md)의 경로·데이터·이벤트를 소비한다. 다른 내부 상태 구조는 허용하며, UI는 합성 fixture의 문서·기준·판정·승인 상태를 실제로 렌더한다. PNG 자체를 화면에 붙이는 방식은 재현이 아니다.
4. 캡처 드라이버는 의미가 같은 버튼·label·role로 조작한다. 원본 클래스명이 다른 경우 드라이버의 locator와 측정 selector를 자신의 구현에 대응시킨다. 대응표와 변경된 캡처 스크립트 해시를 결과에 보관하며 화면의 의미나 합성 데이터를 바꾸어 차이를 숨기지 않는다.
5. `window.__visual`의 `startReading`, `context`, `confirmReady`, `reviewActive`, `complete`, `dashboardReady`는 fixture 이벤트를 진행시키는 테스트 제어점이다. 사용자 클릭이 만드는 승인·업로드·실행 순서를 유지한 뒤 해당 제어점을 호출한다. mock 제어점으로 기준 승인 이전의 대상 처리 금지 규칙을 우회하지 않는다.

예를 들어 구현자가 `/implementation/main.tsx`를 만든 경우 테스트용 `visual-init.mjs`는 다음 구조로 작성할 수 있다. 경로는 구현자의 서버 루트에 맞게 지정한다. `/implementation/main.tsx`는 패키지에 제공된 파일이라는 뜻이 아니다.

```js
import { installVisualMock } from '/architecture/ui/reference/mock-api.mjs';

const fixture = await fetch('/architecture/ui/reference/synthetic-fixture.json')
  .then(response => response.json());
const dashboardHtml = await fetch('/architecture/ui/reference/synthetic-dashboard.html')
  .then(response => response.text());
const darkDashboardHtml = await fetch('/architecture/ui/reference/synthetic-dashboard-dark.html')
  .then(response => response.text());

installVisualMock(fixture, dashboardHtml, darkDashboardHtml);
await import('/implementation/main.tsx');
```

테스트 HTML에서 `/architecture/ui/fonts/fonts.css`를 로드하고, 앱은 지정된 font stack을 적용한다. 네트워크를 사용하지 않고 완전히 같은 fixture·폰트·화면 상태를 만들 수 있어야 한다. 구현 코드의 해시는 자체 provenance로 기록하며 원본 소스 해시와 같아야 한다는 조건은 없다.

## 캡처 절차

1. [환경 계약](../../environment/README.md)의 버전으로 의존성을 설치하고 자신의 앱과 위 테스트 어댑터를 준비한다. 브라우저 엔진·버전, OS, locale, timezone, device scale factor를 기록한다.
2. 자신의 테스트 페이지를 연 뒤 `window.__REFERENCE_CAPTURE_CONFIG`에 진입 URL과 출력 디렉터리를 설정한다. 드라이버는 `entryUrl` 생략 시 현재 `page.url()`, `outputDirectory` 생략 시 runner 작업 디렉터리의 `architecture/ui/reference`를 사용한다. `fontPath` 기본값은 `/architecture/ui/fonts`다. 기존 baseline을 보존하려면 재현 캡처의 별도 출력 디렉터리를 만들고 **reference 디렉터리의 fixture·HTML·mock·두 캡처 스크립트·finalizer를 모두 복사**한다. 업로드 토큰은 `outputDirectory/synthetic-fixture.json`에서 읽으므로 빈 출력 디렉터리만으로는 실행되지 않는다. 진입점은 로컬 HTTP(S) URL이어야 하며 `about:blank`를 진입 URL로 사용하지 않는다.
3. 새 브라우저 context와 `deviceScaleFactor: 1`을 사용한다. 시작 viewport는 1440 × 960, 모바일은 390 × 844다. [capture-required-viewports.js](capture-required-viewports.js)는 같은 helper로 필수 1600 × 960 / 1280 × 800의 랜딩·기준 확인·결과 상세를 추가 캡처한다. 두 드라이버의 측정/DOM 배열을 ID순으로 합친다. 앱 모션 저장값과 OS reduced motion을 명시적으로 설정한다. 상태를 상속받은 기존 탭을 사용했다면 그 사실을 기록한다.
4. Playwright runner에 [capture-flow.js](capture-flow.js)의 비동기 함수를 전달하고 자신의 `page`로 실행한다. 파일은 단독 Node 프로그램이 아니므로 `node capture-flow.js`만으로 실행되는 명령으로 안내하지 않는다. 다른 드라이버를 사용하면 같은 상태 전이와 viewport를 유지한다.
5. 각 상태의 화면 준비 조건과 `document.fonts.ready`를 기다린 뒤 PNG를 캡처한다. `window.__referenceMeasurements`에 누적된 측정 결과를 별도 출력 디렉터리의 `measurements.json`으로 저장한다. 전체 문서 캡처인지 viewport 캡처인지도 기록한다. 기존 드라이버의 기본은 viewport 캡처다.
6. PNG를 열어 잘린 주요 컨트롤, 예기치 않은 가로 스크롤, 빈 미리보기, 로딩 상태 잔류, fallback 폰트를 확인한다. 화면 ID별 DOM 측정값·모션 설정·폰트 상태·입력 해시를 연결한다.
7. 새 캡처와 baseline을 비교하고 결과를 별도의 evidence에 보관한다. baseline PNG나 측정값을 재현 결과로 덮어쓰지 않는다. 실패·미실행·skip은 통과와 구별한다.

드라이버 설정 예시는 다음과 같다. 출력 경로는 브라우저 파일시스템이 아니라 Playwright runner의 파일시스템에 적용된다.

```js
await page.goto('http://127.0.0.1:5173/visual.html');
await page.evaluate(() => {
  window.__REFERENCE_CAPTURE_CONFIG = {
    entryUrl: 'http://127.0.0.1:5173/visual.html',
    outputDirectory: 'evidence/reimplementation-visual',
    fontPath: '/architecture/ui/fonts',
  };
});
// 이 page에 capture-flow.js의 비동기 함수를 실행한 뒤:
const measurements = await page.evaluate(() => window.__referenceMeasurements);
// runner에서 JSON.stringify(measurements, null, 2)를 measurements.json으로 저장한다.
```

캡처 드라이버는 같은 로컬 origin 밖의 요청을 차단한다. 원본의 Google Fonts stylesheet 요청만 로컬 폰트 CSS로 응답하며 그 CSS의 WOFF2 URL도 로컬 origin으로 바꾼다. 차단된 외부 URL은 누락된 자산이나 어댑터 의존성을 조사할 단서로 보관한다.

화면 03은 앱 모션과 OS 설정을 동시에 줄인 정적 참조다. 따라서 이 한 장으로 앱 OFF 단독·OS reduce 단독의 동작이 각각 검증되었다고 주장하지 않는다. 모션 ON 화면은 애니메이션 위상에 따라 픽셀이 달라질 수 있다. 정적 픽셀 비교에는 양쪽의 모션 조건을 맞추고, 실제 모션 동등성은 이벤트 시각·DOM sampling·trace 또는 영상으로 별도로 확인한다.

## 로컬 폰트

[fonts.css](../fonts/fonts.css)는 `DM Sans`와 `Noto Sans KR`를 인접한 WOFF2 파일로 불러온다. [폰트 manifest](../fonts/manifest.json)는 수집 시점·요청 URL·User-Agent와 각 파일의 `path`, `bytes`, `sha256`을 보관한다. 배포 시 [DM Sans 라이선스](../fonts/dmsans-OFL.txt)와 [Noto Sans KR 라이선스](../fonts/notosanskr-OFL.txt)를 함께 유지한다.

font stack은 `'DM Sans', 'Noto Sans KR', sans-serif`, 기본 weight는 400이며 `font-synthesis: none`을 적용한다. 원본의 Google Fonts CSS 요청을 intercept하여 로컬 CSS로 대체하는 방식은 참조 수집에 사용할 수 있다. 독립 재현에서는 로컬 CSS를 직접 로드하면 된다. 외부 폰트 응답의 가용성을 재현 전제로 삼지 않는다.

캡처마다 `document.fonts.status`, 사용 family의 load/check 결과, font face 상태, 주요 요소의 계산된 font family/size/weight/line-height를 남긴다. `document.fonts.check()` 한 값만으로 모든 한글 glyph가 같은 폰트에서 그려졌다는 결론을 내리지 않는다. 브라우저·OS의 rasterization 차이도 있으므로 동일 폰트 파일만으로 플랫폼 간 PNG의 바이트 일치를 요구하지 않는다.

## 해시와 manifest 해석

[원본 소스 해시 목록](../../baseline/source-snapshot.json)은 기준 앱의 소스 파일명·크기·SHA-256을 기록한 provenance다. 파일명은 조사 출처이며 파일 본문이나 실행 가능한 앱이 아니다. 독립 구현은 이 해시 목록의 원본 파일을 읽어야 할 의무가 없다. `architecture/package-manifest.json`은 배포 패키지 자체의 무결성을, 폰트 manifest는 글꼴 자산의 무결성을 각각 담당한다.

시각 참조 manifest의 최소 의미 계약은 다음과 같다. 실제 필드명과 구조는 배포된 `manifest.json`과 `measurements.json`에 맞추되 의미가 누락되면 미측정으로 취급한다.

| 범주 | 필요한 정보 |
| --- | --- |
| 버전·범위 | schema version, 캡처 시각, synthetic 표시, fixture ID, 참조가 보장하는 범위와 한계 |
| 실행 환경 | 브라우저와 버전, OS, viewport, DPR, locale/timezone, 앱 모션과 OS reduced motion, 캡처 방식 |
| 입력·출처 | fixture·mock·capture driver·dashboard HTML의 상대 경로와 SHA-256, 원본 source snapshot의 참조 또는 해시, 로컬 폰트 manifest 참조 |
| 화면별 산출물 | 고유 ID, 상태명, PNG의 상대 경로·바이트 크기·SHA-256·이미지 가로/세로, 입력 상태 설명 |
| 측정 연결 | 측정 JSON 경로 또는 화면별 측정 레코드, 같은 화면 ID, selector와 bounding box, 계산된 시각 속성, overflow와 fonts-ready 결과 |
| 검증 결과 | 캡처/검사 성공 여부, 미실행·실패·제외 상태, 발견한 차이와 제한 사항 |

경로는 패키지 기준 또는 해당 manifest 기준의 상대 경로로 저장하며 기준을 명시한다. 해시는 실제 파일 바이트의 SHA-256으로 계산한다. PNG 해시가 일치한다는 것은 자산이 바뀌지 않았다는 뜻이고, 다른 구현의 동등성 시험을 통과했다는 뜻은 아니다. fixture, 폰트, 드라이버 또는 입력 상태가 바뀌면 캡처 provenance와 관련 해시도 갱신한다.

측정 레코드는 화면 ID와 viewport/DPR, 문서 scroll 크기와 horizontal overflow, 앱/OS 모션, font 상태, 의미 있는 요소별 `x`, `y`, `width`, `height`, font 및 색·배경·radius·padding·gap 등을 연결한다. 없는 selector는 0 크기로 꾸미지 않고 미존재 또는 미측정으로 남긴다. 합성 참조에 대한 측정과 새 구현의 측정을 별도 파일로 보존한다.

## DOM·스타일·모션 샘플

`dom/<화면 ID>.json`은 PNG와 같은 상태의 실제 DOM을 담는다. `main.tree`와 sandbox iframe별 `frames[].tree`에는 부모 인덱스, tag, class/role/aria/data 및 SVG 도형 속성, 직접 텍스트, 입력값, 경계 상자, scroll 크기, 계산된 폰트·색·배경·border·shadow·grid/flex·transform·opacity, 생성된 `::before/::after` 스타일을 기록한다. SCRIPT/STYLE/NOSCRIPT 본문, 이벤트 핸들러, 앱 소스는 포함하지 않는다. Canvas 픽셀은 PNG와 함께 읽는다.

이 DOM은 재현을 위한 참조 템플릿이다. 운영 앱을 fixture 문구에 고정하거나 JSON을 그대로 HTML로 덮어쓰라는 지시가 아니다. 자신의 데이터 바인딩·상태 전이·접근성 구조로 같은 화면을 구성해야 한다. 원본과 다른 내부 클래스명이면 의미 있는 컨트롤과 스타일·geometry로 대응표를 만든다.

정적 상태는 최소 650ms와 유한 애니메이션 종료, 주요 패널 opacity=1을 기다린다. `settling.finiteAnimationsSettled`가 실제 성공 여부이며 실패한 상태를 정적 기준으로 취급하지 않는다. 07/08/13/20은 진행 중 모션 샘플이다. 무한 애니메이션을 정지하거나 PNG에 마스크를 적용하지 않았으며 `animationFreeze=none`이다. DOM에는 Web Animations의 target 인덱스, 현재 시각, play state, timing, computed timing과 keyframes를 함께 보관한다. DOM은 PNG 직후 수집되어 live 애니메이션의 위상은 약간 다를 수 있다.

측정에는 앱 모션 ON/OFF, OS reduced-motion, wall-clock 및 performance 시각, 합성 이벤트 sequence/timestamp가 별도로 있다. 시각 비교 시 clock/elapsed 영역을 정규화할 수 있으나 마스크 대상과 이유를 별도 기록하고 레이아웃 차이를 숨기지 않는다. 구체적인 영역 및 한계는 manifest의 `comparison`과 `limitations`를 참조한다.

Playwright에서 `window.__referenceDomSnapshots`를 JSON으로 내보내고, 메타데이터 객체 `{measurements: window.__referenceMeasurements, environment: window.__referenceEnvironment, blockedExternal: window.__referenceBlockedExternal, requests: window.__visual.requests}`도 별도 JSON으로 저장한다. [finalize-capture.mjs](finalize-capture.mjs)는 이 두 JSON을 입력으로 각 DOM 파일, measurements와 해시 manifest를 만든다. 위 2단계의 모든 입력 자산과 출력 PNG를 재현용 출력 디렉터리에 복사한 다음 실행한다. `scope`, `captureEngine`, `freshNamedBrowserSession`, `visualInspection`, `sourceVerification`은 실제 수행한 내용만 메타데이터에 추가한다. 생략값은 미기록으로 남으며 원본 GSPEC 캡처나 시각 검사를 수행했다고 자동 주장하지 않는다. 기본 baseline 디렉터리에서 실행하면 baseline manifest를 갱신하므로 새 구현 비교에서는 별도 복사본을 사용한다.

```sh
node evidence/reimplementation-visual/finalize-capture.mjs metadata-export.json dom-export.json
```

이 스크립트의 상대 경로인 `../../baseline/source-snapshot.json`, `../fonts/manifest.json`도 재현 출력의 구조에 맞게 배치하거나 스크립트 경로를 조정한다. 원본 source 파일을 읽지는 않는다. 대시보드 HTML은 정적으로 그대로 제공해야 한다. 개발 서버가 HTML에 HMR 코드를 삽입하는 경우 Vite의 `?raw` import처럼 원본 문자열을 읽는 어댑터를 사용하여 iframe CSP 오류를 피한다.

시각 허용 오차와 기능 검증의 권위는 [UI·모션 계약](../../specs/04-ui-motion.md)에 있다. 이 README, PNG 수 또는 로컬 integrity 검사의 성공만으로 제품 재현 완료를 선언하지 않는다.

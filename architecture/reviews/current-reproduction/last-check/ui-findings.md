# 최종 UI·exports 반증 감사

날짜: 2026-09-21. 현재 제품 원본과 현재 재현 계약을 비교했다. 기존 점수·평가를 결론의 근거로 사용하지 않았다. `.env`, provider, 브라우저, 실행 중 앱/API에 접근하지 않았다. 제품 소스는 수정하지 않았다. 감사 중 확인된 문서 공백에 대해 부모 작업에서 명시적으로 문서·fixture 수정 범위를 추가 승인했다.

## 발견 1 — UI-06 구조 지도 병합·표시 순서의 재구현 공백 (P2, 문서 보완 완료)

**원본:** `src/components/DocumentAnalysis.tsx:35`의 record/plain/first, `:80` inventoryParts, `:189` structureGroups, `:236` 지도 순서, `:249` footer, `:267` context drawer.

**기존 문서:** `architecture/ui/detail-controls.md` D3.2는 inventory의 배열/alias 형태와 'sheet→page→document 키 순으로 그룹' 및 wrapper 생략을 요약했다. I7은 빈 상태와 출처 동작을 규정했다. 시각 카탈로그에는 inventoryParts 호출·반복 표현식이 있으나 helper의 배열 우선순위/Map 병합/레이블 생성 본문은 없다. 따라서 원본 없는 구현자는 inventory 순서와 structure 순서가 다를 때 지도 순서를 확정할 수 없었다.

구체 반례:

1. inventory sheets `['B','A']`, structure sheet 순서 `A,C,B` → 원본 지도 **B,A,C**. inventory를 먼저 Map에 넣고 structure의 새 key C만 뒤에 추가한다.
2. inventory B(title='B first'), A, B(title='B last') → 원본 **B last,A**. 마지막 값이 덮어써도 B의 최초 위치는 그대로다.
3. 직접 inventory 배열 `[{sheet:'A',name:'A inventory'},{sheet:'B',name:'B inventory'}]`와 structure A → 원본 **document(name='B inventory'),sheet:A(name='A')**. 직접 배열에는 rawSheets가 없어 part.sheet가 투영되지 않는다. 이를 '정상적인 시트 그룹'으로 개선하면 현재 재현과 달라진다.
4. inventory page2 rows3 + transcription={} + text/page2/name='2쪽'/description='요약' → group.description=`3행 · 요약`, wrapper 카드 없음. transcription이 없으면 동일 wrapper가 region으로 남는다.

**수정:** D3.2의 '키 순서'를 키 선택 우선순위로 명확히 했고 D3.2.1에 nullish alias, 문자열/숫자 처리, name/description 생성, rawSheets/rawPages 조건, Map 삽입 순서와 overwrite, 새 structure 그룹 fallback, pageWrapper, drawer와 지도 차이를 명시했다. `architecture/ui/document-analysis-structure-cases.json`에 8개 독립 입력과 전체 JSON 출력 추가. 제품 개선은 포함하지 않는다.

**증거:** `ui-probe.mjs`는 TypeScript AST로 원본의 순수 helper 5개를 수정 없이 추출하고 transpileModule+VM에서 실행한다. `ui-probe-results.json` 8개 사례 PASS_LOCAL_PURE_HELPER. 공개 fixture 8개 전체 출력도 동일 helper 결과와 deepEqual했다. UI/browser 실행 상태는 모두 **NOT_RUN**이다.

## 이 범위에서 추가 차이를 찾지 못한 표본

아래는 정적 원본 대조이며 앱 실행 통과를 뜻하지 않는다.

| 표본 | 원본 | 계약/대조 결과 |
|---|---|---|
| App 입력 잠금·epoch·삭제 closure·탭 unmount·내보내기 메뉴 | `src/App.tsx:48`–`:149` 및 결과 JSX | 04 §3, I1/I1.1에 상태 초기화 예외·비동기 한계까지 규정됨 |
| dashboard ready/공백 HTML/failed/3번째 GET 오류/취소·late POST·캐시 | `DashboardModal.tsx:219`–`:453` | 05 D03/D09/D09a의 busy/job/preview 구분, 1200ms poll, 기존 성공 보존, 5개 캐시와 일치 |
| 적용 tag 우선순위·소스탭 수명·다운로드 | `DashboardModal.tsx:191`–`:203`, `:456`–`:466`, `:575`–`:620` | D09a의 large→bars→none→hidden→bottom→square→subtle, iframe 유지/소스 unmount, bridge 없는 motionHtml 저장과 일치 |
| source 탭 같은 항목 재선택·파일과 인용파일 분리·필터와 상세 | `DashboardEvidence.tsx:30`–`:91`, `dashboard-file-scope.mjs` | 05 D10a/D10b의 preferred evidence, file counts, 선택/filter 전이와 일치 |
| fixed renderer 차트 옵션 | `server/dashboard-fallback.mjs:202`–`:211`, `scripts/dashboard-chart-entry.jsx` | 05 D06의 motion/OS/meta, cutout, bar/polar, corners/hoverOffset/spacing/barThickness와 일치 |
| dashboard snapshot DTO/문자열 상한/sourceEvidence·numericGroups | `server/dashboard.mjs:62`–`:109` | D02의 allowlist, pending→review, missing metadata 손실, detached freeze와 일치. 이 문서가 명시한 기존 한계를 새 이슈로 세지 않음 |
| 대장 busyRef/sequenceRef/AbortController·memo 유지·409 | `LedgerModal.tsx:119`–`:271` | 05a §6/§9의 재분석 메모 보존, clearAnalysis 초기화, 기존 mapping 유지/사용자 재분석과 일치 |
| 일반 export 상태/11열/JSON/CSV/XLSX | `server/app.mjs:30`–`:39`, `:120`–`:150` | 05a §7의 completed/partial/failed+nonempty, unknown format, JSON 필드, CSV BOM/CRLF/quote/formula 방어, XLSX 4시트와 일치 |

## 실행·범위 한계

- 실행한 것은 로컬 순수 helper 8개 사례와 문서 fixture 동일성 검사다. 실행 명령: `node .cache/architecture-final-challenge/ui-probe.mjs`.
- 브라우저 렌더, viewport/cascade 실측, Chart.js canvas, dialog focus, 실제 fetch race, provider·sandbox, 다운로드 저장, ZIP 무결성 검증은 **NOT_RUN**. 정적 코드의 제어 흐름을 실제 race 재현으로 주장하지 않는다.
- 관련 CSS/시각 정본의 소유권·우선순위 설명은 읽었으나 17,366개 선언 전체를 독립 재계산하지 않았다. 이번 변경은 CSS/제품 UI 변경이 아니다.
- 문서 보강은 발견 1에 한정한다. 모든 가능한 UI 입력을 완전탐색했다거나 재현 가능성이 증명됐다는 결론은 내리지 않는다.

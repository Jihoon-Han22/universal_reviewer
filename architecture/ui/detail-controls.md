# 상세 작업 UI 계약: 원문·기준 수정·문서 이해·검토대장·샘플

이 문서는 빈 프로젝트의 구현자가 원래 소스를 읽지 않고 아래 다섯 기능을 재현하기 위한 부록이다. UI는 **React** 함수 컴포넌트이며 ReactDOM이 마운트한다. `04-ui-motion.md`가 있는 경우 전체 화면 구성은 그 문서를 따르고, 이 부록의 입력 검증·선택·원문 위치 규칙을 함께 구현한다. 정밀 시각 값은 [VISUAL-CONTRACT.md](VISUAL-CONTRACT.md)의 style/component catalog cascade를 우선한다. [interaction-contract.md](interaction-contract.md)는 본 부록을 보완하는 상태·empty·수명주기 정본이며, [interaction-fixtures.json](interaction-fixtures.json)은 입력과 기대값을 독립적으로 제공한다(모두 NOT_RUN 설계 사례). 아래 **관찰됨**은 고정 기준 구현의 코드에서 확인한 동작이며 **한계**는 현재 구현이 제공하지 않는 동작이다. 새 브라우저/실 API 검증을 실행했다는 뜻이 아니다.

## D0. 기술 책임과 인터페이스

| 책임 | 라이브러리 / API | package.json 선언 → lock 실제 버전 | 구현 책임 |
|---|---|---|---|
| 다섯 화면의 상태·효과·memo·ref | React | `^19.2.0` → `19.3.0` | URL/문서 변경 초기화, AbortController 종료, 선택 유지 |
| 브라우저 마운트 | ReactDOM | `^19.2.0` → `19.3.0` | 최상위 앱 마운트; 이 부록 컴포넌트는 별도 root 없음 |
| PDF 종이 진입, 분석 지도/상세, 대장 진입 | `motion/react`의 `motion`, `AnimatePresence` | `motion ^12.23.24` → `12.43.0` | D1/D3/D4 타이밍. GSAP/Lottie/Three.js 미사용 |
| 모든 제어 아이콘 | `lucide-react` SVG React 컴포넌트 | `^0.468.0` → `0.468.0` | FileText, FileSpreadsheet, FileSearch, ScanLine, Chevron*, ShieldCheck 등. 보통 10–25px |
| PDF 원본 캔버스 및 텍스트 좌표 | `pdfjs-dist` `getDocument`, `GlobalWorkerOptions`, `PDFDocumentProxy` | `^6.2.108` → `6.3.289` | D1.1. react-pdf 미사용 |
| XLSX preview 생산(서버) | `exceljs` | `^4.4.0` → `4.4.0` | 서버에서 rows 구성. 브라우저에는 HTML `<table>`이며 Excel 편집기/SheetJS 렌더러 없음 |
| DOCX preview 생산(서버) | `mammoth` | `^1.11.0` → `1.12.3` | 텍스트 preview. DOCX 페이지 레이아웃 렌더러 아님 |
| CSV preview 생산(서버) | `csv-parse/sync` | `^7.0.2` → `7.0.2` | rows 생산, 브라우저에서는 XLSX와 같은 표 |
| 시트·원문 스크롤, 파일 전환 | DOM `ResizeObserver`, `scrollTo`, `requestAnimationFrame`, native dialog | 브라우저 API | 외부 제스처/그리드/모달 라이브러리 미사용 |

최소 데이터 계약(TypeScript 표기; 선택 필드는 `?`):

```ts
type Evidence = { documentId: string; page?: number; sheet?: string; cell?: string; quote?: string };
type Preview = {
  type?: 'pdf'|'image'|'table'|'text'; text?: string;
  sheets?: {name:string; rows:string[][]; state?:string}[];
  truncated?:boolean; warnings?:string[];
};
type PreviewDocument = {
  id:string; name:string; kind:string; mime:string; size:number;
  role:string; url:string; preview?:Preview;
};
type Highlight = {
  id:string; status:'pass'|'fail'|'review'|'pending'; label:string;
  value?:string|number|null; evidence:Evidence[];
  sourceType?:'review-item'; targetDocumentId?:string;
  missing?:boolean; itemAnchorLabels?:string[];
};
type PreviewProps = {
  document:PreviewDocument|null;
  stage:'idle'|'reading'|'extracting'|'reviewing'|'complete';
  evidence?:Evidence[]; highlights?:Highlight[];
  selectedHighlightId?:string|null;
  onHighlightSelect?:(id:string)=>void;
  onPageChange?:(oneBasedPage:number)=>void; compact?:boolean;
};
```

문자열/배열 아닌 preview 값은 무시한다. null 셀은 `''`, 나머지 셀은 `String(cell)`로 표시한다. sheet rows는 배열인 행만 허용한다. warning은 문자열인 값만 표시한다. preview는 **판정 모델의 원본 입력이 아니다**. 전체 읽기/해석 coverage를 preview 행 수로 만들지 않는다.

## D1. DocumentPreview: 원문을 직접 보는 공통 패널

### D1.1 렌더러 분기와 자원

분기 순서는 PDF → image → sheet table → `preview.text !== undefined` → 원본 열기 fallback이다. PDF 조건은 MIME `application/pdf`, preview.type `pdf`, 확장자 `pdf` 중 하나. Image는 MIME `image/*` 또는 preview.type `image`. table은 sheets가 한 개 이상일 때다.

- 파일 미선택: 종이 3장 장식, `원문에서 시작되는 검토`, `문서를 선택하면 원문을 볼 수 있어요`, PDF/Word/Excel/CSV/Image 표기.
- 항상 원본 링크 `document.url`, `target="_blank" rel="noreferrer"`. 지원하지 않는 preview도 원본 링크는 유지.
- 이미지: `<img src=url alt="파일명 원본">`; max-width 100%, height auto. 실패 시 `이미지를 표시하지 못했어요. 원본을 열어 확인해 주세요.`. **이미지 위 bbox/줌/페이지 전환은 현재 없음**.
- Word/TXT/MD/JSON: 텍스트 종이; 실제 Word 페이지·머리글/바닥글의 시각적 재현을 주장하지 않는다. HTML 문자열을 삽입하지 않는다.
- PDF worker는 `pdfjs-dist/build/pdf.worker.min.mjs?url`을 Vite 자산 URL로 import하여 `GlobalWorkerOptions.workerSrc`에 설정한다. 실행 중 외부 CDN 요청을 요구하지 않는다.
- `public/pdfjs/6.3.289/{cmaps,standard_fonts,wasm,iccs}/`와 PDF.js LICENSE를 설치된 같은 버전에서 복사한다. 경로 root는 `${import.meta.env.BASE_URL}pdfjs/${pdfjsVersion}/`. worker와 자산 버전을 혼합하지 않는다.
- `getDocument({url,cMapUrl:root+'cmaps/',cMapPacked:true,standardFontDataUrl:root+'standard_fonts/',wasmUrl:root+'wasm/',iccUrl:root+'iccs/',useSystemFonts:true})`를 쓴다.

PDF 상태 초기값: `page=1, width=440, zoom=1, loading=true, error='', dimensions={width:440,height:620}, pageText=null`. URL 바뀌면 PDF·text·오류를 비우고 page/zoom 초기화. ResizeObserver는 container content width를 최소 140px로 기록한다. viewport scale은 `observedWidth * zoom / pdfPage.getViewport({scale:1}).width`. DPR은 `min(devicePixelRatio || 1,2)`; canvas backing size만 DPR 곱하고 CSS width/height는 viewport 크기. render transform은 DPR이 1이면 생략, 아니면 `[DPR,0,0,DPR,0,0]`.

render 완료 후 loading=false, `getTextContent()`로 각 run의 `str, transform, width, height, hasEOL`과 폰트 `ascent,descent`를 저장. 텍스트 획득 실패는 종이 렌더 성공을 취소하지 않으며 위치 색칠만 불가능해진다. PDF 로드 실패 메시지는 `이 PDF의 미리보기를 열 수 없어요. 원본을 열어 확인해 주세요.`; 페이지 실패는 `페이지를 표시하지 못했어요. 원본을 열어 확인해 주세요.`. `RenderingCancelledException`은 사용자 오류로 표시하지 않는다.

정리: URL 변경/unmount에서 `loadingTask.destroy()`; 페이지/width/zoom 변경 또는 unmount에서 `renderTask.cancel()`; ResizeObserver disconnect; cancelled 플래그 뒤 비동기 state 반영 금지.

### D1.2 페이지·확대·시트 선택

| 제어 | 동작/범위 |
|---|---|
| 이전/다음 | 1-based page, 1…numPages. PDF 없음/경계에서 disabled. page 출력 `현재 / 전체`, 로드 전 `—`, aria-live polite |
| 요청 근거 page | 양의 정수이며 numPages 이하일 때만 적용. 잘못된 page를 clamp해서 다른 페이지를 근거인 것처럼 보여주지 않음 |
| PDF 축소/확대 | 0.25 단계, zoom 1…2. 각 끝에서 disabled |
| 너비에 맞춤 | 항상 zoom=1; 표시 `맞춤`, 그 외 125%,150%,175%,200% |
| PDF source chip | 해당 highlight의 첫 page 근거가 truthy이고 PDF가 존재하며 1≤page≤numPages이면 setPage, 이어 선택 callback. 요청 prop 경로와 달리 정수/유한성 명시 검사가 없어 1.5도 수용한 뒤 PDF.js 오류가 날 수 있음. callback은 이동 실패와 무관하게 호출 |
| Sheet tab | 원문 이름 그대로, `role=tab`, aria-selected. state가 있고 visible이 아니면 `숨김`. 숨김 시트도 preview에 들어왔으면 사용자가 볼 수 있음 |
| 문서 ID 변경 | sheetIndex=0, imageError=false. PDF는 ID key로 재마운트 |
| sheet 근거 선택 | 서로 충돌 없는 sheet명을 찾으면 해당 tab으로 전환. compact + 1개 sheet면 tab bar 생략 |

표는 Excel 병합 셀/스타일을 그대로 그리는 뷰가 아니다. 최대 열 수까지 부족한 행을 빈 셀로 채우고 열 머리글 A…Z…AA, 행 1…을 붙인다. sticky 열 머리글 + 첫 행번호 열, 내부 가로·세로 스크롤을 사용한다.

공개 preview의 서버 계약: 최대 30 sheets, sheet별 100 rows × 100 cols, 전체 60,000 chars, cell별 최대 2,000 chars. 최초 budget을 모든 sheet에 공유하고 읽은 만큼 감소시킨다. 일부 절단이 있으면 `truncated=true`; 표 warning은 최대 10개, 각 1,000자. `미리보기는 문서 일부만 표시합니다. 전체 내용은 원본에서 확인하세요.`를 숨기지 않는다. 이것은 실제 E2B 전체 탐색 상한이 아니다.

### D1.3 근거 선택과 거짓 하이라이트 금지

색칠 우선순위는 **현재 선택 항목 → fail → review → pending → pass**. 여러 항목이 같은 셀을 차지하면 대표 항목으로 셀 색/버튼을 만들고 아래 작은 상태 점 버튼으로 각각 선택할 수 있게 한다. PDF는 선택 항목을 나중에 그려 위에 보이게 한다. 색·상태 라벨 둘 다 제공한다.

문서별 highlight는 evidence를 현재 documentId로 먼저 제한한다. 현재 문서의 evidence가 하나라도 있거나, 원래 evidence가 비었거나, targetDocumentId가 현재 문서면 fallback chip은 유지한다. 다른 문서 evidence를 현재 원문 위에 옮겨 칠하지 않는다. 선택 evidence는 explicit props 중 현재 문서의 evidence가 있으면 그것을 우선하고, 없으면 선택 highlight의 evidence를 사용한다.

**리뷰 항목 전처리는 필수다.** `presence==='present'|'unreadable'`이면 missing=false. 아니면 `presence==='missing'` 또는 `missingVerified===true`이면 missing=true. legacy 저장 데이터는 value 전체가 `누락|미기재|미제출|해당 항목 없음|missing|not provided|not reported|not present`(공백/대소문자 허용)에 해당할 때만 missing으로 인식. null/0/판독불가/자유로운 reason 문구로 누락을 추정하지 않는다. missing 항목의 색칠용 evidence에서 **target documentId 근거 전부 제거**하고 다른 기준 문서 근거는 보존한다. 원래 상세 설명용 evidence는 삭제하지 않는다. highlight에는 `sourceType:'review-item',targetDocumentId:item.documentId,missing`과 `itemAnchorLabels=[전체 label, label을 ·/›/>로 분리한 마지막 부분]`의 비어 있지 않은 unique 값을 보낸다. 이렇게 하면 누락 항목의 머리글/시료명 문맥 근거를 판정 위치로 칠하지 않는다.

Spreadsheet 좌표 규칙:

1. `A1`, `$B$3`, `A1:C4`, 역순 `C4:A1`, `1:3`, `row 2`, `2행`을 허용. 다중 주소는 따옴표 밖 comma/semicolon으로 분리. sheet qualifier는 `'검토 자료'!A1`, 작은따옴표 escape `''`를 지원.
2. 명시 sheet와 주소의 모든 qualifier는 대소문자 무시하여 같은 한 sheet로 해석돼야 한다. 다르면 ambiguous=true, 어떤 sheet도 색칠하지 않는다. 따옴표가 닫히지 않거나 비문자 주소도 ambiguous.
3. sheet 비교는 실제 sheet name과 일치; sheet 없을 때는 1-sheet 문서만 허용. 단일 CSV에는 evidence sheet `csv` 대소문자 무시 별칭 허용.
4. 좌표는 양의 safe integer. 범위를 100×100 preview 내로 clip한 뒤 unique row-major `{row,column}`로 확장. 좌표가 있으면 좌표 우선; quote로 다른 셀에 재배치하지 않는다. **현재 표 renderer는 좌표 경로에서 quote가 실제 셀 텍스트와 같은지 검증하지 않는다.** 따라서 upstream이 잘못 준 유효 좌표는 색칠될 수 있다. quote 불일치→색칠 거부는 이 renderer의 관측 기능이 아니다. 현재 재현은 이 좌표 우선 동작을 유지한다. interaction-contract I9.1의 TABLE-HIGHLIGHT-REBUILD admission은 OPTIONAL_FUTURE이며 별도 제품 변경을 선택했을 때만 실행한다. 좌표가 없고 quote가 있으면 해당 sheet 모든 셀을 exact text matcher로 한 번 탐색.
5. 인덱스 키 `(row-1)*columnCount+(column-1) → highlights[]`를 source/activeSheet 변화에만 재계산. 선택 항목 변경만으로 전체 셀 매칭을 반복하지 않는다.

Text exact matcher: 공백 연속만 ASCII space 한 개로 normalize하며 original offset map을 유지한다. case-sensitive. quote trim 후 모든 겹치는 발생 위치를 모은다. 숫자 quote의 시작/끝이 더 큰 숫자, 소수/천단위 구분, 부호 `+ - − ±`, 과학 표기 `e/E±digit`를 잘라내는 일치면 거부. 예 `5`는 `15`, `5.0`, `5e3`와 일치하지 않으며 `5 MPa`의 5는 가능. 빈 quote 금지. 좌표 없는 raw quote의 단순 `<mark>` 표시도 존재하나 이는 판정 색칠/매칭의 권위가 아니다.

PDF 매칭 계약:

- quote admission은 `!source.page || source.page === currentPage`다. 명시된 다른 page는 같은 문구여도 제외, page 생략/falsy0은 현재 모든 page에서 매칭 가능. 페이지를 생략한 동일 문구의 유일 page를 renderer가 찾아 보장하지 않는다.

- 실제 PDF.js text runs를 합치되 run 축 정렬 dot<.98, 수직거리>3×maxHeight, 또는 같은 줄에서 가로 gap>3×maxHeight이면 NUL separator를 삽입하여 다른 표/열을 하나의 quote로 합치지 않는다.
- 줄바꿈/수직거리>.35×maxHeight면 newline, 인접 fragment gap 절댓값≤.12×maxHeight면 separator 없음, 나머지는 space. quote 일치 run의 **전체 box**를 표시하며 부분 glyph 폭 추정 금지.
- review-item일 때 quote 안에 실제로 포함된 itemAnchorLabels만 witness로 인정(글자 `\p{L}` 포함). 인용된 run과 label run의 교집합이 없으면 box 없음. witness들이 서로 다른 행이면 중복 항목 위치 모호성으로 box 없음. same-row는 축 dot≥.98, 수직거리≤.4×maxHeight.
- 이름을 담은 quote의 같은 행 run은 색칠 가능. 이름 없는 값/단위 quote는 같은 행에서 동일 text run이 하나일 때만 추가; 반복 값/단위만으로 병렬 열을 고르지 않는다.
- box 계산은 viewport matrix V와 run matrix M의 2D affine 곱 T=V×M. advance vector=`(T.a,T.b)*run.width/hypot(M.a,M.b)`; height vector=`(T.c,T.d)*run.height/hypot(M.c,M.d)`; ascent는 유한한 ascent, 없으면 1+descent, 없거나 (0,2] 밖이면 1. origin=`(T.e,T.f)+(ascent-1)*heightVector`. origin 및 advance/height를 더한 4 corner의 min/max bbox. 유효하지 않은 matrix/폭높이, 절대값>1e8 좌표, 크기>1e7 box는 무시.
- OBSERVED_BASELINE: scanned PDF에 text layer가 없으면 **fallback chip만**이다. 원본 UI에 OCR bbox 추정 엔진이 있다는 주장은 금지한다. 현재 재현도 fallback chip만 사용한다. [08 RB-GEOMETRY](../specs/08-rebuild-coverage-geometry.md)는 OPTIONAL_FUTURE이며 원본에 없는 bbox를 현재 재현에 추가하지 않는다.

기준서 preview는 저장된 `sourceEvidence`+`evidenceCells`를 우선한다. 이것들이 없을 때 구조화 source.documentId가 있거나, 기준 파일이 하나이며 source에 page/sheet/cell이 있으면 source를 쓴다. 완전 동일 citation은 dedupe. 호환용 item-name 셀 보충은 엄격하게 제한: 글자 포함 label, citation.cell+quote, unambiguous sheet, 최대 12개 셀이며 같은 행, 실제 그 셀에 quote 일치, 공백 셀로 끊기지 않는 같은 record 안에 normalized(NFKC/공백제거/lowercase) label 셀이 정확히 하나, 위쪽 실제 item-header(`시험항목`, `검사항목`, `검토항목`, `측정항목`, `항목/항목명`, `시험명`, `item`, `testitem`, `parameter`, `test`) column 존재. 다른 header row를 가로지르지 않는다. 회복 후보가 전체에서 정확히 하나일 때만 preview citation 추가; 서버 criterion/provenance/verdict는 변경하지 않는다. 전치표와 애매한 중복명은 서버의 명시 근거가 필요하다.

Source chip 표시:

- noncompact은 전부. compact은 현재 위치에 실제 칠해진 항목을 숨기고, evidence가 전부 다른 page/sheet를 지목하는 항목도 숨긴다.
- 현재 위치에 없지만 다른 페이지/시트의 근거가 있으면 `Np`/sheet명 표시. 현재 근거 위치를 못 찾았으면 missing은 `항목 누락`, evidence 있음은 `위치 확인`, evidence 없음은 `근거 없음`.
- 선택시 `aria-pressed`; label/title에 상태+항목명, 누락/위치 불명 설명. 원문 아래 selected evidence 첫 3개를 page/sheet/cell과 quote로 표시.
- 선택 mark가 viewport 위 40px/아래 24px 경계를 벗어나면 `top += target.top-viewport.top-min(90,clientHeight/4)`; 좌 35px/우 12px 경계 밖이면 `left += target.left-viewport.left-45`. 각 0 이상 clamp. reduced는 `behavior:'instant'`, 일반은 `smooth`. 외부 문서 전체가 아니라 해당 내부 viewport만 스크롤.

### D1.4 측정 가능한 색/레이아웃/모션

| 항목 | 값 |
|---|---|
| 원문 panel | white, border #e8e8e5 1px, radius14; toolbar min49px, 0 16px |
| viewport | height clamp(320px,48vh,520px), overflow auto, overscroll contain, bg #f3f3f0 |
| PDF/image padding | 24px; criteria compact source-pane PDF 14px |
| table | font10px, line-height1.7, cell padding9px 11px,min70,max230; sticky row number33px |
| pass fill/line/ink | #d5eaa67a / #8ca74a / #526829 |
| fail fill/line/ink | #efb3a377 / #d07d68 / #95543f |
| review fill/line/ink | #f4d48c80 / #c79a42 / #946c25 |
| pending fill/line/ink | #dedde780 / #a09ba9 / #756f80 |
| selection | PDF outline2px+offset2px; cell inset2px; 750ms ease-out brightness 1→.91 at40%→1 |
| PDF paper | initial opacity0,y8; loading opacity.35,y4; ready opacity1,y0; .35s ease [.2,.7,.3,1]; reduced initial=false,y0 |
| scanning condition | stage reading/extracting only; label `문서 내용 읽는 중`/`검토 항목 추출 중` |
| scanning visuals | overlay top -30%→100%, height30%, 3.2s cubic-bezier(.35,.1,.5,.95) infinite; pulse1.4s opacity .3 at50%; registration four corners11px |
| loading spinner | .8s linear rotate360 infinite, loading only |
| source chips | gap6,padding11px 13px,max-height96px, chip max-width190px; compact는 높은 specificity가 이겨 max-height41px,padding5px9px,gap5px,flex-shrink0 |
| reduced motion | root data-motion=reduced: all descendant animation/transition none !important; scan-overlay hidden; no fake progress replacement |
| ≤520px | viewport350px; toolbar padding12; table min65px; chip max160px; legend help hidden |

## D2. CriteriaConfirmation: 원문과 기준을 수정하고 명시 확정

### D2.1 구조와 입력 상태

페이지 내 section(모달 아님). heading `이 기준으로 검토할까요?`, 출처 tabs, 왼쪽 editable 기준 tree, 오른쪽 원문, 하단 고정 footer. 원문은 `React.lazy`+`Suspense`로 불러온다. 기준 tab을 전환하면 원문 ID도 전환하고 선택 evidence·선택 criterion·펼친 editor·uncertain 상세를 초기화. 표준 상태 `drafts[], expandedId|null, activeSourceKey, previewDocumentId, previewEvidence[], previewCriterionId, feedback, feedbackEntries[], submitting, feedbackSending`. 전체 disabled=`busy || submitting || revising || feedbackSending`.

초안 초기화: 각 criterion shallow copy, included=true, comparison 있으면 numeric 없으면 qualitative, 기본 operator lte, 숫자 문자열/단위/conditions/categoryPath/scope/sampleName을 입력 필드로 분리. incoming criteria의 JSON signature 또는 revision 값이 실제 바뀌면 초안을 **서버 새 버전으로 다시 초기화**, editor/error 해제, local sending/sent feedback를 applied로 전환. 동일 props 재렌더만으로 사용자의 미확정 편집을 날리지 않는다.

출처 그룹: 기준 role 파일 inventory를 순서대로 표시. sourceDocumentId/구조화 source.documentId/sourceEvidence.documentId에서 현재 기준 파일 ID 또는 `natural-language`로 실제 해석되는 목적지를 먼저 모은다. **유효 목적지가 0개이면 메타데이터 존재 여부와 무관하게** 문자열 source 설명의 완전한 파일 ID token을 찾고, 여전히 0개이면 고유 파일명과 sourceName의 정확한 일치 또는 설명의 완전한 파일명 token을 찾는다. 중복 파일명은 자동 선택하지 않는다. 따라서 sourceDocumentId='unknown', source='known-id'이고 known-id 기준 파일이 있으면 `file:known-id`로 연결한다. 유효 명시 목적지가 하나라도 있으면 설명 fallback으로 다른 파일을 추가하지 않는다.

파일 연결 후에도 목적지가 0개일 때 자연어 source marker가 있으면 `직접 입력한 기준`으로 간다. marker는 문자열 source, sourceName, 구조화 source의 type/kind/origin을 합친 값이다. marker가 없을 때만 `hasSourceMetadata=false`이고 human-/revision- ID 또는 text 입력 모드이면 직접 입력으로 간다. hasSourceMetadata는 비어 있지 않은 명시 ID가 하나 이상이거나 marker가 비어 있지 않거나 구조화 source에 key가 하나 이상이면 true다. unknown ID도 metadata로 세므로 sourceDocumentId='unknown'만 있는 기준은 inputMode=text/human- ID여도 `출처 확인 필요`이며, metadata 없음 제한을 ID/파일명 fallback 앞에 적용하지 않는다. categoryPath가 실제 있으면 그 계층, 직접 입력의 `scope.trim()`이 `공통`이면 공통 계층이며 계층 이름에는 trim 전 원래 scope 문자열을 보존, 그 밖에 scope/label을 유형으로 추정 금지. sampleName이 마지막 path와 다르면 leaf로 추가. 유형 없는 기준은 **평평한 목록**으로 정상 표시; 가짜 `미분류` 타입 강요 금지. criterion은 여러 실제 source 그룹에 나타날 수 있지만 그룹당 ID dedupe. 유일 자식만 있고 직접 criterion이 없는 계층은 chain label로 압축. CRITERIA-TREE의 sourceResolutionEdgeCases가 이 경계의 독립 입력/기대값이다.

#### D2.1.1 출처 token·자연어 marker의 정확한 matcher

`nonempty(x)`는 `typeof x==='string' && x.trim().length>0`이다. 유효성을 확인한 뒤 ID·파일명·sourceName 값을 저장하거나 비교할 때 자동 trim/lowercase/NFKC 변환을 하지 않는다. 명시 ID와 inventory ID의 Map 조회는 JS 문자열의 대소문자 구분 완전 일치다. `sourceName===group.name` 비교도 raw 문자열 완전 일치다.

설명 token 검사 `mentions(description, token)`는 아래 함수 그대로다. `description.trim()===token`의 단독 token 예외를 먼저 검사하지만 token 자체를 trim하지 않는다. 정규식 flag는 `u`뿐이며 대소문자를 구분한다. token의 정규식 특수문자는 escape하므로 파일명 `a+b.pdf`의 +와 .은 문자 그대로다. 아래 문자열의 backslash는 JS 문자열 literal escaping을 포함한다.

```js
function mentions(description, token) {
  if (!nonempty(description) || !nonempty(token)) return false;
  if (description.trim() === token) return true;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?:^|[\\s\\[({<"\':;,/\\\\])' + escaped
    + '(?=$|[\\s\\])}>"\':;,!])', 'u').test(description);
}
```

왼쪽 경계는 시작 또는 공백/`[`/`(`/`{`/`<`/큰따옴표/작은따옴표/`:`/`;`/`,`/`/`/`\`이고, 오른쪽 경계는 끝 또는 공백/`]`/`)`/`}`/`>`/큰따옴표/작은따옴표/`:`/`;`/`,`/`!`다. 하이픈·underscore·마침표는 양쪽 경계가 아니며 `/`와 `\`는 오른쪽 경계가 아니다. 이 비대칭을 일반적인 단어 경계로 바꾸지 않는다.

자연어 판별은 `sourceMarkers=[문자열 source, sourceName, 구조화 source.type, source.kind, source.origin].filter(nonempty).join(' ')`에 아래 식을 적용한다. Unicode 전용 단어 분리기를 추가하지 않으며 JS `\b`와 `i` 의미 그대로다. marker를 고정 enum 하나로 제한하지 않고 정규식에 맞는 부분이 있으면 true다.

```js
/사용자\s*(?:입력|요청|지시)|직접\s*입력|자연어|\b(?:natural(?:[_ -]language)?|user(?:[_ -]?(?:text|input|request))?|manual)\b/i
```

marker가 없고 metadata도 없을 때 사용하는 `inputMode` 집합은 정확히 `['text','natural','natural-language','natural_language','usertext','manual']`이다. Set.has이므로 case/trim을 보정하지 않는다(`Text`, `' text '`는 해당 없음). 동일 조건에서 criterion.id가 raw 대소문자 구분 `human-` 또는 `revision-`으로 시작하면 text group이다. natural marker는 metadata가 있어도 적용되지만 이 inputMode/ID 추론은 `!hasSourceMetadata`일 때만 적용된다. 어느 쪽도 이미 찾은 file 목적지를 text로 바꾸지 않는다.

최소 입력은 문서 `{id:'known-id',name:'known.pdf',role:'criteria'}` 하나, 기본 criterion `{id:'c',label:'항목',rule:'기준 준수'}`, inputMode='file'이며 각 행의 patch만 독립 적용한다. 기대값은 해당 criterion이 들어가는 group key다.

| criterion patch 또는 options | 기대 group | 이유 |
|---|---|---|
| source='[known-id]' 또는 source=' known-id ' | file:known-id | 괄호 경계 또는 trim한 단독 token |
| source='prefix-known-id' 또는 source='known-id-more' | unlocated | 하이픈은 경계가 아님 |
| source='KNOWN-ID' | unlocated | ID matcher는 대소문자 구분 |
| sourceName='known.pdf' | file:known-id | 고유 파일명의 raw 완전 일치 |
| sourceName=' known.pdf ' | unlocated | sourceName 직접 비교는 trim하지 않음 |
| sourceName='자연어' 또는 sourceName='사용자 입력' | text | 각각 natural marker 식 일치 |
| sourceDocumentId='unknown', source='[known-id]' | file:known-id | 명시 ID가 해석되지 않아 설명 fallback 허용 |
| sourceDocumentId='unknown', sourceName='USER INPUT' | text | file 목적지 없음, marker는 i flag로 일치 |
| sourceDocumentId='unknown', inputMode='text', id='human-c' | unlocated | metadata가 암묵적 mode/ID 추론을 막음 |
| source 속성 없음, inputMode='text' | text | metadata 없는 허용 mode |
| source 속성 없음, inputMode='Text' 또는 ' text ' | unlocated | mode는 대소문자/공백 보정 없음 |

excludedDocuments는 documentId로 dedupe. excluded source 중 하나라도 criterion에 명시/안전 해석돼 있으면 그 criterion 전체를 적용 후보에서 제외. 제외 파일들은 이유+원문 링크로 별도 접힌 안내. 기준 파일 전체가 제외되면 모든 draft를 숨기고 제목 `기준 파일을 다시 선택해 주세요`, empty `기준으로 사용할 파일이 없습니다`, 재선택 CTA만. uncertain assessment는 자동 제외하지 않고 tab 경고+사유/원문 상세를 둔다.

### D2.2 직접 편집과 제한

| 필드 | UI 제한/확정 검증 |
|---|---|
| 적용 checkbox | false면 편집 fieldset disabled, 수치/문구 validation 대상에서 제외 |
| 항목명 | 필수 trim, maxLength500 |
| 적용 대상 | 선택, maxLength500 |
| 판정 기준 문구 | 필수 trim, maxLength4000, 직접 수정 즉시 comparison 제거·comparatorConfirmed=false·mode=choose·value/upper 빈 값 |
| 판정 방식 | choose(선택 안내, disabled option)/numeric/qualitative. 문구 수정 뒤 choose 상태에서는 확정 불가 |
| 비교 | lte 이하≤ / gte 이상≥ / lt 미만< / gt 초과> / eq 같음= / range 양끝 포함 |
| 숫자 | number input step any, 문자열 입력100자 이하. 비어 있거나 `Number` 비유한이면 invalid. range upper≥value |
| 단위 | 선택, maxLength80 |
| 적용 조건 | textarea max6500; newline trim+빈 줄 제거+dedupe; 최대12개, 한 줄500자 |
| 유형 경로 | newline 한 단계, textarea max1608, 최대8단계 × 각200자; 빈 path 허용 |
| 시료·제품명 | 선택, max300 |
| 추가 | 일반 toolbar 버튼만 selected<250 AND availableDrafts<500 AND enabled 조건. 빈 출처의 추가 버튼은 disabled만 확인하며 handler guard는 disabled 또는 allFilesExcluded뿐. 따라서 초안 상한 우회 가능하나 확정은 1…250 유지. ID `human-${crypto.randomUUID()}`, 빈 label/rule, source 사용자 입력, active source 연결 |
| 확정 수 | selected 1…250. 0/초과면 버튼 disabled 및 상태 문구 |
| 자연어 수정 요청 | maxLength12000, trim empty 전송 불가 |

numeric mode에서 label/value/operator/upper/unit/scope/conditions 변경하면 rule을 즉시 다시 작성한다. 형식: `항목: ≤ 10 mg/L · 적용 대상: … · 조건: 조건1, 조건2`; 범위는 `항목: 10 ~ 20 mg/L (양 끝 포함)`. 분류 path 편집 blur에서 변경됐으면 classificationNeedsConfirmation=false, 비어 있으면 classificationStatus=not_applicable, 있으면 resolved, classificationReason=''. sampleName은 blur trim.

확정 직렬화는 이전 comparison/comparatorConfirmed/draftState를 먼저 제거한다. label/rule/scope/unit/sampleName trim, conditions dedupe, categoryPath trim lines. numeric이고 유효한 경우에만 `{comparison:{operator,value:Number,upper?:Number,unit},comparatorConfirmed:true}`. qualitative에는 이전 comparator를 절대 남기지 않음. 확정은 needsConfirmation=false. revision 요청은 incomplete input도 보낼 수 있으며 `{draftState:{mode,operator,value,upper,unit,issues},needsConfirmation:issues.length>0 || oldNeedsConfirmation}`를 포함해 빈 숫자를 0으로 바꾸지 않는다.

확정 버튼 누름 → 첫 invalid criterion의 출처/행을 선택·펼치고 requestAnimationFrame 후 scrollIntoView(block nearest), 첫 오류 표시 → 유효하면 onConfirm(직렬화된 selected) await. false/throw면 오류 후 동일 화면, finally submitting=false. 성공이 실제 다음 화면 전환의 신호이며 기준 추출 완료가 자동 확정을 의미하지 않는다. 취소 CTA는 `기준 입력으로`.

대표 오류 문구: `항목명을 입력해 주세요.`, `판정 기준을 입력해 주세요.`, `수정한 기준이 수치 기준인지 정성 기준인지 선택해 주세요.`, `유효한 기준값을 입력해 주세요.`, `상한은 하한 이상의 숫자여야 합니다.`.

### D2.3 HITL 재수정·출처 연결·탐색 범위

feedback local entry는 UUID/text/현재 group name/status sending. `onRevise(text,selectedSerializedForRevision,documentId?)`의 documentId는 text group이면 `natural-language`, file이면 그 ID, 기타 undefined. selected>250만 거부하므로 0개 초안에서 누락 기준 추가 요청은 가능. accepted=false/throw는 failed 기록+오류, 입력 유지. 성공은 composer 비우고 sent; 실제 새 criteria/revision 수신 뒤 applied. stored feedback의 completed/applied/succeeded→applied, failed→failed, 기타 sent. 서버/local 기록이 text+scope가 같으면 local 중복 생략. 대화 이력은 접힌 details, scope/상태/요청/응답 summary/경고를 표시.

원문 링크 누름: 문서가 local documents에 있으면 오른쪽 preview에 즉시 위치 표시; 없으면 상위 onSource callback. 원문 highlight 누름은 반대로 해당 criterion을 펼쳐 nearest scroll하며 양방향 selection. 원문 없는 항목의 표시 `직접 입력한 기준` 또는 `원문 위치 정보 없음 · 직접 확인해 주세요`; 임의 파일과 연결 금지.

탐색 범위 details는 sources+discovery에서 실제 inventory sheets, coverage, warnings, regions를 표시. 같은 file/sheet count dedupe. `allSheetsInventoried=false`, `allRegionsExamined=false`, unresolved/remaining ranges, 읽지 못한 이미지 수, classificationLimitReached, criteriaLimitReached/droppedCriteria를 경고로 노출. `cellsRead`는 실제 읽은 셀 숫자. region 상태는 !examined→미확인, criteria→기준, context→배경 정보, unrelated→기준에서 제외, 그 외 해석 확인. region 링크는 sheet와 range의 첫 cell로 preview 이동. coverage warning이 있다고 버튼을 자동 봉쇄하지는 않으며 사람이 확인할 내용을 남긴다. 원문 전체 읽기 완료와 모든 문맥 확인을 혼동하지 않는다.

### D2.4 배치 기준

최종 CSS cascade 기준: header min70,padding11px 18px,title20px/1.3,eyebrow8px/11px, subtitle 숨김; 숫자 count29px. workspace columns `minmax(0,1.05fr) minmax(0,1fr)`; container≤800은1.1fr:1fr. row grid `18px minmax(84px,1.15fr) minmax(64px,.9fr) minmax(35px,.45fr) minmax(65px,.95fr) 26px 20px`; gap6, min-height34,padding6px 8px; columns=체크/항목/기준/단위/대상조건/원문/펼침. label12px/21px, numeric14px, rule11px, unit/조건10px. 원문과 편집부 각각 내부 scroll. footer padding8px 15px/min-height52px, CTA min36px/padding-block7px/font12px. mobile≤680: height=min(1000px,92dvh),min620px; workspace 한 열, row heights minmax(280px,1.2fr) + minmax(220px,1fr), footer 한 열. 작은 화면의 내부 스크롤은 정상이며 모든 문서 내용을 한 viewport에 구겨 넣는 조건이 아니다.

## D3. DocumentAnalysis: 읽기와 문맥 이해의 구분

### D3.1 선택·완료·관측 이벤트

상태는 selectedId/logsOpen/detailMode(context|checks|transcription|null). selected document는 사용자 선택 ID, 없으면 최근 documentId activity, 없으면 첫 문서. 파일 클릭 후에는 사용자 선택이 유지된다. 문서 변경시 상세 닫기. 문서별 분석 Map과 latest activity Map으로 독립 상태 표시. selectedEvents는 해당 documentId 또는 documentId 없는 전역 activity만 포함.

finished status 집합=`ready,complete,completed,analyzed,done`. attention=`review,needs_confirmation,confirmation,partial,unsupported,failed,blocked,error,limited`. **분석 완료 count는 finished이면서 quality 없거나 quality.status=verified일 때만**. quality가 limited/needs_review인데 status=complete인 문서를 완료로 집계하지 않는다.

phase 라벨은 read 파일 탐색 → structure 구조 분석 → transcribe 내용 읽기 → extract 항목 정리. step 해석 순서: quality/validate/repair/retry→structure; extract/field/normalize/organize/ground/verif→extract; transcri/vision/vlm/content/read_page→transcribe; struct/profile/header/explor/inventory/analy/context→structure; 나머지 read. 완료면 extract에 정지. 이것은 실제 이벤트를 읽어 표시하는 UI 분류이지 네 단계를 임의 타이머로 완료시키는 워크플로가 아니다.

readingSummary 우선: readerComplete=false→`원문 일부 미확인`; readerComplete=true & complete=false이면 visualAnalysisPending 또는 transcription.complete=false→`원본 파일 확인 · 전사 확인 필요`, 나머지→`원문 읽기 완료 · 해석 확인 필요`. context summary에 덮여 사라지지 않아야 한다.

### D3.2 지도·coverage·세부 drawer

inventory는 배열 또는 sheets/worksheets/sheetInventory 또는 pages/pageInventory를 읽는다. 이름 외에 rows,columns,range,region 수,mergedRangeCount,hidden/veryHidden,rotation을 서술한다. structure는 `{name?,kind?,page?,sheet?,range?,headers?,description?,uncertain?}` 배열. sheet→page→document는 **그룹 키 선택의 우선순위**이며 표시 정렬 순서가 아니다. inventory 먼저 삽입하고 structure의 새 키만 뒤에 추가하는 정확한 순서·레이블 계약은 D3.2.1을 따른다. 전사에 포함된 `kind=text,page=N,name='N쪽'` page wrapper는 독립 region 카드로 중복 표시하지 않고 group.description에 합친다. 원문 위치(page 또는 sheet)가 없는 region 버튼은 disabled. 클릭하면 documentId+page/sheet+range의 첫 cell만 source callback.

CoverageArc는 SVG viewBox56,r22,pathLength1. ratio는 numerator+denominator가 있고 denominator>0일 때 clamp(n/d,0,1), 그렇지 않으면 explicit complete=true일 때1, 아니면0. 숫자 불명확은 `—`, 완결 선언만 있으면 체크; 가짜 percent 금지. 원본 읽기 arc=`unitsRead/unitsTotal, readerComplete`; 문맥 해석 arc=`contextSegmentsRead/contextSegmentsTotal,contextComplete`; visual은 `analysis.coverage.transcription.transcribedPages.length/expectedPages,coverage.contextComplete`를 페이지 전사로 표시. 테이블 count는 kind table/criteria, header count는 비어 있지 않은 header label 수. 최종 seal은 coverage.complete일 때만 범위 확인.

파일 목록 role: 기준 파일/검토대장/검토 문서. 지도 card는 시트/페이지 heading+원문 버튼, region 카드 이름/위치/첫3 header+추가 수, uncertain 경고, nested-table description일 때 중첩 표 badge. 하단 action `맥락 · 구조 자세히`, 전사 markdown 존재시 `전사 텍스트`, `원문`.

상세는 페이지 내 `aside`, dialog 아님. 열면 close 버튼 focus, Escape로 닫기. context=summary+inventory facts+sheet/page+영역별 header/description+quality history; checks=quality issues+questions+warnings+uncertain region; transcription=문단/표/주석 markdown을 plain `<pre tabIndex=0>`로 표시, markdownTruncated 알림. Markdown HTML 실행 없음. close 후 이전 trigger로 focus를 복원하는 별도 코드가 기준 구현에는 없음(접근성 개선 필요 사항으로 기록 가능).

quality rail은 quality 또는 quality 관련 실제 activity가 있을 때 일반 phase rail을 대체. step reread 우선, repair/retry, quality/validate/verify 순으로 phase 분류. event.attempt는 양의 정수만 회차에 넣음. event 회차를 모은 뒤 quality.rounds를 우선 덮어씀. 최대 횟수도 quality.maxAttempts 또는 event.maxAttempts가 실제 있을 때만 `최대 N회`. activity만 있고 terminal quality 없고, 마지막 선택문서 event가 running이며 busy일 때만 animate. status verified→검증 통과, limited→제한·확인 필요, 기타→확인 필요. history는 attempts/maxAttempts, issues, 각 attempt의 status/issueCount/rereadRanges를 보인다.

로그는 busy=true로 바뀔 때 자동 펼침, busy=false로 바뀔 때 자동 접힘; 사용자가 다시 토글 가능. activity count+마지막 실제 title. 새 로그 auto-follow는 사용자가 바닥에서 28px 미만일 때만; 위로 읽으면 새 로그로 끌고 내려오지 않는다. 시각 기록 timestamp는 ko-KR HH:mm:ss, invalid time은 빈 값. progress 완료/오류/진행/안내는 activity.status로만 산출.

### D3.2.1 inventory 표시값과 구조 그룹의 정확한 병합

아래는 CURRENT_REPRODUCTION이다. 대소문자·공백·숫자 문자열을 보정하거나 시트명/페이지 번호순으로 정렬하지 않는다. 자족적인 입력과 전체 그룹 출력은 [document-analysis-structure-cases.json](document-analysis-structure-cases.json)의 8개 사례에 있다. fixture의 브라우저 실행 상태는 NOT_RUN이며 로컬 순수 helper 결과를 브라우저 렌더 증거로 대신하지 않는다.

공통 helper는 다음과 같다.

- `record(v)`: truthy인 비배열 object이면 그대로, 그 외 `{}`. 직접 배열은 root object로 보지 않는다.
- `plain(v)`: string이면 공백/대소문자를 포함하여 그대로; finite number이면 `String(v)`; boolean/null/undefined/비유한 숫자/object는 `''`.
- `first(obj,keys)`: keys 순서대로 **undefined/null이 아닌 첫 값**. `''`, `0`, `false`도 선택하며 다음 alias로 넘어가지 않는다. 모든 key가 nullish이면 undefined.

`inventoryParts(value)`의 배열 선택 순서는 다음과 같다. `root=record(value)`, `rawSheets=first(root,['sheets','worksheets','sheetInventory'])`, `rawPages=first(root,['pages','pageInventory'])`를 먼저 만든다. entries는 `Array.isArray(value)`이면 value, 아니면 rawSheets가 배열이면 rawSheets, 아니면 rawPages가 배열이면 rawPages, 아니면 `[]`다. 빈 배열도 앞 순위를 차지한다. 예를 들어 `sheets:[]`이면 뒤의 worksheets/pages를 합치지 않는다. `sheets:''`는 worksheets alias를 가리지만 rawPages가 배열이면 pages branch는 사용할 수 있다.

각 entry를 입력 순서대로 다음 part로 바꾼다. index는 0-based이다.

1. entry가 string이면 `{name:entry,description:''}`. **rawSheets가 배열일 때만** `sheet:entry`도 넣고 즉시 반환한다. pages의 string entry에는 page 번호를 자동 생성하지 않는다.
2. 나머지는 `item=record(entry)`. sheet 후보=`plain(first(item,['sheet','sheetName','name']))`. pageValue=`first(item,['page','pageNumber','number'])`; `typeof pageValue==='number'`이면 pageValue, 그렇지 않고 **rawPages가 배열이면** index+1, 아니면 undefined. 이 fallback 검사는 선택된 entries가 sheets인지와 독립이다.
3. range=`plain(first(item,['range','usedRange','dimension','dimensions']))`; rows=`plain(first(item,['rows','rowCount','maxRow','max_row']))`; cols=`plain(first(item,['columns','columnCount','maxColumn','max_column']))`.
4. name=`plain(first(item,['title','name','sheet','sheetName'])) || (page ? page+'페이지' : '영역 '+(index+1))`. 첫 title이 빈 문자열이면 뒤 name으로 넘어가지 않고 fallback을 사용한다.
5. description은 `[rows && rows+'행', cols && cols+'열', range, regions, merged, hidden, rotation]`에서 truthy만 남겨 ` · `로 join한다. regions는 item.regions가 배열일 때 길이+`개 영역`(0개도 표시); merged는 `typeof mergedRangeCount==='number' && >0`이면 `병합 N곳`; hidden은 `hidden===true || state==='hidden' || state==='veryHidden'`일 때 `숨김 시트`; rotation은 `typeof rotation==='number' && rotation!==0`일 때 `회전 N°`. 숫자 rows=0은 plain 후 `'0'`이므로 `0행`이다. 숫자 유효성 검사는 각 조건 그대로이며 merged/rotation에 별도 finite 검사는 없다.
6. part는 name/description을 항상 포함한다. `Array.isArray(rawSheets) && sheet`일 때만 sheet, page가 truthy일 때만 page, range가 truthy일 때만 range를 추가한다. page 숫자 0/NaN은 빠지고 음수는 남는다. 직접 배열의 `{sheet:'A'}`는 name에는 쓰일 수 있지만 rawSheets가 배열이 아니므로 **part.sheet로 보존되지 않는다**. 이를 자동 수정하지 않는다.

`structureGroups(analysis)`의 key는 truthy sheet이면 `'sheet:'+sheet`, 아니고 truthy page이면 `'page:'+page`, 아니면 `'document'`다. JS Map의 삽입 순서를 그대로 표시한다.

1. 빈 Map에 inventoryParts의 각 part를 `set(key,{...part,id:key,regions:[]})`한다. 같은 key가 다시 나오면 **나중 part가 이름·설명·범위 등 값을 덮어쓰고 첫 삽입 위치는 유지**한다. 직접 배열에서 sheet/page가 없는 여러 part는 document key 하나로 합쳐져 마지막 part의 이름이 남는다.
2. `analysis.structure || []`를 원래 순서대로 방문한다. 해당 key가 없을 때만 맨 뒤에 `{id,name:region.sheet || (region.page ? region.page+'페이지' : '문서 전체'),description:'',sheet:region.sheet,page:region.page,regions:[]}`를 추가한다. structure-only 그룹의 이름에 region.name을 쓰지 않으며 range도 그룹에 복사하지 않는다. sheet/page가 undefined인 property는 런타임 객체에 있을 수 있으나 JSON 직렬화에서는 생략된다.
3. `!!analysis.transcription && region.kind==='text' && region.page && region.name===region.page+'쪽'`이면 page wrapper다. 이 조건은 case-sensitive이고 transcription의 내용/완료 여부는 검사하지 않는다. wrapper는 region 카드에 push하지 않고 그룹 description을 `[기존 description,region.description].filter(Boolean).join(' · ')`로 바꾼다. sheet와 page가 함께 있는 region도 이 조건으로 판정한다. transcription이 없거나 name이 `2페이지`인 text region은 일반 카드다.
4. 나머지 region은 그룹의 regions에 원래 객체를 그대로 push한다. 그룹 안 카드 순서는 해당 key가 structure에서 나타난 순서이고 ID/name으로 중복 제거하지 않는다. 최종 결과는 `[...groups.values()]`이며 추가 정렬이 없다.

예를 들어 inventory sheets=`['B','A']`, structure sheet 순서=`A,C,B`면 지도는 **B,A,C**다. inventory B,A,B에서는 마지막 B 내용이 첫 위치에 남는다. 카드 heading은 group.name, footer는 group.description이 truthy이면 그 값, 아니면 `N개 구조 요소`다. inventory-only 그룹의 빈 region 그림은 기존 I7의 `구조 미확인` 계약을 따른다. context drawer의 inventory 목록은 `inventoryParts` 배열 자체를 사용하므로 Map에서 합쳐진 중복도 목록에는 각각 남고, 영역별 해석 목록은 원래 structure 배열을 표시하므로 wrapper를 지도처럼 제거하지 않는다.

### D3.3 모션 수치와 cleanup

| 대상 | trigger/시작→끝 | timing |
|---|---|---|
| 현재 phase node | 실제 phase 변경, Motion layoutId document별 | .55s ease[.22,1,.36,1], reduced 0 |
| coverage arc | 실제 ratio 변경 pathLength0→ratio | .7s 같은 ease, reduced initial=false/duration0 |
| sheet/page card | 실제 group 도착 opacity0,y12,scale.98→1,0,1 | .6s, delay min(index,5)×.08s |
| region button | 실제 region 도착 opacity0,x-7→1,0 | .52s, delay min(index,5)×.075+.12s |
| drawer | 열기 opacity0,x20→1,0; 닫기 opacity0,x10 | .4s 같은 ease, reduced x0/duration0 |
| 단계 wire | data-running=true인 current 단계만 left -50%→120%; 0–15%/85–100% opacity0,30% opacity1 | 2.5s ease-in-out infinite |
| 구조 탐색 scan | busy & terminal 아님; y0→100px→0, opacity .15→.7→.15 | 3.7s cubic-bezier(.45,0,.55,1) infinite |
| quality icon | 실제 active 검증 rail | 3s linear rotate360 infinite |
| repair icon | busy repair workspace | 4s linear rotate360 infinite; validate/repair 중 scan line 숨김 |

reduced에서는 initial=false 또는 이동거리0, CSS wire/scan opacity0+animation none, quality spin none. busy/terminal 변경은 data-running=false로 애니메이션 정지. 각 CSS keyframe은 해당 DOM unmount 시 소멸하며 자체 interval 없음. **한계:** 현재 일반 phase/map의 running 판정은 일부 위치에서 busy+terminal 상태를 사용하므로 매 프레임 실제 API 호출 하나를 뜻하지 않는다. 실제 회차/로그를 만들어 추가하면 안 된다.

## D4. LedgerModal: 검토대장에 새 사본으로 반영

### D4.1 입력·상태·검증

native `<dialog>.showModal()` + Motion 진입, aria-labelledby/title와 describedby 설명. 필드: XLSX 한 개, 검토한 target 문서 select, 성적서번호(max200), 분석 버튼, 기존값/기입값 표, 추가 확인 메모(max1000), 다운로드 버튼. sourceDocuments는 run.documents 중 role=target만; 외부 documents 메타에 run 문서 값을 우선 merge. 기본 source 첫 target. extraction.referenceNumber가 string/number면 trim+slice200 자동 입력; 사용자가 번호를 바꾸면 재분석 요구. 기존 role ledger && kind xlsx가 있으면 처음부터 선택.

operation=`null|upload|analyze|export`; ref busy가 연속 클릭을 동기적으로 막고 UI busy=operation!=null로 disabled. 파일은 이름 .xlsx 대소문자 무시, size>0 && ≤20*1024*1024. 드롭은 정확히1개; 아니면 `검토대장 한 개를 선택해 주세요.`. extension 오류 `검토대장은 XLSX 파일로 선택해 주세요.`. size 오류 `빈 파일은 사용할 수 없어요. 파일당 20MB 이하의 XLSX를 선택해 주세요.`.

파일/번호/대상 문서 변경시 analysis,basis,note,error,success 초기화. 추가 메모 변경은 success만 초기화. `canAnalyze=ledger && sourceDocumentId && key.trim() && !busy`.

### D4.2 네트워크와 변경 방지 기준

```ts
type LedgerMapping = {
 status:'ready'|'blocked'; code?:string|null; reason?:string; sheet?:string;
 key:string; headerRow?:number; keyColumn?:string; resultColumn?:string; noteColumn?:string;
 matchingRows?:number[]; targetCells?:string[]; existingValues?:Record<string,string>;
 sourceDigest?:string; candidates?:{sheet:string;row:number}[];
};
type LedgerProposal = {
 fingerprint:string; result:'적합'|'부적합'|'확인 필요'; note:string;
 counts:{total:number;pass:number;fail:number;review:number};
 sourceDocumentId:string; sourceDocumentName:string; incomplete:boolean;
};
type Basis={documentId:string;key:string;runId:string;sourceDocumentId:string};
```

1. Upload POST `/api/documents`: FormData `files=<File>`, `role=ledger`; AbortSignal. 응답 documents[0]의 id 존재/kind.toLowerCase()==xlsx 검증.
2. Analyze POST `/api/ledgers/analyze`: JSON `{...basis,contextId:UUID}`. basis는 현재 ledger.id/key.trim()/run.id/sourceDocumentId의 snapshot. 응답 mapping.status는 ready 또는 blocked 필수. ready이지만 proposal 없거나 targetCells.length!=2이면 오류; export 불허.
3. canExport는 ledger, basis, proposal.fingerprint, mapping ready, 정확히 두 targetCells, basis.documentId==ledger.id, basis.key==key.trim(), basis.runId==run.id, basis.sourceDocumentId==선택ID, !busy의 **전부**가 참이어야 한다.
4. Export POST `/api/ledgers/export`: JSON `{...basis,mapping,proposalFingerprint:proposal.fingerprint,confirmed:true,...(trimNote?{note:trimNote}:{})}`. 응답 !ok는 JSON message 또는 error string/error.message; parsing 실패 generic. blob size0은 오류. 서버에서도 sourceDigest/fingerprint/확정된 셀 재검증을 해야 하며 UI canExport는 보안 경계가 아니다.
5. 새 blob object URL로 임시 anchor download. Content-Disposition `filename*=UTF-8''…`가 있으면 decodeURIComponent 뒤 slash/backslash/ASCII control을 `_`로 대체. 없거나 decode 실패이면 원래 파일명의 .xlsx 제거+`_검토반영.xlsx`. anchor 클릭 후 제거; object URL은1000ms 후 revoke. 성공은 다운로드 **시작** 메시지, OS 저장 성공을 단정하지 않음.

block이면 `기입 위치를 확정할 수 없어요`+reason와 후보 sheet/row 목록. 확실한 셀만 표에 제시. 표 2개 row 순서는 targetCells[0]=판정, [1]=비고; 현재 값 빈 문자열은 빈 셀. 기입 값은 proposal.result, finalNote=`[proposal.note, trimNote ? '사용자 확인: '+trimNote : ''].filter(Boolean).join('\n')`. incomplete는 별도 경고이며 비고에도 서버 proposal 내용이 보존된다. 결과 counts는 선택한 문서에만 해당한다.

### D4.3 취소·내부 작업 표시·시각 기준

close/Escape는 busy 상태에서도 가능: sequence++, 현재 AbortController.abort(), dialog.close(), onClose. unmount는 alive=false,sequence++,abort,null,busyRef=false,dialog.close. 모든 비동기 결과는 alive && capturedSequence==currentSequence && !signal.aborted일 때만 반영. 명시 cancel 버튼은 없으나 닫기가 요청 중단을 수행한다. 서버가 실제 E2B 작업을 취소하는 정책은 backend 계약으로 검증해야 하며 브라우저 abort만으로 sandbox kill을 가정하지 않는다.

analyze 동안 오른쪽 비교부는 inline compact `SandboxActivityDock(contextId,busy=true,title='대장 구조를 이해하는 과정')`; 새로운 fake animation 로그를 생성하지 않는다. 완료 응답 뒤 mapping preview로 교체. `문서 구조 확인` disclosure는 실제 status/summary/inventory/coverage를 표시하며 reader/context 미완료 또는 sourceTruncated이면 일부 범위 확인. hidden/protected sheet badge, 전체/읽은 sheets와 context segments, warnings/questions 포함.

최종 charcoal-dialogs cascade: dialog width min(1100px,93vw),max-height92dvh,radius18,border#424d62; bg#111318,panel#1b2029,line#343d4d,text#eff3ff,muted#a0abc1,accent#70f3c4. backdrop#080b12b8 blur12px. field bg#141820/border#424d62/text#eff3ff/focus#7195ff; CTA bg#315fe9/border#3d6dff/white, hover#3b68ef/border#527eff, disabled#293246/text#8996b0. ready#70f3c4/bg#70f3c410; blocked#ffd080/bg#ffd08010; error#ffb1b2/bg#ff8f9110. header/footer#1b2029; table th#222936/text#a0abc1, td border#2c3443, new-value#70f3c4. shadow0 28px110px #0009,0 0 0 1px #ffffff05. body grid310px+1fr. header padding21px25px,title18px/1.3, footer17px24px. CTA min41px. 진입 initial opacity0,y14,scale.985→1,0,1, .23s easeOut; reduced initial=false. spinner1.1s linear infinite; root reduced에서 전체 CSS animation/transition none. ≤780px는 width96vw,max94dvh,radius14,body 한 열; 분석 중 input pane 숨김; footer 세로/download100%. 원본은 보존하고 확인한 셀을 반영한 **새 사본**이라는 footer 문구를 유지.

## D5. GoldenPicker: 데모/공개 테스트 문서 선택

native dialog, React state only; Motion import 없음. mode all(default)/criteria/target. **현재 App 진입점은 criteria/target뿐이며 all은 컴포넌트 기본값·격리 테스트 경로다.** all은 기준 하나+target 여러 개+선택 ledger, criteria는 기준만, target은 target만. 초기 criterionId C01, certificates [P01], format pdf, ledgerId ''. 이 ID들은 **공개 fixture 선택 UI 기본값**이며 판정/추출/품질 알고리즘의 분기 조건으로 사용 금지.

mount에서 showModal와 GET `/api/golden` AbortSignal; catalog=`{criteria: {id,description,notice?}[],certificates:…[],ledgers:…[],maxCertificates:number}`. catalog 실패는 내용 영역 오류이며 닫기 가능. cleanup에서 catalog request abort/dialog.close.

기준은 radiogroup, targets checkbox. target 선택 제거 항상 허용, 추가는 length<catalog.maxCertificates(카탈로그 없을 때 fallback10). 최대 도달하면 미선택 checkbox disabled. PDF/PNG는 aria-pressed buttons, loading 동안 모든 변경 disabled. target 포함 mode는 최소 한 target 선택해야 Load 활성. all/criteria 기준 선택 ID는 하나 유지하지만 catalog에 존재하는지 CTA는 검사하지 않는다. 빈 catalog criteria=[]에서도 기본 C01로 load 가능하며 실패는 서버 응답을 따른다.

POST `/api/golden/load` payload=`{mode,...(criteriaIncluded?{criterionId}:{}),...(targetsIncluded?{certificateIds,format}:{}),...(mode==='all' && ledgerId?{ledgerId}:{})}`. 응답=`{documents:Doc[],criteriaText:string,scenario:'golden'}`; 성공 onLoad(selection) 후 onClose; 실패 error와 loading=false로 복구. loading 동안 X disabled, Escape 무시. **한계:** load POST는 여기서 별도 AbortSignal을 전달하지 않음; catalog fetch만 abortable.

안내: 선택 기준/대장 notice, P10+PNG이면 `P10 PNG에는 첫 페이지만 있습니다. 전체 성적서는 PDF를 선택하세요.`; all+ledger+P01 미선택이면 준비 대장의 연결 예시는 P01이며 다른 성적서는 번호 일치 행 확인 안내. 파일 로드만으로 review 시작/criteria confirm을 자동 실행하지 않는다.

관찰된 모양: all width min(940px,94vw),height min(820px,92dvh),max94dvh,radius20; 단일 mode width min(600px,94vw); 최종 bg#111318,text#eff3ff,border#424d62; backdrop#080b12b8 blur12px. header/footer#1b2029, header linear110deg #1c2435→#1b2029. body all 1fr1fr, 각 목록만 scroll. 선택 marker#3d6dff, border#6589ff60,bg#3d6dff15,text#a9c0ff; PDF/PNG active border#6589ff70,bg#3d6dff20,text#c5d5ff. CTA#315fe9/white, hover#3b68ef. title22px, header23px25px, entry min34px(단일38), description12px/1.4, CTA min44px. entry background/border .16s; spinner1s linear rotate; reduced는 spinner 정지. ≤650px width96vw,height94dvh,radius14,title17px, 버튼40px; all의 두 열은 유지하고 여백/타이포를 줄인다.

## D6. 구현 후 검증 사례와 정직한 한계

아래는 **설계 acceptance 사례**이며 현재 앱에서 모두 실행했다는 결과가 아니다. 이 파일만 작성하는 단계에서는 코드 읽기·의존 버전 확인만 수행했다.

| ID | 입력/행동 | 기대 관찰 |
|---|---|---|
| detail-01 | 3page PDF, page2 evidence 선택, 2× 확대, 다른 파일로 전환 | 2page로 이동→200%, 파일 교체 후1page/맞춤; 이전 render 취소 오류 노출 없음 |
| detail-02 | B3 근거(sheetA)와 `'sheetB'!B3`+sheetA 충돌 | 첫 항목은 sheetA B3만, 충돌 항목은 어느 sheet도 색칠 없음 |
| detail-03 | missing item의 target 근거는 머리글/시료명, 기준 file에 rule evidence | target 머리글/시료명 색칠0, 항목 누락 chip; 기준 근거는 detail에서 보존 |
| detail-04 | PDF 동일 item label 두 행, 인용 숫자만 있음 | 추정 bbox0, 위치 확인 chip; 정확한 item-name witness 있는 유일 행은 box 가능 |
| detail-05 | XLSX 120 rows 또는31 sheets | preview 절단 문구 표시; preview만으로 읽기 완료를 선언하지 않음 |
| detail-06 | numeric≤10을 문구≤20으로 직접 수정 | 즉시 comparator 제거+choose. mode 선택 전 confirm 오류. qualitative 선택후 old numeric 없음 |
| detail-07 | 유형 없는 criterion, 8-level path,9-level path,13 conditions | 첫 두 구조 정상,9-level/13조건은 확정 오류; 공백 hierarchy 필수 요구 없음 |
| detail-08 | excluded criterion source + uncertain 문서 | excluded 후보/확정 payload 제외; uncertain은 원문+사유로 HITL 유지 |
| detail-09 | 새 revision props 없이 same props re-render | 로컬 편집 유지; revision 수신시에만 draft 교체, feedback applied |
| detail-10 | readerComplete=true,contextComplete=false,complete=false,quality limited | 읽기 완료·해석 확인 필요, 완료 count 증가 없음, 실제 최대/회차만 표시 |
| detail-11 | 분석 중 logs 위로 스크롤→새 event→busy=false | auto-follow 안함→로그 자동 접힘, 수동 재펼침 가능 |
| detail-12 | ledger ready 후 번호/target/file 변경 | analysis,basis,note 해제/export disabled, 새 analyze 필요 |
| detail-13 | ledger 중복행 blocked, 셀1개 응답, 빈 blob | 각각 blocked/export 불가/빈 다운로드 오류, 원본 변경 없음 |
| detail-14 | upload/analyze 중 ledger 닫기→늦은 응답 | AbortSignal aborted, unmounted state/다른 modal에 늦은 결과 미반영 |
| detail-15 | reduced-motion ON | spinner/scan/wire 중단, 내용/selection/controls는 동일, 가짜 완료로 대체하지 않음 |
| detail-16 | full golden load 중 Escape/X | 닫히지 않음, 실패하면 복구; load 성공은 시작/확정을 자동 수행하지 않음 |

원문 위치 안전성은 텍스트 일치와 source citation의 품질에 의존한다. 이미지 overlay, OCR bbox 생성, DOCX 페이지 fidelity, 전체 workbook을 그대로 렌더하는 spreadsheet engine은 기준 구현에 없다. 유일한 item-name 셀 보충 외의 좌표 회복은 하지 않는다. 표/텍스트 preview 한계와 별도로 backend는 전체 bytes를 읽어야 한다. 현재 작은 UI 글자와 drawer focus 복원 부족은 기준 상태로 명시하며, 개선을 선택할 때는 시각 동등성 기준과 구분해 기록한다.

## D7. 교차 상태 정본

전체 파일 상태/quality/seal의 표는 interaction-contract §I7, 파일별 결과 선택·모바일·빈 상태와 inspector 편집 경쟁은 §I8, 정확한 입력 흐름은 §I1을 따른다. 다중 출처·중복 파일명·시트별 category tree 및 재피드백, item-name 셀 보충/거부, 숨김 시트·회전 페이지·coverage 분리의 자체 포함 입력은 interaction-fixtures.json의 CRITERIA-*, PREVIEW-*, ANALYSIS-*에 있다. 손상 표·없는 원문·잘못된 근거를 일반적으로 모두 검출한다는 보장은 없다. renderer별 현재 검증 범위와 추가 목표를 구분한다.


## 독립 감사 적용 범위

위의image bbox없음·text-layer 없는PDF fallback·추정OCR추가금지는**OBSERVED_BASELINE 재현**의범위다. 현재 재현의 G07도 이 baseline을 따른다. [08 RB-GEOMETRY](../specs/08-rebuild-coverage-geometry.md)는 OPTIONAL_FUTURE이며 baseline보다 우선하지 않는다. 임의bbox/가려진값복원은두범위모두금지한다. 숫자formatter2개·size1MiB경계·rawquote mark의한도는[auxiliary-contract](auxiliary-contract.md)를따른다.

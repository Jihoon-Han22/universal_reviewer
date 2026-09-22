# 02. 문서 읽기·전사·문맥·샌드박스 실행 계약

이 문서는 빈 프로젝트에서 구현할 수 있도록 기준 구현의 실제 처리 순서와 한계를 독립적으로 정의한다. HTTP/SSE와 run 상태는 [01-state-api.md](01-state-api.md), 기준 탐색/정규화/판정은 [03-algorithms.md](03-algorithms.md), 모델 응답 schema는 [pipeline-model-schemas.json](../contracts/pipeline-model-schemas.json), **실제 프롬프트와 조립 순서**는 [pipeline-prompts.md](../prompts/pipeline-prompts.md)에 있다. 문서에 남긴 현재 제한은 숨기지 않으며, '범용'은 지원 범위 내 임의 이름·위치·값의 문서를 처리한다는 뜻이다. 모든 문서/레이아웃의 완전 자동 판정을 보장하지 않는다.

## 2.1 모듈 경계와 실행 DAG

| 구현 책임 | 입력 → 출력 | 필수 불변식 |
|---|---|---|
| DocumentStore | `{name,buffer,role}` → 공개 metadata + private 원본 | 원본 bytes 보존, upload 제한/서명 검증, raw bytes·modelParts 비공개 |
| trusted Python reader | 원본 bytes, allowlisted kind → DocumentProfile | 수식/매크로/링크/업로드 명령 실행 금지, SHA-256과 실제 coverage 기록 |
| sandbox analyzer | Document + Gemini + abort → analyzed Document | 한 문서 동안 같은 E2B 세션 유지, 모든 retained source 구간 구조 해석/검증 |
| context verifier / requery | Profile + Context → quality + 교정 Context | selector는 데이터, 검증된 고정 reader만 실행, 미해결은 확인 필요 |
| VLM transcription / judge | 실제 PDF/image + inventory → page/block/table 전사 | source facts 전에 전체 구조, independent visual judge, 가짜 page/겹친 cell 금지 |
| field extraction | 같은 문서 원본 + 전사 → Extraction | 판정 기준 독립, 해당 문서의 모든 실질 결과 보존 |
| ReviewEngine | 승인 기준 + analyzed targets → items/doc statuses | 문서 2-worker 격리, 결정론적 재판정, partial/failed 보존 |
| activity observer | 실제 task/command transitions → activity | 모델·E2B 작업 ID와 인과 handoff, 예상 이벤트/진행률 생성 금지 |

실행 순서:

```text
upload → signature/local preview → private original retained
 criteria_first.start
  → criteria docs analyze (2 workers)
    → E2B create → original+reader upload → parsers install once → trusted read
    → nonvisual: context chunks → deterministic + model verifier
          ↳ typed selections → SAME E2B reread → complete replacement → verify (≤3 rounds)
    → E2B kill (always)
    → visual only: VLM full transcription → independent visual judge → reread (≤3 rounds)
  → eligibility → exclude not_criteria
  → XLSX discovery (its own E2B session) / other source criteria extraction
  → candidate grouping → awaiting_confirmation
  ↔ user direct edits / feedback revision (≤20 feedback submissions)
  → explicit approval → frozen approvedCriteria → awaiting_documents
  → attach 1..10 target docs → analyze (same pipeline)
  → targets review (2 workers)
    → visual only: independent facts extraction
    → semantic criterion matching/verdict proposal
    → server normalization, evidence/applicability/conditions/missing/numeric checks
    → coverage → document completed / partial / failed
  → run completed / partial / failed → human item resolution, exports/ledger/dashboard
```

프런트엔드가 대상 업로드를 잠가도 서버에서 승인 상태·기준 버전을 재검사한다. 일반 문서 구조 분석용 `ensureAnalyzed`는 결과가 있으면 캐시를 돌려주고 진행 중 promise는 공유한다. 뒤늦게 합류한 waiter의 취소는 최초 분석 owner를 취소하지 않는다. 새 run의 `analyzeInputs`는 자체 분석을 수행하며 기존 source cache를 링크 체인으로 연결하지 않는다.

## 2.2 입력과 로컬 미리보기

실제 업로드 허용 확장자(소문자로 정규화)는 `pdf, docx, xlsx, csv, txt, md, json, png, jpg, jpeg, webp`다. `xls, xlsm, pptx, tsv, hwp, heic, bmp, tiff`는 public upload 지원 형식이 아니다. Python reader 안의 추가 handler가 있어도 UI/API 지원을 확대했다고 주장하지 않는다. role은 `criteria|target|ledger`다.

| 제한 | 실제 수치 / 처리 |
|---|---|
| 파일 | 1..20 × 1024² bytes |
| 저장소 | 새 예약 직전에 `documents.size + pendingDocuments <100` 검사, 예약 뒤 합계 최대100; 총 예약 bytes ≤250 × 1024²; parse 실패 시 예약 반환 |
| 파일명 | `\\`를 `/`로 바꿔 basename만 유지, ASCII control/DEL 제거, trim 후 1..240자 |
| 원문 문자열 | 로컬 text/source 최대 1,500,000자 |
| 공개 preview | text 최대 60,000자; table 최대 30 sheet × 100 rows × 100 cols, 총 텍스트 예산 60,000자, cell 최대 2,000자 |
| CSV 업로드 parser | UTF-8 필수, BOM 제거, CRLF 정규화, 10,000 logical rows, 100 cols, record 100,000자; 빈 줄 유지/열 수 차이 허용 |
| PDF 로컬 보조 텍스트 | pdf.js, 최초 30페이지, 총 1,500,000자, 25초; 실패는 visual PDF 업로드를 거절할 근거가 아님 |
| XLSX 로컬 source | 30 sheet / 100,000 cells / source 1,500,000자 초과 시 **파일을 버리지 않고** deferred preview로 전환 |

각 extension과 magic signature를 검사한다. PDF `%PDF-`, PNG 8-byte signature, JPEG `FF D8 FF`, WebP `RIFF....WEBP`. XLSX/DOCX는 ZIP central directory를 먼저 검사한다: 최대 20,000 entries, total expanded ≤100 MiB, 중복 entry 금지, encryption/분할/ZIP64 sentinel 거부, local/central entry name·compression method 일치, stored(0)/deflate(8)만 허용. central directory의 크기와 offset으로 입력 경계를 검사하고 실제 inflate 결과 길이를 central uncompressed size와 비교한다. **local header의 compressed/uncompressed size 필드 자체가 central 값과 같은지는 비교하지 않는다.** `[Content_Types].xml`과 해당 `xl/workbook.xml` 또는 `word/document.xml` 존재가 필수다. mime은 서버 매핑이며 클라이언트 MIME만 신뢰하지 않는다.

로컬 XLSX는 ExcelJS로 preview, JSZip으로 메모 XML 경로/namespace 호환성을 **메모리 복제본에만** 보정한다. 로컬 preview 복제본에서는 지원 여부와 무관하게 drawing relationships를 모두 제거한다. 따라서 정상 drawing도 이 preview에는 표시되지 않으며 실제 image/chart 분석은 원본을 여는 E2B reader가 담당한다. original download bytes를 수정하면 안 된다. formula는 저장된 result만 표시하고 없는 cache는 `[계산 결과 없음: 수식 재계산 필요]`다. merged continuation에는 실제 master 주소 표식을 유지하고 보통 공백을 forward-fill하지 않는다. DOCX 로컬 preview는 mammoth의 raw text이며 최종 구조 근거는 아래 E2B ordered blocks다. TXT/MD/JSON은 UTF-8와 NUL 부재를 확인하며 JSON은 실제 JSON.parse 성공 필요. Python의 cp949/UTF-16 fallback은 업로드 제한을 우회하지 않는다.

drawing 생략을 감지한 표 preview는 `warnings:['삽입 이미지·도형·차트는 로컬 미리보기에 포함되지 않았습니다. 샌드박스에서 이미지/구조 분석이 필요합니다.']`를 갖는다. 예: 한 시트1셀 `A1='기준'`과 drawing만 있는 경우 공개 preview=`{type:'table',sheets:[{name:'품질',rows:[['기준']],state:'visible'}],warnings:[위 문구]}`이며 drawing 생략 자체로 truncated를 추가하지 않는다. `truncated:false`를 직렬화하는 대신 그 키가 없을 수 있다. source에는 `EXTRACTION_LIMITATION: Embedded images, charts and drawings were not interpreted by the local preview. Original bytes must be analyzed by the sandbox before claiming to have reviewed those contents.`가 추가된다. readable cell0이고 drawing만 있으면 아래 imageOnly text fallback이며 별도 warnings 배열은 없다. public table warning은 최대10개×1000자다.

`deferredSpreadsheetPreview(reason,imageOnly=false)`는 정확히 다음 **private parse result**를 만든다. PublicDocument에는 preview만 복사하며 source/sourceSheets는 비공개다. 로컬 부분 rows/sheets는 남기지 않고 원본 buffer만 보존하므로 빈 sourceSheets가 원본 빈 문서를 의미하지 않는다.

```ts
{
  source: `LOCAL_PREVIEW_INCOMPLETE: ${reason}. This is only a local preview limitation. Original workbook bytes are retained and must be analyzed by the sandbox before any review. Do not infer contents from this incomplete preview.`,
  sourceSheets: [],
  preview: {type:'text', truncated:true, text: imageOnly
    ? '텍스트 미리보기 없음. 샌드박스에서 이미지/구조 분석 필요'
    : `로컬 텍스트 미리보기 일부 생략: ${reason}\n원본 파일은 유지되며 샌드박스에서 전체 구조 분석이 필요합니다.`}
}
```

public cell clipping은2000자다. 내부 local XLSX source cell은 displayedValue 전체이며 개별3000자 제한이 없고 전체 source1,500,000자 예산을 적용한다. 예를 들어3000자 셀도 public에서는2000자로 잘리지만 셀만 잘린 경우 truncated가 켜지지 않을 수 있다. 이 boolean은 exhaustive loss detector가 아니다. source preview를 model input 원본으로 대체하면 안 된다.

## 2.3 Trusted reader와 DocumentProfile

실행 환경은 E2B `base` 템플릿 기본값; 서버가 전달하는 명령은 고정 경로와 allowlisted kind로만 구성한다:

```text
python -m pip install --disable-pip-version-check --no-input openpyxl==3.1.5 python-docx==1.1.2 PyMuPDF==1.26.4 Pillow==11.3.0
python /home/user/document-reader.py /home/user/document-input.bin <kind> /home/user/document-profile.json
```

`document-reader.py`는 재현 앱이 구현해 배포할 신뢰 프로그램이다. 업로드 파일에서 코드나 dependency를 읽어 실행하지 않는다. 원본을 매번 SHA-256 계산하고 Node가 원본 digest·kind를 대조한다. 32 MiB보다 큰 profile 응답, JSON parse 실패, coverage/inventory/warnings 누락은 hard error다.

정규 profile 형태(선택 필드의 type은 형식별):

```ts
type DocumentProfile = {
  kind: string; sha256: string; status: 'ready'|'partial'|'unsupported';
  inventory: {sourceBytes?:number;bytesRead?:number;sha256?:string;
    sheetCount?:number;pageCount?:number;[formatMetadata:string]:unknown};
  coverage: {complete:boolean;unitsTotal:number|null;unitsRead:number;
    cellsTotal:number;cellsRead:number;textChars:number;truncated:boolean;
    truncatedReasons:string[];rowsRead?:number;missingFormulaCaches?:number};
  warnings:string[]; images: {path:string;mime:'image/png';width:number;height:number;
    sheet?:string;cell?:string;page?:number;sourceKind?:'pdf-page';description?:string}[];
  sheets?: {name:string;state:string;maxRow:number;maxColumn:number;
    mergedRanges:string[];hiddenRows:number[];
    hiddenColumns:{column:string;min:number;max:number}[];
    rows:{row:number;cells:{cell:string;column:number;columnName:string;value:unknown;
      formula?:string;cachedValue?:unknown;cacheMissing?:boolean;
      comment?:string;hyperlink?:string;numberFormat?:string}[]}[];
    autoFilter?:string;tables?:unknown[];headersFooters?:{header:string;footer:string};
    imageInventory?:unknown[];chartInventory?:unknown[];complete:boolean}[];
  pages?: {page:number;width:number;height:number;rotation:number;text:string;
    blocks:{bbox:number[];text:string;type:'text'}[];tables:unknown[];
    imageInventory:unknown[];complete:boolean}[];
  blocks?: {index:number;kind:'paragraph'|'table';source:string;text?:string;
    style?:string;rows?:unknown[][];nestedTables?:unknown[];complete?:boolean}[];
  sections?:unknown[];supplementaryText?:{part:string;text:string}[];text?:string;
};
```

현재 reader의 계수 의미: XLSX units는 sheet, PDF는 page, DOCX는 ordered body/header/footer paragraph 또는 table, CSV는 logical row, text는 1, image는 frame. `cellsTotal`은 format마다 의미가 다르며 모두 동일한 coverage 비율로 합산하지 않는다. CSV 조기 중단 시 `unitsTotal:null` 및 `rowCountAtLeast`, 원본 전체 개수를 아는 척하지 않는다.

한도마다 결과 형태가 다르다. `partial(reason)` 호출은 coverage.complete=false/truncated=true + truncatedReasons와 warning, 최종 status=partial이다. 그러나 아래 unsupported/불완전 가지를 전부 이 함수와 같다고 취급하지 않는다.

| 범위/실패 | 현재 reader 결과 |
|---|---|
| 원본 >20 MiB, 빈 파일, OOXML >100 MiB/20,000 entries, 거부 archive, 독립 image >40,000,000 pixels, parser exception | Python main이 예외를 받아 status=unsupported/coverage.complete=false 및 bounded warning을 JSON에 기록; truncated=true는 자동 설정하지 않음. 파서 클래스 외 raw exception text 미공개 |
| cells100,000/PDF300pages/XLSX100sheets/populated rows100,000/images8/elapsed150초 도달 | partial(reason), 이미 확보한 내용 유지. 조기 중단 coverage에는 실제 읽은 수만 기록 |
| `Reader.text`에 전달한 문자열이 남은 text 예산을 **초과** | `len(text) > 1,500,000 - coverage.textChars`일 때만 해당 helper가 partial을 표시하고 남은 부분까지 보존. 정확히 같으면 이 helper는 partial을 표시하지 않음 |
| embedded image decode 또는 pixel limit 초과 | save_image가 coverage.complete=false와 warning, null 반환; 이 경로만으로 truncated=true가 되지는 않음. 호출부가 별도 partial(reason)을 부를 수 있음 |
| Node profile >32 MiB/JSON 파싱 실패/digest·kind 불일치/falsy coverage 또는 inventory/warnings가 배열 아님/nonzero reader command exit | SandboxDocumentError; 분석 결과로 위장하지 않음 |

Python의 unsupported JSON도 정상 main 경로 exit=0일 수 있다. 원본 cap 같은 조기 예외로 digest가 준비되지 않았으면 Node digest gate에서 실패한다. 충분한 identity가 있으면 unsupported analysis로 보존되며 context를 분석했다고 표시하지 않는다. 이미지 decode 실패에 OCR 문자열을 만들어 넣지 않는다. `save_image`로 추출하는 보조·embedded visual은 최대3000×3000 thumbnail PNG로 저장한다. 독립 image의 `read_image`는 metadata만 읽고 thumbnail 복제본을 만들지 않으며 host가 원본 bytes를 모델에 첨부한다.

위 Node admission은 DocumentProfile의 모든 필수 필드를 검사하는 schema validator가 아니다. correct kind/digest, `coverage:{},inventory:{},warnings:[]`만 있고 status/counts/images가 없는 합성 PDF profile도 이 gate를 통과하여 downstream에서 `partial,readerComplete=false,visualAnalysisPending=true` 분석값을 반환할 수 있다. 이는 정상 Python reader가 그런 profile을 생성한다는 뜻이 아니라 adapter가 실제 검사하는 범위를 고정한 반례다. 반환 DTO의 필수 선언과 raw admission 조건을 합쳐 더 강한 reject를 만들지 않는다.

TXT의 ASCII `x`만으로 만든 원본을 `Reader.read`로 읽으면 1,499,999자와 정확히 1,500,000자는 모두 `status='ready',coverage.complete=true,truncated=false`이고, 1,500,001자는 앞 1,500,000자를 보존한 `partial/false/true`다. 이 text 계수는 Python `len(str)`의 Unicode code point 수다. 아래 model source 계수는 JS UTF-16 code unit 수이므로 두 한도를 합치지 않는다. 이 반례는 reader 포트 시험이며 로컬 업로드의 LINE prefix를 포함한 별도 source 예산까지 통과한다는 뜻이 아니다. 다른 형식의 다음 셀/블록을 읽기 전 `>=` 검사 등은 별도이므로 이 equality 규칙을 모든 cap에 일반화하지 않는다. 정확한 입력 recipe와 전체 기대 coverage는 [source-serialization-cases.json](../contracts/source-serialization-cases.json)의 `readerTextBoundaryCases`에 있다.

### XLSX 읽기 알고리즘

1. openpyxl로 `data_only=False/read_only=False/keep_links=False`, 별도 workbook을 `data_only=True`로 연다. 첫째는 수식, 둘째는 saved cache다. 재계산하지 않는다.
2. 전체 worksheet inventory를 먼저 만든다: name/state/max row·column/stored meaningful cells/merge·image·chart count/tables/protected. defined names는 최대 500개; 초과 partial.
3. sparse `sheet._cells`를 `(row,column)` 정렬해 iterate. MergedCell continuation과 value/comment 없는 cell은 skip한다. `maxRow*maxColumn` 직사각형 전체를 걷지 않는다. XFD1048576에 스타일만 있는 파일이 루프 폭발을 만들지 않아야 한다.
4. 각각 actual address·value·formula/cache·comment·hyperlink target(data only)·number format을 보존한다. 모든 sheet의 state, merged ranges, hidden row/column, filter, named tables, odd header/footer도 보존한다.
5. formula cache가 없으면 `cacheMissing=true`와 count/warning. zero로 변환 금지. source 직렬화에는 sentinel 표시. missing cache 자체가 항상 reader partial을 만드는 것은 아니지만 값 판정은 review다.
6. 실제 embedded image를 anchor cell과 함께 최대 8개 읽는다. Chart 객체는 inventory만 얻으며 chart visuals를 읽었다고 할 수 없어서 partial. parser가 unsupported/altered feature warning을 내도 partial.
7. hidden sheet도 생략하지 않는다. image-only workbook은 로컬 preview 없음이 허용되며 E2B/모델에서 구조를 확인한다. 이미지/차트 미해석 부분은 전체 완료를 막는다.

### PDF·이미지 읽기

PyMuPDF로 password 여부, 전체 pageCount와 size/rotation/metadata/fonts/embedded file count를 기록한다. 최대 300페이지에서 `get_text('text',sort=True)`, text block bbox, images inventory, `find_tables()`의 bbox/header/rows를 읽는다. table detection 실패는 warning이며 시각 전사를 대체하지 않는다. 한 페이지 공백 제외 text가 40자 미만이거나 비내장 CJK CID font이면 full page PNG를 만들고 `sourceKind:'pdf-page',page`를 기록한다. scale은 `min(1.7,2800/max(width,height))`. 8-image cap 때문에 필요한 render를 못하면 partial. PNG 보조 경로는 `/home/user/document-image-<정수>.png`만 허용하며 signature, mime, 실제 page 매핑을 Node에서 재검사한다. 누적 attachments 16 MiB 초과는 partial. 다른 thumbnail을 원본 page로 착각하면 안 된다.

독립 image는 한 파일=page 1이다. 인쇄된 `1/2`나 파일명 때문에 없는 page 2를 만들지 않는다. Pillow로 pixels/frame count 확인만 할 뿐 metadata를 OCR로 부르지 않는다. 여러 frame이면 첫 frame만 read로 기록하고 partial. PDF의 디지털 텍스트는 보조 원문이고 PDF/image 원본 bytes가 항상 모델 입력에 유지된다.

### DOCX·텍스트

DOCX는 python-docx ordered body paragraphs/tables + 연결되지 않은 first/even/normal headers/footers를 source label과 1-based BLOCK index로 보존한다. Word layout의 실제 고정 page 번호를 만들지 않는다. table nested depth >8은 partial. sections의 paper dimensions/orientation, core properties를 inventory에 넣고 embedded images를 읽는다. footnotes/endnotes/comments와 textboxes는 lxml `resolve_entities=False,no_network=True`로 읽어 supplementaryText로 보존한다. source lines는 Python `str.splitlines()`와 동일하게 JS에서 CRLF와 `\n\r\v\f\x1c-\x1e\x85\u2028\u2029` 처리; 끝 line break의 빈 마지막 줄은 제거. L1부터 원본 줄 번호를 사용한다.

CSV sandbox parser는 delimiter를 첫 65,536자로 `, \t ; |` 중 sniff하고 실패 시 comma+warning. 업로드 단계는 comma CSV parser이므로 semicolon/TSV가 public 지원인 것처럼 문서화하지 않는다. TXT/MD/JSON는 원본 syntax/heading 포함 모든 nonempty line을 구조 coverage에 포함한다. hyperlink URL은 source 문자열일 뿐 fetch하지 않는다.

## 2.4 읽기 완료와 문맥 이해 완료

`profileSource`는 모든 retained 값을 위치와 함께 직렬화한다. 다음 header/record 구분자를 유지하면 모델은 값과 위치를 함께 참조할 수 있다:

```text
SANDBOX_READER: original bytes physically opened in E2B
INVENTORY: <JSON>
READ_COVERAGE: <JSON>
SHEET "품질" state=visible size=12x6
MERGED_RANGES ["B2:D2"]
HIDDEN_ROWS [] HIDDEN_COLUMNS []
SHEET_METADATA {"autoFilter":null,"tables":[],"headersFooters":{...},"imageInventory":[]}
XLSX_ROW 8 | "품질"!C8: "항목" | "품질"!D8: "기준"
XLSX_ROW 9 | "품질"!C9: "강도" | "품질"!D9: "30 이상"
PAGE 1 size=595x842 rotation=0
<actual PDF text>
BLOCK 1 {"index":1,"kind":"paragraph","source":"body","text":"..."}
FULL_TEXT_WITH_SOURCE_LINE_NUMBERS
L1: # 문서 제목
```

### 2.4.1 source 문자열의 정확한 직렬화

위 예시의 구분자만으로 문자열을 새로 조립하면 JSON 공백·필드 순서·생략 차이가 아래 구간 수와 잘림을 바꿀 수 있다. 이 절은 `profileSource(profile)`의 **출력 문자열**을 고정한다. 이 함수는 입력 profile을 다시 정렬하거나 schema 검증하는 단계가 아니다. reader가 제공한 배열 순서를 그대로 순회하며, profile 안에서 다른 형식의 선택 필드가 함께 있으면 아래 순서대로 모두 직렬화한다.

- `J(value)`는 ECMAScript `JSON.stringify(value)`의 **replacer 없음, indentation 없음** 결과다. 객체 key를 별도 정렬하지 않고 ECMAScript own-property enumeration 순서, 배열 원래 순서를 유지한다. 객체의 undefined 값은 생략하고 null은 `null`이다. JSON 문자열의 따옴표·역슬래시·개행은 이 함수의 escaping 그대로이며 별도 HTML escape/NFKC/trim을 하지 않는다. JS 문자열 보간 안에서 `J(value)` 자체가 undefined인 경우에는 문자 `undefined`가 된다.
- 아래 `emit(record)`는 문자열 하나를 순서 있는 목록에 넣는다. 최종 source는 그 목록의 `join('\n')`이다. record 사이 구분자는 LF 한 개이며 **추가 종료 LF는 붙이지 않는다**. record 내부에 이미 들어 있는 원문 LF는 그대로 둔다. 따라서 원문 자체가 LF로 끝나는 별도 record까지 강제로 잘라내는 규칙은 아니다.
- 아래 `T(value)`는 JS `String(value)`이고 `??`와 `||`의 차이를 유지한다. cell의 표시값 `V(cell)`은 truthy formula가 있으면서 cachedValue가 null/undefined/빈 문자열이면 `[계산 결과 없음: 수식 재계산 필요]`, 그 외에는 `String(cell.formula ? cell.cachedValue : (cell.value ?? ''))`다. cachedValue의 `0`과 `false`는 누락이 아니다.

다음 순서와 공백을 그대로 적용한다. `${...}`는 문자열 보간, `J`/`V`는 위 정의이며 모든 `for`는 입력 순서다.

```text
emit('SANDBOX_READER: original bytes physically opened in E2B')
emit('INVENTORY: ' + J(profile.inventory || {}))
emit('READ_COVERAGE: ' + J(profile.coverage || {}))

for sheet of (profile.sheets || []):
  emit(`SHEET ${J(sheet.name)} state=${sheet.state} size=${sheet.maxRow}x${sheet.maxColumn}`)
  emit('MERGED_RANGES ' + J(sheet.mergedRanges || []))
  emit('HIDDEN_ROWS ' + J(sheet.hiddenRows || []) + ' HIDDEN_COLUMNS ' + J(sheet.hiddenColumns || []))
  emit('SHEET_METADATA ' + J({autoFilter:sheet.autoFilter, tables:sheet.tables,
                             headersFooters:sheet.headersFooters, imageInventory:sheet.imageInventory}))
  for row of (sheet.rows || []):
    parts := row.cells.map(cell =>
      `${J(sheet.name)}!${cell.cell}: ${J(V(cell))}`
      + (cell.formula ? ` [FORMULA ${J(cell.formula)}; cached, not recalculated]` : '')
      + (cell.comment ? ` COMMENT: ${J(cell.comment)}` : '')
      + (cell.numberFormat ? ` FORMAT: ${J(cell.numberFormat)}` : '')
      + (cell.hyperlink ? ` LINK_DATA_NOT_FETCHED: ${J(cell.hyperlink)}` : ''))
    emit(`${profile.kind === 'csv' ? 'CSV' : 'XLSX'}_ROW ${row.row} | ${parts.join(' | ')}`)

for page of (profile.pages || []):
  emit(`PAGE ${page.page} size=${page.width || '?'}x${page.height || '?'} rotation=${page.rotation || 0}\n${page.text || ''}`)
  for table of (page.tables || []): emit(`PAGE ${page.page} TABLE ${J(table)}`)
  for block of (page.blocks || []): emit(`PAGE ${page.page} BLOCK ${J(block)}`)
for block of (profile.blocks || []): emit(`BLOCK ${block.index ?? ''} ${J(block)}`)
if profile.sections?.length: emit('DOCUMENT_SECTIONS ' + J(profile.sections))
for extra of (profile.supplementaryText || []): emit('SUPPLEMENTARY_TEXT ' + J(extra))
if profile.text:
  emit('FULL_TEXT_WITH_SOURCE_LINE_NUMBERS\n' + sourceLines(profile.text).map((line,i) => `L${i+1}: ${line}`).join('\n'))
for row of (profile.rows || []):
  emit(`CSV_ROW ${row.row} | ` + row.cells.map((value,i) => `${excelColumn(i+1)}${row.row}: ${J(value)}`).join(' | '))
for img of (profile.images || []): emit('EMBEDDED_IMAGE ' + J({...img, path:undefined}))
if profile.warnings?.length: emit('READER_WARNINGS ' + J(profile.warnings))
return emittedRecords.join('\n')
```

`SHEET_METADATA`는 위 네 key를 그 순서로 생성한 **별도 객체**다. 예를 들어 autoFilter만 null이고 나머지가 생략된 입력은 `SHEET_METADATA {"autoFilter":null}`이며, 네 값 모두 undefined면 `SHEET_METADATA {}`다. 기본 빈 배열/null을 새로 채우지 않는다. 반면 `PAGE TABLE/BLOCK`, 최상위 `BLOCK`, sections, supplementaryText는 해당 객체/배열 전체를 그대로 J에 전달한다. `profile.rows` compatibility 분기는 sheet 행과 달리 `V`로 문자열화하지 않으므로 number/boolean/null을 각각 `7/false/null`로 쓴다. 그 분기의 column은 1→A, 26→Z, 27→AA인 1-based Excel 표기다.

`sourceLines`는 먼저 `String(value ?? '')`로 바꾸고 빈 문자열이면 []를 반환한다. 그 외 `/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/`로 split하고, 원문이 이 line-break 문자 중 하나로 끝났을 때만 마지막 빈 요소 하나를 제거한다. 원래 빈 중간 줄은 남기고 L번호를 부여한다. `profile.text` truthy 검사로 빈 본문은 marker 자체를 생략한다.

embedded image record는 원래 img의 key/값을 shallow copy하되 `path`를 undefined로 덮어 J에서 제외한다. **이 source 함수는 inventory 등의 모든 path/data/base64 key를 재귀 제거하지 않는다.** 그 제거는 공개 analysis.inventory 투영의 별도 책임이다. source의 warnings는 원래 순서와 중복을 유지한다. source 직렬화 전용 dedup·추가 필터는 없다.

정밀 예시는 [source-serialization-cases.json](../contracts/source-serialization-cases.json)의 `cases[].input → expectedSource`를 따른다. workbook 예시는 sourceChars=495이지만 UTF-8 bytes=545이므로 바이트 수를 아래 JS length 예산에 대입하면 안 된다. `boundaryCases`는 **literal prefix + 지정 횟수의 ASCII x**로 source를 만들며 원본 함수 없이도 예상 문자열·구간 수·SHA-256을 계산할 수 있다. SHA-256은 BOM 없는 UTF-8 source/retained source의 해시이고 이것을 JS length 대신 사용하지 않는다.

### 2.4.2 구간 해석과 공개 분석

model context 전체 cap은 **직렬화 문자열 1,200,000자**, 순차 chunks는 **150,000자**다. 단순 character slicing이며 cell/row 경계 정렬은 현재 구현에 없다. 각 source segment마다 9000-output-token 구조 요청, 첫 chunk에 embedded images 첨부. 한 chunk 실패해도 다음 chunk를 처리하고 실패 표시를 남긴다. 분석 schema는 summary/documentType/structure/warnings/questions. structure는 `{name,kind:table|text|metadata|image|list|other,sheet?,page?,range?,headers:string[],description,orientation:horizontal|vertical|mixed|unknown,uncertain}`이다.

정확히 `sourceTruncated = source.length > 1_200_000`, `retainedSource = source.slice(0,1_200_000)`, `chunks = Math.max(1,Math.ceil(retainedSource.length/150_000))`다. source/retainedSource 계수와 slice는 모두 JS UTF-16 code unit 단위다. **profileSource 본문의 최초 `SANDBOX_READER`, `INVENTORY`, `READ_COVERAGE` 세 행은 source.length에 포함되어 이 예산을 소비한다.** source 밖에서 모델 요청에 덧붙이는 `DOCUMENT_ID/DOCUMENT_NAME/DOCUMENT_KIND/DOCUMENT_ROLE/UNTRUSTED DOCUMENT DATA` header와 `SOURCE SEGMENT ... Inventory: ...` 안내는 source.length에 포함하지 않는다. 이 구분은 source 분할 예산에 관한 것이며 전체 모델 요청의 길이를 뜻하지 않는다. sourceChars=149,999/150,000/150,001은 chunks=1/1/2, 1,199,999/1,200,000/1,200,001은 모두 chunks=8이고 마지막 경우만 sourceTruncated=true다. 이 chunks는 초기 source 분할 개수이며 실제 provider 호출 전체 횟수나 완료를 뜻하지 않는다.

검증/정규화: 한 응답 structure ≤160; name 240, description 2000, summary 4000, documentType 200자; headers ≤100×300자; warning ≤50×1000, question ≤20×1000. sheet는 실제 profile name과 같아야 하며 PDF page는 inventory 범위. XLSX/CSV/DOCX에는 page를 붙이지 않는다. sheet range는 A1, DOCX는 `BLOCK1:BLOCK4`, TXT/MD/JSON는 `L1:L20`다. 표의 headers는 `C8 항목`처럼 좌표와 실제 source text를 함께 담는다. 헤더 없는 구역은 table이라 주장하지 말고 other/list/text로 설명한다.

이 문법은 모델 schema/후속 quality 검사의 책임과 구분한다. `validateDocumentContext` 자체는 range가 문자열이고180자 이하인지만 검사하여 `not-a-source-range`도 일단 보존한다. unknown kind/orientation은 `other/unknown`으로 정규화하고 headers/warnings/questions의 원소는 `String(value ?? '')` 후 해당 길이로 자른다. 예를 들어 `[null,5,{a:1}]`은 `['','5','[object Object]']`다. page는 `Number(inventory.pageCount) || profile.pages?.length || 0`이 양수일 때만 정수·bounds를 검사해 보존하고, page 수가0이면 제공된 page도 생략한다. 실제 selector/source coverage 유효성은 뒤의 quality 단계가 다시 검사하므로 helper 단독 통과를 전체 원문 검증 완료로 취급하지 않는다.

**완료 판정은 세 값이다.**

```text
readerComplete = profile.coverage.complete === true
contextComplete(nonvisual) = supported && quality.status==='verified'
                             && !sourceTruncated && missingContextSheets.length===0
complete = readerComplete && contextComplete
analysis.status = unsupported ? 'unsupported' : complete ? 'complete' : 'partial'
```

public analysis는 `{status,summary,documentType,structure,inventory,warnings,questions,needsConfirmation,quality?,coverage}`. summary ≤8000, combined structure ≤1000, warnings ≤100×1000, questions ≤40. inventory에서 `path/data/base64` 키는 재귀 제거한다. coverage에는 원래 reader counts와 `complete,readerComplete,contextComplete,contextSegmentsTotal,contextSegmentsRead,initialContextSegmentsRead,sourceChars,contextChars,sourceTruncated,missingContextSheets,visualAnalysisPending`를 포함한다. 재검증 성공 시 contextSegmentsRead=전체 segments, initial count는 실제 최초 성공 수다. 'read 100%'를 'understood 100%'로 표시하면 안 된다.

**160과1000은 다른 단계다.** 최초 chunk 응답은 각각 validateDocumentContext의 기본 maxStructure=160을 통과한 뒤 배열을 합친다. merged initialContext는 다시160개로 검증하지 않은 채 quality에 전달된다. 최종 public analysis.structure는 첫1000개로 잘라 노출한다. 반면 repair 응답은 파일 전체 context의 완전 대체본 하나이며 같은 validator 기본160을 적용한다. repair가161개 이상이면 실패하고 기존 context를 유지한 needs_review로 종료한다. 큰 원문을160개로 몰래 축약하거나1000개 허용 repair라고 구현하면 기준 동작과 달라진다. 160개 초과 repair 지원은 별도 개선 사항이지 현재 통과 기능이 아니다.

private analyzed 문서는 [internal-pipeline.ts](../contracts/internal-pipeline.ts)의 DTO/변환을 따른다. sourceSheets의 cell.address, sourceRows, modelParts, PDF page images, criteriaInventory는 public preview/analysis와 다르며 public projection에서 원본 bytes와 inlineData를 제거한다. ensureAnalyzed의 공유 analysisPromise는 `Promise<PublicAnalysis>`이고 전체 AnalyzedDocument는 sandboxAnalysisResult에 별도 캐시된다.

형식별 변환은 다음과 같다. XLSX ReaderCell `{cell:'D12',column:4,columnName:'D',value:2.5}` → SourceCell `{address:'D12',text:'2.5'}`이며 원래 row=12를 유지한다. formula가 있고 cachedValue가 null/undefined/빈 문자열이면 text=`[계산 결과 없음: 수식 재계산 필요]`; formula와 cachedValue 자체도 별도 필드로 보존한다. formula 없는 null은 빈 문자열이다. sparse sheet에 없는 셀을 새 값으로 채우지 않는다. CSV는 profile.rows가 있으면 그것을 사용하고, 없으면 첫 profile sheet의 각 row에서 최대 retained column까지만 빈 문자열 array를 만들어 실제 column 위치를 채운다. 예: row12의 B='항목'/D=3은 `{row:12,cells:['','항목','','3']}`이고 trailing maxColumn 전체를 만들지 않는다. PDF verificationPages는 profile.pages의 page와 실제 reader text를 복사하며 VLM text로 바꾸지 않는다.

internal table provenance와 공개 evidence는 별개다. 내부 Word native citation `{documentId:'D',block:2,table:'BLOCK2'}` 또는 PDF `{documentId:'D',page:1,table:'t1'}`는 table indexing용이다. **eligibility 모델 schema/validator는 documentId/quote/page/sheet/cell 외 키를 거부**하므로 block/table을 출력하게 해서는 안 된다. 공개 Word 예시는 `{documentId:'D',quote:'강도 30 이상'}`, 공개 PDF 예시는 `{documentId:'D',page:1,quote:'강도 30 이상'}`다. 존재하지 않는 `sheet:'BLOCK2'`를 만들어 좌표를 보존하지 않는다. review item evidence는 실증 공란일 때 blank:true를 추가할 수 있지만 eligibility evidence에는 허용되지 않는다. 현재 dashboard의 snapshot/sourceItems projection은 blank 및 presence/missingVerified를 누락한다. full review item 타입과 대시보드용 투영 타입을 동일하게 쓰지 않는다(05의 현행 한계/별도 개선 gate 참조).

criteria discovery inventory는 공통 ReaderProfile이 아니라 `CriteriaWorkbookInventory`다. 모든 sheet가 `{name,visibility,dimensions,nonEmptyCells,profiledCells,complete,mergedRanges,mergedRangesTotal,hiddenRows,hiddenColumns,formulas,comments,images,styles,regions,regionsOmitted}`를 갖고 region은 `{id,range,nonEmptyCells,sample,sampleOnly}`다. id=`s<원본 1-based 시트순서>-r<보존된 1-based 구역순서>`로 만들어지고 각 sample cell에는 원문 cell/text/styleId/hiddenRow/hiddenColumn 및 있는 경우 formula/uncachedFormula/comment/mergedRange/truncated를 보존한다. 이것은 일부 sample이므로 sampleOnly=true를 전체 원문 처리 완료로 오해하지 않는다. 상세 읽기 응답은 `{ranges:[{sheet,range,cells,truncated}],complete,cellsRead}`이며 유형/구역별 계획·누락 검사 계약은03이 소유한다.

## 2.5 문맥 독립 검증과 동일 세션 repair

각 attempt=1..3에서 아래 deterministic checks **모두** 수행하고, 모든 retained source segment에 6000-token 별도 verifier 요청을 한다. 모델 `checked:true`와 issues array(≤80)를 받아야 한다. API 실패/부정 응답을 `review_failed` issue로 보존한다.

- reader partial/source truncated/최초 context chunk 누락/빈 structure.
- populated cells 또는 images가 있는 모든 sheet에 해석 entry가 있어야 한다.
- 각 sheet entry의 range는 valid A1 rectangle, table에는 실제 headers가 있어야 한다.
- header의 A1 셀을 찾아 해당 source value(수식은 cached value)와 header text를 NFKC + whitespace/punctuation 제거 + lowercase로 비교한다. header에 원문 텍스트가 포함되지 않으면 mismatch.
- 모든 populated source cell이 하나 이상의 설명 range에 들어가야 한다. 단순 '전체 sheet' 선언만으로 business context 검증이 끝나지 않으며 independent model이 구조/방향/조건을 검증한다.
- Word의 nonempty paragraph/table BLOCK 모두 cover, text의 모든 nonempty line 모두 valid in-bounds L range로 cover. unknown sheet, uncertain entry, unanswered question은 issue.
- 정성 기준 단위 공란은 정상이다. 다만 missing_unit issue를 없애려면 unitEvidence의 단일 criterionCell/unitCell/unitHeaderCell이 실제 sheet에서 같은 행/열로 연결되고, unit header=단위/unit/units, unit cell 실제 공란, formula/comment/merged nonblank master가 없고, quote가 실제 명백한 정성 token(정상/적합/이상없음/yes/no 등)과 같아야 한다. 수치 단위/ND 문제를 이 예외로 없애지 않는다.

```text
context = initialContext
segmentsComplete = initialChunksRead == totalChunks
for attempt in 1..3:
  issues = deterministic(context, originalProfile, segmentsComplete)
  for segment in ALL retainedSource150kChunks:
    issues += independentVerifier(context, segment) or review_failed
  issues = dedupe(code + normalized message), max 80
  if issues empty: return verified(context)
  fingerprint = SHA256(stableJSON({structure, sorted(issue.code+request)}))
  if source_limit present: return limited(context, issues)
  if attempt==3 or fingerprint==previous: return needs_review(context, issues)
  proposed = truthy issue.request values in issue order
  candidates = proposed.length > 0 ? proposed : fallback(profile)
  selectors = first 8 after validate/normalize, drop invalid, JSON.stringify Map dedup
  # do not run fallback again when validation removes all candidates (see 2.5.1)
  freshlyRead = sameSandbox.staticRequery(selectors)
  require freshlyRead.coverage.complete && selections.length==selectors.length
  context = validate(model.completeReplacement(prior, issues, freshlyRead), maxStructure=160)
  segmentsComplete = true
  # incomplete reread => source_limit + limited; other repair failure => needs_review
  # failure keeps prior context; never invents completion
```

`quality={status:verified|needs_review|limited,attempts,maxAttempts:3,issues:string[],rounds:[{attempt,status:verified|retry|needs_review,issueCount,rereadRanges}]}`. 이전 fingerprint에는 메시지 표현만 달라지는 것을 진전으로 보지 않도록 issue code/selector와 structure를 넣는다. cap 문제는 모델 재시도로 해결됐다고 할 수 없어 즉시 limited다.

최초 chunk 실패의 `context_incomplete`는 영구 sticky가 아니다. 재조회 coverage가 complete이고 replacement validation 성공 시 segmentsComplete=true로 바꾼 후 **다음 round에서 모든 retained source segments**를 다시 독립 검증한다. 그 round의 모든 issue가 없어야 verified가 된다. 재조회 반환의 coverage.complete가 false이거나 selections 배열 부재/개수가 요청과 다르면 source_limit을 추가해 **limited**로 끝낸다. 유효 selector 없음, 재조회 throw, replacement API/JSON/validation 실패는 source_limit이 추가되지 않은 한 **needs_review**다. 두 경우 모두 이전 context와 최초 count를 보존한다. verified이면 analysis.contextSegmentsRead=total, initialContextSegmentsRead는 최초 성공 수를 유지한다. sourceTruncated 또는 reader partial은 이 복구로 해소되지 않는다. 초기 실패 warning은 replacement warnings에 따라 사라질 수 있어도 실제 최초 처리 수는 사라지지 않는다.

### 허용 selector와 재조회 응답

```json
{"requests":[{"kind":"sheet","sheet":"품질","range":"C8:F20"},{"kind":"blocks","start":1,"end":4},{"kind":"text","start":3,"end":15}]}
```

한 문서에 실제 맞는 selector만 사용한다. 1..8개; sheet는 실제 이름과 A1 rectangle, `$` 제거/case normalize, col ≤16384, row ≤1048576. **현행 Node selector는 sheet maxRow/maxColumn 내로 제한하지 않고 Excel bounds만 검사**하므로 빈 범위는 존재하는 내용으로 인식하면 안 된다. BLOCK 범위는 1..actual block count와 길이 ≤200, text는 actual line count와 길이 ≤1000. Python은 unknown/extra JSON keys와 duplicate keys를 거부, 요청 JSON ≤16384 bytes. 파일명/경로/code/명령/인터넷 주소는 selector가 아니다.

### 2.5.1 재조회 selector의 정확한 fallback과 순서

최종 issues 배열을 원래 순서대로 펼쳐 truthy `issue.request`만 `proposed`에 넣는다. **proposed.length가0일 때만** 아래 fallback을 택한다. 먼저 proposed/fallback 중 한 배열을 결정하고, 그 뒤 각 항목을 `validateRequeryRequest`로 정규화하여 무효값을 버린다. 정규화 객체의 `JSON.stringify`를 key로 insertion-order Map에 넣어 중복을 제거한 뒤 앞8개를 쓴다. 유효한 항목이0개가 되었다고 fallback을 다시 호출하지 않는다.

fallback은 다음 첫 일치 분기 하나만 선택한다. missing issue의 위치, 관련도, 셀 크기로 순서를 다시 매기거나 다음 round에 cursor를 진행하지 않는다.

1. `profile.sheets.length>0`: profile의 시트 순서 앞8개를 각각 `{kind:'sheet',sheet:sheet.name,range:boundingRange(sheet.rows.flatMap(row=>row.cells))}`로 만든다. boundingRange는 각 cell의 **cell 속성**을 A1 파서로 읽고 유효 좌표 전체를 감싸는 최소 열/행~최대 열/행 직사각형이다. 유효 cell0개면 `A1`, 이후 selector 정규화 결과는 `A1:A1`이다. 빈 시트도 앞8개 예산을 소비한다. profile의 dimension/maxRow/maxColumn 전체, missing ranges, 뒤의9번째 시트를 자동 선택하지 않는다.
2. 시트가 없고 `profile.blocks.length>0`: `[{kind:'blocks',start:1,end:min(200,blocks.length)}]` 하나다. BLOCK 인덱스는1-based다.
3. 둘 다 없으면 `profile.text`의 Python `str.splitlines()` 호환 줄 수 L을 세어 L>0이면 `[{kind:'text',start:1,end:min(1000,L)}]`, 아니면 `[]`다. CRLF는 한 경계, LF/CR/VT/FF/U+001C..001E/U+0085/U+2028/U+2029도 경계다. 마지막 줄바꿈만으로 생긴 trailing 빈 요소는1개 제거하고 중간 빈 줄은 센다. 끝 줄바꿈 없는 `a\nb`와 있는 `a\nb\n`은 둘 다2줄이다.

예: requests 없는 context_incomplete이고 sheet S의 retained cell이 B3/E9이면 `S!B3:E9`; 그 앞의 빈 sheet E가 있으면 `E!A1:A1`이 먼저다. 9개 시트면 첫8개만 선택한다. 시트 없는 DOCX의230 blocks는 BLOCK1:BLOCK200, 시트/blocks 없는1200줄 text는 L1:L1000이다. 이 범위를 자동으로 쪼개어 전부 읽거나 다음 range로 이어가는 동작은 없다. validator/reader의 별도 면적·문자 한도를 넘거나 selectors0개면 repair 실패 경로로 가서 이전 context를 보존한다. source_limit가 있으면 limited, 없으면 needs_review이며 abort는 전파한다.

static command: `python /home/user/document-requery.py /home/user/document-input.bin <kind> /home/user/document-requests.json /home/user/document-requery.json`. 180초 command cap. 원본 SHA-256를 다시 맞춘다. Python은 원본 전체를 trusted reader로 **재개방한 뒤** selector 구간을 꺼낸다. 별도 원본을 쓰거나 model-generated code를 실행하지 않는다. source 누적 ≤120,000자, cells ≤10,000, Node 결과 문자열 ≤180,000자. selection=`{request,source:string}`이고 source는 선택한 region JSON 문자열이다. 반환 request/order가 원요청과 정확히 같아야 한다. truncated JSON source일 수도 있으므로 `coverage.complete:false`에서는 repair 성공으로 취급하지 않는다. 원본 reader 자체 partial이면 구간만 읽었더라도 재조회 complete는 false다.

## 2.6 PDF/image 시각 전사와 별도 품질 검증

시각 문서는 E2B metadata read 다음, **별도 Gemini 작업**으로 전체 구조 전사한다. E2B 세션은 이 시점 전에 종료된다. 전사 전에 selected facts부터 뽑으면 안 된다. page 제목/본문/표/각주/조건/stamp/reading order를 먼저 보존한다. original PDF/image를 유지하고 verification text만으로 원본을 대체하지 않는다. 전사 텍스트에도 'fallible untrusted source' 표시를 붙여 다음 추출에 전달한다.

한 호출 최대 3 requested pages; 전체 최대 30페이지; 1-based 위치는 inventory 기준. 전체 180초와 호출당 min(남은 시간,60000ms) 제한. 각 전사 호출 output 16384 tokens; JSON page 합계 250,000자. attempt 1..3은 전사+검증 한 round다. 최초 읽은 페이지가 하나도 없을 때 호출 오류는 hard failure, 일부 페이지가 있으면 보존 후 partial/needs_review.

page 구조와 validation:

```json
{"pages":[{"page":1,"rotation":0,"complete":true,"warnings":[],
 "blocks":[{"id":"p1-b1","kind":"text","text":"시험 결과","uncertain":false},{"id":"p1-b2","kind":"table","text":"","tableId":"p1-t1","uncertain":false}],
 "tables":[{"id":"p1-t1","headers":["항목","결과"],"cells":[
  {"row":1,"column":1,"rowSpan":1,"colSpan":1,"text":"항목","uncertain":false},
  {"row":1,"column":2,"rowSpan":1,"colSpan":1,"text":"결과","uncertain":false},
  {"row":2,"column":1,"rowSpan":1,"colSpan":1,"text":"강도","uncertain":false},
  {"row":2,"column":2,"rowSpan":1,"colSpan":1,"text":"31.0","uncertain":false}]}]}],"warnings":[]}
```

page는 실제 requested/expected 범위 내, 중복 금지. rotation 0/90/180/270; blocks ≤300, tables ≤60, cells 합계 ≤1600/page; row/span ≤2000, col/span ≤200; row+span/col+span bounds 검사. cell text/block text ≤10000; warning ≤60×1500; header ≤200×1000. block/table ID는 동일 page 내 유일하고 실제 table을 참조해야 한다. `kind=table` block은 root table을 정확히 한 번 가리킨다. merged cell은 anchor 하나이며 rectangle overlap 금지. nested table은 child `parentTableId,parentCell:RnCn`와 parent cell `childTableIds`가 양방향 동일, cycle 금지. multi-row header나 인접 table을 nested로 오인하면 품질 오류다. empty cells는 empty string, 인쇄 `-`는 `-`, ND는 ND, decimal zeros/commas/inequality/units는 원문 그대로다.

전사 self `complete`만 믿지 않는다:

1. 독립 page inventory와 반환 page sets를 비교해 missing pages 계산.
2. 디지털 PDF 보조 원문의 nonempty line 중 NFKC/whitespace/zero-width 제거 후 길이 ≥3인 line이 해당 전사 모든 blocks/cells에 없으면 source omission. 보조 text로 값을 자동 보충하지 않음.
3. **텍스트가 풍부한 PDF 포함 모든 전사 page**에 별도 original-visual judge를 호출한다. 입력은 원본+전사, output은 acceptable/issues/rereadPages/verificationLimits/blankPages. 요청 밖 page는 오류. entirely empty transcript는 원본 전체가 빈 페이지임을 judge의 blankPages reason으로 명시 확인해야 함.
4. judge가 acceptable=false인데 이유를 누락하면 각 page에 일반 unverified issue 추가. verificationLimits가 있으면 요청 모든 page에 issue. judge 실패/미실행도 완료 아님.
5. 각 page의 source omission/uncertain/warning/incomplete/judge issues를 모은다. 새 전사가 이전에 들어 있던 source line을 잃으면 교체하지 않는다. 기존 issue 수가 줄거나 judge issue가 있는 page 내용이 바뀐 때만 개선 교체한다.
6. 디지털 텍스트 없는 image/scan에서 한 번 판독 불확실이 생기거나 judge verificationLimit가 있으면 sticky 확인 필요를 유지한다. 모델이 다음 round에서 경고만 지웠다고 자동 확정하지 않는다.

재시도는 issue가 있는 실제1..30 page 중 `visual_confirmation`/`judge_failure`만 남은 경우를 제외해 전사 요청한다. issue ID fingerprint가 같거나 issue가 남은 채 전체 내용이 같으면 `no_progress`. stopReason=`verified|round_limit|time_limit|page_limit|output_limit|request_failed|no_progress|unverified_inventory|needs_confirmation`. 마지막 페이지에도 unresolved sticky/judge issue가 있으면 complete=false. quality status는 **최종 선택된 stopReason이 time_limit/page_limit/output_limit 중 하나일 때만** limited, 그 외에 issues가 있거나 requiresConfirmation이면 needs_review, 나머지 verified다. cap 존재만으로 stopReason 우선순위를 건너뛰지 않는다. issueDetails 최대100, verificationLimits에는 '전사 완료가 모든 글자 정확성 보증은 아님'을 포함한다.

종료 분기는 순서대로 적용한다: (1) 이미 time/output/request 처리에서 limited이면 needs_review round로 종료하고 설정된 stopReason 유지, (2) issues 없음 verified, (3) noProgress이면 batchFailure에 따라 request_failed 또는 no_progress, (4) repairable page 없음이면 expectedPages>30일 때 page_limit, expectedPages 없음이면 unverified_inventory, 나머지 needs_confirmation, (5) 아직 repairable이고 attempt=3이면 round_limit, (6) 나머지만 retry. 따라서31페이지 파일도 앞30페이지 문제 때문에 no_progress/round_limit이 먼저 선택되면 quality=needs_review다. page31미읽음은 coverage/warning에 남고 run은 partial이며, 항상 quality=limited라고 단정하지 않는다.

시각 analysis 업데이트는 readerComplete && transcription.coverage.complete로 `complete`를 계산하고 contextComplete=transcription.coverage.complete, visualAnalysisPending=false로 바꾼다. public transcription은 markdown 첫25000자(나머지 markdownTruncated), 각 page의 blocks/tables 개수만 노출한다. 실제 full structured transcript는 private modelParts에 보존한다. 전사 전달 serialized cap은 650000자.

## 2.7 source facts와 판정 분리

현행 **독립 field extraction은 PDF/image에만** 추가 호출한다. XLSX/CSV/DOCX/TXT/MD/JSON는 분석 원문에서 판정 호출이 값을 추출하며 별도 Extraction fields inventory를 생성한다고 주장하면 안 된다.

Extraction=`{referenceNumber,documentType,fields,warnings,referenceNumberVerified}`. fields ≤300, each `{label,value,unit,uncertain,evidence,verification:verified|mismatch|unverified}`. label 1..500자, value ≤2000, unit ≤80, evidence ≤8, quote 1..2500, documentId exactly same, page1..10000, A1 cell syntax. warning ≤30×2000. 공란 value/no evidence는 uncertain=true. test report에서는 모든 실측 result tables/all provided pages의 rows를 보존하고 날짜/의뢰인/서명/방법 번호 등을 측정값으로 바꾸지 않는다. 개별 specimen/반복 test는 source identifier로 분리한다. 기준이 없는 field도 남긴다.

document number 우선순위는 실제 성적서번호/시험성적서번호/Certificate No/Report No; 없는 경우에만 general 문서번호. decorative 문서 관리 ID/revision은 certificate ID를 덮어쓰지 않는다. source notation, leading zero, unit `-`를 그대로 보존한다. unit empty는 실제 blank/absent일 때만. value `N.D.`는 판독 uncertainty와 구별하지만 수치 판정에는 쓸 수 없다.

independent text verification은 공백/NFKC/zero-width 정규화 후 같은 field label이 있는 source row/line에서 정확 value token 확인. 숫자 경계를 둬 `0.02`가 `0.025`에서, `1.2`가 `11.2`에서 매치되면 안 된다. PDF label만 단독 줄이면 최대 뒤2줄까지 합치되 다른 추출 label을 만난 즉시 stop. label anchor가 있는데 값 불일치면 mismatch+uncertain; text 영역/label을 찾지 못하면 unverified(자동 mismatch 아님). image는 디지털 text 대조 불가 warning. PDF number가 실제 text에 없으면 referenceNumber를 빈 문자열로 지우고 warning.

최종 items는 별도 semantic review 후 server가 다시 판정한다. details는 03 계약. exact numeric unit 변환을 임의로 추가하지 않는다. fields count와 findings count는 다를 수 있다(한 field에 여러 criteria, criterion 없는 field, 필수 누락). source가 없는 필수 누락 항목은 **머리글·시료명을 해당 값의 하이라이트로 꾸미지 않는다**. blank cell 실증과 subject identity source를 구분해야 한다.

## 2.8 병렬성·세션·타임아웃·취소

| 자원 | 상한/스케줄 |
|---|---|
| open review runs | running/awaiting_confirmation/awaiting_documents 합계 최대3; 초과429 |
| input document analysis | run당 2 workers, dedupe by document.id |
| eligibility | 2 workers |
| target review | 2 workers; 각 document의 fields→verdict는 순차 |
| ReviewEngine model queue | max2; 프로세스 단일 engine에서 공통 |
| 실제 Gemini adapter | process-wide FIFO TaskPool(2), dashboard/분석 포함, pending100 |
| 실제 E2B | process-wide FIFO TaskPool(2), dashboard/criteria 포함, pending100 |
| 동일 document E2B 내부 | TaskPool(1), nested reread는 새 global slot을 잡지 않음 |

TaskPool은 대기 중 abort를 즉시 remove/reject한다. 실행 중 abort는 underlying work settle + sandbox cleanup 전까지 slot을 유지해 취소 때 concurrency가 2를 넘지 않게 한다. pending100 초과 `POOL_FULL`,429. 두 client를 만들었다고 글로벌 제한이 늘어나면 안 된다.

한 document sandbox resources는 WeakMap에 `{id,kind,sha256,sourcePromise,parsersPromise,queryPromise}`로 저장한다. 같은 physical sandbox에 다른 document.id/kind/digest가 들어오면 거부한다. 원본/reader upload·pip install·query script upload 각각 once, 실패 promise를 보존해 설치 반복으로 복구한 척하지 않는다. profile read 이후 문맥 검증 모델 호출 동안도 해당 E2B global slot은 점유한다. document context repair의 reread는 그 동일 원본/설치를 재사용한다. **XLSX criteria discovery는 앞선 문서 분석 세션 종료 후 별도 E2B 세션을 만들고 그 탐색 loop 안에서 재사용한다. 사용자 기준 HITL revision은 Gemini 최소 patch 요청1회이며 E2B sandbox를 만들지 않는다.** 따라서 전체 run 동안 하나의 sandbox를 영구 유지하지도, 사용자 수정마다 새 sandbox를 생성하지도 않는다. §2.1 DAG의 feedback revision은 문서 context repair와 다른 단계다.

시간표: E2B create request30초, sandbox lifetime job10..300초 범위(기본60초, document300초), document application total session300초(큐 대기 포함 타이머 시작), pip90초, reader/requery command180초, Python reader150초, E2B kill request15초. Gemini client HTTP 기본30초; VLM wrapper는 전체180초/호출60초의 별도 deadline로 abort한다. 모든 단계 공통 무한 retry 없음.

withSandbox는 성공/실패/abort 모두 동일 kill promise를 finally await. abort와 정상 finish가 겹쳐도 kill once. create가 늦게 성공한 뒤 signal aborted면 곧바로 finally cleanup. kill 실패는 `CLEANUP_FAILED`로 보존하며 cancelled adapter error로 바꾸지 않는다. global E2B activity task는 kill settle까지 살아 있다가 실패 시 failed/cleanup=`실행 환경 종료를 확인하지 못했습니다`를 발행한다. 이미 cancelled run의 후속 event는 차단되므로 이 오류는 run.cancelled를 번복하지 않고 별도의 activity SSE/GET에서 관측한다. UI stop 후 이 알림을 반드시 다시 보여주는 기능까지 완료되었다고 주장하지 않는다. app session deadline이면 진행 중/대기 작업을 abort하고 `문서 분석 제한 시간을 초과하여 같은 샌드박스의 작업을 종료했습니다...` 오류다. 객체 리소스/Abort listener/timer는 finally 제거. credential은 SDK create용 옵션일 뿐 sandbox environment에 넣지 않는다. 프로세스 시그널 종료가 이 finally들을 await한다는 보장은 없으며 01 §11의 현재 shutdown 계약을 따른다.

### 2.8.1 공통 adapter의 정확한 port

`loadConfig({env=process.env,envPath=<root>/.env})`는 dotenv 문법을 Node parseEnv로 읽고 `env[name] ?? fileEnv[name] ?? ''`를 문자열/trim 처리한다. 따라서 환경변수의 빈 문자열도 `.env`보다 우선한다. 파일 ENOENT는 빈 설정 허용, 다른 읽기 오류는 config/CONFIG_READ다. 반환 객체는 freeze하고 `geminiApiKey,e2bApiKey,modelExtract,modelExplore,e2bTemplate`만 갖는다. 모델 기본값은 모두 `gemini-3.5-flash-lite`, E2B template은 `base`. 모델명은 `^(?:models/)?[a-zA-Z0-9._-]+$`에 맞아야 한다. 이 기본값은 저장된 애플리케이션 설정이며 실제 provider의 현재 모델 제공 여부를 인증한 주장이 아니다. publicConfig는 configured boolean2개와 모델명2개만 공개한다.

`createGemini({config=loadConfig(),client?})`는 아래3개 method를 가진다. fake `client`를 주입하면 키 검사를 우회하고 같은 request/response validator를 쓴다. 미주입 시 `new GoogleGenAI({apiKey:requireKey(config,'gemini'),httpOptions:{timeout:30000}})`다. 정확 타입은 contracts/types.ts가 re-export하는 [internal-pipeline.ts](../contracts/internal-pipeline.ts)에 있다.

| method | 입력/SDK 호출 | 성공 |
|---|---|---|
| generateText(options) | options=`{contents?,prompt?,role?,schema?,systemInstruction?,maxOutputTokens?,signal?}`. role 기본extract, extract/explore만 허용. truthy contents 또는 prompt가 필요. SDK `ai.models.generateContent(request)` | `{text:response.text,model:response.modelVersion,usage:response.usageMetadata}`; text.trim()이 비어 있으면 INVALID_RESPONSE, 원문 text 자체는 trim하지 않고 반환 |
| generateJson(options) | 위 입력 + **schema 필수**, optional synchronous `validate(data):boolean`. generateText 후 JSON.parse | `{data,model,usage}`. parse 실패/validate false/validate 예외는 INVALID_RESPONSE. schema는 provider에 보낼 뿐 adapter가 schema validator를 자동 생성하지 않음 |
| streamText(options) | 위 입력으로 `ai.models.generateContentStream(request)` | async iterator: chunk.text truthy일 때 `{type:'text.delta',text}`, usage 있을 때 `{type:'usage',usage}`, 정상 종료 `{type:'done'}`. text.delta가 한 번도 없으면 INVALID_RESPONSE. 공백-only stream text는 truthy이므로 generateText와 동일한 trim 검증은 없음 |

request=`{model:role==='explore'?config.modelExplore:config.modelExtract, contents:contents??prompt, config:{maxOutputTokens,...}}`. config에는 truthy systemInstruction, signal→abortSignal, schema가 있으면 responseMimeType=`application/json`과 responseJsonSchema를 넣는다. output 기본2048, 정수1..32768만 허용하며 위반은 CONFIG_INVALID다. contents와 prompt가 함께 있으면 contents 우선이다. 이 adapter에는 입력 parts 개수/file 크기/응답 bytes/JSON depth의 **범용 상한이 없다**. 원본20MiB, VLM transcript/parts, 각 schema list와 요청 token 예산은 호출 단계가 검사한다. phase budgets는 prompts 문서가 소유한다(예: XLSX supplemental criteria overlay8000, 일반 기준 추출32768). adapter 수준 자동 retry는 없다.

Gemini global TaskPool2의 slot은 generateContent Promise가 settle되기까지, stream은 iteration 완료·throw·consumer return의 finally까지 유지한다. stream consumer가 중간에 close하면 release한다. pool 그 자체의 pending100 초과는 TaskPoolError/POOL_FULL/status429지만 adapter catch를 거치면 아래 safeError에 의해 QUOTA로 공개된다. 원래 SDK 오류는 cause로도 보관하지 않는다.

`IntegrationError(service,code,status?)`의 service는 gemini/e2b/config 외에는 config로, code는 아래 목록 외에는 REQUEST_FAILED로 정규화한다. status는 정수100..599일 때만 보존한다. name=`IntegrationError`, message=`<service>: <표의 문구>`. HTTP 기본 오류 envelope는01의 `{error:message}`이며 아래 `{service,code,status?,message}`는 **internal errorSummary/debug-safe projection**이지 모든 HTTP 오류의 wire shape가 아니다.

| code | 안전한 문구 |
|---|---|
| CONFIG_MISSING | 필수 API 키가 설정되지 않았습니다. |
| CONFIG_INVALID | 서비스 설정 형식이 올바르지 않습니다. |
| CONFIG_READ | .env 설정 파일을 읽지 못했습니다. |
| AUTH | API 키 또는 서비스 접근 권한을 확인하세요. |
| QUOTA | 서비스 할당량 또는 사용 한도를 확인하세요. |
| MODEL_UNAVAILABLE | 요청한 모델 또는 리소스를 사용할 수 없습니다. |
| TIMEOUT | 서비스 요청 시간이 초과되었습니다. |
| INVALID_RESPONSE | 서비스 응답 형식이 예상과 다릅니다. |
| REQUEST_FAILED | 서비스 요청에 실패했습니다. |
| CLEANUP_FAILED | 샌드박스 종료를 확인하지 못했습니다. 설정한 제한 시간 후 자동 종료됩니다. |

safeError는 이미 IntegrationError면 같은 객체 반환. 아니라면 `Number(error.status ?? error.statusCode ?? error.response.status)`로 status를 얻어 순서대로401/403→AUTH,429→QUOTA,404→MODEL_UNAVAILABLE,408/504 또는 name AbortError/TimeoutError→TIMEOUT, 나머지 REQUEST_FAILED. AbortError가 항상 사용자 취소를 뜻하지 않으므로 UI 상태는 에러 이름 대신 소유 signal/run 상태로 결정한다. raw request header/URL/stack/key는 투영하지 않는다.

`withSandbox(work,{config,timeoutMs=60000,sandboxFactory=Sandbox,signal,activity})`의 work는 함수, timeoutMs는 정수10000..300000이어야 한다. 키 검사는 queue 진입 전에 한다. create=`sandboxFactory.create(config.e2bTemplate,{apiKey,timeoutMs,requestTimeoutMs:30000})`; work 인자는 `(sandbox, report)`이며 callback의 **report.taskId 속성**으로 실제 activity 식별을 전달한다. `report(event)`의 반환값은 undefined다. work 반환값을 그대로 돌려주되 그 전에 finally kill이 성공해야 한다. kill request15000, 실패 CLEANUP_FAILED 우선, pool2/취소 동작은 §2.8과 같다. `runSandboxCommand(sandbox,command,{timeoutMs=15000})`는 nonempty string, 정수1..120000 검사 후 `commands.run(command,{timeoutMs,requestTimeoutMs:timeoutMs+5000})`; SDK 결과 그대로 반환하며 safeError 적용한다. 문서 reader/requery의180초 명령은 이120초 helper 대신 다음 `runObservedCommand`를 사용하므로 서로 한도로 혼합하지 않는다.

## 2.9 activity·실패 격리·완료

실제 트리거만 event: sandbox provisioning/work/files/install/read/reread/cleanup, context structure/context/quality/repair, visual transcribe/quality, eligibility/extract/verify. command stdout은 trusted `TRACE_PROGRESS:{stage,current,total?}`와 제한된 parser 설치 진단만 관측한다. UI로 shell 명령·key·URL·base64·전체 source를 내보내지 않는다. 문서 activity sanitizer는 ANSI/control 제거, known secrets·AIza/e2b_/Bearer·URL 치환, `api_key/authorization/password/secret/token/process.env/environ =` 같은 줄 숨김, 입력을 String 변환 후 먼저 앞20,000자로 제한하고 정제·trim 후 앞 최대1,500자. command stdout/stderr의 tail buffer와 잘림 방향이 다르다. handoff는 parentTaskId 또는 `fromTaskId/toTaskId`로 실제 E2B reread→Gemini verifier 전달 때 기록한다. 모션 자체 규칙은 UI 명세의 실제 activity queue 계약을 따른다.

### 명령 stdout/stderr의 framing·backpressure

`runObservedCommand(sandbox,command,{step='work',title,detail?,outputKind='none',onActivity,secrets=[],signal,timeoutMs=15000,requestTimeoutMs=timeoutMs+5000,throttleMs=600,heartbeatMs=8000,maxLogs=24})`는 실행 결과 raw SDK object를 반환한다. onStdout/onStderr callbacks는 동기·비차단이다. callback에서 한 줄도 arbitrary stdout/source를 직접 publish하지 않는다.

1. channel마다 `buffer`와 `received`를 독립 소유. nonempty callback 수신 시 received=true. `(oldBuffer + chunk)`의 **마지막16000자**를 남겨 CR/LF 연속으로 split, 아직 끝나지 않은 마지막 line의 마지막8000자는 buffer에 저장. 완성된 마지막40개 line만 검사한다. 최종 feed에서는 buffer도 완성 line으로 처리하고 비운다. 순서 기준은 callback 수신 순서이며 두 channel의 실제 OS 쓰기 순서를 재구성하지 않는다.
2. commandProgressLine은 ANSI 제거/trim 후 empty 또는 >8000자 거부. reader의 TRACE_PROGRESS만 stage=file/sheet/page/range/blocks/cells + safe integer current0..1e9 허용. total은 같은 bounds와 total≥current일 때만 표시. build의 TRACE_BUILD는 target=browser/validation와 status=started/completed만. reader summary JSON은 cellsRead 필수, unitsRead/unitsTotal/returned/requested는 유효 count일 때만. check JSON은 rendered=true + characters count일 때만 검사 통과 안내로 변환한다.
3. packages는 Collecting/Downloading/Using cached/Requirement already satisfied 뒤의 안전 package token(문자 시작, 뒤 `[A-Za-z0-9_.-]` 최대80), Successfully installed의 안전 token 최대10개(뒤 `[A-Za-z0-9_.+-]` 최대100), npm added/changed 최대6자리 count, up to date만 안내한다. 기타 stdout은 버리고 기타 nonempty stderr는 내용 없는 `실행 진단 수신`으로 바꾼다. sanitizer를 다시 적용한다.
4. key=`channel|sanitizedTitle|sanitizedDetail`. command-local seen Set100으로 동일 key 재표시 방지, pending Map8은 가득 차면 oldest 제거, info/log events 총24개. flush는600ms 간격.8초 heartbeat는 다음 process 응답을 기다린다는 **상태 안내**만, 백분율/가짜 완료 없음. heartbeat는 seen dedup을 생략하되 pending Map 같은 key는 합쳐진다.
5. commands.run resolve 시 channel별 nonempty streaming callback을 한 번이라도 받았으면 aggregate result.stdout/stderr를 replay하지 않고 남은 buffer만 final flush. streaming callback을 전혀 받지 않은 channel만 aggregate를 한 번 feed한다. 그래서 streaming+final 중복과 stdout→stderr간 false dedup을 모두 피한다.
6. 정상/오류 모두 interval/timer 정리. abort 아님이면 pending 마지막 최대3개를24개 cap 안에서 flush 후 closed=true/pending clear. 이후 callback 무시. integer nonzero exitCode는 failed event, 그 밖은 completed event; caller는 실제 read.exitCode를 별도로 검사한다. throw는 signal.aborted에 따라 cancelled/failed event 후 재throw. observer exception은 삼켜 실제 work를 실패시키지 않는다. process kill은 이 observer가 아니라 owning withSandbox의 abort/finally 책임이다.

dashboard는 상위 phase의 start/end를 직접 발행하므로 이 observer의 info/log만 전달해 설치/완료 카드 중복을 피한다. global activity store의12-log retention은 이 command24-log emission cap과 별개다. 각 activity timestamp는 실제 append 시 생성하며 animated playback 시간으로 덮어쓰지 않는다. SSE byte framing·revision과 terminal 불변식은01 §6/8의 별도 계약이다.

문서 한 개가 실패해도 sibling worker를 중단하지 않는다. criteria document read failure는 기준 근거가 사라지므로 run failed. target read failure는 해당 document failed, 나머지 처리; 전부 실패면 run failed. successful partial analysis도 진행 가능하지만 최종 run partial을 반드시 유지한다. review에서 error가 나면 document.failed를 내고 sibling 계속 처리. 취소는 run cancelled, queued/processing target cancelled, 진행 feedback cancelled; emit은 run.cancelled 외 후속 event를 차단한다. 재시도는 사용자가 새 분석/run을 시작하는 행위이며 기존 실패 데이터를 성공으로 바꾸는 자동 fake retry는 없다.

최종 target 상태의 정확한 식은 `outputLimited = normalizedItems.length >= 250 || result.data.reviewCoverage?.complete === false`, 이어 `state.status = missingRows.length || document.analysis?.coverage?.complete === false || outputLimited ? 'partial' : 'completed'`다. normalizedItems는 optional missing 항목을 제거한 뒤 배열이다. reviewCoverage/analysis/coverage 생략이나 complete=null은 이 strict-false 검사에서 partial을 만들지 않는다. remainingWork가 nonempty라는 사실만으로도 partial로 바꾸지 않는다. 오류를 throw한 target은 catch에서 failed다.

오류 설명은 대입 순서대로 덮어쓴다: (1) outputLimited면 `reviewCoverage={complete:false,itemLimit:250,remainingWork}`를 만들고 한도 안내를 error에 저장하며 document.incomplete 발행, (2) analysis.coverage.complete===false면 readerComplete===true일 때 `원문 읽기 완료 · 해석 확인 필요. 문서 이해에서 남은 확인 사항을 살펴보세요.`, 아니면 `문서의 일부 범위를 읽지 못했습니다. 문서 이해에서 미확인 범위를 살펴보세요.`로 error 교체, (3) missingRows가 있으면 해당 행 개수/위치 안내로 최종 error를 교체하며 별도 document.incomplete 발행한다. 따라서 최종 snapshot의 설명 우선순위는 missingRows > analysis incomplete > outputLimited다. (2)만으로 별도 document.incomplete event를 추가하지 않는다. 성공 처리 마지막의 document.completed는 partial도 자신의 status와 함께 발행한다.

run 집계의 정본은 [01 §3](01-state-api.md#3-run-상태-기계)의 exact predicate다. target 전체 failed이면 failed, 그 외 target failed/partial, analysis.status!==complete, 또는 명시된 criteria discovery9개 신호 중 하나면 partial이고 나머지는 completed다. `allRegionsExamined`, `extractedCriteriaComplete`, `contextComplete`, `rejectedDispositions` 및 일반적인 coverage.complete를 criteria report에 대해 추가로 검사하지 않는다. 생략된 report coverage/optional 신호를 자동 incomplete로 간주하지 않는다. **조건 미해결 review items가 있다고 반드시 run partial인 것은 아니다.** completed는 이 집계의 결과이며 모든 의미·근거·조합을 독립 검증했다는 증명이 아니다. UI summary의 review count를 함께 보여야 한다.

### 필수 acceptance 예시

| 입력/실패 주입 | 기대 증거와 상태 |
|---|---|
| title row1, header row8, unrelated log row900, hidden criteria sheet | 모든 populated region 설명, header exact source; 미설명 row900이 deterministic missing_region |
| 저장 수식은 있으나 cache 없음 | formula 보존, warning/count, 값 zero 생성 금지, 해당 item review |
| reader complete=true, 구조 header 셀 오독, repair3회 잔존 | readerComplete=true/contextComplete=false, analysis partial, run partial; read 완료와 이해 완료 라벨 분리 |
| 2개 문서에서 동시에 context repair | 최대2 E2B, 각각 sandbox ID 동일 재사용, pip당1회, 문서간 bytes 혼합0 |
| 전사 첫 round에서 0.02가 0.025로 오독 | 원본 judge/field text check가 검출, 자동 pass 금지; resolved 아님을 기록 |
| image 파일 printed 1/2 | page1만 inventory, absent page 추정 금지, 잘린 내용 warning |
| 31페이지 PDF | 실제 expected31, VLM cap30, page31 missing과 run.partial; 앞30페이지 issue에 따라 no_progress/round_limit needs_review 또는 page_limit limited |
| fast tasks 2개 / cancel during install | activity에는 실제 events만, global limits 준수, kill once, queued removed, late completion suppressed |
| E2B kill 실패와 cancellation 동시 | run은 cancelled 유지, global E2B activity failed/cleanup, adapter CLEANUP_FAILED; resource 종료 완료 주장 금지 |
| 한 target API 실패, 다른 target 정상 | failed/completed 문서 각각, run partial, 정상 결과 보존 |

이 예시는 설계 gate이며 이 문서 작성 중 실제 provider를 호출해 실행한 결과가 아니다. 시험별 실행/미실행은 패키지 검증 증거에 구분한다.

**추가 acceptance와 기존 source 검증의 구분:** malicious ZIP/매크로/외부 링크의 end-to-end 불실행, 복잡한 nested DOCX 실물+헤더/본문 방향의 모델 의미 검증, 두 문서 사이 잘못된 evidence/bytes의 교차 입력 음성 시험은 이 설계의 추가 gate다. 단위 validator나 fake adapter 테스트가 있다고 이 세 end-to-end 시나리오가 실행됐다고 승격하지 않는다. 해당 fixture·명령·결과 파일이 없으면 unexecuted로 기록한다. 이는 현재 구현의 정보 유출이 확인됐다는 주장도 아니다.

추가 gate의 구체적 입력 제작·변형·실행·판정은 [document-negative-cases.json](../contracts/document-negative-cases.json)의 DN-01~04로 고정한다. DN-01/02는 G12의 archive/macro/link 불실행, DN-03은 G03의 nested DOCX+전치 의미, DN-04는 G03의 실제 두 문서 시각 경로+별도 오염 주입이다. 기존 `run-gate.mjs`의 위치 인자와 `runGate(gateId,{projectRoot,inputDirectory,runId,signal})` export를 사용하며 새 옵션을 만들어 내지 않는다. genuine VBA fixture/실제provider/artifact가 없으면 NOT_RUN이며 문서 작성이나 marker-only 가짜 macro로 pass를 만들 수 없다. 명령과 반환 protocol은06 §6 및 validation/README와 동일하다.

## 2.10 기준 버전의 명시적 한계

- 통계적 모델 응답으로 모든 가능한 레이아웃 의미를 증명할 수 없다. deterministic location/coverage + 별도 모델 검증 + HITL이 보완하지만 같은 모델의 self-correlated 오류 가능성은 남는다.
- material/category/condition의 의미 추출은 모델 의존이다. row/column 이름·case ID·고정 좌표 lookup으로 대체하면 범용 재현 실패다.
- summary source cap, PDF/VLM cap, 이미지/차트 cap은 지원 한도이며 남은 범위를 completed로 지우지 않는다. 단순 구조 coverage는 semantic criterion coverage와 별도다.
- public DOCX evidence schema는 BLOCK/L을 직접 구조화한 field가 없고 quote 기반이다. context range는 BLOCK/L을 보존하지만 고정 pagination/highlight를 만들어 보완하지 않는다.
- XLSX locale display formatting은 value와 numberFormat을 별도 보존하며 Excel rendering과 byte-identical 표기를 보장하지 않는다.
- 전사/field max에 걸리면 source warning과 partial을 보존해야 한다. 모델이 `reviewCoverage`를 아예 생략한 경우 현재 원문 row 검사가 없는 형식의 exhaustive combinations를 deterministic하게 증명하지 못한다(03의 known gaps 참조).
- 본 패키지는 설계와 검증 계약이다. 재구현 앱·Python reader 전체 소스를 제공하는 대신 위 데이터·알고리즘·프롬프트·수치와 테스트 gates로 구현해야 한다.

감사상 원본 근거: `server/documents.mjs`, `sandbox-documents.mjs`, `sandbox-document-reader.py`, `document-quality.mjs`, `document-requery.{mjs,py}`, `document-sandbox-resources.mjs`, `visual-transcription.mjs`, `visual-quality-judge.mjs`, `field-extraction.mjs`, `review.mjs`, `integrations/src/{gemini,sandbox,task-pool,config}.mjs`. 이 경로는 추적용이며 이 문서의 내용을 이해하거나 구현하기 위한 필수 외부 파일이 아니다.


## 현재 상한과 향후 전수 처리 제안의 차이

**CURRENT_REPRODUCTION**은 위 본문의 상한을 그대로 사용한다. reader의 시각 이미지 최대 8개, VLM 최대 30페이지, 전사 wall budget 180초를 초과하면 현재 coverage/partial/stopReason을 보존한다. 자동 window 분할이나 새 session으로 나머지를 이어 읽는 기능을 추가하지 않는다. [08의 확장 제안](08-rebuild-coverage-geometry.md)과 [확장 DTO](../contracts/rebuild-extensions.ts)는 **OPTIONAL_FUTURE**이며 현재 원본에 없는 physical-page 집계·추가 locator·geometry verifier를 정의한다. 그 제안의 미실행은 현재 재현 실패가 아니며, 제안된 새 결과를 기준선의 partial 결과 대신 사용해서도 안 된다.

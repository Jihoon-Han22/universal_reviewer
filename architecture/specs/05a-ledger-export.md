# 검토대장과 일반 결과 내보내기 재현 계약

이 문서는 검토 결과 내보내기와 **사용자가 올린 XLSX 검토대장 사본의 두 셀에 결과를 기록하는 기능**의 구현 계약이다. 영구 보관형 대장 데이터베이스, 전체 파일 일괄 기록, 대장 행 추가는 현재 기능이 아니다. 아래 스키마와 알고리즘만으로 구현할 수 있어야 하며, 기준 소스 경로는 감사용 출처일 뿐 구현에 필요한 외부 참조가 아니다.

기준 조사: 2026-09-21, `server/ledger.mjs`, `server/app.mjs`, `server/ledger.test.mjs`, `server/app.test.mjs`, `src/components/LedgerModal.tsx`, `src/components/ledger-modal.css`, `src/App.tsx`, `server/documents.mjs`, `server/review.mjs`. 테스트 실행 여부는 마지막 절과 검증 로그를 구분해서 읽는다.

활성 프로필은 **CURRENT_REPRODUCTION**이다. 이 문서의 기존 대장/내보내기 동작은 현재 소스의 계약이다. 별도 전역 개선안이 여기에 서술한 요청 순서, fingerprint 무효화 조건, 오류 우선순위, 메모 보존, 다운로드 결과를 바꾸지 않는다. 미래 worker/queue나 전면 접근성·성능 보강은 **OPTIONAL_FUTURE**이다.

## 1. 책임과 저장 수명

| 책임 | 재구현 모듈 | 실제 도구 / 선언 범위 → lock 버전 |
|---|---|---|
| 대장 업로드·선택·미리보기·확인 다운로드 | React `LedgerModal`, 조건부 lazy import + Suspense fallback=null | React `^19.2.0` → `19.3.0`, ReactDOM 동일 |
| 모달 입장 효과 | `motion.div`, `motion/react` | Motion `^12.23.24` → `12.43.0` |
| 아이콘 | `lucide-react`; FileSpreadsheet, ScanLine, ShieldCheck, LockKeyhole 등 | `^0.468.0` → `0.468.0` |
| 행·열·수식·병합 읽기와 저장 후 확인, 일반 XLSX 생성 | 서버 `ExcelJS.Workbook` | exceljs `^4.4.0` → `4.4.0` |
| 대장 ZIP 엔트리 읽기, 두 셀 XML만 교체 | 서버 JSZip | jszip `^3.10.1` → `3.10.2` |
| HTTP 라우터 | Express Router | express `^5.1.0` → `5.2.1` |
| fingerprint / 원본 동일성 | Node `crypto.createHash('sha256')` | Node 내장 API |
| ZIP 확장 크기 사전 방어 | Node `zlib.inflateRawSync`, `Buffer` | Node 내장 API |

대장도 `/api/documents`의 메모리 `DocumentStore`에 `role:'ledger'`로 업로드한다. 서버의 run도 메모리 Map이다. 대장 분석 매핑/제안/추가 메모는 열린 모달의 React state이다. 서버 재시작 후 원본 및 run 복원, localStorage 복원, 대장 검색·필터·페이지네이션 API가 없다. 일반 내보내기에는 현재 UI 필터와 무관하게 모든 `run.items`가 들어간다. 대장 모달은 한 번에 선택한 대상 문서 1개와 대장 1개, 정확히 일치한 행 1개만 처리한다.

원본 `document.buffer`는 변경하지 않는다. 사용자의 최종 버튼은 사본 다운로드를 시작하며, 업로드한 원본에 저장하거나 run 판정을 수정하지 않는다. 모달을 닫았다 열면 선택/메모/매핑이 초기화된다. 모달 내부에서 새로 업로드한 대장 ID를 부모 documents 목록에 추가하는 callback은 현재 없다.

## 2. HTTP 계약

공통: JSON 요청은 `Content-Type: application/json`. 실패는 `{ "error": "사람이 읽을 수 있는 한국어 설명" }`. `LedgerError`의 상태 코드는 기본 400, 일반 예외는 500과 `검토대장 처리 중 오류가 발생했습니다.`. `POST`에서 Origin이 있으면 로컬 hostname(`localhost`, `127.0.0.1`, `[::1]`)만 허용하는 앱 공통 정책을 적용한다. 비밀 키와 파일 원문 바이트는 응답 JSON에 넣지 않는다.

### 2.1 업로드

`POST /api/documents`, multipart fields: `files`=XLSX 파일 1개, `role`=`ledger`. 성공 201 `{documents:[{id,name,kind:'xlsx',mime,size,url,...}]}`. 파일 내용 URL은 `/api/documents/{id}/content`이다. 앱 전체 업로드는 요청당 10개/파일당 20MiB이지만 대장 UI는 1개만 받는다. `.xlsx` 확장자(대소문자 무시), 크기 `0 < bytes <= 20*1024*1024`를 클라이언트에서 검사하고 서버에서도 실제 ZIP/워크북을 검사한다. 업로드만 성공해도 기록 가능하다고 표시하지 않는다.

### 2.2 기록 위치 분석

`POST /api/ledgers/analyze` → 200:

```ts
type LedgerAnalyzeRequest = {
  documentId: string;       // 업로드한 XLSX 대장
  key: string;              // trim 후 비어 있으면 안 됨. 원 입력 길이 <=200
  runId?: string;           // UI는 항상 두 ID를 함께 보냄
  sourceDocumentId?: string;
  contextId?: string;       // /^[A-Za-z0-9_-]{1,100}$/; UI는 crypto.randomUUID()
};
type LedgerMapping = {
  status: 'ready' | 'blocked'; code: string | null; reason: string;
  key: string; sheet: string | null;
  headerRow?: number;       // 1-based
  keyColumn: string | null; resultColumn: string | null; noteColumn: string | null;
  matchingRows: number[]; targetCells: string[]; existingValues: Record<string,string>;
  sourceDigest?: string;    // 원본 전체 buffer SHA-256 lowercase hex
  candidates?: {sheet:string; row:number}[];
};
type LedgerProposal = {
  result: '적합'|'부적합'|'확인 필요'; note:string;
  counts:{total:number; pass:number; fail:number; review:number};
  sourceDocumentId:string; sourceDocumentName:string; incomplete:boolean;
  fingerprint:string;      // §4의 순서로 구성한 proposal JSON UTF-8 SHA-256
};
type LedgerAnalyzeResponse = {
  mapping: LedgerMapping; proposal?:LedgerProposal;
  analysis?: {
    status?:'complete'|'partial'|'unsupported'|'failed';
    summary?:string; documentType?:string;
    inventory?:{sheetCount?:number;sheets?:{name?:string;state?:string;maxRow?:number;maxColumn?:number;protected?:boolean}[]};
    warnings?:string[];questions?:string[];needsConfirmation?:boolean;
    coverage?:{complete?:boolean;readerComplete?:boolean;contextComplete?:boolean;
      unitsTotal?:number;unitsRead?:number;contextSegmentsTotal?:number;
      contextSegmentsRead?:number;sourceTruncated?:boolean};
  };
};
```

순서: `documentStore.get(documentId)`가 존재하고 `kind==='xlsx'`인지 검사(실패 404) → contextId 형식 검사 → 공통 `ensureAnalyzed(document,{contextId,signal})` 완료를 await → §3의 결정론적 매핑 → `runId || sourceDocumentId`가 truthy이면 §4의 proposal 계산 → JSON. 따라서 두 ID가 모두 빈 문자열이면 proposal을 생략하며, 한쪽만 truthy이면 나머지 ID 부재도 proposal 검사에서 오류가 된다. key 검사는 ensureAnalyzed 뒤 analyzeLedger 안에서 수행한다. 구조 분석이 throw하면 매핑 및 쓰기에 진입하지 않는다. 분석이 `partial` 등 결과를 반환하면 구조 안내와 정확한 셀 매핑은 별개로 표시한다; 현재 코드는 구조 분석 `partial`이라는 이유만으로 mapping ready를 blocked로 바꾸지 않는다.

`req.aborted` 또는 응답이 끝나기 전 `res.close`이면 이 요청 전용 AbortController를 abort하여 `ensureAnalyzed`에 전달한다. listener는 finally에서 제거한다. 전역 실행 또는 다른 문서 작업 취소로 확장하지 않는다. `ensureAnalyzed` 주입이 없는 단위 테스트에서는 구조 분석을 생략할 수 있지만 실제 앱 라우터에는 주입해야 한다.

### 2.3 사본 다운로드

`POST /api/ledgers/export`:

```json
{
  "documentId":"ledger-uuid", "key":"R-42", "runId":"run-uuid",
  "sourceDocumentId":"target-uuid",
  "mapping": {
    "status":"ready", "code":null, "reason":"", "key":"R-42", "sheet":"대장",
    "headerRow":8, "keyColumn":"A", "resultColumn":"C", "noteColumn":"D",
    "matchingRows":[9], "targetCells":["C9","D9"], "existingValues":{"C9":"","D9":""},
    "sourceDigest":"분석 응답의 원본 SHA-256 값을 그대로 보냄"
  },
  "proposalFingerprint":"분석 때 받은 64자리 hex", "confirmed":true,
  "note":"선택적 사용자 추가 의견, 최대 1000자",
  "contextId":"선택적 작업 식별자"
}
```

위 예시는 §3.2의 합성 대장을 사용한 객체 형태이다. 실제 요청은 받은 mapping **객체 전체**를 보내며 `sourceDigest`와 `proposalFingerprint` 설명 문자열을 실제 분석 응답의 hex 값으로 대체한다. 처리 순서와 상태 코드는 고정한다.

1. `confirmed === true`가 아니면 400 `기록할 성적서번호·판정·비고·대상 셀을 확인해 주세요.`
2. 원본 조회 및 구조 재확인(§2.2와 같은 ensureAnalyzed 경로). UI는 export에 별도 contextId를 생성하지 않는다.
3. `key`가 string이고 `mapping.key === key.trim()`인지 확인. 아니면 400.
4. 서버 현재 run의 제안을 다시 계산한다. run이 없거나 상태가 `completed|partial`이 아니면 409; 문서 ID가 run에 없으면 400.
5. `proposalFingerprint`가 현재 **직렬화된 제안 내용**의 fingerprint와 같지 않으면 409 `검토 결과가 변경되었습니다. 기입 내용을 다시 확인해 주세요.`. 사람 확인 이벤트 발생 자체는 무효화 조건이 아니다. 포함 필드와 동일 fingerprint가 유지되는 사례는 §4.1을 따른다.
6. `note`가 생략되었거나 길이 <=1000인 string인지 확인(아니면 400). 최종 비고=`proposal.note` + 메모가 trim 후 비어 있지 않을 때 `\n사용자 확인: ${note.trim()}`.
7. §5의 원본 재매핑/두 셀 쓰기/보존 검증. 클라이언트의 `result` 필드는 무시하고 서버의 `proposal.result`를 쓴다.
8. XLSX bytes, MIME=`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
   `Content-Disposition: attachment; filename="review-ledger.xlsx"; filename*=UTF-8''{URL encoded 원본이름_검토반영.xlsx}`. 원본 `.xlsx` suffix만 대소문자 무시하고 제거한다.

## 3. 셀 매핑 알고리즘

파일명/시트명/사례 ID/고정 셀 주소로 매핑하지 않는다. 모든 시트의 모든 존재 행에서 헤더를 탐색하며 숨김 시트도 제외하지 않는다.

### 3.1 안전 제한

| 항목 | 허용 한도 또는 규칙 |
|---|---|
| 원본 ZIP | Buffer, 22 bytes 이상, 20MiB 이하 |
| ZIP 엔트리 수 | 1–20,000, central directory 실제 개수와 일치 |
| ZIP 구조 | 단일 디스크, EOCD comment 길이 포함 파일끝 일치, 중앙목록 시작+크기=EOCD 위치 |
| 엔트리 | 암호화 불가; local header/central method 일치; 저장(0)·deflate(8)만 |
| 압축 해제 | 선언 합계와 실제 합계 각각 <=100MiB. 각 deflate maxOutputLength=min(선언 크기,남은 한도), 최소1. 확장 실제 크기=선언 크기 |
| 워크북 | `xl/workbook.xml` 필수; ExcelJS 읽기 가능; <=30시트 |
| 시트 | 각각 rowCount<=10,000, columnCount<=200 |
| 탐색 셀 | 모든 방문 행 `row.cellCount` 합 <=100,000 |

ZIP 검증을 ExcelJS/JSZip 파싱보다 먼저 수행한다. 무결성 검증 실패는 400이다. ZIP64/분할 압축 등의 구조를 임의 허용하지 않는다.

### 3.2 헤더·행 탐색

헤더 정규화: `String(value ?? '').normalize('NFKC').replace(/[\s\u200b-\u200d\uFEFF._()\-]/g,'').toLowerCase()`. 셀 문자열은 `cell.value == null ? '' : cell.text`이다.

| 역할 | 허용되는 정규화된 이름 |
|---|---|
| key | 성적서번호, 시험성적서번호, 성적서no, reportno, reportnumber, certificateno, certificatenumber |
| result | 판정, 검토결과, 최종판정, 판정결과, 결과판정 |
| note | 비고, 검토의견, 판정사유, 검토비고 |

같은 행에서 세 역할을 모두 찾았을 때만 표 헤더 후보이다. 후보가 없으면 `headers_not_found`. 후보 중 어느 하나라도 한 역할에 복수 열이 있으면 `ambiguous_headers`(선택 key와 관계없이 보류). 후보별 탐색 범위는 헤더 다음 행부터 **같은 시트의 다음 유효 헤더 직전** 또는 시트 끝까지이다. 뒤쪽 표는 자체 열 매핑을 쓴다.

key 비교는 셀 `.text.trim() === request.key.trim()`의 정확 일치이다. key 자체에 NFKC, 부분 문자열, 대소문자 접기, 유사도 매칭을 적용하지 않는다. 일치행 0개면 `key_not_found`. 전체 시트/표에서 2개 이상이면 `duplicate_key`이며 `candidates`에 시트/행을 모두 반환한다. `matchingRows`만으로 시트를 식별하면 안 된다.

일치 1개일 때 targetCells는 `[판정열+행, 비고열+행]`, existingValues는 이 두 주소의 원래 `.text`이다. sourceDigest는 전체 원본 bytes의 SHA-256. 다음 보류 조건을 **나열 순서**로 검사한다.

| code | 조건 |
|---|---|
| protected_sheet | ExcelJS sheet protection 또는 XML sheetProtection의 sheet=`1|true` |
| formula_key | key 셀이 ExcelJS Formula 타입 |
| merged_target | key 또는 두 target 셀 중 하나가 병합 셀 |
| formula_target | target 중 하나가 ExcelJS Formula 타입 |
| formula_key | XML `<f ref="...">` 배열·공유 수식 범위에 key 포함 |
| formula_target | 위 수식 범위에 target 포함 |
| aggregate_row | 일치행의 어느 값이 trim 후 `합계|소계|총계|총합계|total|subtotal` 정확 일치(영문 대소문자 무시) |

시트 XML 경로는 workbook의 해당 시트 `r:id`→workbook relationships의 Target으로 해석한다. TargetMode가 정확히 `External`이면 거절한다. Target이 `/`로 시작하면 맨 앞 `/` 하나만 제거하며, 나머지는 `path.posix.normalize(path.posix.join('xl',Target))`로 만든다. 그 문자열이 `xl/worksheets/`로 시작하고 실제 ZIP 엔트리가 있는지 확인한다. 절대형 Target에도 동일한 정규화를 추가하거나 대소문자를 무시한 External 검사를 수행한다고 현재 동작을 과장하지 않는다. 수식 ref는 `$`를 제거한 A1 또는 A1:B2 직사각형 범위를 인식한다. 끝까지 통과하면 `{status:'ready',reason:'',code:null,...}`이다.

blocked 기본 객체: `status:'blocked',code,reason,sheet:null,key,keyColumn:null,resultColumn:null,noteColumn:null,matchingRows:[],targetCells:[],existingValues:{}`. 찾은 범위에 따라 headerRow/시트/열/기존값/digest를 덧붙인다. 따라서 보류인데도 찾은 두 셀과 제안값을 미리보기로 보여줄 수 있으나 다운로드는 비활성이다.

예: 시트 `대장`, 8행 헤더 `성적서번호|수량|판정|비고`, 9행 `R-42|7||`이면 keyColumn A, resultColumn C, noteColumn D, targetCells `["C9","D9"]`, matchingRows `[9]`. 표를 20행/4열 이동하면 주소만 바뀌고 같은 논리 행을 찾는다. 이 예시 좌표를 구현에 하드코딩하면 실패이다.

## 4. 선택 문서의 대장 제안

`run.status`는 `completed|partial`이어야 한다(일반 결과 내보내기와 다르다). `run.documents.find(id===sourceDocumentId)`를 사용한다. API는 role을 다시 제한하지 않지만 UI는 `role==='target'`만 선택지에 넣는다. `items=run.items.filter(documentId===sourceDocumentId)`의 순서를 유지한다.

```
counts = { total:items.length, pass:pass 개수, fail:fail 개수, review:review 개수 }
incomplete = document.status !== 'completed'
          || items.length === 0
          || items.some(status가 pass/fail/review 중 하나가 아님)
result = counts.fail > 0 ? '부적합'
       : counts.review > 0 || incomplete ? '확인 필요' : '적합'
```

비고 줄 목록:

1. `${document.name}: ${counts.total}개 검토 (적합 ${counts.pass}, 부적합 ${counts.fail}, 확인 필요 ${counts.review})`
2. incomplete이면 `문서 검토가 불완전합니다. 누락·처리 오류 확인이 필요합니다.`
3. pass가 아닌 항목 중 원래 순서 첫 5개의 `${item.label}: ${item.explanation}`.

줄바꿈 `\n`으로 join 후 전체 `.slice(0,6500)`(JavaScript UTF-16 문자열 단위). `{result,note,counts,sourceDocumentId,sourceDocumentName:document.name,incomplete}`를 이 삽입 순서로 만든 뒤 `sha256(Buffer.from(JSON.stringify(proposal)))`를 fingerprint로 붙인다. 이것은 암호 인증서가 아니라 현재 결과와 이전 미리보기의 일치 검사다.

확인 필요 1개 또는 불완전 문서만 있어도 적합으로 내보내지 않는다. 부적합이 있으면 불완전 여부보다 부적합이 우선이며 불완전 사유는 비고에 남는다. 기존 AI 판정을 사람 수정한 결과가 run에 반영되어 있으면 최신 최종 판정을 집계한다. 다른 문서의 fail은 선택 문서 결과에 섞이지 않는다.

### 4.1 Fingerprint의 정확한 무효화 범위

비교 대상은 §4에서 계산한 `result`, `note`, `counts`, `sourceDocumentId`, `sourceDocumentName`, `incomplete` 6개 필드뿐이다. `humanNote`, `reviewedByHuman`, `machineStatus`, `audit`, run revision, 수정 시각은 해시 입력이 아니다. export 시 이 여섯 필드를 다시 계산한 JSON의 SHA-256과 클라이언트가 분석 때 받은 값을 비교한다. 클라이언트의 새 `note`는 사용자 확인 메모로 덧붙이므로 기존 fingerprint에 포함하지 않는다.

| 분석 후 변경 | 현재 동작 |
|---|---|
| 선택 문서 항목의 pass→fail로 집계가 달라짐 | proposal 변경 → 기존 fingerprint로 export하면409 |
| 같은 status를 사람이 재확인하고 humanNote/audit만 바꿈 | proposal 그대로 → fingerprint 일치; 그 이유만으로409를 내지 않음 |
| 선택 문서와 무관한 다른 문서만 수정 | proposal 그대로 → fingerprint 유지 |
| non-pass 항목의 label/explanation 수정이 첫5개 비고 또는6500자 안에 반영됨 | note 변경 → fingerprint 변경 |
| 첫5개 밖 사유 변경 또는6500자 잘린 부분만 변경, status/counts 등은 동일 | 직렬화 결과 동일할 수 있음 → fingerprint 유지 |
| UI 추가 확인 메모 변경 | 분석 mapping 유지; export 요청의 메모를 길이 검사 후 덧붙임 |

이는 **대장에 쓸 제안의 변경 감지**이며 모든 사용자 수정 이벤트의 감지나 전체 run 감사 체인의 무결성 검증이 아니다. 모든 사람 확인마다 재승인을 요구하려면 별도 run revision/audit hash를 계약에 추가해야 하는데, 그것은 현재 재현 범위를 넘어서는 별도 강화 사항이다.

## 5. 두 셀만 쓰는 사본 보존 계약

1. mapping.status는 ready. result는 세 한국어 판정 중 하나. 최종 note는 비어 있지 않은 string, <=8000자, XML 불법 제어문자 `[\x00-\x08\x0b\x0c\x0e-\x1f\uFFFE\uFFFF]` 불가.
2. 동일 원본으로 §3을 다시 수행한다. fresh.status가 ready가 아니면 409. 다음을 입력 mapping과 정확히 비교한다: sheet,key,headerRow,keyColumn,resultColumn,noteColumn,sourceDigest; JSON.stringify로 targetCells,matchingRows,existingValues. 하나라도 다르면 409 `대장 또는 기록 위치가 변경되었습니다. 기록 위치를 다시 확인해 주세요.`
3. 원본 ZIP을 열어 해당 worksheet XML에서 두 `<c r="주소">` 노드만 교체한다. 다른 노드/엔트리를 ExcelJS 재저장으로 재생성하지 않는다. 기존 셀이 있으면 `s` 등 셀 속성을 보존하고 `t`만 `inlineStr`로 바꾼다. 값은 `<is><t xml:space="preserve">...</t></is>`; XML `& < > " '`를 escape한다. `=HYPERLINK(...)` 같은 문자열도 실행 수식이 아닌 text 셀로 남는다.
4. 없는 target cell은 존재하는 해당 row XML 안의 열 순서에 맞는 위치에 삽입한다. row XML 자체를 못 찾으면 실패. XML namespace prefix가 있으면 보존한다.
5. 수정 전/후 XML에서 target 두 셀 노드만 제거한 문자열이 동일한지 검사한다. 차이가 있으면 500으로 다운로드 중단.
6. JSZip DEFLATE로 새 XLSX를 생성한다. 원본과 결과 엔트리 이름 집합이 동일해야 한다. 대상 시트 외 각 파일의 **압축 해제 bytes**가 동일해야 한다. 대상 시트는 두 셀 제거 후 XML 동일. ZIP 압축 bytes 전체가 동일하다는 뜻은 아니다.
7. 결과를 ExcelJS로 다시 열어 두 셀의 `.text`가 result/note와 정확히 같음을 확인한다. 검증 실패는 500. 통과한 buffer만 전송한다.

이 절은 수식/스타일/다른 시트/기존 문자열 보존의 완료 조건이다. 원본의 단순 checksum만 기록하고 전체 workbook을 재저장하는 구현은 동등하지 않다.

## 6. 모달 사용자 흐름과 UI 수치

결과 화면의 `내보내기` 팝오버 → `검토대장에 기록` 클릭 시 lazy import된 native `<dialog>`를 `showModal()`로 연다. 주요 검토 단계는 페이지지만 **대장 연결 도구는 현재 모달**이다. `aria-labelledby`는 제목 `검토대장에 결과 기록`, `aria-describedby`는 미리보기 설명. ESC의 cancel default를 막고 공통 close 경로를 호출한다. 닫기 X 버튼 aria-label=`검토대장 창 닫기`; backdrop 클릭 닫기 동작은 없다.

초기값: 부모 documents 중 첫 `role=ledger,kind=xlsx`가 있으면 대장 선택. run.documents의 target 목록 첫 문서를 선택한다. 문서 extraction.referenceNumber가 string/number이면 trim한 뒤 최대 200자로 성적서 번호를 자동 입력. 자동값과 현재 key.trim()이 같을 때 `문서에서 추출` 배지 표시. 수동 수정 가능.

작업 state=`null|upload|analyze|export`. 하나라도 실행 중이면 파일·문서 선택, key/메모 입력, 분석·다운로드 버튼을 비활성화한다. 닫기 X/ESC와 원본 열기 링크는 계속 사용할 수 있다. ref 기반 busy lock으로 같은 렌더 tick 이중 실행도 차단한다. `beginOperation`은 AbortController/증가 sequence를 만들고 error/success 초기화. 결과 반영 조건은 alive && 현재 sequence 일치 && !signal.aborted. close/unmount는 sequence 증가·abort·dialog close. 늦게 도착한 응답을 UI에 반영하지 않는다.

대장 변경/문서 선택 변경/key 입력 변경은 매핑·basis·메모·오류·성공을 초기화한다. `canAnalyze=ledger && sourceDocumentId && key.trim() && !busy`. 분석 시작 시 이전 매핑/basis를 지우고 고유 activity context로 요청한다. 분석 응답이 ready인데 proposal 또는 targetCells 두 개가 빠지면 오류를 보여준다. 분석 UI는 진짜 해당 context의 `SandboxActivityDock`이며 대장 구조 이해가 진행되는 동안만 표시한다.

`canExport`는 ledger,basis,proposal.fingerprint,mapping ready,targetCells.length=2를 모두 요구하고 basis의 documentId,key(trim),runId,sourceDocumentId가 현재 입력과 같아야 한다. 체크박스는 없다. `확인하고 대장 사본 내려받기` 버튼 자체가 `confirmed:true`의 명시적 확인이다. 추가 메모 1000자 제한, 미리보기 비고에 `사용자 확인:` 줄 즉시 반영. 메모 변경은 기존 매핑을 무효화하지 않는다.

성공 응답을 Blob으로 읽어 0 byte면 오류, object URL의 임시 `<a download>`를 클릭/제거하고 1000ms 후 revoke한다. UTF-8 filename*를 decode하고 `/`, `\\`, U+0000–U+001F를 `_`로 치환; 실패하면 `{원본명}_검토반영.xlsx`. 성공 메시지는 `검토 결과가 반영된 대장 사본의 다운로드를 시작했어요.`이며 OS 저장 완료를 주장하지 않는다.

컨트롤 및 실패 상태를 다음과 같이 고정한다.

| 상태/입력 | 표시·행동 |
|---|---|
| 대상 문서0개 | select에 `연결할 검토 문서가 없어요`; select/분석/다운로드 비활성 |
| 파일 미선택 | `검토대장을 선택하거나 놓으세요`; 클릭 file input, drop은 정확히1개만 허용; 여러 개면 `검토대장 한 개를 선택해 주세요.` |
| 잘못된 확장자/크기 | 확장자 오류 `검토대장은 XLSX 파일로 선택해 주세요.`; 빈 파일/20MiB 초과 `빈 파일은 사용할 수 없어요. 파일당 20MB 이하의 XLSX를 선택해 주세요.`; 업로드 요청 없음 |
| file input 변경 | 첫 파일만 처리하고 input.value를 빈 문자열로 초기화하여 같은 파일 재선택 허용 |
| 업로드 결과 검증 실패 | 첫 응답 document의 id 존재와 kind가 xlsx인지 검사; 실패 `업로드한 검토대장을 확인하지 못했어요. 다시 선택해 주세요.` |
| 업로드 중 | 미선택 drop 영역은 `대장을 올리고 있어요`와 spinner; 이미 ledger가 선택된 교체 업로드에는 기존 파일 카드가 남음 |
| 분석 중 | 버튼 `샌드박스에서 대장 구조 확인 중`; 이전 mapping 대신 inline compact dock; title=`대장 구조를 이해하는 과정`, `contextId=이번 analyze UUID`, `busy=true`; 종료하면 dock 제거 |
| 분석 후 | mapping이 있으면 버튼 `기입 위치 다시 확인`, 없으면 `기입 위치 확인하기` |
| 잘못된 분석 응답 | mapping이 없거나 status가 ready/blocked가 아니면 `기입 위치를 확인하지 못했어요. 다시 분석해 주세요.`; ready인데 proposal/두 targetCells가 없으면 `기입할 값과 대상 셀을 모두 확인하지 못했어요. 다시 분석해 주세요.` |
| ready/blocked | 배지 `위치 확인됨`/`기입 보류`; blocked 사유는 role=status, 후보가 있으면 시트+행 목록; 두 셀을 찾았으면 blocked라도 미리보기 표 표시; export 비활성 |
| 표 | `기록 항목 / 대상 셀 / 현재 값 / 기입할 값`; 두 행은 `판정`, `비고`; 빈 값은 `빈 셀`; 제안 없으면 `검토 결과를 확인해 주세요` |
| 추가 메모 | blocked가 아니고 proposal이 있을 때만 표시; rows=3/maxLength1000; 변경 시 success만 지우고 mapping/basis/error는 유지 |
| 내보내기 중/오류 | 버튼 `대장 사본 만드는 중`; HTTP 오류는 JSON의 message→error string→error.message 순; 없으면 `대장 사본을 만들지 못했어요. 다시 시도해 주세요.`; role=alert; 기존 mapping은 유지되므로409 후 재분석은 사용자가 실행 |

재분석 시작은 mapping/basis만 지우며 기존 추가 메모는 보존한다. 파일 업로드/문서 선택/key 입력 변경에서 호출하는 `clearAnalysis`가 메모까지 초기화한다. 원본 열기는 `target=_blank,rel=noreferrer`다. 모달은 별도 cancel 버튼이나 자동 재시도/자동 재분석을 제공하지 않는다.

### 6.1 레이아웃·스타일

폰트는 앱 전역을 inherit한다. 이 컴포넌트의 별도 폰트 다운로드는 없다. 아래 값은 **현재 화면에 최종 적용되는 차콜/코발트/민트 값**이다. `ledger-modal.css`의 과거 녹색 기본 선언보다 `charcoal-dialogs.css`의 `.ledger-modal.ledger-modal` 선택자가 높은 명시도로 우선한다. lazy CSS가 늦게 로드되어도 이 우선순위를 유지한다. 대장 전용 lime 예외 테마는 없다. 이름이 `--ledger-lime`인 변수의 현재 값도 `#70f3c4`(민트)다.

| 최종 토큰 | 값 |
|---|---|
| bg / panel / line | `#111318` / `#1b2029` / `#343d4d` |
| text / muted / mint | `#eff3ff` / `#a0abc1` / `#70f3c4` |
| 입력 bg / border / placeholder | `#141820` / `#424d62` / `#8390a7` |
| 주요 버튼 bg / border / text | `#315fe9` / `#3d6dff` / `#fff` |
| 주요 버튼 hover bg / border | `#3b68ef` / `#527eff` |
| 주요 버튼 disabled bg / border / text | `#293246` / `#343d4d` / `#8996b0` |
| ready / blocked 배지 bg,border,text | `#70f3c410,#70f3c43d,#70f3c4` / `#ffd08010,#ffd08040,#ffd080` |
| 표 header bg,text / body bg,text / row border | `#222936,#a0abc1` / `#1b2029,#c5cfe4` / `#2c3443` |
| 이전 값 / 새 값 text,bg | `#a0abc1` / `#70f3c4,#70f3c408` |
| upload 기본 / hover / drag bg | `linear-gradient(145deg,#1b2029,#222936)` / `#3d6dff15` / `#70f3c410` |
| upload 기본 / hover / drag border | `#465572` / `#6589ff` / `#70f3c4` |
| uploaded 카드 bg,border,text | `#70f3c40a,#70f3c43d,#d4ffef` |
| comparison bg | `linear-gradient(145deg,#141820,#1b2029)` |
| empty 종이 bg,border,shadow | `linear-gradient(145deg,#273249,#1b2029)`, `#6589ff50`, `10px 12px 25px #0003` |
| empty 강조 셀 bg,border,shadow | `#70f3c418`, `#70f3c4`, `0 0 15px #70f3c422` |

| 요소 | 데스크톱 기준 |
|---|---|
| dialog | width=min(1100px,93vw), max-height=92dvh, radius=18px, padding=0, overflow hidden, border 1px #424d62, shadow `0 28px 110px #0009,0 0 0 1px #ffffff05` |
| backdrop | #080b12b8, blur(12px) |
| shell | flex column, max-height 92dvh, min-height 0 |
| header | 고정 flex, padding 21px 25px, gap16px, 바닥 border, #1b2029 |
| 제목 | 18px/1.3, weight550, tracking -0.5px; eyebrow mono 8px, tracking1.8px |
| header icon / close | 40×40/r11px, icon21/stroke1.6 / 33×33/r8px, X20 |
| body | grid columns `310px minmax(0,1fr)`, overflow-y auto; header/footer는 body 스크롤 외부 |
| 좌측 / 우측 | padding25px22px / 25px24px28px; 좌측 우경계1px |
| upload | min-height127px, padding17px, gap9px, dashed border, radius10px; 설명 9px/1.7 |
| 입력 | min-height38px, padding10px, radius7px, border#424d62, bg#141820, text11px/1.6; textarea min-height88px, resize vertical |
| 분석 버튼 | width100%, min-height39px, margin-top21px, padding10px12px, radius8px, font11px/weight500 |
| 우측 제목 | 15px/weight500/tracking-0.35px; 설명10px/1.7; 위치 배지8px |
| 매핑 표 | fixed layout, font10px, column widths17/17/26/40%; header padding11px10px,font9px; td13px10px,line-height1.75,pre-wrap,overflow-wrap anywhere |
| 주소 칩 | mono9px/1.5, padding2px5px, radius4px,border#6589ff40,bg#3d6dff0e,text#a9c0ff |
| footer | fixed flex, padding17px24px,gap15px,bg#1b2029; 설명9px; 버튼min-height41px,padding11px15px,r8px,font11px/1.4/650 |
| empty | min-height340px, 중심 정렬, 186×134px CSS 종이 그림(perspective600 rotateY-12deg rotateX9deg); 제목14px/450, 설명10px/1.85 |
| activity | margin-top18px; expanded height=min(470px,53dvh), min-height330px |

`max-width:780px`: dialog width96vw,max-height94dvh,r14px; header16px19px,제목16px; body 한 열; 좌측 padding20px/바닥경계; upload min97px; 우측21px20px; empty min275px; footer 세로/padding13px20px/gap10px, 버튼width100%/min40px/font10px; 매핑 표9px,셀padding9px7px,열16/17/24/43%. 분석 중에는 좌측 입력 영역 숨김. 데스크톱/모바일 모두 자료가 길면 **모달 body 안**에서 스크롤한다.

보류 callout은 border`#ffd08040`/bg`#ffd0800c`/text`#e8c992`(strong`#ffd080`), error는 border`#ff8f9140`/bg`#ff8f9110`/text`#ffb1b2` 및 role=alert. 성공은 border`#70f3c43d`/bg`#70f3c410`/text`#70f3c4` 및 role=status. button/input/select/textarea focus-visible은 2px `#7195ff` outline + offset3px; a는 base 선언의 민트`#70f3c4`+offset3px, 구조 summary는 민트+offset2px이다. 입력 focus border는`#7195ff`. 표는 열 `<th scope=col>`. 파일 input은 1px/clip-path 숨김이지만 aria-label 유지.

구조 disclosure는 native `<details>`의 접힘 초기 상태. statusLabel: failed/unsupported→확인 필요, partial 또는 coverage incomplete→일부 범위 확인, needsConfirmation→확인 사항 있음, complete→구조 확인됨, 그 외 분석 정보. `readerComplete`와 `contextComplete`를 별개로 해석한다. 요약 높이150px, 시트 chips125px, warnings/questions135px 각각 overflow-y auto. 읽은 시트 수와 해석 구간 수, 숨김/보호 시트, warnings/questions를 표시한다.

### 6.2 모션 계약

| trigger | 도구 | 시작→끝 | 시간/종료 |
|---|---|---|---|
| 모달 mount | Motion `motion.div` | opacity0,y14px,scale0.985 → 1,0,1 | duration0.23s,easeOut; reduced motion이면 initial=false |
| upload hover/drag 상태 | CSS transition | border-color/background 상태 전환 | 0.18s, 기본 CSS ease |
| 구조 details 펼침 | CSS transform | ChevronDown rotate0→180deg | 0.18s, 기본 ease |
| 실제 upload/analyze/export 대기 | LoaderCircle + `ledger-spin` | rotate0→360deg | 1.1s linear infinite; 해당 operation 종료시 제거 |
| 구조 분석 이벤트 | 공통 SandboxActivityDock | 해당 요청 context의 실제 activity/handoff만 | 공통 모션 명세를 따름. 대장 전용 가짜 progress 없음 |

`:root[data-motion='reduced'] .ledger-modal` 후손 및 pseudo에 animation/transition none!important. Motion 입장 여부는 `useAppReducedMotion`으로 같이 제한한다. CSS empty 종이 그림은 정적이다; `ledger-art-scan` 스타일이 정의되어 있어도 현재 JSX에 그 노드가 없어 움직이는 스캔으로 재현하지 않는다. 취소 후 infinite spinner나 stale 작업실이 남으면 실패다.

## 7. 일반 JSON/CSV/XLSX 결과 내보내기

`GET /api/runs/:id/export?format=json|csv|xlsx`, 기본 json. run 없음 404. run.status가 `completed|partial|failed` 중 하나이고 items.length>0이어야 하며 아니면 409 `내보낼 검토 결과가 아직 없습니다.`. 알 수 없는 format은 400 `내보내기는 json, csv, xlsx를 지원합니다.`. 정렬/필터/페이지 query는 없다. run.items 원래 순서를 모두 내보낸다.

파일명=`검토결과_${run.id.slice(0,8)}.${format}`. Content-Disposition의 ASCII fallback은 `review-export.${확장자}`, filename*=UTF-8'' URL encoded 실제 파일명. 결과 UI 팝오버의 XLSX/CSV/JSON은 이 URL의 `<a download>`이고 클릭하면 팝오버를 닫는다.

### 7.1 공통 11열 행

| 순서/헤더 | 값 |
|---|---|
| 1 문서 | item.documentId로 찾은 run.documents.name; 없으면 ID |
| 2 항목 | item.label |
| 3 추출값 | item.value |
| 4 단위 | item.unit |
| 5 적용 기준 | item.criterion |
| 6 최종 판정 | item.status의 pass→적합,fail→부적합,review→확인 필요,그 외 원값 |
| 7 AI 원판정 | item.machineStatus에 동일 label mapping |
| 8 판정 이유 | item.explanation |
| 9 원문 근거 | 각 evidence의 truthy 값 `[page&&`${page}쪽`,sheet,cell,quote]`를 ` · ` join; 여러 evidence는 `\n` join |
| 10 사람 검토 사유 | item.humanNote ?? '' |
| 11 사람 확인 | item.reviewedByHuman ? '예' : '아니오' |

원문 근거는 인용/위치이며 원본 파일 bytes를 첨부하는 기능이 아니다. CSV/XLSX에도 AI 원판정과 사람 변경 사유를 보존한다. pending은 한국어 변환 없이 pending으로 남는다.

### 7.2 JSON

MIME application/json;charset=utf-8. 아래 선택 필드로 객체를 만들고 `JSON.stringify(object,null,2)`로 보낸다: `id,mode,status,createdAt,criterionVersion,approvedCriteria,criteriaFeedback,summary,criteria,criteriaDiscovery,analyses,documents,items,audit`. undefined 필드는 JSON.stringify가 생략한다. run 내부 AbortController/listeners/work Promise와 document buffer/modelParts를 내보내지 않는다.

### 7.3 CSV

MIME text/csv;charset=utf-8, 첫 글자 UTF-8 BOM U+FEFF. 헤더와 데이터 각 행을 comma로, 행을 CRLF로 연결한다. **모든 셀**을 `"`로 감싸고 내부 `"`를 `""`로 치환한다. nullish→빈 문자열. 문자열이 `/^[\s]*[=+@-]/`에 맞으면 작은따옴표 `'`를 맨 앞에 붙여 스프레드시트 formula injection을 막는다. 예: label `=1+1`→CSV 셀 `"'=1+1"`; 개행 인용문은 인용부호 안에 보존.

### 7.4 XLSX

ExcelJS 새 Workbook, creator=`REVIEW / Universal Reviewer`(사용자 브랜드 표시는 GSPEC이지만 이 메타데이터 값은 기준 구현 그대로). 4개 시트:

1. `검토 결과`: §7.1 헤더/모든 행. 1행 frozen ySplit=1. column widths `[26,30,18,12,44,14,14,60,60,40,14]`. 첫 행 font bold/white ARGB FFFFFFFF, solid fill FF1D3632. 모든 행 vertical top,wrapText true.
2. `적용 기준`: 헤더 `[ID,기준명,적용 규칙,출처]`; 각 run.criteria의 `[id,label,rule,source]`. widths `[12,30,80,45]`.
3. `확인 이력`: 헤더 `[동작,시각,항목,변경 전,변경 후,사유]`; audit 순서의 `[action,timestamp,itemId??'',before??'',after??'',note??'']`. 별도 열 너비 지정 없음.
4. `검토 범위`: 행 `[검토 ID,id]`, `[완료 상태,status]`, `[기준 버전,criterionVersion]`, `[안내,"확인 필요 및 처리 실패 문서를 검토하세요. AI 원판정과 사람의 수정 이력이 함께 보존됩니다."]`, 빈행, `[문서,처리 상태,오류]`, 모든 document의 `[name,status,error??'']`. widths `[35,65,65]`.

일반 XLSX는 대장 복사와 달리 새 문서를 생성한다. 단순 문자열을 ExcelJS에 넣어 formula 객체로 해석시키지 않는다. 빈/불완전/실패 문서 정보는 검토 범위 시트로 보존한다.

## 8. 검증 계약과 실행 상태

빈 프로젝트 구현자는 아래 항목을 새 테스트에 구현해야 한다. 원 저장소 테스트 경로는 감사 출처이며 패키지에 그 구현이 자동으로 존재한다는 뜻이 아니다.

| ID | 입력/행동 | 필수 assertion |
|---|---|---|
| LED-01 | 임의 이름 시트, 헤더 행/열 이동, 다중 표 | 역할 헤더로 정확한 두 target 탐지; 다른 numeric 열 유지 |
| LED-02 | key 없음/공백/유사값/동일 key 다른 시트 | 없음/중복 보류; 근접 key로 대체 금지 |
| LED-03 | 중복 헤더, 보호, 수식 key/target, 병합, 합계행 | 정확한 blocked code; export 금지 |
| LED-04 | 배열 수식 비anchor 대상 | 해당 범위 target도 formula_target |
| LED-05 | sourceDigest/주소/열/기존값/행 위조 | HTTP409; 쓰기 없음 |
| LED-06 | 사용자 note `=HYPERLINK(...) & <태그>` | 정확한 text 보존, 수식 아님, 스타일 유지 |
| LED-07 | 원본과 사본 ZIP 비교 | 두 셀 외 XML/다른 엔트리 uncompressed bytes 동일; 셀 재open 동일 |
| LED-08 | 선택 문서 pass only / review / fail / incomplete | 적합 / 확인 필요 / 부적합 / 확인 필요; 다른 문서 집계 금지 |
| LED-09 | confirmed 없음, stale fingerprint, 클라이언트 result 위조 | 400 /409 /서버 판정 적용 |
| LED-10 | ensureAnalyzed throw, HTTP abort, 서로 다른 context | 쓰기 없음; 요청별 abort 전달; 타 작업 영향 없음 |
| LED-11 | forged ZIP count/size, 큰 확장 | 파서 전 실패; 한도 넘어 allocation 금지 |
| LED-12 | UI 빠른 중복 클릭/닫기/입력 변경/메모 | 이중 요청 없음; stale response 무시; canExport 동기화 |
| LED-13 | 동일 status의 humanNote/audit 수정, 다른 문서 수정 | proposal 여섯 필드가 같으면 fingerprint 유지; 모든 사람 수정이409라는 과잉 조건 금지 |
| LED-14 | non-pass6번째 사유 변경, 첫5개 비고의6500자 밖 변경 | counts/result 등 동일하고 최종 note가 같으면 fingerprint 유지; 첫5개/6500자 안 변경은 fingerprint 변경 |
| LED-15 | 재분석/선택 변경/추가 메모/409 | 재분석은 메모 보존, 선택 변경은 초기화, 추가 메모는 mapping 유지,409는 오류를 표시하고 사용자의 재분석을 기다림 |
| EXP-01 | CSV label =1+1, 인용부호/개행/한글 | BOM/CRLF/quote/작은따옴표 방어 |
| EXP-02 | human override 후 XLSX/JSON | 최종/AI 원판정/이유/이력 보존; XLSX 4시트 |
| EXP-03 | running/빈 run/unsupported format | 상태와 오류 일치, 0byte 성공 금지 |
| UI-LED | 1440×900, 390×844, reduced motion, 긴 note | header/footer 접근, 내부 스크롤, 비교 표 overflow, 키보드/ESC/정지 모션 |

기준 저장소에서 독립 실행 가능한 로컬 검증 명령:

```powershell
node --test server/ledger.test.mjs server/app.test.mjs
```

이 테스트는 mocked model/로컬 서버와 golden ledger를 쓰는 결정론적 검증이며 실제 Gemini/E2B 통합 성공을 뜻하지 않는다. 실행 결과는 `../reviews/ledger-export-test-run.txt`를 참조한다. 신규 구현의 동명 테스트를 만들기 전에는 위 명령을 그대로 사용할 수 없으므로 PLAN에서 이 테스트 구현을 선행 조건으로 잡는다. 구조 분석 실제 E2B 호출/실제 브라우저 렌더/다운로드 저장/화면 비교는 이 명령의 범위 밖이다.

한계: 임의 언어 헤더 자동 추론, 공통 헤더 3종이 서로 다른 행인 대장, 표 머리글 병합으로 역할 셀이 불명확한 대장, 30시트·10,000행·200열·100,000셀 상한 초과는 이 대장 기록 기능에서 지원을 보장하지 않는다. 범용 문서 분석기가 이를 읽을 수 있어도 대장 자동 기록은 더 좁은 안전 계약을 적용한다. “모든 XLSX를 자동 기록”으로 홍보하거나 테스트에만 맞춘 주소 규칙을 추가하면 동등성 실패다.

## 9. 자료구조·복잡도·비동기 실행 경계

아래는 현재 구현을 재현하기 위한 비용 모델이다. `C`는 방문 셀 수, `T`는 유효 헤더 후보 수, `R`은 각 표의 key 탐색 행 합, `M`은 key 일치 후보 수, `E`는 ZIP 엔트리 수, `U`는 압축 해제 크기, `L`은 대상 worksheet XML 길이, `N`은 run 전체 항목 수다. 셀 문자열 정규화 시간은 문자열 길이에 비례하며 표의 O(C)는 평균 길이가 제한된 경우의 표기다.

| 단계 | 현재 자료구조·비용 | 유지할 불변 조건 |
|---|---|---|
| 역할 헤더 인식 | 역할별 `Set<string>`3개; 행마다 `{key:[],result:[],note:[]}`; 전체 존재 셀을3역할에 대조하여 O(C) | 같은 행의 역할 후보를 모두 보존; 중복 열을 임의 하나로 축소하지 않음 |
| 표 경계·key 탐색 | `tables[]`; 각 table에서 tables.filter/reduce로 다음 헤더 검색 O(T²), key 행 스캔 O(R); `matches[]` O(M) | 같은 시트의 다음 헤더에서 정지; 전체 시트 중복 key 검사 완료 전 첫 일치행 반환 금지 |
| 매핑 | targetCells 길이2 배열, existingValues 주소별 object, 원본 SHA-256 | JSON 직렬화 비교를 사용하는 배열 순서와 기존값 key 삽입 순서를 유지 |
| 제안 계산 | 전체 항목 filter O(N), 선택 문서 항목을 몇 차례 filter; 비고 후보는 모든 non-pass를 filter한 후 첫5개 slice | 항목 원래 순서; 모든 선택 문서의 counts는 첫5개와 무관하게 집계 |
| ZIP 검증 | 엔트리 metadata 배열 O(E), 엔트리별 inflate/크기 누적 O(U) | 파서 실행 전 확장 크기와 구조 제한 확인; 엔트리 실제 bytes를 동시에 전부 복제하는 방식으로 바꾸지 않음 |
| 두 셀 교체·보존 확인 | 고정2번 XML 검색·문자열 교체 O(L), ZIP entry 정렬 O(E log E), 엔트리 비교 O(U), ExcelJS 재open | 압축 해제 bytes 동일성 비교를 생략하거나 전체 workbook 재저장으로 치환 금지 |

워크북 객체, ZIP 객체, 원본/출력 Buffer, 수정 XML을 메모리에 둔다. streaming writer, worker thread, persistent ledger cache, 전역 ledger 요청 queue는 현재 구현에 없다. 대략적인 보유 공간은 O(U+C+T+M+L)이며 ZIP/ExcelJS의 내부 표현 및 원본/사본 상수 배수 때문에100MiB 확장 제한을 실제 process RSS 상한으로 해석하면 안 된다.

HTTP 순서는 `await ensureAnalyzed → await analyzeLedger → proposal → response`, export는 `await ensureAnalyzed → proposal/fingerprint 검증 → await writeLedgerCopy → bytes response`다. 구조를 해석하는 LLM↔샌드박스 과정은 공통 문서 파이프라인을 사용한다. 그 뒤의 헤더/key 매핑과 두 셀 쓰기는 서버의 결정론적 알고리즘이며 별도 LLM 호출·자동 반복은 없다. analyze 요청 context의 실제 이벤트만 dock에서 보여준다.

각 모달은 `busyRef`로 동시 operation1개를 제한하고 `sequenceRef`로 뒤늦은 응답 반영을 차단한다. 이는 한 모달의 UI 중복 방지이며 서로 다른 HTTP 요청 전체에 대한 전역 mutex가 아니다. close의 AbortController는 fetch와 서버 `ensureAnalyzed`에 취소를 전달한다. 이후 로컬 ZIP inflate/매핑/쓰기 함수에는 AbortSignal이 전달되지 않으므로 이미 시작한 CPU 작업을 중간에 즉시 중단한다는 보장은 없다. 현재 ZIP 검증의 `inflateRawSync` 및 셀 순회는 메인 Node event loop를 점유할 수 있다. `async` 함수라는 이유로 CPU 병렬 처리 또는 무정지 렌더링을 주장하지 않는다.

향후 최적화로 시트별 정렬 header index를 만들면 다음 헤더 탐색을 O(T)로 낮출 수 있고, worker/세마포어로 ZIP CPU 작업과 동시 메모리를 제한할 수 있다. 이는 현재 기능이 아니다. 채택할 경우 LED-01…15의 표 경계·중복·순서·보존 결과가 동일해야 하며 별도 성능 측정과 변경 결정 기록이 필요하다.

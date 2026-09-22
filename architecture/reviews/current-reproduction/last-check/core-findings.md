# 마지막 독립 core adversarial 검토

검토일: 2026-09-21. 목표는 현재 제품의 정확한 재현 계약이다. 과거 architecture/reviews 보고서·점수·240개 질문의 답은 읽지 않았다. 원본 제품 코드는 수정하지 않았고 `.env`와 provider/E2B를 호출하지 않았다. 최초에는 보고서만 요청받았으며, 이후 root가 허용한 직렬화·reader equality·세 input-shape 서술만 architecture에 반영했다.

## 1. 실제 반례로 확인한 두 항목과 수정 결과

### CORE-FINAL-01 — source 직렬화의 공백·순서가 처리 분기를 바꾸는데 예시만으로 규칙을 재현할 수 없었음

- 문서 근거(수정 전): `architecture/specs/02-backend-pipeline.md` §2.4는 header/record 예시와 150,000자 chunk/1,200,000자 retained cap을 제시했지만 compact JSON, metadata의 undefined 생략, 전체 record 순서와 모든 보조 record의 정확한 문자열 문법을 고정하지 않았다.
- 원본 근거: `server/sandbox-documents.mjs:69`의 cellValue, `:76`의 profileSource, `:280` 이후 source.length/slice/chunks. JSON.stringify의 indentation 없음, 입력 순서, 정확한 구분자 및 원문 보존 여부가 source length를 결정한다.
- 구체 입력 → 현재 결과: `.cache/architecture-final-challenge/core-probe.mjs`의 합성 TXT profile에서 원본 serializer 결과를 정확히150,000자로 맞추면 chunks=1이다. INVENTORY JSON만 pretty-print하는 대안은 같은 객체 의미를 유지해도150,009자가 되어 chunks=2다. 정확히1,200,000자일 때 원본 sourceTruncated=false지만 같은 공백 차이를 가진 대안은1,200,009자여서true다. 대안은 제품 실행 결과가 아니라 기존 서술만 따르는 구현 선택이 분기를 바꾼다는 반례다.
- 반영: §2.4.1에 J/문자열 보간/cellValue/emit 순서/JSON 생략/metadata/page·table·block/sections/supplementary/full text/compatibility CSV/images/warnings/line join을 자족적으로 고정했다. §2.4.2에는 JS UTF-16 단위와 equality를 명시했다.
- 재개 후 명확화: source 본문 세 행 `SANDBOX_READER`, `INVENTORY`, `READ_COVERAGE`는 cap에 포함한다. source 외부의 추가 DOCUMENT_ID 등의 요청 header와 SOURCE SEGMENT 안내만 제외한다.
- fixture: `architecture/contracts/source-serialization-cases.json`. 사람이 직접 명시한 literal expectedSource4개를 원본함수와 assert 비교했다. 숫자·null·false·formula cache sentinel, 배열/객체 순서, supplementary/이미지 path 제외 등도 포함한다. 추가 source length6개는 literal prefix+ASCII x recipe로 재구현자가 원본함수 없이 예상 문자열을 만들 수 있고 UTF-8 SHA-256 및 retained hash가 고정돼 있다.

### CORE-FINAL-02 — reader text 한도에 정확히 닿았을 때의 상태가 “도달→partial”과 다름

- 문서 근거(수정 전): §2.3 표의 `text1,500,000자 … 도달 → partial`.
- 원본 근거: `server/sandbox-document-reader.py:121`의 Reader.text는 `len(text) > remaining`일 때만 partial 처리한다. Reader.read_text는 원문을 이 helper에 한 번 전달하고 Reader.read가 coverage에 따라 status를 확정한다.
- 실제 입력 → 결과(원본 Reader.read 실행):

| ASCII x 원본 길이 | 보존 길이 | status | coverage.complete | truncated |
|---:|---:|---|---|---|
| 1,499,999 | 1,499,999 | ready | true | false |
| 1,500,000 | 1,500,000 | ready | true | false |
| 1,500,001 | 1,500,000 | partial | false | true |

- 반영: §2.3에서 text helper를 별도 행으로 분리하고 equality/초과를 설명했다. fixture의 readerTextBoundaryCases에 입력 recipe와 전체 기대 coverage/warnings를 남겼다.
- 범위: Python Unicode code point 계수이며 위 입력은 ASCII라 JS code unit과 우연히 동일하다. 원본 reader 포트 결과이지 로컬 업로드의 LINE prefix/source 예산까지 통과했다는 주장이 아니다. 다른 형식의 다음 셀/블록 `>=` 검사나 다른 cap에 이 결과를 일반화하지 않았다.

## 2. 입력 shape에 관한 최소 서술 보완 — 새 기능·새 모집단 질문 아님

다음은 정상 producer가 실제로 그런 데이터를 만든다는 주장이 아니다. 원본 helper/HTTP가 검사하는 범위를 DTO 또는 후속 quality 검사와 혼동하지 않도록 root 승인 후 최소 사실을 추가했다.

1. `POST /api/runs` no body+no Content-Type, 또는 text/plain `{}` →500 공통 안전 오류. application/json empty body/`{}`/`[]` →400 일반 입력 오류. JSON literal null →400 JSON 형식 오류. 실제 loopback HTTP6회를 실행했다. §01 4.2에 start endpoint만 한정해 기록했으며 새 root-object guard를 요구하지 않았다.
2. correct PDF kind/digest와 coverage:{},inventory:{},warnings:[]만 가진 mock raw profile → admission을 통과하여 partial/readerComplete=false/visualAnalysisPending=true. §02 2.3의 넓은 “필수 DTO 불일치”를 실제 falsy coverage/inventory, warnings 비배열 검사로 좁혔다. profile status/counts/images 부재까지 검증하는 새 schema validator를 요구하지 않았다.
3. validateDocumentContext에 headers/warnings=[null,5,{a:1}], unknown kind/orientation, range='not-a-source-range', page 수0인 profile → 원소['','5','[object Object]'], other/unknown, range 유지, page 생략. §02 2.4.2에 단독 admission/정규화와 후속 quality의 범위를 구별했다. 이 입력으로 전체 분석이 verified된다고 주장하지 않았다.

증거: `core-probe-results.json`의 httpBodyShapes/contextShapeCoercion/missingProfileRequiredFields. 모든 의존 서비스는 명시 fake로 주입했고 예상 밖 모델 호출은 throw하도록 했다.

## 3. 검토 범위와 새 질문의 처리

읽고 대조한 원본: server/app.mjs, review.mjs의 start/confirm/revise/attach/resolve/cancel/snapshot/events/normalization/analysis cache, documents.mjs의 저장 예약·서명·source·preview, sandbox-documents.mjs의 profile/context/serializer, sandbox-document-reader.py의 text/XLSX/CSV/Word 흐름, document-quality.mjs의 source line splitter, task-pool.mjs/ModelQueue, document-sandbox-resources.mjs, integrations config/exports의 호출 경계. architecture01/02/03/07의 해당 조항을 직접 대조했다.

보존/pruning, SSE Number cursor와 replay, 취소 후 이벤트 억제·cleanup 채널, shared analysisPromise의 waiter 취소, pool FIFO/slot lifetime, numericVerdict의 Number/단위 계약은 읽은 범위에서 기존 문서와의 새로운 모순을 확정하지 못했다. 이것은 모든 경계가 검증됐다는 승인이나 기존240항목의 재승인이 아니다.

새로 계수할 core 질문은 위 실제 반례2개(직렬화의 결정성, reader equality)이고, shape3개는 기존 validation 계약의 부연이다. 독립 UI 검토와 최종 질문 모집단/점수의 구성은 root 소유다. 이 보고서는 최종 정량 점수를 만들지 않는다.

## 4. 실행 증거와 NOT_RUN

실행 및 결과:

- `node .cache/architecture-final-challenge/core-probe.mjs` → exit0. 원본 HTTP6개, source 공백 경계2개, context 정규화1개, fake profile admission1개. 저장 결과 core-probe-results.json.
- `python -B .cache/architecture-final-challenge/core-reader-probe.py` → exit0. 실제 원본 Reader.read로 ASCII 파일3개. 저장 결과 core-reader-results.json. -B로 원본 디렉터리 pycache 쓰기를 막았다.
- `node .cache/architecture-final-challenge/build-source-cases.mjs` → exit0. 직접 작성 expectedSource4개 및 명시 prefix/suffix6개를 원본 profileSource와 assert 대조했다. 출력은 source-cases-verification.json, 계약 산출물은 source-serialization-cases.json. reader3개 관측을 계약에 담았으며 이 generator가 reader를 다시 실행한 것은 아니다.
- 중단 후 세 malformed 서술 반영 여부를 rg로 확인했고 모두 남아 있었다. artifact JSON parse는 cases4/boundaries6/reader3을 확인했다.
- `git diff --stat -- server integrations`는 출력 없음이었다. 이 작업에서 제품 파일은 변경하지 않았다.

NOT_RUN: 실제 Gemini/E2B/provider 비용 발생 호출, .env 읽기, 실제 브라우저 UI/SSE 재연결 시험, 장시간 resource/heap 측정, 전체 기존 test suite, 모든 archive/PDF/image reader cap의 equality, 빈 프로젝트의 독립 구현 실행. source 대안 직렬화는 비교 설명용이며 별도 재구현 모델/provider 결과는 실행하지 않았다.

규범 문서 변경은 specs01의 body shape 설명, specs02의 serializer/equality 및 두 raw validation 부연, 신규 source-serialization-cases.json으로 완료했다. 더 강한 validation, 새 제품 동작 또는 provider 실행은 추가하지 않았다. 최종 정확성/명확성 승인은 별도 reviewer가 담당한다.

# 초기 독립 정확성 감사: backend/core

평가자: /root/core_accuracy · 역할: accuracy · 2026-09-20T17:53:57.283Z

초기 입력 digest: ab16ffc3282c8060180f45247b3328570e5f02106648a12b9588396b5c16019d. 소스·설계 수정 없음. .env, 실제 앱·서버·브라우저, 외부 provider 접근 없음.

기존 **80개:73 PASS /7 FAIL /0 UNVERIFIED (91.25%)**. 자체 추가5개 포함 **73/85 PASS (85.8824%)**, 열린이슈5건. 이는 선언된 설계질문의 원본정확성 평가이며 제품재구현·실행완료나 모든런타임경로 검증이 아니다.

## 이슈

### CA-01 P2

문서activity log prefix1500자와설계suffix1500자불일치.

질문: CORE-15-C01, CORE-15-X01

String변환→앞20000자→정제→trim→앞1500자와observedcommand stdout/stderr tail을분리해기록한다.

### CA-02 P1

일반numeric finding의없는sheet/가짜quote/invalid좌표가pass가능하나설계표현이원본검증보다강하다.

질문: CORE-11-C04, CORE-12-X01

baseline regex/미검증영역과반례fixture를정확히기록한다. 강화는원문/좌표검증·review혹은reject정책을REQUIRED_REBUILD/NOT_RUN으로별도선언한다.

### CA-03 P2

전역coverageguard와cited-pageblock/cellguard범위를혼동한다.

질문: CORE-12-C04, CORE-12-X02

03§5.3/자격교차참조에서전역과인용page전용조건을분리하고비인용uncertainpage반례를추가한다. 전체page강화는새재구현요구로만기록한다.

### CA-04 P2

criteria100sheet한도의allmetadata/후속emptycomplete분기누락.

질문: CORE-08-C04, CORE-19-C05, CORE-08-X01

cellprofileindex한도와후속empty/populated의서로다른complete를fixture로기록하고genericreader100sheetpartial와구분한다.

### CA-05 P2

07normalizeItems순서가03/source의guard순서와상충한다.

질문: CORE-12-C03, CORE-19-C02, CORE-19-X01

07표를source의shape/누락·수치/conditions/applicability/extraction/label/machineStatus순서로고치고03§5를단일정의로연결한다.

## 실행 근거와 한계

CA-P01: BEGIN+x×2000+END의 문서로그는1500자로 잘리고 BEGIN으로 시작하며 END로 끝나지 않는다. CA-P02: 일반numeric기준에 없는sheet/invented quote와 A0/B2:A1/ZZZ9999999를 각각 넣으면 모두pass다. CA-P03: 전역summary가verified인2page전사에서 비인용2page block uncertain=true여도 인용1page literal근거는true다. 세probe는 외부서비스없는 Node직접함수호출을 실행했다. CA-P03은 helper계약반례이며 정상pipeline이모순summary를 생성한다는증명은아니다.

Python101sheet probe는PATH의 python/py/python3부재로NOT_RUN이다. 빈101번째sheet결론은 정적분기근거다. 전체suite/liveGeminiE2B/browsermotion/npm installbuild/goldenv3전수/holdout도NOT_RUN이다.

UI중첩질문은 /root/ui_accuracy의 명시적 source교차검토다. 첫비공식메시지의잘못된수치는두번째정정으로폐기했다. samples정확fixture누락은 clarity발견을source에서확인한협업추가사항으로 부모평가자가ID를관리한다.

## 기존 질문 개별 판정

### CORE-01-C01 PASS

제공 env > dotenv, 빈 키와 blank model 기본값, 두 역할 모델, template와 publicConfig 비밀 비노출이 일치한다.

- integrations/src/config.mjs:1-44 loadConfig/publicConfig
- architecture/specs/02-backend-pipeline.md §2.8.1

### CORE-01-C02 PASS

JSON/text의 입력·role·출력·usage·오류 allowlist를 명시하고 schema 전달과 로컬 검증을 구분한다.

- integrations/src/gemini.mjs:23-82 createGemini
- integrations/src/errors.mjs:1-42 safeError
- architecture/specs/02-backend-pipeline.md §2.8.1

### CORE-01-C03 PASS

abort/timeout 전달과 stream 소비 종료까지 slot 유지, E2B callback→finally kill await→slot 해제가 맞다.

- integrations/src/gemini.mjs:1-82
- integrations/src/sandbox.mjs:10-66 withSandbox
- architecture/specs/07-data-algorithms-concurrency.md §7.5-7.6

### CORE-01-C04 PASS

응답/파일부분/token/JSON 파싱과 cleanup 실패의 한도·오류가 맞다. kill 실패를 성공으로 숨기지 않는다.

- integrations/src/gemini.mjs:23-82
- integrations/src/sandbox.mjs:10-66
- architecture/specs/02-backend-pipeline.md §2.8.1

### CORE-01-C05 PASS

fake-client tests/check와 live smoke 명령이 분리되어 있다. 테스트 존재·관련 코드 대조이며 이번 전체suite 실행 통과는 아니다.

- integrations/test/integrations.test.mjs:1-90
- integrations/test/gemini-limits.test.mjs:1-56
- architecture/specs/06-verification.md §6

### CORE-02-C01 PASS

route method/DTO/상태·오류와 public/private projection이 일치한다. samples 정확 fixture는 별도 협업 추가질문이다.

- server/app.mjs:41-167 createApp
- server/documents.mjs:439-468 publicDocument
- architecture/specs/01-state-api.md §4.1-4.2

### CORE-02-C02 PASS

문서/run의 메모리 수명과 재시작 손실, 없는 ID404를 명시한다. dashboard 내부는 UI 감사 범위다.

- server/documents.mjs:470-517 DocumentStore
- server/app.mjs:69-96 requireRun
- architecture/specs/01-state-api.md §1

### CORE-02-C03 PASS

이번 batch add 실패시 이미 추가한 문서를 rollback하고 run document/criteria/analysis 참조 문서는 terminal run도 DELETE409다.

- server/app.mjs:59-79 upload/delete
- architecture/specs/01-state-api.md §4.1

### CORE-02-C04 PASS

Origin 있는 비읽기 요청만 loopback hostname 검사, JSON2MiB·multipart10files/3fields/100fieldBytes/13parts와413/400이 맞다.

- server/app.mjs:15-15 multer
- server/app.mjs:47-57 origin
- server/app.mjs:159-167 errors
- architecture/specs/01-state-api.md §4

### CORE-02-C05 PASS

loopback:8791/PORT, dist 조건부 서빙, SIGINT/TERM run 취소 후 즉시 exit 경계와 검증 명령을 명시한다. graceful cleanup 대기를 과장하지 않는다.

- server/index.mjs:1-10
- server/app.mjs:157-158
- architecture/specs/01-state-api.md §11

### CORE-03-C01 PASS

허용 확장자/role/name/MIME와 원본 buffer 보존이 맞다. Python 내부 tsv/gif 지원을 public upload 형식으로 확대하지 않는다.

- server/documents.mjs:11-69
- server/documents.mjs:470-517 DocumentStore.add
- architecture/specs/02-backend-pipeline.md §2.2

### CORE-03-C02 PASS

namespace/comment/VML/drawing 보정은 임시 파서 ZIP에만 적용하고 원본 bytes와 formula cache/hidden/merged 정보를 구별한다.

- server/spreadsheet-xml-compatibility.mjs:1-48
- server/documents.mjs:178-349
- architecture/specs/02-backend-pipeline.md §2.2

### CORE-03-C03 PASS

30sheet/100000cell/source한도의 SpreadsheetPreviewLimit는 deferred이고 손상/금지형식 오류와 다르다.

- server/documents.mjs:178-349 spreadsheet parsing
- architecture/specs/02-backend-pipeline.md §2.2

### CORE-03-C04 PASS

pending reservation으로 동시 add 용량을 먼저 예약하고 finally 반환한다.20MiB/100docs/250MiB와 ZIP20000/100MiB가 맞다.

- server/documents.mjs:70-177 archive checks
- server/documents.mjs:470-517 store
- architecture/specs/02-backend-pipeline.md §2.2

### CORE-03-C05 PASS

preview 잘림·cache 없음·drawing 생략·PDF 보조읽기 실패와 전체 분석완료를 구분한다. 원본과 경고/coverage가 남는다.

- server/documents.mjs:178-438 previews/verification
- architecture/specs/02-backend-pipeline.md §2.2-2.3

### CORE-04-C01 PASS

digest/kind/coverage/inventory/warnings 검사와 profile→modelParts/sourceSheets/sourceRows/analysis projection이 지정되어 있다.

- server/sandbox-documents.mjs:183-373 analyzeDocumentInSession
- architecture/specs/02-backend-pipeline.md §2.3

### CORE-04-C02 PASS

sandbox+document WeakMap에서 source/parser/query Promise를 재사용하며 retained session의 TaskPool(1)이 command를 직렬화한다.

- server/document-sandbox-resources.mjs:1-72
- server/sandbox-documents.mjs:112-182
- architecture/specs/07-data-algorithms-concurrency.md §7.6

### CORE-04-C03 PASS

세션300000ms, observed reader command180000ms, Python150초 soft budget을 구분하고 abort/finally 종료 책임을 명시한다.

- server/sandbox-documents.mjs:112-182
- server/sandbox-documents.mjs:220-278
- server/sandbox-document-reader.py:115-119
- architecture/specs/02-backend-pipeline.md §2.8

### CORE-04-C04 PASS

generic reader100sheets/100000cells/1500000chars/300PDFpages/8images/40MP 및 partial/경고가 맞다. 기준 inventory의100sheet 의미는 별도 추가질문이다.

- server/sandbox-document-reader.py:75-253 Reader budgets
- server/sandbox-document-reader.py:254-771 handlers
- architecture/specs/02-backend-pipeline.md §2.3

### CORE-04-C05 PASS

고정 script/command/path만 실행한다. 수식은 cache만 읽고 macro/external link는 실행·추적하지 않는다. injection/reader 정적 테스트 계약이 연결된다.

- server/sandbox-document-reader.py:153-174 inspect_archive
- server/sandbox-document-reader.py:254-399 read_xlsx
- server/sandbox-documents.mjs:224-227
- architecture/specs/02-backend-pipeline.md §2.3

### CORE-05-C01 PASS

exact selector keys/8requests/ascending Excel bounds/Word blocks/text lines와 응답 hash/kind/순서/coverage 검사를 지정한다. 코드·경로 selector는 허용하지 않는다.

- server/document-requery.py:16-89
- server/document-requery.mjs:1-61
- architecture/specs/02-backend-pipeline.md §2.5

### CORE-05-C02 PASS

150000자 chunk/1200000 retainedsource에 대해 초기 context와 독립검증을 수행하고 deterministic header/region 누락 검사와 source 잘림을 구분한다.

- server/sandbox-documents.mjs:281-373
- server/document-quality.mjs:1-278
- architecture/specs/02-backend-pipeline.md §2.4-2.5

### CORE-05-C03 PASS

3qualityround/2repair, fingerprint 반복/source limit/last round 종료, COMPLETE context replacement 후 전체 재검증과 같은 E2B 재조회를 명시한다.

- server/document-quality.mjs:1-278 verifyAndRepairDocumentContext
- server/document-requery.mjs:1-61
- architecture/specs/02-backend-pipeline.md §2.5
- architecture/specs/07-data-algorithms-concurrency.md §7.8

### CORE-05-C04 PASS

partial/검증실패는 needs_review/limited와 기존context를 반환하고 abort는 throw다. 무단위 정성기준과 실제 numeric unit 누락을 UNIT_POLICY로 구별한다.

- server/document-quality.mjs:10-10 DOCUMENT_UNIT_POLICY
- server/document-quality.mjs:1-278
- architecture/specs/02-backend-pipeline.md §2.5

### CORE-05-C05 PASS

실제좌표·헤더 기반이며 특정파일명 분기가 없다. multi-sheet/hidden/Word nested/text누락 변형 tests와 검증 요구가 존재한다. 이번 suite 실행 결과로 세지 않는다.

- server/document-quality.test.mjs:1-266
- server/document-reader.test.py:1-280
- architecture/specs/06-verification.md §5
- architecture/specs/02-backend-pipeline.md §2.5

### CORE-06-C01 PASS

page/rotation/bbox/block/table/cell/span/parent/uncertain/coverage schema가 맞고 sheet를 PDF page로 쓰지 않는다.

- server/visual-transcription.mjs:17-158 schema/validatePage
- architecture/specs/02-backend-pipeline.md §2.6

### CORE-06-C02 PASS

모델 complete 외 source omission·geometry·overlap와 독립 visual judge가 실제 원본을 확인한다. blank page 별도승인이 필요하다.

- server/visual-transcription.mjs:59-195
- server/visual-quality-judge.mjs:94-173
- architecture/specs/02-backend-pipeline.md §2.6

### CORE-06-C03 PASS

30pages/batch3/3round/180초wall/60초request를 구분하고 완료페이지 유지·재판독 merge·재검증을 정의한다.

- server/visual-transcription.mjs:201-379 boundedGenerate/transcribeVisualDocument
- architecture/specs/02-backend-pipeline.md §2.6
- architecture/specs/07-data-algorithms-concurrency.md §7.8

### CORE-06-C04 PASS

source parts/PNG 검증 및 전달제한, rotation/표 구조 오류를 issues/coverage로 남긴다. 불확실 값을 추정해서 verified로 채우는 계약이 없다.

- server/visual-transcription.mjs:239-379
- server/visual-quality-judge.mjs:44-75 pdfPageImageParts
- architecture/specs/02-backend-pipeline.md §2.6

### CORE-06-C05 PASS

cross-document/page/invented/blank/nested/overlap 거절의 offline stub cases가 존재하고 validator와 연결된다. 이번 전체 테스트 실행을 주장하지 않는다.

- server/visual-transcription.test.mjs:1-361
- server/visual-transcription-alignment.test.mjs:1-84
- server/visual-quality-judge.test.mjs:1-172
- architecture/specs/06-verification.md §4-6

### CORE-07-C01 PASS

classification/normative/sourceKind/reason/evidence 조합과 excluded 공개 projection을 정의하고 invalid 조합을 곧바로 제외하지 않는다.

- server/criteria-eligibility.mjs:1-229
- server/review.mjs:377-505
- architecture/specs/03-algorithms.md §13.1

### CORE-07-C02 PASS

not_criteria+완전읽기+실제인용을 모두 요구하며 혼합문서의 재사용 규범을 남긴다. admission의 substring baseline 한계도 적혀 있다.

- server/criteria-eligibility.mjs:1-229 source verification
- architecture/specs/03-algorithms.md §13.1

### CORE-07-C03 PASS

invalid응답에만1회repair, transient실패 uncertain이며 excludedsource의 편집/추가 재유입도 막는다.

- server/criteria-eligibility.mjs:1-229 repair
- server/criteria-revision.mjs:212-340 allowed groups
- architecture/specs/03-algorithms.md §13.1-13.2

### CORE-07-C04 PASS

파일명/role/요약은 source가 아니다. 숫자경계와 partialsource guards가 맞다. 시각 cited-page guard 세부차이는 신규질문으로 분리했다.

- server/criteria-eligibility.mjs:1-229 literal/source guards
- architecture/specs/03-algorithms.md §13.1

### CORE-07-C05 PASS

정성/법무업무/혼합/기록/injection 사례와 oracle격리 검증이 연결된다. 모델의 의미정확도 실측이나 특정자료 전수실행을 주장하지 않는다.

- server/criteria-eligibility.test.mjs:1-550
- server/review.eligibility.test.mjs:1-149
- architecture/specs/03-algorithms.md §13.1
- architecture/specs/06-verification.md §5

### CORE-08-C01 PASS

inventory/region/ranges/assessment/disposition/criteria+citation이 별도이며 미회수·uncertain·invalid 영역을 unresolved로 남긴다.

- server/criteria-workbook-profile.py:73-130
- server/criteria-sandbox.mjs:120-171
- architecture/specs/03-algorithms.md §11.2-11.3

### CORE-08-C02 PASS

best table만 믿지 않고 모든 inventory region fallback, 행열 양방향 role index, split min/max·전치·병합·옆표 static 후보를 사용한다.

- server/criteria-sandbox.mjs:120-171
- server/criteria-layout.mjs:1-247
- architecture/specs/03-algorithms.md §11
- architecture/specs/07-data-algorithms-concurrency.md §7.3A

### CORE-08-C03 PASS

문서 generic session 종료 후 discovery는 새 withSandbox이고 내부 profile/detail/최대2round는 같은 session/누적 budget이다.

- server/criteria-sandbox.mjs:566-778 discoverWorkbookCriteria
- server/review.mjs:377-505
- architecture/specs/02-backend-pipeline.md §2.1
- architecture/specs/07-data-algorithms-concurrency.md §7.6

### CORE-08-C04 FAIL

03§11.1은100sheet 초과가 불완전이라고 단정하나 실제 profile은 모든sheet metadata를 남기며101번째 이후 빈sheet는 complete=true다. generic reader hardstop과 혼동했다.

- server/criteria-workbook-profile.py:73-128 profile
- architecture/specs/03-algorithms.md §11.1
- architecture/specs/07-data-algorithms-concurrency.md §7.8

### CORE-08-C05 PASS

시트/항목/위치/숨김/옆표/신규유형/규범없는열의 변형 tests 및 명세가 존재한다. 테스트 선언·함수 대조와 이번 실제 실행을 구분한다.

- server/criteria-generalization.test.mjs:1-208
- server/criteria-matrix-regression.test.mjs:1-136
- architecture/specs/06-verification.md §5
- architecture/specs/03-algorithms.md §9

### CORE-09-C01 PASS

comparison.unit/독립unit/scope/path/sample/conditions와 각각 provenance가 분리되고 empty path와 ambiguous를 구분한다.

- server/review.mjs:89-124 validateCriteria
- server/criteria-sandbox.mjs:194-565 grounding
- architecture/specs/03-algorithms.md §2/11.3

### CORE-09-C02 PASS

양방향 notes exclusion은 비고의 나이/온도를 조건에서 빼고 실제 condition/age/temperature 열은 보존한다. ignoredSourceNotes와 판정조건을 구분한다.

- server/criteria-notes.mjs:1-146
- server/criteria-table-sources.mjs:1-151
- server/criteria-layout.mjs:1-141
- architecture/specs/03-algorithms.md §3.3

### CORE-09-C03 PASS

공통부모/실제subtype/sample/목차, disposition 원문·현행replacement·identity·cycle검사를 정의한다. dedup 후 sampleEvidence 병합 안 됨도 공개한다.

- server/criteria-context.mjs:1-297
- server/criteria-sandbox.mjs:194-565
- architecture/specs/03-algorithms.md §12

### CORE-09-C04 PASS

250criteria/8level/ID·문구 bounds와 비교식검증이 맞다. 충돌·미검증 계층은 추정비교식으로 통과시키지 않고 확인으로 남긴다.

- server/review.mjs:89-124
- server/criteria-sandbox.mjs:194-565
- architecture/specs/03-algorithms.md §2/11.3

### CORE-09-C05 PASS

정성무단위/가변path/같은항목다른scope·condition은 semantic key로 분리한다. 유형표현 regex와 특정golden 파일명 판정 hardcode를 혼동하지 않는다.

- server/criteria-context.mjs:1-144
- server/criteria-adapter.test.mjs:1-178
- server/criteria-generalization.test.mjs:1-208
- architecture/specs/03-algorithms.md §9/12

### CORE-10-C01 PASS

confirm/revise criteria/feedback/document/scope/expectedVersion DTO와 approvedCriteria projection,202/200을 지정한다.

- server/app.mjs:115-118
- server/review.mjs:592-685
- architecture/specs/01-state-api.md §4.2/5

### CORE-10-C02 PASS

editable 의미필드와 서버provenance를 분리하고 humanUUID/manualsource,semanticdiff/userOverride/structuredClone을 정의한다.

- server/criteria-approval.mjs:1-212
- architecture/specs/03-algorithms.md §8
- architecture/specs/01-state-api.md §5

### CORE-10-C03 PASS

criteria_revising은 stage이고 run.status는 awaiting_confirmation이다. 성공version증가/실패복귀/confirm후awaiting_documents가 맞다.

- server/review.mjs:592-685
- server/criteria-revision.mjs:212-340
- architecture/specs/01-state-api.md §3/5

### CORE-10-C04 PASS

stale409/missing400,feedback20회·12000chars와 abort/version 늦은응답 차단, 실패후재시도를 명시한다.

- server/review.mjs:592-685
- server/criteria-revision.mjs:212-340
- architecture/specs/01-state-api.md §4.2/5

### CORE-10-C05 PASS

승인전 target첨부를 거절하고 approveddeepfreeze/원본과수정이력/target대기 단계를 보존한다.

- server/review.mjs:592-685
- server/criteria-approval.mjs:87-91
- architecture/specs/01-state-api.md §3/5

### CORE-11-C01 PASS

facts300fields와review250findings schema를 구분하고 referenceNumber/documentType/fieldverification 대 reviewcriterionId/evidence를 정의한다.

- server/field-extraction.mjs:1-188
- server/review.mjs:137-205
- architecture/specs/02-backend-pipeline.md §2.7
- architecture/specs/03-algorithms.md §2/4

### CORE-11-C02 PASS

기준을 측정치로 복사하지 않는 facts prompt와 실제 관측정보 보존, PDF label+value token검증/reference 제거·image unverified가 명시된다.

- server/field-extraction.mjs:1-188
- architecture/specs/02-backend-pipeline.md §2.7
- architecture/specs/03-algorithms.md §4

### CORE-11-C03 PASS

ensureAnalyzed→visual facts→승인기준view로 제안→normalize→items저장/item.decided 순서가 맞다. 세부guard 모순은 CORE12-C03/19-C02에서 판정한다.

- server/review.mjs:506-585 reviewDocuments
- architecture/specs/02-backend-pipeline.md §2.1/2.7
- architecture/specs/03-algorithms.md §4-5

### CORE-11-C04 FAIL

wrongdoc/criterionID는 거절하지만 일반numeric finding은 sheet존재/실제quote/Excel bounds를 검증하지 않는다. A0·B2:A1·ZZZ9999999+invented quote도pass인 반례에 비해 유효A1/원문위치 설명이 강하다.

- server/review.mjs:137-205 normalizeItems
- server/criterion-applicability.mjs:185-214 early return
- architecture/specs/03-algorithms.md §5/10

### CORE-11-C05 PASS

blank필드도 record에 남기고 모든적용기준 prompt/coverage를 정의한다. outOfScope와 미검토를 구분하며 완전 record×criterion행렬 검증은 REQUIRED_REBUILD임을 공개한다.

- server/table-records.mjs:1-49
- server/review.mjs:206-221 csvCoverage
- architecture/specs/03-algorithms.md §7
- architecture/specs/07-data-algorithms-concurrency.md §7.4

### CORE-12-C01 PASS

numeric literal/lt/lte/gt/gte/eq/range·단위정규화만 사용하고 환산없음, status/machineStatus/presence/missingVerified/missingConditions와 uncertain 차이가 맞다.

- server/review.mjs:125-205 numericVerdict/normalizeItems
- architecture/specs/03-algorithms.md §5-5.2

### CORE-12-C02 PASS

requiredness/optionalomit·확인missing과ND/unreadable/cache/truncated를 구분한다. fullsource·실제blank/literal·record guard와 flag생략 차이까지 기록했다.

- server/missing-result.mjs:1-153
- server/review.mjs:137-205
- architecture/specs/03-algorithms.md §6

### CORE-12-C03 FAIL

03§5는source와 같으나07§7.4는 applicability를 numeric앞에,conditions를 extraction뒤에 두어 상충한다. 뒤guard의 status/explanation 덮어쓰기 순서가 달라진다.

- server/review.mjs:137-205 normalizeItems
- architecture/specs/03-algorithms.md §5
- architecture/specs/07-data-algorithms-concurrency.md §7.4

### CORE-12-C04 FAIL

literal/path/sample/동일record guard는 맞으나03§5.3이 모든page의block/cell uncertain=false를 요구한다고 과장한다. 실제helper는 인용page만 그 검사를 하여 비인용page uncertainty가 있어도 근거를 인정한다.

- server/criterion-applicability.mjs:83-122 verifiedVisualRegions
- server/criterion-applicability.mjs:159-214
- architecture/specs/03-algorithms.md §5.3

### CORE-12-C05 PASS

0/blank/merged/formula cache/정상missing/ND/extractionmismatch 별도결과의 fixture와 tests를 연결한다. 존재·조건 대조이며 이번 suite 실행으로 세지 않는다.

- server/missing-result.test.mjs:1-166
- server/review.test.mjs:1-189
- architecture/specs/03-algorithms.md §9

### CORE-13-C01 PASS

run/document/stage enum,legacy/wizard,seq/time snapshot/events와 현재status기준 summary 계산을 구분한다.

- server/review.mjs:222-404 summaryOf/ReviewEngine
- architecture/specs/01-state-api.md §2-3/6/10

### CORE-13-C02 PASS

analysis/review 각2workers, 한문서실패격리, sharedanalysisPromise 및 documentId별결합과 ModelQueue2의 별도역할이 맞다.

- server/review.mjs:246-585
- architecture/specs/07-data-algorithms-concurrency.md §7.5
- architecture/specs/01-state-api.md §3

### CORE-13-C03 PASS

openstatus취소/lateevent차단, ensureAnalyzedwaiter취소와sharedwork수명, completed/partial/failed집계를 명시한다. run표시와 실제cleanup종료가 다르다.

- server/review.mjs:301-376
- server/review.mjs:680-706
- architecture/specs/01-state-api.md §3
- architecture/specs/07-data-algorithms-concurrency.md §7.5-7.6

### CORE-13-C04 PASS

open3/terminal정리40/findings250와partialcoverage, pruning범위 및 runevents무상한을 공개한다.

- server/review.mjs:265-283 start/prune
- server/review.mjs:137-221
- architecture/specs/01-state-api.md §1/3
- architecture/specs/07-data-algorithms-concurrency.md §7.2/7.10

### CORE-13-C05 PASS

종료후사유와humanresolve만 허용하며 machineStatus유지/audit beforeafter/summary/item.resolved를 정의한다.

- server/review.mjs:680-706 resolve
- server/app.mjs:119-119
- architecture/specs/01-state-api.md §4.2/10

### CORE-15-C01 FAIL

identity/handoff/secret정제는 맞지만02§2.9의 마지막1500자는 반대다. sanitizer는 입력앞20000자정제후 앞1500자를 남긴다. command tailbuffer와 구별해야 한다.

- server/sandbox-documents.mjs:26-32 sanitizeDocumentActivity
- integrations/src/activity.mjs:1-128
- architecture/specs/02-backend-pipeline.md §2.9

### CORE-15-C02 PASS

전역Gemini2/E2B2+pending100FIFO,ModelQueue2,workers2,retainedcommand1을 owner별 구분하고 kill종료까지slot을 유지한다.

- integrations/src/task-pool.mjs:1-63
- integrations/src/sandbox.mjs:1-66
- server/review.mjs:227-245
- architecture/specs/07-data-algorithms-concurrency.md §7.5

### CORE-15-C03 PASS

queued/running/terminal/queuedabort/latecomplete와 global fullsnapshot/revision,runSSEafter/replay를 구분한다. UI observer 범위는 담당 교차검토를 참고했다.

- integrations/src/activity.mjs:22-128
- server/activity.mjs:1-26
- server/app.mjs:97-113
- architecture/specs/01-state-api.md §6-8
- architecture/specs/07-data-algorithms-concurrency.md §7.7

### CORE-15-C04 PASS

실제stdout/stderr진행·조용한heartbeat를 구분하고 가짜percent/내부추론을 만들지 않는다. buffer/중복line/timeout/identityscope 계약이 맞다.

- integrations/src/command-progress.mjs:1-118
- architecture/specs/02-backend-pipeline.md §2.9
- architecture/specs/07-data-algorithms-concurrency.md §7.7

### CORE-15-C05 PASS

UI교차검토: 실제작업과presentation분리, queue8+active1/seen256/sessionseen512/visited100/Map30/fresh[-5000,15000]ms. OFF만clear·seen보존이며terminal은purge조건아님. reducedmotion/autoCollapse가runstate를바꾸지않는다.

- CROSS_REVIEW /root/ui_accuracy: CORE-15-C05 corrected second message
- first numerical summary discarded
- architecture/specs/04-ui-motion.md I4/I5/5.4
- architecture/specs/07-data-algorithms-concurrency.md §7.7

### CORE-16-C01 PASS

completed/partial만 허용하고11열/JSONsnapshot/CSVUTF8BOM/XLSX4시트에최종·원판정·human사유·근거를보존한다.

- server/app.mjs:26-39 exportRows
- server/app.mjs:120-151
- architecture/specs/05a-ledger-export.md §7

### CORE-16-C02 PASS

사용자key와실제header/unique row검증,허용결과·비고두셀,formula/mergeprotection·원본buffer불변copy가맞다.

- server/ledger.mjs:99-145 analyzeLedger
- server/ledger.mjs:167-194 writeLedgerCopy
- architecture/specs/05a-ledger-export.md §3/5

### CORE-16-C03 PASS

analyze제안/confirmedexport분리·freshmapping대조·fingerprint409를정의한다. fingerprint범위가전runmetadata아닌고정projection임도명시한다.

- server/ledger.mjs:196-255 ledgerProposal/createLedgerRouter
- architecture/specs/05a-ledger-export.md §2/4.1

### CORE-16-C04 PASS

CSVapostrophe,ledger비대상XML/ZIPbyte보존/reopen검증,allowlistedgolden선택/path와batch실패rollback이맞다.

- server/app.mjs:30-34 csvCell
- server/ledger.mjs:167-194
- server/golden-catalog.mjs:37-76
- architecture/specs/05a-ledger-export.md §5/7.3

### CORE-16-C05 PASS

UIgolden원본선택과v3직접업로드·검증범위를분리하며expectedanswer를판정에주입하지않는다. samples정확fixture누락은협업추가질문이다.

- server/golden-catalog.mjs:1-76
- server/app.mjs:81-93
- architecture/specs/06-verification.md §2/5
- architecture/specs/01-state-api.md §4.1

### CORE-19-C01 PASS

source/run/Promise/retainedsandbox/record/activity·UIcache의owner/key/lifetime/bound를정의한다. FIFO/삽입순서를LRU라하지않고무상한도공개한다. UI/dashboard는담당교차범위다.

- server/documents.mjs:470-517
- server/review.mjs:246-404
- server/document-sandbox-resources.mjs:1-72
- architecture/specs/07-data-algorithms-concurrency.md §7.2/7.10

### CORE-19-C02 FAIL

sparse/roleindex/coverage/dedup복잡도는대체로맞으나07정규화순서표가source/03과상충한다. guard덮어쓰기와explanation이달라질수있다.

- server/review.mjs:137-205 normalizeItems
- architecture/specs/07-data-algorithms-concurrency.md §7.4
- architecture/specs/03-algorithms.md §5

### CORE-19-C03 PASS

전역/엔진/worker/localcap과작업→finallycleanup→slot반환순서및generic끝난뒤discovery새session을명시한다. 중첩E2Bslot교착을피한다.

- integrations/src/task-pool.mjs:1-63
- integrations/src/sandbox.mjs:10-56
- server/sandbox-documents.mjs:112-182
- architecture/specs/07-data-algorithms-concurrency.md §7.5-7.6

### CORE-19-C04 PASS

runSSE무상한/명시backpressure없음과activity512KiBdestroy/snapshotrevision을구분한다. UI교차검토는PDFcancel/destroy/reset,iframecache5/abort/sequence·handoff수명에동의했다. 없는batching/visibilitypause를주장하지않는다.

- server/app.mjs:97-113
- server/activity.mjs:1-26
- CROSS_REVIEW /root/ui_accuracy CORE-19-C04
- architecture/specs/07-data-algorithms-concurrency.md §7.7/7.10

### CORE-19-C05 FAIL

byte/UTF16/Pythonchar/시간/token·NOT_RUN정책은좋으나criteria100sheets의stop/partial설명이후속빈sheet분기를놓친다. genericreaderhardstop과all-metadata inventory를구분해야한다.

- server/criteria-workbook-profile.py:73-128
- server/sandbox-document-reader.py:292-319
- architecture/specs/07-data-algorithms-concurrency.md §7.8
- architecture/specs/03-algorithms.md §11.1

## 추가 질문

### CORE-15-X01 FAIL

문서로그의 입력앞20000자→정제→앞1500자와 command tailbuffer의 잘림방향을 구별하는가?

설계의 마지막1500자는 source의 prefix1500과 다르다.

- server/sandbox-documents.mjs:26-32 sanitizeDocumentActivity
- architecture/specs/02-backend-pipeline.md §2.9
- probe CA-P01

### CORE-12-X01 FAIL

일반finding evidence의 permissive regex/미검증원문과 조건·분류·필수누락의 실제검증을 구별하고 invalid좌표·가짜quote numericpass baseline 및 강화REQUIRED_REBUILD를 명시하는가?

유효A1/직사각형 설명은 현재guard보다 강하다. 일반finding은 실제sheet/quote/bounds검사를 하지 않아 numericpass가 가능하다.

- server/review.mjs:137-205 normalizeItems
- server/criterion-applicability.mjs:185-214 unclassified early verified
- architecture/specs/03-algorithms.md §5/10
- probe CA-P02

### CORE-12-X02 FAIL

시각 applicability/자격helper의 전역pagecoverage검사와 인용page만의 block/cell uncertainty검사를 구별하는가?

비인용page의cells/blocks는 이helper에서 재검사하지 않으나 설계는 모든block/cell false라고 쓴다. 정상pipeline이모순summary를생성한다는주장과helper반례를구별해야한다.

- server/criterion-applicability.mjs:83-122 verifiedVisualRegions
- architecture/specs/03-algorithms.md §5.3
- probe CA-P03

### CORE-08-X01 FAIL

기준inventory는100sheet초과에도 모든metadata를반환하며후속빈sheet는complete=true라는점을genericreaderhardstop과구별하는가?

100은출력sheet수hardcap아닌cellprofile대상index한도다. 후속빈sheet는0==0으로complete이며값/주석이있으면incomplete다. 정적결론이고Pythonprobe는NOT_RUN이다.

- server/criteria-workbook-profile.py:73-128 profile
- server/sandbox-document-reader.py:307-313 sheet limit
- architecture/specs/03-algorithms.md §11.1
- architecture/specs/07-data-algorithms-concurrency.md §7.8

### CORE-19-X01 FAIL

normalizeItems의 숫자/누락→조건→분류→독립추출→표시label→machineStatus 순서를 모든요약표가 owning알고리즘과동일하게기술하는가?

07요약표가03/source의순서와상충한다. 후속guard는앞선status/explanation을덮어쓰므로단순설명순서가아니다.

- server/review.mjs:137-205 normalizeItems
- architecture/specs/03-algorithms.md §5
- architecture/specs/07-data-algorithms-concurrency.md §7.4

## 소스 기능·분기 역목록

- **integrations/src/config.mjs** (CORE-01): env우선순위/빈값/기본모델; 필수키오류; publicConfig비밀제외. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **integrations/src/gemini.mjs** (CORE-01, CORE-19): 역할모델/JSON·text·stream; contents/file/token/응답한도; 전역pool2/pending100/abort/timeout; stream소비끝slot; 형식/provider오류. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **integrations/src/sandbox.mjs** (CORE-01, CORE-19): create/callback/finallykillonce; abortcreaterace/cleanup오류우선; pool2/pending100; commandtimeout/nonzero. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **integrations/src/errors.mjs** (CORE-01): service/code/statusallowlist; secret없는errorSummary. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **integrations/src/index.mjs** (CORE-01): 공개adapter재수출. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **integrations/src/task-pool.mjs** (CORE-15, CORE-19): FIFOqueue/admit/overflow/abort; finallyrelease/정수cap. 설계: architecture/specs/01-state-api.md, architecture/specs/02-backend-pipeline.md, architecture/specs/04-ui-motion.md, architecture/specs/07-data-algorithms-concurrency.md
- **integrations/src/activity.mjs** (CORE-15, CORE-19): identity/parent/handoff; queued/running/terminal/lateignored; retention/events/logs/snapshotrevision; secretURLANSI정제/listener격리. 설계: architecture/specs/01-state-api.md, architecture/specs/02-backend-pipeline.md, architecture/specs/04-ui-motion.md, architecture/specs/07-data-algorithms-concurrency.md
- **integrations/src/command-progress.mjs** (CORE-15, CORE-19): 실제stdout/stderrline분류; tail/linebuffer/중복/heartbeat; abort/exit/timeout/finalflush. 설계: architecture/specs/01-state-api.md, architecture/specs/02-backend-pipeline.md, architecture/specs/04-ui-motion.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/index.mjs** (CORE-02): loopback/PORT; SIGINTTERMcancel+exit. 설계: architecture/specs/01-state-api.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/app.mjs** (CORE-02, CORE-16): routeDTOstatuserror404; uploadrollback/delete409; origin/multipart/JSON; runSSEsnapshot/replay/after/heartbeat/close; samplesexpenses/materialsrollback; exports/injection; distfallback. 설계: architecture/specs/01-state-api.md, architecture/specs/07-data-algorithms-concurrency.md, architecture/specs/05a-ledger-export.md, architecture/specs/05-dashboard-exports.md
- **server/documents.mjs** (CORE-02, CORE-03, CORE-19): extension/role/name/MIME/original; ZIP/XML/UTF8; XLSXnamespace/comments/drawingcompat; preview/deferred/truncate/hidden/merged/cache; PDFauxtexttimeout; public/storependingreserve/delete. 설계: architecture/specs/01-state-api.md, architecture/specs/07-data-algorithms-concurrency.md, architecture/specs/02-backend-pipeline.md
- **server/spreadsheet-xml-compatibility.mjs** (CORE-03): DTDreject; namespaceelement/relationshiprename; valuetextpreservation/temporaryinput. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/sandbox-documents.mjs** (CORE-04, CORE-05, CORE-19): digestkindprofilebudget; retainedpool1/abort/finally; source/installonce; observedread/PNGpathsignature; sourcechunk/context/qualityrepair; partialunsupportedvisual; logprefix. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/document-sandbox-resources.mjs** (CORE-04, CORE-19): WeakMap sandbox+document; source/parser/queryPromise; identityhash/abort/failurereset. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/sandbox-document-reader.py** (CORE-04): byteZIPtimecelltextimagebudget; XLSXsparse/allinventory/100break/hiddenmergedcacheformula; PDFencrypted/font/scanned/table/render/close; DOCXbody/headerfooter/nested8/supplement/unsupported; CSVdialectencodingblank/unknowncount; textJSONroot/invalid; imageframepixelpartial. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/document-quality.mjs** (CORE-05, CORE-19): source/header/structurecoverage; modelqualityeachsegment; issuecapdedupfingerprintstop; selectorfallback/repair3round; qualitativeunit/failure/abort. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/document-requery.mjs** (CORE-05): selectorrequestcaps; retainedcommand/fixedpath; responsehashkindordercoveragebytes. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/document-requery.py** (CORE-05): uniqueJSONkeys/exactfields; Excelbounds/ascending/block/text; trustedreaderreloadhash; sheetmergedhidden/blocknested/text; cellcharbudget/partial/error. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/visual-transcription.mjs** (CORE-06): page/rotation/bbox/overlap/nested; sourceomission/blank/coverage; 30page3batch3round180s60s; merge/rejudge/stickyissues; aborttimeoutpartial/modelparts. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/visual-quality-judge.mjs** (CORE-06): originalPDF/PNGallowlist/pageidentity; independentjudge/blankadmission; issue/rereadbounds/limitations. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-eligibility.mjs** (CORE-07): classificationnormativesource/evidence; literalnumberboundary/complete; partialnoexclude/oneinvalidrepair/transientuncertain; excludedsource. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-sandbox.mjs** (CORE-08, CORE-19): profile/detail/install/newsession; plan+allregionsfallback/2round; range18/area12000/total24000/repeat; groundingunitconditionsscopehierarchysample; layoutomission/region/context; 250partialcoverage. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-workbook-profile.py** (CORE-08): allmetadata/sparse200000/first100cellprofile; rowcolregions300/sample24; formula/cache/comments/stylehiddenmerged; details18/unique6000/record220000/overlap. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-layout.mjs** (CORE-08, CORE-19): twoorientationroleindex/excludednotes; mergedgeometry; minmax/split/transposecandidate1000; citationcomparison. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-adapter.mjs** (CORE-09): numericgrammar/unit; qualitativeNDreference; tableheader/condition/sourcecells; ExcelJSfallback/comments. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-normalization.mjs** (CORE-09): universalconditions; handlingfold/retain/mutation. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-notes.mjs** (CORE-09): rowcolumnnotesindex; ignoredSourceNotes/conditionsstrip; geometrymerge/exclusion. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-table-sources.mjs** (CORE-09): sourcecondition/comment; qualificationunitpreserve; notesexclusion/mutation. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-context.mjs** (CORE-08, CORE-09): semanticdedup/docs/path/conditions; firstcriterion/allowlistunion/confirmationOR; signals/revokedstatus; dispositionidentityreplacementcycle; unresolveddropscomparison. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-approval.mjs** (CORE-10): editablesemantic/provenance; humanUUID/manual; semanticdiff/userOverride/clone/freeze. 설계: architecture/specs/01-state-api.md, architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criteria-revision.mjs** (CORE-10): draftscope/sourcegroups; patchupdate/delete/add; excluded/reassignforbidden; feedbackabortrepair/wholevalidation. 설계: architecture/specs/01-state-api.md, architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/field-extraction.mjs** (CORE-11): PDF/imagefacts300; reference/uncertainty; independentlabel+valuetoken; PDFreferenceguard/imageunverified. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/criterion-applicability.mjs** (CORE-12): literalactualsource/bounds; PDFdigital/verifiedvisual; globalpage+citedcell; orderedpath/sample; recordrowlink; unclassifiedearlyverified. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/conditions.mjs** (CORE-09, CORE-12): durationtoken/relationalwholecondition; sourcequote/formats; missingconditionsreview/noimagefallback. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/missing-result.mjs** (CORE-12): requiredness/optionalomit; missingvsND/unreadable; analysis/transcriptioncompleteness; independentcontradiction; blankmergedformula/evidence; missingverified. 설계: architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/table-records.mjs** (CORE-11, CORE-12, CORE-19): IDheaderrecords/blankfields; rowlabel/cellanchors; coverage/remainingwork/outofscope. 설계: architecture/specs/02-backend-pipeline.md, architecture/specs/03-algorithms.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/review.mjs** (CORE-02, CORE-07, CORE-09, CORE-10, CORE-11, CORE-12, CORE-13, CORE-19): criterionDTO/numeric; rawfinding/absence/missing/condition/applicability/extraction; labelscoverage/summary; legacywizard/open3/prune40; analysisPromise/workers2/ModelQueue2; eligibilitydiscoveryapprovaltargets; versionabortlateevents; resolveaudit/safeMessage. 설계: architecture/specs/01-state-api.md, architecture/specs/07-data-algorithms-concurrency.md, architecture/specs/03-algorithms.md, architecture/specs/02-backend-pipeline.md
- **server/task-pool.mjs** (CORE-13): sharedTaskPoolreexport. 설계: architecture/specs/01-state-api.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/activity.mjs** (CORE-02, CORE-15, CORE-19): fullsnapshot; namedactivitySSE/revision; 512KiBdisconnect/15sheartbeat/closeunsubscribe. 설계: architecture/specs/01-state-api.md, architecture/specs/07-data-algorithms-concurrency.md, architecture/specs/02-backend-pipeline.md, architecture/specs/04-ui-motion.md
- **server/ledger.mjs** (CORE-16): ZIPsafety/headerkeyuniquerow; formula/merge/protection; proposal/fingerprint; confirmedcopy/twocells/otherZIPbytepreserve/reopen; analyze/exporterrors. 설계: architecture/specs/01-state-api.md, architecture/specs/05a-ledger-export.md, architecture/specs/05-dashboard-exports.md, architecture/specs/07-data-algorithms-concurrency.md
- **server/golden-catalog.mjs** (CORE-16): frozenallowlist/selectionbounds; rolepath/noanswerinjection; sequentialloadrollback. 설계: architecture/specs/01-state-api.md, architecture/specs/05a-ledger-export.md, architecture/specs/05-dashboard-exports.md, architecture/specs/07-data-algorithms-concurrency.md

## 입력 보존

읽은파일72개의bytes/SHA256/초기snapshot일치여부/검토방식은 JSON readFiles에 보존했다. tests는선언/관련case읽기이며이번전체suite실행이아니다. 초기snapshot대비차이: 없음. snapshot에없는프로토콜등: architecture/reviews/independent-audit/PROTOCOL.md.

# CORE 정확성 검토 — round 01

정의된 CORE 18모듈/90질문을 원본 구현·타입·테스트와 대조했다. **68 pass / 15 fail / 7 unverified, 정확성 75.56%, 열린 이슈 23건**이다. 모든 모듈 인수를 의미하지 않으며 미확인 사례를 통과로 계산하지 않았다.

외부 API·서버를 실행하거나 비밀 값을 읽지 않았다. 기존 테스트를 읽었고 일부 반례는 메모리 내 순수 함수/파일 fixture로 재현했다. 실제 서비스, 새 구현 앱, 전 포맷의 보편 정확성, 브라우저 픽셀·오프라인 canvas 통과를 입증한 보고서가 아니다. 최종 JSON의 입력 hash가 이 회차의 검토 기준을 고정한다.

| 모듈 | pass | fail | unverified | 정확성 |
|---|---:|---:|---:|---:|
| CORE-01 | 3 | 0 | 2 | 60% |
| CORE-02 | 4 | 0 | 1 | 80% |
| CORE-03 | 3 | 2 | 0 | 60% |
| CORE-04 | 3 | 1 | 1 | 60% |
| CORE-05 | 4 | 0 | 1 | 80% |
| CORE-06 | 3 | 1 | 1 | 60% |
| CORE-07 | 2 | 2 | 1 | 40% |
| CORE-08 | 4 | 1 | 0 | 80% |
| CORE-09 | 3 | 2 | 0 | 60% |
| CORE-10 | 5 | 0 | 0 | 100% |
| CORE-11 | 5 | 0 | 0 | 100% |
| CORE-12 | 4 | 1 | 0 | 80% |
| CORE-13 | 5 | 0 | 0 | 100% |
| CORE-14 | 3 | 2 | 0 | 60% |
| CORE-15 | 5 | 0 | 0 | 100% |
| CORE-16 | 4 | 1 | 0 | 80% |
| CORE-17 | 3 | 2 | 0 | 60% |
| CORE-18 | 5 | 0 | 0 | 100% |

## 질문별 판정

각 증거는 architecture 상대 경로와 `source:` 접두사를 쓴 프로젝트 상대 경로로 구분한다.

### CORE-01

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-01-C01 | pass | 환경 우선순위·빈 값 처리·두 역할의 기본 모델·publicConfig allowlist가 원본과 일치한다. | `environment/README.md` .env와 비밀 경계; `specs/01-state-api.md` §4.1 GET /api/health; `source:integrations/src/config.mjs` loadConfig / publicConfig; `source:integrations/test/integrations.test.mjs` root env format; missing credentials |
| CORE-01-C02 | unverified | 단계별 프롬프트는 있으나 공통 generateText/generateJson 요청·응답 및 provider 오류 매핑 계약이 없어 같은 인터페이스를 검증할 수 없다. 원본은 prompt/contents 선택, optional validate와 model/usage 메타데이터를 제공한다. | `specs/02-backend-pipeline.md` §2.1, §2.8; `prompts/pipeline-prompts.md` 호출 조립 표; `source:integrations/src/gemini.mjs` request / generateText / generateJson; `source:integrations/src/errors.mjs` safeError |
| CORE-01-C03 | pass | Gemini HTTP 30초와 E2B create/lifetime/kill 제한을 구분하며 finally cleanup까지 슬롯을 보존하는 취소 순서가 원본과 일치한다. | `specs/02-backend-pipeline.md` §2.8; `source:integrations/src/sandbox.mjs` withSandbox; `source:integrations/src/task-pool.mjs` #drain; `source:integrations/test/concurrency.test.mjs` abort during creation; active sandbox abort; lifecycle slots |
| CORE-01-C04 | unverified | cleanup 실패는 명시했지만 공통 Gemini의 1..32768 token/default2048 및 blank text/JSON.parse/validate 실패 정책이 명세에서 빠졌다. 원본 adapter에는 별도 응답 byte/파일 part cap이 없으므로 단계별 cap과 구분도 필요하다. | `specs/02-backend-pipeline.md` §2.8; `source:integrations/src/gemini.mjs` MAX_OUTPUT_TOKENS / request / generateJson; `source:integrations/src/errors.mjs` IntegrationError / safeError; `source:integrations/test/gemini-limits.test.mjs` token boundary cases |
| CORE-01-C05 | pass | npm test에 integration fake-client 테스트가 포함되며 check와 실제 provider smoke의 경계가 명시돼 있다. 테스트 실행을 실제 서비스 실행 증거로 표현하지 않는다. | `environment/README.md` 앱 구현 이후 실행 명령; `source:package.json` scripts.test; `source:integrations/package.json` test/check/smoke; `source:integrations/test/integrations.test.mjs` fake client / sandboxFactory fixtures |

### CORE-02

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-02-C01 | pass | HTTP method·payload·상태·안전 오류와 공개 metadata/비공개 원본 경계가 router 및 publicDocument와 일치한다. | `specs/01-state-api.md` §4, §4.1, §4.2, §9; `contracts/types.ts` HTTP request/response DTO; `source:server/app.mjs` createApp routes / requireRun / error middleware; `source:server/documents.mjs` publicDocument; `source:server/app.test.mjs` public upload response has no buffer/modelParts |
| CORE-02-C02 | pass | 문서/run/activity/dashboard 메모리 수명 및 restart 후 ID 소실과 404는 Map 저장소와 라우트 구현에 부합한다. | `specs/01-state-api.md` §1, §4.1, §4.2; `source:server/app.mjs` createApp / requireRun; `source:server/review.mjs` ReviewEngine.runs; `source:server/documents.mjs` DocumentStore; `source:server/dashboard.mjs` createDashboardRouter jobs Map |
| CORE-02-C03 | pass | 업로드 배치의 added rollback과 보존 run의 target/criteria/analysis 참조 DELETE 409가 실제 구현과 같다. | `specs/01-state-api.md` §1, §4.1; `source:server/app.mjs` POST /api/documents lines59-68; DELETE lines76-79; `source:server/app.test.mjs` upload, review, evidence fetch: retained delete409 |
| CORE-02-C04 | pass | Origin 존재 시 로컬 hostname 검사, JSON 2mb 및 multipart 파일/필드/parts 제한과 오류코드가 원본 순서와 일치한다. | `specs/01-state-api.md` §4, §4.1; `source:server/app.mjs` upload limits; createApp middleware; Multer error mapping; `source:server/app.test.mjs` reject unsupported uploads and outside origins |
| CORE-02-C05 | unverified | 포트·process.env override·dist 서빙·명령은 정확하지만 SIGINT/SIGTERM→run cancel→server.close→exit0의 명시 계약/재현 기대값이 없다. 개발 child 종료 설명만으로 API 프로세스 종료 경로까지 검증할 수 없다. | `environment/README.md` 앱 구현 이후 실행 명령; `specs/01-state-api.md` §1, §10; `source:server/index.mjs` lines3-9; `source:server/app.mjs` dist static fallback lines157-158 |

### CORE-03

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-03-C01 | pass | 허용 확장자/role/파일명 정제/signature 검사와 원본 bytes 복사·content 응답은 구현과 같다. | `specs/02-backend-pipeline.md` §2.2; `contracts/types.ts` PublicDocument; `source:server/documents.mjs` lines20,43,131,475; `source:server/app.mjs` content route line69; `source:server/documents.test.mjs` lines62,75,253 |
| CORE-03-C02 | pass | OOXML 호환 변환은 ZIP 복사본에 적용하고 원본 bytes와 hidden/merged/formula cache 정보를 구분한다. | `specs/02-backend-pipeline.md` §2.2 XLSX; `source:server/documents.mjs` compatibleSpreadsheetBytes line192; metadata281-304; original485,496; `source:server/documents.test.mjs` lines98,154,174,207; `source:server/spreadsheet-xml-compatibility.test.mjs` lines8,14,28 |
| CORE-03-C03 | pass | 로컬 XLSX capacity만 deferred preview로 바꾸며 30시트/100000셀/1500000자 제한을 원본 손상과 구별한다. 셀 한도 직접 fixture는 없지만 분기 코드가 명시적이다. | `specs/02-backend-pipeline.md` §2.2 limits table; `source:server/documents.mjs` lines168,255-269,271,292; `source:server/documents.test.mjs` lines253,270 |
| CORE-03-C04 | fail | 예약/용량 한도는 맞지만 local/central ZIP 크기 일치 검사라는 주장은 틀리다. local 이름/method만 비교하고 실제 팽창 길이는 central size와 비교하므로 local uncompressed size=1 변조가 수용된다. | `specs/02-backend-pipeline.md` §2.2 ZIP; `source:server/documents.mjs` ZIP lines108-126; reservation475-505; `source:server/documents.test.mjs` lines288,296,317 |
| CORE-03-C05 | fail | drawing 제거는 미지원 XML에 한정되지 않고 모든 drawing 관계에 적용된다. 또한 3000자 셀을 2000자로 먼저 줄이면 public preview.truncated=false가 되어 모든 잘림 표시를 보장하지 않는다. | `specs/02-backend-pipeline.md` §2.2 XLSX/PDF; `source:server/documents.mjs` drawing214-218; cell315; public453-456; PDF349-414; `source:server/documents.test.mjs` lines75,98,241 |

### CORE-04

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-04-C01 | pass | digest/kind/envelope 검증 및 private profile/modelParts/sourceSheets/sourceRows와 public analysis 변환은 원본과 같다. | `specs/02-backend-pipeline.md` §2.3, §2.4; `source:server/sandbox-documents.mjs` lines100-119,183-229,363-371; `source:server/sandbox-documents.test.mjs` digest mismatch line136 |
| CORE-04-C02 | pass | 한 문서 분석 phase에서 물리 sandbox/TaskPool1과 identity-bound source/parser/query promises를 재사용한다. discovery/revision의 별도 세션도 02에서 정확히 구분한다. | `specs/02-backend-pipeline.md` §2.8; `source:server/sandbox-documents.mjs` lines144-164; `source:server/document-sandbox-resources.mjs` lines14-70; `source:server/document-sandbox-session.test.mjs` lines54,75,138 |
| CORE-04-C03 | pass | 300초 앱 세션/180초 command/150초 Python cooperative guard와 pip/cleanup 수명을 따로 정의하며 종료 테스트에 대응한다. | `specs/02-backend-pipeline.md` §2.8; `source:server/sandbox-documents.mjs` lines130-175,223; `source:server/document-sandbox-resources.mjs` pip line49; `source:server/sandbox-document-reader.py` elapsed line115; `source:server/document-sandbox-session.test.mjs` lines86,99,113,124,132 |
| CORE-04-C04 | fail | 한도 수치는 맞지만 일괄 partial/truncated 설명이 원본 상태를 혼동한다. standalone image>40MP는 unsupported/complete=false, archive/source hard limit은 예외, embedded 이미지 실패는 complete=false이며 truncated가 아닐 수 있다. | `specs/02-backend-pipeline.md` §2.3 하드/부분 한도; `source:server/sandbox-document-reader.py` limits23-33; hard158-159,212-213; embedded176-207; standalone749-755; unsupported789-796 |
| CORE-04-C05 | unverified | 고정 명령·keep_links=False·수식 비실행 코드는 확인했으나 모집단이 요구하는 malicious archive/macro/external-link 실행 음성 fixture는 지정 Python suite에서 확인되지 않는다. | `specs/02-backend-pipeline.md` §2.3, §2.5; `decomposition/core-modules.json` CORE-04-C05; `source:server/sandbox-documents.mjs` static commands222-223; `source:server/document-sandbox-resources.mjs` lines27-58; `source:server/sandbox-document-reader.py` macro/link153-172; cached formulas254-264; `source:server/document-reader.test.py` formula160; selector175 |

### CORE-05

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-05-C01 | pass | selector는 typed data이며 bounds/sheet/BLOCK/L, digest/kind/order를 검사한다. populated maxRow/maxColumn보다 큰 Excel bounds 허용도 명세에서 한계로 공개한다. | `specs/02-backend-pipeline.md` §2.5 허용 selector; `source:server/document-quality.mjs` lines29-64; `source:server/document-requery.mjs` lines15-54; `source:server/document-requery.py` lines29-89; `source:server/document-quality.test.mjs` lines236,253 |
| CORE-05-C02 | pass | 1200000 retained cap/150000 chunks의 모든 retained segment 독립 검증과 deterministic missing sheet/cell/header/line 검사가 구현돼 있다. | `specs/02-backend-pipeline.md` §2.4–2.5; `source:server/sandbox-documents.mjs` lines280-327; `source:server/document-quality.mjs` lines100-172,203-228; `source:server/sandbox-documents.test.mjs` lines155,187; `source:server/document-quality.test.mjs` lines96,172 |
| CORE-05-C03 | pass | 최대 3 verification rounds/2 repairs, no-progress/source-limit 중지와 전체 context 교체·재검증 및 같은 sandbox 연결이 pseudocode와 같다. | `specs/02-backend-pipeline.md` §2.5 pseudocode / quality; `source:server/document-quality.mjs` lines197-281; `source:server/sandbox-documents.mjs` lines330-336; `source:server/document-quality.test.mjs` lines106,120,130; `source:server/document-sandbox-session.test.mjs` line54 |
| CORE-05-C04 | pass | 원문으로 뒷받침되는 정성 단위 공백만 예외로 하고 verifier/requery 실패·미해결은 partial/needsConfirmation으로 남긴다. | `specs/02-backend-pipeline.md` §2.4–2.5 qualitative unit; `source:server/document-quality.mjs` lines72-95,226-281; `source:server/sandbox-documents.mjs` lines359-369; `source:server/document-quality.test.mjs` lines46,59,80,142,150,244 |
| CORE-05-C05 | unverified | sparse/hidden/multisheet/헤더/text 누락 fixture는 있으나 실제 nested DOCX reader와 행/열 semantic 방향 fixture는 지정 suite에서 확인되지 않는다. synthetic flat block 테스트로 대체할 수 없다. | `specs/02-backend-pipeline.md` §2.5, acceptance examples; `decomposition/core-modules.json` CORE-05-C05; `source:server/document-reader.test.py` lines53-102,123,160; `source:server/document-quality.test.mjs` lines96,166,172,190; `source:server/sandbox-document-reader.py` nested DOCX implementation569-608 |

### CORE-06

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-06-C01 | pass | page/rotation/block/table/cell/parent/uncertainty/coverage 구조와 실제 page inventory 계약이 원본 schema와 같다. | `specs/02-backend-pipeline.md` §2.6; `contracts/pipeline-model-schemas.json` visualTranscriptionSchema; `source:server/visual-transcription.mjs` lines17,59,137,220; `source:server/visual-transcription.test.mjs` lines41,83,162 |
| CORE-06-C02 | pass | 원본을 별도 visual judge로 비교하며 invented/blank/overlap/missing page를 complete=true만으로 승인하지 않는다. | `specs/02-backend-pipeline.md` §2.6 validation; `source:server/visual-transcription.mjs` judge line313; `source:server/visual-quality-judge.mjs` lines94,143; `source:server/visual-quality-judge.test.mjs` lines13,55,64; `source:server/visual-transcription-alignment.test.mjs` lines17,34,50 |
| CORE-06-C03 | fail | 30page/3page/3round/180s/60s 한도는 맞지만 page-limit는 무조건 limited가 아니다. expected31+page1 unresolved fixture는 needs_review/no_progress(2rounds, missing31)가 되어 명세 상태 우선순위와 다르다. | `specs/02-backend-pipeline.md` §2.6 status; 31-page acceptance; `source:server/visual-transcription.mjs` stopReason precedence lines344-350,366; `source:server/visual-transcription.test.mjs` partial/no-progress tests |
| CORE-06-C04 | pass | 원본 page image8/16MiB, judge3page/250000 chars와 구조/회전 오류의 warning·partial 보존은 실제 제한에 대응한다. | `specs/02-backend-pipeline.md` §2.3 PDF images; §2.6; `source:server/sandbox-documents.mjs` lines233-259; `source:server/visual-quality-judge.mjs` lines1-5,44,143-166; `source:server/visual-transcription.mjs` lines59,235,294-305,321-369; `source:server/visual-quality-judge.test.mjs` lines86,144,162,169 |
| CORE-06-C05 | unverified | invented page/blank false approval/nested reference 테스트는 있지만 서로 다른 두 문서 원본 혼합 음성 fixture는 없다. 현재 단일 문서 페이지 필터 테스트는 문서간 분리를 입증하지 않는다. | `decomposition/core-modules.json` CORE-06-C05; `prompts/pipeline-prompts.md` source binding; `source:server/visual-quality-judge.test.mjs` line119; `source:server/visual-transcription-alignment.test.mjs` line61; `source:server/visual-transcription.mjs` caller source245-249; `source:server/visual-quality-judge.mjs` source parts44-74 |

### CORE-07

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-07-C01 | pass | criteria/not_criteria/uncertain와 public assessment/exclusion event 계약은 원본의 근거 기반 자격 판별과 같다. | `specs/03-algorithms.md` §13.1; `specs/01-state-api.md` §6; `source:server/criteria-eligibility.mjs` assessCriteriaDocument; `source:server/review.mjs` assessCriteriaInputs / prepareCriteria |
| CORE-07-C02 | fail | 자동 제외의 명세는 explicit false/count/list 완전성 metadata를 요구하지만 completeAnalysis는 선택 flags·counts·missingContextSheets 생략을 허용한다. 현재 test fixture도 생략한 문서를 제외한다. | `specs/03-algorithms.md` §13.1 line340; `source:server/criteria-eligibility.mjs` completeAnalysis lines131-142; `source:server/criteria-eligibility.test.mjs` lines8-15,35 |
| CORE-07-C03 | pass | invalid 응답만 1repair, 실제 불확실/불완전/transport 실패는 uncertain이며 제외된 출처의 revise/confirm 재사용을 막는다. | `specs/03-algorithms.md` §13.1; `specs/01-state-api.md` §4.2, §5; `source:server/criteria-eligibility.mjs` repair / inspectAssessment; `source:server/review.mjs` source guards lines407,595,619; `source:server/review.eligibility.test.mjs` uncertain/excluded source cases |
| CORE-07-C04 | fail | same-row range quote의 joined full-string equality를 주장하지만 실제로는 정규화 substring 및 사용 가능한 comment까지 검색한다. | `specs/03-algorithms.md` §13.1 line338; `source:server/criteria-eligibility.mjs` matching lines34-39,86-128 |
| CORE-07-C05 | unverified | standards/mixed/record/injection은 확인했으나 필수 질문의 정성 legal/business 분류 fixture→기대값 매핑은 확인하지 못했다. | `specs/03-algorithms.md` §13.1, §14; `decomposition/core-modules.json` CORE-07-C05; `source:server/criteria-eligibility.test.mjs` classification fixtures; `source:server/review.eligibility.test.mjs` eligibility integration fixtures |

### CORE-08

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-08-C01 | pass | plan/extract/coverage 구조와 원문 inventory/actual-cell 단계 구분은 원본 discovery 계약에 대응한다. | `specs/03-algorithms.md` §11.1–11.3; `prompts/criteria-algorithms.catalog.json` discovery plan/extract schemas; `source:server/criteria-sandbox.mjs` discoverWorkbookCriteria |
| CORE-08-C02 | pass | 전 시트 실제 region accountability와 layout validation의 보조 역할, 단일 best table로 탐색을 대체하지 않는 점이 구현과 같다. | `specs/03-algorithms.md` §3.1, §11.2; `source:server/criteria-layout.mjs` layout parsing; `source:server/criteria-sandbox.mjs` discoverWorkbookCriteria; `source:server/criteria-matrix-regression.test.mjs` layout variations |
| CORE-08-C03 | fail | 03 §11.1은 기존 분석 sandbox 재사용을 주장하지만 discovery는 별도 sandboxRunner 수명을 열고 기존 criteriaInventory만 재사용한다. 02 §2.8과도 충돌한다. | `specs/03-algorithms.md` §11.1; `specs/02-backend-pipeline.md` §2.8 line269; `source:server/criteria-sandbox.mjs` discoverWorkbookCriteria sandboxRunner / inventory reuse |
| CORE-08-C04 | pass | 한도와 잔여 범위/읽지 않은 이미지/잘린 criteria·hierarchy를 coverage로 남기는 정책은 원본과 같다. | `specs/03-algorithms.md` §11.1–11.2 limits / coverage; `source:server/criteria-sandbox.mjs` discoverWorkbookCriteria; `source:server/criteria-sandbox.test.mjs` limit / remaining-range cases |
| CORE-08-C05 | pass | 구조 변형 fixture의 의미/원문 검증은 source generalization/matrix tests에 대응하고 이름 고정 lookup과 구별된다. | `specs/03-algorithms.md` §9, §11; `source:server/criteria-generalization.test.mjs` structural transformations; `source:server/criteria-matrix-regression.test.mjs` matrix regressions |

### CORE-09

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-09-C01 | pass | 기준 wire fields/한도와 baseline DTO caveat는 validateCriteria의 generic shape 계약과 일치한다. | `specs/03-algorithms.md` §2, §11.3; `contracts/types.ts` baseline DTO caveat / Criterion; `source:server/review.mjs` validateCriteria lines89-120; `source:server/review.classification.test.mjs` lines8,18; `source:server/criteria-normalization.mjs` normalizeHandlingCriteria lines19-22; 별도 issue R1-CORE-023의 mutation 근거 |
| CORE-09-C02 | fail | 같은 evidence row에서만 조건을 복구한다는 주장은 evidenceCells가 있을 때만 성립한다. sourceEvidence만 남긴 generic 후보는 동일 label 여러 행의 조건을 받을 수 있다. | `specs/03-algorithms.md` §3.3 line96; `source:server/conditions.mjs` candidate filter line48; `source:server/review.mjs` citation normalization lines112-113 |
| CORE-09-C03 | pass | grounded discovery hierarchy와 superseded/overridden/cross-reference disposition의 보존·확인 guard는 원본과 같다. | `specs/03-algorithms.md` §11.3, §12; `source:server/criteria-sandbox.mjs` groundHierarchy line397; `source:server/criteria-context.mjs` lines50,79,92,205; `source:server/criteria-context.test.mjs` context dispositions |
| CORE-09-C04 | fail | 모집단의 모든 unverified hierarchy/invalid comparator→confirmation 보장은 generic baseline보다 강하다. validateCriteria는 근거 없는 nonempty path를 resolved로 만들고 invalid comparison을 버리면서 needsConfirmation=false를 유지할 수 있다. | `decomposition/core-modules.json` CORE-09-C04; `specs/03-algorithms.md` §2 generic validation; `source:server/review.mjs` validateCriteria lines106-120 |
| CORE-09-C05 | pass | 정적 parser 경계와 grounded discovery/context의 generalization 검증 범위를 구분하며 실제 fixture가 있다. | `specs/03-algorithms.md` §3.2, §9, §11.3; `source:server/criteria-generalization.test.mjs` lines9,41,54,62,93,178; `source:server/criteria-sandbox.test.mjs` lines241,283,416,474; `source:server/criteria-context.test.mjs` lines112,127 |

### CORE-10

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-10-C01 | pass | revise/confirm/attach DTO 및 선택 criteria/문서 출처 계약은 source methods와 일치한다. | `specs/01-state-api.md` §4.2, §5; `contracts/types.ts` ConfirmCriteriaRequest / ReviseCriteriaRequest / AttachDocumentsRequest; `source:server/review.mjs` revise614; attachDocuments649; confirm671; `source:server/review.wizard.test.mjs` wizard checkpoint |
| CORE-10-C02 | pass | 직접 rule/comparison 편집과 서버 provenance 보존·human criterion 처리 및 미완성 revise 대 strict confirm의 구분이 정확하다. | `specs/03-algorithms.md` §8, §13.2; `source:server/criteria-approval.mjs` normalizeCriteria line96; `source:server/review.mjs` normalizedDraft line596; `source:server/criteria-approval.test.mjs` lines17,28,41,101 |
| CORE-10-C03 | pass | revision 성공 version 증가, 실패 이전 draft/version 보존, confirm 승인본 생성 상태가 원본과 같다. | `specs/01-state-api.md` §3, §5; `source:server/review.mjs` lines614-645,671-686; `source:server/review.wizard.test.mjs` lines73,170 |
| CORE-10-C04 | pass | criteria_first required integer version, stale409,20 feedback cap와 revisionToken/cancel late result 차단은 실제 guard다. | `specs/01-state-api.md` §4.2 line112; `specs/03-algorithms.md` §13.2; `source:server/review.mjs` lines592-594,617-645; `source:server/review.wizard.test.mjs` lines119,145 |
| CORE-10-C05 | pass | 승인 deep freeze/고정 version을 target attach에서 재사용하며 재추출하지 않는 동작을 test가 확인한다. | `specs/01-state-api.md` §5 line130; `source:server/review.mjs` freezeValue61; attach/confirm649-677; `source:server/review.wizard.test.mjs` lines73,119 |

### CORE-11

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-11-C01 | pass | 독립 facts 및 proposed/final item schema는 field extractor와 normalizeItems의 실제 입력/출력에 맞는다. | `specs/02-backend-pipeline.md` §2.7; `specs/03-algorithms.md` §2; `contracts/pipeline-model-schemas.json` fields / review schema; `source:server/field-extraction.mjs` lines9,61; `source:server/review.mjs` lines38,137 |
| CORE-11-C02 | pass | 원문 표기/referenceNumber와 label-linked numeric token 검증, unverified 대 mismatch 구분 및 모델 한계를 정확히 기술한다. | `specs/03-algorithms.md` §4, §10; `source:server/field-extraction.mjs` verifyField103; extractDocumentFields159; `source:server/field-extraction.test.mjs` lines15,24,35,82 |
| CORE-11-C03 | pass | 시각 문서만 facts 선행, semantic review→normalization→pending extracted→decided 이벤트 순서가 코드와 같다. | `specs/02-backend-pipeline.md` §2.7; `specs/03-algorithms.md` §1, §5; `source:server/review.mjs` reviewDocuments lines506-547 |
| CORE-11-C04 | pass | 알 수 없는 criterion/문서 evidence와 numeric/독립 추출/분류 mismatch guard 및 same-row 한계를 구현대로 기술한다. | `specs/03-algorithms.md` §5, §5.3, §10; `source:server/review.mjs` normalizeItems lines142-184; `source:server/criterion-applicability.mjs` lines157,189; `source:server/field-extraction.test.mjs` negative token/evidence cases |
| CORE-11-C05 | pass | CSV/XLSX record coverage·blank/merged/formula 구분과 CSV exclusion/조합 exhaustive 한계를 분리한다. | `specs/03-algorithms.md` §7, §10; `source:server/table-records.mjs` spreadsheetRecords6; spreadsheetCoverage30; `source:server/review.mjs` csvCoverage206; lines538-560; `source:server/table-records.test.mjs` lines22,50,74 |

### CORE-12

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-12-C01 | pass | 정확 경계/operator/unit literal 비교와 absent≠zero 계약은 numericVerdict 및 경계 tests와 일치한다. | `specs/03-algorithms.md` §5, §5.1, §6; `source:server/review.mjs` numericVerdict125-134; final202; `source:server/review.test.mjs` lines10,22 |
| CORE-12-C02 | fail | 누락 fail의 명세는 sourceTruncated=false/needsConfirmation=false를 모두 요구하지만 실제 inspectedCompletely는 생략 flags를 허용한다. complete:true와 실제 evidence만 있는 fixture도 fail을 반환한다. | `specs/03-algorithms.md` §6 line174; `source:server/missing-result.mjs` inspectedCompletely lines24-26; `source:server/missing-result.test.mjs` complete fixture line12; `source:server/review.test.mjs` missing fixture line38 |
| CORE-12-C03 | pass | missing/context→numeric→conditions→applicability→independent extraction consistency 우선순위는 원본 순서다. | `specs/03-algorithms.md` §5 lines114-125; `source:server/review.mjs` normalizeItems lines150-202 |
| CORE-12-C04 | pass | 분류/시료 applicability와 record linkage를 실제 target evidence로 확인하는 guard 및 한계가 원본과 일치한다. | `specs/03-algorithms.md` §5.3, §10; `source:server/criterion-applicability.mjs` recordLinkageIssue157; verifyCriterionApplicability189; `source:server/criterion-applicability.test.mjs` lines64,72,108,120,147,163 |
| CORE-12-C05 | pass | 0/빈 셀/uncached formula/merged/정상 누락/불확실 누락/상충 추출을 분리한 source tests와 추가 acceptance 구분이 존재한다. | `specs/03-algorithms.md` §6, §9; `source:server/missing-result.test.mjs` lines18,29,42,79,86,97,105,122; `source:server/conditions.test.mjs` condition guards; `source:server/review.test.mjs` numeric and extraction conflicts |

### CORE-13

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-13-C01 | pass | legacy/criteria_first 상태·snapshot·runStatus 권위·event 순서·최종 summary 집계는 실제 engine/reducer와 일치한다. | `specs/01-state-api.md` §3, §6, §7, §10; `contracts/types.ts` RunStatus / RunSnapshot / RunEnvelope / Summary; `source:server/review.mjs` summaryOf / snapshot / emit; `source:src/review-state.ts` ReviewRequestGate / reduceReviewEvent; `source:server/review-state.test.mjs` document/status/version and stale response cases |
| CORE-13-C02 | pass | 분석과 review 각각 2 worker이며 분석 결과 Map의 document.id 결합과 문서별 catch로 sibling 실패 격리가 구현돼 있다. | `specs/02-backend-pipeline.md` §2.8, §2.9; `source:server/review.mjs` analyzeInputs / reviewDocuments; `source:server/review.test.mjs` one document failure remains visible as a partial run; `source:server/review.wizard.test.mjs` target-analysis failure preserves approved version |
| CORE-13-C03 | pass | 열린 세 상태 취소·late event 차단·terminal 집계 및 후속 ensureAnalyzed waiter만 취소하는 규칙이 원본과 일치한다. | `specs/01-state-api.md` §3, §7; `specs/02-backend-pipeline.md` §2.1 ensureAnalyzed; §2.9; `source:server/review.mjs` ensureAnalyzed / cancel / emit / reviewDocuments; `source:server/review.wizard.test.mjs` pending revision cancellation; awaiting documents cancellation; `source:server/use-review-commands.test.mjs` late acknowledgement after reset |
| CORE-13-C04 | pass | open3, 전체 Map 기준 pruning40, 결과>=250 또는 reviewCoverage false의 partial을 정확히 구분하며 모델 완료 문구로 미완료 범위를 지우지 않는다. | `specs/01-state-api.md` §1, §3; `specs/02-backend-pipeline.md` §2.9; `source:server/review.mjs` start lines269-280; reviewDocuments outputLimited/incompleteCriteria; `source:server/review.pipeline.test.mjs` partly read files remain partial |
| CORE-13-C05 | pass | 종료 후 사유 필수 resolve는 최초 machineStatus, before/after audit, 최종 summary와 item.resolved를 유지한다. | `specs/01-state-api.md` §4.2, §6, §10; `source:server/review.mjs` resolve lines693-704; `source:server/review.test.mjs` overrides retain original verdict and audit; `source:server/app.test.mjs` override and export assertions |

### CORE-14

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-14-C01 | pass | 원문 위치/criterion evidence/item highlight/PDF anchors를 구분하며 Highlight 인터페이스는 appendix에 있다. | `specs/04-ui-motion.md` §7; `ui/detail-controls.md` D0, D1.3; `source:src/components/DocumentPreview.tsx` lines24-40; `source:src/components/item-source-highlights.mjs` interfaces; `source:src/components/source-highlights.mjs` PDF anchoring |
| CORE-14-C02 | pass | 선택 파일 전체 항목 highlight와 filter 독립성 및 file scope 분리가 model/projection과 UI wiring에 대응한다. | `specs/04-ui-motion.md` §7.1–7.3; `specs/05-dashboard-exports.md` D10; `source:src/components/file-review-model.mjs` line35; `source:src/components/dashboard-file-scope.mjs` lines4,21; `source:src/components/FileReviewResults.tsx` line49 |
| CORE-14-C03 | pass | missing 판정에 가짜 대상 좌표를 붙이지 않는 projection과 실제 criterion label/rule/unit cell 결합이 구현돼 있다. | `specs/03-algorithms.md` §6 line182; `ui/detail-controls.md` D1.3; `source:src/components/item-source-highlights.mjs` lines4,12; `source:src/components/criterion-preview-evidence.mjs` line19; `source:src/components/item-source-highlights.test.mjs` missing evidence cases |
| CORE-14-C04 | fail | 범용 quote/location rejection은 spreadsheet 구현보다 강하다. PDF witness 보호와 달리 tableHighlightIndex는 valid coordinate를 quote 대조 없이 우선하고 coordinate-free quote도 item-row witness가 없다. | `specs/04-ui-motion.md` §7.4; `ui/detail-controls.md` D1.3 coordinate-first table behavior; `decomposition/core-modules.json` CORE-14-C04; `source:src/components/DocumentPreview.tsx` tableHighlightIndex lines404-432; `source:src/components/source-highlights.mjs` PDF witness protections |
| CORE-14-C05 | fail | 모집단은 runId guard를 요구하지만 실제 bridge와 D07은 source/origin/channel/type/random per-preview token/item allowlist를 검증한다. runId가 없다는 것은 확인되나 취약점 증명은 아니며 모집단 출처 수정이 필요하다. | `decomposition/core-modules.json` CORE-14-C05; `specs/05-dashboard-exports.md` D07; `source:src/components/dashboard-bridge.mjs` readEvidenceSelection line47; `source:server/dashboard-bridge.test.mjs` bridge security cases |

### CORE-15

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-15-C01 | pass | activity task/event identity와 parent/handoff 검증, run SSE sequence 대 activity snapshot revision 차이, 비밀/명령 정제 길이가 실제 표현과 맞는다. | `specs/01-state-api.md` §6, §8; `specs/02-backend-pipeline.md` §2.9; `contracts/types.ts` ActivityTask / ActivityEvent / ActivitySnapshot; `source:integrations/src/activity.mjs` sanitizeActivity / createActivityStore; `source:integrations/src/command-progress.mjs` commandProgressLine; `source:server/activity.mjs` SSE store.revision |
| CORE-15-C02 | pass | Gemini/E2B 별도 process-wide2 pending100, engine별 ModelQueue2, retained sandbox command1은 각 자원 수명과 구현에 맞게 분리된다. | `specs/02-backend-pipeline.md` §2.8; `source:integrations/src/gemini.mjs` requests TaskPool(2); `source:integrations/src/sandbox.mjs` sandboxes TaskPool(2); `source:integrations/src/task-pool.mjs` maxPending100 / FIFO; `source:server/review.mjs` ModelQueue; `source:server/sandbox-documents.mjs` retained document command queue |
| CORE-15-C03 | pass | queued/running/terminal 보존, 대기 취소와 늦은 event 차단, bounded GET 후 snapshot SSE 및 backoff 재연결 순서가 실제 observer와 일치한다. | `specs/01-state-api.md` §8; `specs/04-ui-motion.md` §4.1 observer; `source:integrations/src/activity.mjs` terminal guard; `source:integrations/src/task-pool.mjs` waiting abort removal; `source:src/activity-observer.mjs` connect / accept / onerror / dispose; `source:server/activity-observer.test.mjs` reconnect/quiet/deadline/disposal cases |
| CORE-15-C04 | pass | heartbeat는 다음 실제 프로세스 응답 대기로 표시되고 stdout allowlist·중복 제한·scope 필터·취소 후 callback 무시는 실제 구현과 일치한다. | `specs/02-backend-pipeline.md` §2.9; `specs/04-ui-motion.md` §4 activity/handoff; `source:integrations/src/command-progress.mjs` runObservedCommand heartbeat / dedup / finish; `source:src/activity-scope.mjs` matchesActivityRun / matchesActivityContext; `source:server/command-progress.test.mjs` quiet heartbeat; duplicate; cancellation cases; `source:server/activity-scope.test.mjs` run/context isolation |
| CORE-15-C05 | pass | 시간순 실제 handoff 큐와 8개 cap·1400ms hold, 800ms 자동접힘 조건 및 reduced-motion 큐 정리는 데이터 상태 변경과 분리되어 있다. | `specs/04-ui-motion.md` §4.2, §4.3, §9; `source:src/handoff-queue.mjs` createHandoffQueue; `source:src/components/SandboxWorkroomScene.tsx` queue / playback timers / reduced motion effects; `source:src/components/SandboxActivityDock.tsx` autoCollapse effect lines312-315; `source:server/handoff-queue.test.mjs` chronological order / duplicate / omission / reset cases |

### CORE-16

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-16-C01 | pass | 11열 CSV/XLSX, JSON fields, XLSX 4시트와 items가 있는 completed/partial/failed export 조건은 구현과 일치한다. | `specs/05a-ledger-export.md` §7.1–7.4; `specs/01-state-api.md` §10; `source:server/app.mjs` lines30-39,120-150; `source:server/app.test.mjs` lines34-68 |
| CORE-16-C02 | pass | 실제 header/key/row 탐색 후 허용된 2셀만 OOXML 복사본에 쓰고 원본 및 나머지 ZIP contents를 보존한다. | `specs/05a-ledger-export.md` §3, §5; `source:server/ledger.mjs` lines99-193; `source:server/ledger.test.mjs` lines36-66,96-126 |
| CORE-16-C03 | fail | 01 §9/§10은 모든 human override가 fingerprint를 무효화한다고 과장한다. 실제 proposal hash에는 humanNote/reviewedByHuman/audit가 없어 동일 status 확인·사유 변경만으로는 바뀌지 않는다. | `specs/01-state-api.md` §9 line213, §10 line232; `specs/05a-ledger-export.md` §2.3, §4; `source:server/ledger.mjs` ledgerProposal lines196-207; `source:server/review.mjs` resolve lines693-702 |
| CORE-16-C04 | pass | CSV formula 방어, 대장 formula/structure/incomplete 보호, sample path allowlist와 rollback은 실제 제한을 기술한다. | `specs/05a-ledger-export.md` §3.1–3.2, §4–5, §7.3; `specs/01-state-api.md` §4.1; `source:server/app.mjs` csvCell lines30-33; samples81-92; `source:server/ledger.mjs` lines24-59,135-142,196-207; `source:server/golden-catalog.mjs` lines37-52,59-71; `source:server/golden-catalog.test.mjs` negative path cases |
| CORE-16-C05 | pass | catalog는 허용된 원본만 선택하며 정답 JSON/filename 판정을 사용하지 않는다. 별도 generalization gate는 추가 검증으로 구분돼 있다. | `specs/01-state-api.md` §4.1; `DECISIONS.md` D14; `PLAN.md` M8; `source:server/golden-catalog.mjs` lines5-6,37-52,63-66; `source:server/golden-catalog.test.mjs` lines8-23; `source:server/review.mjs` SYSTEM line24; target applicability prompt537 |

### CORE-17

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-17-C01 | fail | D01은 15개 필드라 하지만 generation schema/default와 원본 DASHBOARD_PLAN_SCHEMA는 14개다. snapshot freeze/legacy defaults/ready DTO는 일치한다. | `specs/05-dashboard-exports.md` D01 line21; `contracts/dashboard-design.schema.json` properties / required; `contracts/dashboard-design.default.json` 14 fields; `source:server/dashboard-plan.mjs` lines3-21,43-58; `source:server/dashboard.mjs` snapshotRun lines62-110; ready265-272,297-301 |
| CORE-17-C02 | fail | 명시 preference override가 정확한 모델 계획도 덮을 수 있다: dark page+light blue charts는 theme light, 전체 파이+파일별 막대는 distribution bar가 된다. 독립 의미 범위를 항상 보장한다는 계약과 충돌한다. | `specs/05-dashboard-exports.md` D05, D11; `prompts/dashboard-system.md` independent dimensions / chart-only brightness; `prompts/dashboard-loop.md` preference override contract; `reference/dashboard/design-functions.reference.mjs` applyDashboardPreferences; `source:server/dashboard-plan.mjs` applyDashboardPreferences lines71-73,81-82,90 |
| CORE-17-C03 | pass | parse/validation repair의 전체 3호출 예산, retained E2B 1회 설치, diagnostic 전달, cleanup·abort·표준 fallback 상태가 실제 루프와 같다. | `specs/05-dashboard-exports.md` D03–D04; `prompts/dashboard-loop.md` loop and fallback; `source:server/dashboard.mjs` lines174-261,318-349; `source:server/dashboard.test.mjs` lines91-199,257-310 |
| CORE-17-C04 | pass | immutable snapshot·plan allowlist·길이 제한 및 route 검증과 fallback의 표준 결과 표기가 실제로 구현돼 있다. | `specs/05-dashboard-exports.md` D02–D05; `prompts/dashboard-loop.md` strict plan and fallback; `source:server/dashboard.mjs` lines62-110,279-291,322-335; `source:server/dashboard-plan.mjs` parse lines43-58; `source:server/dashboard-plan.test.mjs` lines8-17,65-72 |
| CORE-17-C05 | pass | 대표 조합의 계획/렌더 검증 방법과 실제 서비스 증거의 분리가 정확하다. stub 결과를 실제 모델 의미 이해 성공으로 주장하지 않는다. | `specs/05-dashboard-exports.md` D06, D08, D11; `contracts/dashboard-examples.json` composed/refinement examples; `prompts/dashboard-loop.md` model preservation versus deterministic fallback; `source:server/dashboard-plan.test.mjs` lines31-43,54-63; `source:server/dashboard.test.mjs` lines297-310 |

### CORE-18

| 질문 | 판정 | 이유 | 증거 |
|---|---|---|---|
| CORE-18-C01 | pass | design 정규화→root/CSS/chart/HTML와 mount/update/destroy/inspect는 신뢰 renderer 코드의 실제 계약이다. | `specs/05-dashboard-exports.md` D05–D07; `contracts/dashboard-design.schema.json` design fields; `source:server/dashboard-fallback.mjs` lines38-56,129-137,203-244; `source:scripts/dashboard-chart-entry.jsx` lines12-68 |
| CORE-18-C02 | pass | snapshot 수치/ID 유지, 파일·필터·상세 및 실제 차트 type/palette 옵션이 renderer와 DOM/data validator에 대응한다. | `specs/05-dashboard-exports.md` D02, D05–D08; `source:server/dashboard-fallback.mjs` lines61-87,159-211; `source:server/dashboard-fallback.test.mjs` lines81-115,137-152,205-229; `source:server/dashboard-plan-validation.mjs` lines217-375 |
| CORE-18-C03 | pass | 초기 선택·detail/focus·차트 강조 CSS·reduced motion 및 React root cleanup을 별도로 정의하며 실제 구현과 같다. | `specs/05-dashboard-exports.md` D05–D07, D09; `source:server/dashboard-fallback.mjs` lines113-126,159-225; `source:scripts/dashboard-chart-entry.jsx` lines12-59; `source:server/dashboard-fallback.test.mjs` lines117-211 |
| CORE-18-C04 | pass | CSP nonce/escaping/offline 조건, iframe bridge와 HTML bytes/report 대조가 구현돼 있어 단순 exit0 승인과 다르다. | `specs/05-dashboard-exports.md` D04, D07–D08; `source:server/dashboard-fallback.mjs` lines10-11,221-236; `source:server/dashboard-chart-runtime.mjs` lines4-6; `source:server/dashboard.mjs` lines236-240; `source:server/dashboard-plan-validation.mjs` lines127-214; `source:src/components/dashboard-bridge.mjs` lines22-50; `source:src/components/DashboardModal.tsx` iframe lines215-216; `source:server/dashboard.test.mjs` tamper lines168-179 |
| CORE-18-C05 | pass | 11 DOM/data checks와 실제 canvas/offline Chromium/geometry/motion QA를 분리한다. fake report/jsdom adapter는 실제 브라우저 통과 증거로 쓰이지 않는다. | `specs/05-dashboard-exports.md` D08, D11; `validation/dashboard-dom-validator.cjs` 11-check report; `source:server/dashboard-plan-validation.mjs` lines1-49,127-214; `source:server/dashboard-plan-validation.test.mjs` lines49-99; `source:scripts/dashboard-chart-entry.jsx` inspect lines37-45 |

## 수정이 필요한 이슈

모두 open이며 resolution/recheckedBy는 null이다. 추가 acceptance로 분리하는 결정은 원본의 실제 보장과 새 목표를 명시적으로 구분해야 하며 질문 삭제·미검토의 pass 전환을 뜻하지 않는다.

### R1-CORE-001 — CORE-01 / medium

- 질문: CORE-01-C02, CORE-01-C04
- 문서: `specs/02-backend-pipeline.md` §2.1, §2.8
- 문제: 공통 Gemini adapter의 요청/응답·에러·token 계약이 없다. source gemini.mjs는 prompt/contents, role, schema, systemInstruction, optional validate, text/data/model/usage, default2048 및 1..32768을 갖고 errors.mjs는 safeError 매핑을 갖는다.
- 가능한 해석: 단계별 prompt 표만 보고 서로 다른 공통 adapter API를 구현한다. / 원본 wrapper의 interface/limits/errors를 별도 계약으로 구현한다.
- 필요한 결정: generateText/generateJson(+사용 시 streamText) interface와 오류 code/status 매핑을 추가하고 blank/JSON/validate/token 실패를 정의한다. adapter 자체에는 generic response bytes/file-part cap이 없으며 각 단계 cap과 구별한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-002 — CORE-02 / low

- 질문: CORE-02-C05
- 문서: `environment/README.md` 앱 구현 이후 실행 명령
- 문제: 포트와 dist는 정확하지만 server/index.mjs의 SIGINT/SIGTERM→모든 retained run cancel→server.close→exit0 경로 및 재현 기대값이 빠졌다.
- 가능한 해석: 개발 child 종료만 구현한다. / API 프로세스 signal handler와 in-flight run cancellation도 구현한다.
- 필요한 결정: 현재 signal별 종료 책임과 검증 절차/기대 응답을 명시한다. 실제 프로세스 cleanup 완료를 입증하지 않은 항목을 이미 실행한 테스트로 표시하지 않는다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-003 — CORE-03 / medium

- 질문: CORE-03-C04
- 문서: `specs/02-backend-pipeline.md` §2.2 ZIP
- 문제: local/central ZIP 크기 일치라는 주장이 documents.mjs:108-126보다 강하다. local name/method와 central bounds 및 actual inflate length를 검사하지만 local size fields는 비교하지 않는다. local uncompressed size=1 변조 ZIP은 메모리 실험에서 수용됐다.
- 가능한 해석: 현재 parser의 실제 검사만 재현한다. / local size field까지 비교하는 강화 검사를 baseline으로 구현한다.
- 필요한 결정: 실제 local 이름/method·central bounds·inflate versus central size 검사로 고치거나 local size 비교를 추가 acceptance로 명시한다. 예약 전 <100, 성공 후 <=100 문서 경계를 명확히 한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-004 — CORE-03 / medium

- 질문: CORE-03-C05
- 문서: `specs/02-backend-pipeline.md` §2.2 XLSX/PDF
- 문제: drawing 생략은 미지원 XML 조건부가 아니라 모든 /drawing 관계에 적용된다. 또 3000자 단일 셀은 원본 preview에서 2000자로 줄고 public preview.truncated=false이므로 잘림 표시가 완전하지 않다.
- 가능한 해석: 지원 drawing은 local preview에 보존하고 모든 clipping에 truncated=true를 낸다. / 현재 모든 drawing 관계 제거와 per-cell clipping flag 한계를 재현한다.
- 필요한 결정: 두 baseline 제한을 명시한다. 모든 clipping에 truncated=true를 요구하려면 추가 구현 목표로 구분한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-005 — CORE-04 / medium

- 질문: CORE-04-C04
- 문서: `specs/02-backend-pipeline.md` §2.3 하드/부분 한도
- 문제: 숫자는 맞지만 cap→partial/truncated 일괄 설명이 hard/unsupported와 embedded incomplete를 혼동한다. standalone >40MP는 unsupported이며 source/archive hard cap은 예외다.
- 가능한 해석: 모든 cap은 partial+truncated를 돌려준다. / cap 종류별 hard error/unsupported/partial/incomplete 결과가 다르다.
- 필요한 결정: 한도별 실제 outcome 표를 작성하고 standalone 원본 이미지와 embedded thumbnail을 구분한다. complete=false와 truncated=true가 동치가 아님을 명시한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-006 — CORE-04 / medium

- 질문: CORE-04-C05
- 문서: `decomposition/core-modules.json` CORE-04-C05 / specs02 §2.3
- 문제: 고정 reader 코드 경계는 확인했지만 요구된 malicious archive/macro/external-link 실행 음성 fixture가 지정 Python suite에서 확인되지 않는다. sparse/formula/selector 테스트는 그 범위를 모두 증명하지 않는다.
- 가능한 해석: 기존 named suite가 모든 위협 fixture를 검증했다고 간주한다. / 코드 경계 확인과 아직 수행할 fixture acceptance를 분리한다.
- 필요한 결정: 해당 기존 fixture를 정확히 식별하거나 미검증 사례를 추가 acceptance로 명시하고 향후 실행 gate에 남긴다. 이미 통과한 원본 test로 주장하지 않는다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-007 — CORE-05 / medium

- 질문: CORE-05-C05
- 문서: `decomposition/core-modules.json` CORE-05-C05 / specs02 §2.5
- 문제: 실제 nested DOCX reader와 행/열 semantic orientation fixture 증거가 지정 suite에 없다. synthetic flat block은 중첩 Word reader 검증이 아니다.
- 가능한 해석: flat block case가 nested Word 전체 reader를 증명한다. / nested reader와 semantic orientation은 별도 검증이다.
- 필요한 결정: 구체적 fixture/expectation을 식별하거나 추가 acceptance로 구분하고 미실행 상태를 유지한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-008 — CORE-06 / medium

- 질문: CORE-06-C03
- 문서: `specs/02-backend-pipeline.md` §2.6 status / 31페이지 예시
- 문제: page cap이면 무조건 limited라는 설명과 달리 no_progress/round_limit가 page_limit보다 우선한다. expected31+지속 page1 issue는 needs_review/no_progress, attempts2, missingPages31이다.
- 가능한 해석: 31페이지면 항상 limited/page_limit다. / 더 먼저 성립한 미해결 교정 중지 사유가 상태를 정한다.
- 필요한 결정: 실제 stopReason 우선순위를 문서화하고 31페이지 예시를 다른 미해결 issue가 없는 경우로 한정한다. 다른 정책이면 추가 목표로 표시한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-009 — CORE-06 / medium

- 질문: CORE-06-C05
- 문서: `decomposition/core-modules.json` CORE-06-C05 / prompts source binding
- 문제: invented/blank/nested tests는 있으나 두 문서 혼합 negative fixture는 확인되지 않는다. within-document page isolation만으로 문서간 source isolation 검증을 주장할 수 없다.
- 가능한 해석: 한 문서 페이지 필터링이 문서간 분리도 입증한다. / 두 문서 원본을 이용한 별도 negative test가 필요하다.
- 필요한 결정: 기존 두 문서 fixture를 식별하거나 추가 acceptance로 남긴다. 실제 production leak으로 단정하지 않는다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-010 — CORE-07 / medium

- 질문: CORE-07-C02
- 문서: `specs/03-algorithms.md` §13.1 line340
- 문제: 자동 not_criteria 제외 요건이 source의 optional metadata 처리보다 엄격하다. sourceTruncated/truncated/visualPending가 생략돼도 허용, 숫자 둘 다 finite일 때만 count 비교, missingContextSheets 생략도 허용한다.
- 가능한 해석: false/count/list를 모두 명시하지 않으면 제외 불가다. / 필수 complete true와 optional-safe 부정 검사를 구분한다.
- 필요한 결정: criteria-eligibility.completeAnalysis의 정확한 ===true/!==true/finite-guard/optional-length predicates를 적는다. 강화 요건은 추가 acceptance로 구분한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-011 — CORE-07 / medium

- 질문: CORE-07-C04
- 문서: `specs/03-algorithms.md` §13.1 line338
- 문제: same-row quote full-string equality 주장은 실제 normalized substring(+comment) citation 검사보다 엄격하다.
- 가능한 해석: 선택한 모든 셀 텍스트와 정확히 같아야 한다. / 정규화된 실제 셀/comment 문자열의 부분 인용을 허용한다.
- 필요한 결정: 현재 substring/숫자 경계/comment 정책을 정확히 기술하거나 full equality를 신규 목표로 표시한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-012 — CORE-07 / medium

- 질문: CORE-07-C05
- 문서: `decomposition/core-modules.json` CORE-07-C05 / specs03 §13.1, §14
- 문제: 명시 정성 legal/business 분류 fixture→기대값 매핑이 검증되지 않았다. 표준/혼합/기록/injection 시험만으로 요구된 domain 사례를 모두 충족했다고 할 수 없다.
- 가능한 해석: 기존 유사 fixture로 모든 정성 domain 사례를 대체한다. / 구체적 사례의 기대값을 독립 검증한다.
- 필요한 결정: 기존 fixture를 매핑하거나 추가 acceptance로 정의하고 실행 전 통과로 기록하지 않는다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-013 — CORE-08 / high

- 질문: CORE-08-C03
- 문서: `specs/03-algorithms.md` §11.1
- 문제: 기존 문서 분석 sandbox가 있으면 재사용한다는 주장이 별도 sandboxRunner lifetime인 discovery와 다르며 02 §2.8의 올바른 설명과 충돌한다.
- 가능한 해석: 분석→discovery 동안 하나의 물리 sandbox를 계속 유지한다. / discovery는 별도 세션, discovery rounds만 재사용하고 criteriaInventory만 이전 분석에서 가져온다.
- 필요한 결정: 기존 분석 sandbox 재사용 문장을 제거하고 inventory reuse와 별도 discovery lifetime을 명시한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-014 — CORE-09 / high

- 질문: CORE-09-C02
- 문서: `specs/03-algorithms.md` §3.3 line96
- 문제: same-evidence-row 조건 복구는 evidenceCells가 있는 경우에만 적용된다. generic validateCriteria가 sourceEvidence만 남기면 같은 label인 여러 행의 조건이 합쳐질 수 있다.
- 가능한 해석: sourceEvidence만으로도 정확히 같은 row 조건만 복구한다. / evidenceCells가 없으면 label/document 기반으로 여러 row를 후보로 삼는다.
- 필요한 결정: baseline의 evidenceCells 의존과 sourceEvidence-only 한계를 명시하고 엄격 row-source 보장은 추가 acceptance로 분리한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-015 — CORE-09 / medium

- 질문: CORE-09-C04
- 문서: `decomposition/core-modules.json` CORE-09-C04 / specs03 §2
- 문제: 질문은 모든 ungrounded hierarchy와 invalid comparison이 confirmation으로 남는다고 요구하나 generic validateCriteria는 nonempty path를 resolved로 지정하고 invalid comparison을 버리면서 needsConfirmation=false 유지가 가능하다.
- 가능한 해석: generic shape validator도 grounded discovery 수준의 의미 보증을 한다. / generic validation/discovery grounding/approval guards가 서로 다른 보증을 한다.
- 필요한 결정: 세 경로의 실제 보증을 명시하고 강한 동작은 추가 acceptance로 구분한다. 모집단의 baseline/추가 목표 해석을 기록한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-016 — CORE-12 / medium

- 질문: CORE-12-C02
- 문서: `specs/03-algorithms.md` §6 line174
- 문제: 확인된 누락 fail에 optional sourceTruncated/needsConfirmation의 explicit false를 요구한다는 설명이 source truthiness 검사와 다르다. omitted flags 입력에서도 실제 source evidence와 complete:true면 fail 가능하다.
- 가능한 해석: optional flags가 없으면 항상 review다. / 필수 complete:true 및 각 optional flag의 실제 부정 검사로 판단한다.
- 필요한 결정: missing-result.inspectedCompletely의 정확한 optional flag predicates와 시각문서의 더 강한 별도 조건을 적는다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-017 — CORE-14 / high

- 질문: CORE-14-C04
- 문서: `specs/04-ui-motion.md` §7.4 / ui/detail-controls.md D1.3
- 문제: 범용 quote/location/wrong-row rejection은 실제 spreadsheet/text highlight보다 강하다. tableHighlightIndex는 valid coordinate를 quote 대조 없이 우선하며 quote-only도 item-row witness를 검사하지 않는다.
- 가능한 해석: PDF witness protection이 모든 포맷에 동일하게 적용된다. / PDF와 spreadsheet/text의 실제 highlight 검증 범위가 다르다.
- 필요한 결정: PDF 보호와 표/텍스트 coordinate-first 한계를 분리한다. 강한 표/텍스트 보호는 신규 acceptance로 명시한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-018 — CORE-14 / medium

- 질문: CORE-14-C05
- 문서: `decomposition/core-modules.json` CORE-14-C05 / specs05 D07
- 문제: 모집단은 runId 검사를 요구하지만 실제 bridge는 source/origin/channel/type/random preview token/item allowlist를 검증하며 runId 필드가 없다. 문서 D07 자체는 실제와 맞다.
- 가능한 해석: runId를 반드시 protocol에 추가해야 한다. / 현재 preview-token isolation을 명시적으로 평가한다.
- 필요한 결정: 질문을 실제 token 기반 보안 계약으로 교정할 경우 모집단 변경 이유/보호 범위 동등성을 기록한다. 단순 삭제나 취약점 단정은 피한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-019 — CORE-16 / medium

- 질문: CORE-16-C03
- 문서: `specs/01-state-api.md` §9 line213 / §10 line232
- 문제: 모든 human override가 ledger fingerprint를 무효화한다는 설명은 틀리다. fingerprint는 result/note/counts/source ID/name/incomplete만 포함하고 humanNote/reviewedByHuman/audit는 제외하므로 같은 판정 확인은 유지된다.
- 가능한 해석: 모든 사람 수정은 재확인을 요구한다. / 제안 직렬화 내용이 바뀐 경우만 fingerprint mismatch409다.
- 필요한 결정: 대장 proposal 내용이 달라질 때만409라고 좁히고 동일 status/사유 변경의 한계를 적는다. 강한 규칙은 추가 구현 목표다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-020 — CORE-17 / low

- 질문: CORE-17-C01
- 문서: `specs/05-dashboard-exports.md` D01 line21
- 문제: 15개 필드라는 설명이 실제 schema/default/DASHBOARD_PLAN_SCHEMA의 14개와 충돌한다.
- 가능한 해석: 15번째 필드가 누락됐다. / 설명의 필드 수가 오기다.
- 필요한 결정: 15개를14개로 고친다. schema 자체는 $schema 제외 source와 일치한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-021 — CORE-17 / medium

- 질문: CORE-17-C02
- 문서: `specs/05-dashboard-exports.md` D05,D11 / prompts/dashboard-system.md / prompts/dashboard-loop.md
- 문제: 명시 preference override가 semantic scope를 오해한다. dark page+light blue charts는 theme=light; 전체 파이+파일별 막대는 distribution=bar,fileVisualization=bars. 정확한 모델 결과도 이 override로 바뀔 수 있다.
- 가능한 해석: 원본의 단순 last-positive matcher를 그대로 재현한다. / 독립 semantic dimensions를 항상 보장하도록 개선한다.
- 필요한 결정: 현재 두 반례를 baseline 한계로 공개하고 더 넓은 의미 분리를 추가 acceptance로 분리하거나 참조 계약을 수정한다. baseDesign 보존이 모델 instruction이라는 기존 구분은 유지한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-022 — CORE-09 / medium

- 질문: 추가 발견한 정확성 오류
- 문서: `prompts/pipeline-prompts.md` XLSX 기준에 추가 지시 적용 row
- 문제: overlay 호출 token 표는32768이지만 source server/review.mjs:440 criterionCall의 실제 maxOutputTokens는8000이다.
- 가능한 해석: overlay도 일반 criteria extraction처럼32768을 쓴다. / overlay는8000이고 비-XLSX/자연어 criteria extraction은32768이다.
- 필요한 결정: overlay token을8000으로 수정하고 두 호출을 구분한다.
- 해결/재검토: 미해결 / 없음

### R1-CORE-023 — CORE-09 / medium

- 질문: 추가 발견한 정확성 오류
- 문서: `specs/03-algorithms.md` §1 line18
- 문제: 모든 정규화 반환이 안전한 복사라는 전역 주장이 source와 다르다. preserveSourceConditions는 입력 criterion들을 mutate하며 normalizeHandlingCriteria는 substantive candidate의 rule/handlingNotes를 변경한다.
- 가능한 해석: 모든 normalization port는 immutable pure copy다. / 일부 port는 mutable draft를 갱신하고 승인 시점에만 deep freeze한다.
- 필요한 결정: 함수별 mutation/clone 책임을 적고 전역 safe-copy 보장을 제거하거나 신규 구현 목표라고 표시한다.
- 해결/재검토: 미해결 / 없음

두 번째 회차는 수정 파일을 다시 읽고 같은 질문 ID의 판정을 새 입력 hash로 기록해야 한다. 이 회차의 pass를 변경된 파일에 그대로 이월하지 않는다.


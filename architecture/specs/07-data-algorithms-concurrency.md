# 07. 자료구조·알고리즘·비동기 실행·효율 계약

이 문서는 기능 명세 01–06을 대체하지 않는다. 같은 결과와 모션을 재현하는 데 필요한 **저장 구조, 계산 순서, 자원 소유권, 동시성, 중단, 상한**을 고정한다. 기계 판독 목록은 [efficiency-inventory.json](../contracts/efficiency-inventory.json)이다. 원본 경로는 감사용 출처이며 새 프로젝트의 런타임 의존성이 아니다.

표기의 의미: **구현됨**은 고정 원본에서 관찰한 사실, **분석**은 명시한 변수와 전제에서 도출한 계산량, **추가 검증**은 재구현에서 실행해야 하는 시험, **향후 개선**은 현재 제품에 이미 있다는 뜻이 아니다. 이 문서에는 측정하지 않은 FPS·처리시간·메모리 절감 수치를 사용하지 않는다. 빠르게 보이는 연출이 원문 읽기나 판정 완료를 대신해서는 안 된다.

## 7.1 계산량의 공통 변수와 불변식

| 기호 | 의미 |
|---|---|
| B | 원본 압축 파일 바이트 수. Base64는 대략 4/3배지만 JS 문자열·객체·파서 메모리는 별도다. |
| N, S, R, M | 실제 저장/비어 있지 않은 셀 수, 시트 수, 실제 레코드/행 수, 문서에서 주장한 구조 구역 수 |
| C, I, E, F | 기준 수, 판정 항목 수, 항목당 근거 수, 독립 추출 필드 수 |
| L, T, Q | 문자열 길이, 현재 관측 작업 수, 대기 작업 수 |
| P, K | 시각 페이지 수, 모델 맥락 구간 수 |
| H, D, U | 검증할 헤더 인용 수, 결과 문서 수, 한 번의 UI reducer에 추가하는 항목 수 |
| e, ℓ | semantic dedup의 후보마다 추가되는 고유 근거 수, 각 근거 JSON 문자열 길이(해당 최악 사례에서는 일정하다고 가정) |
| q, V | 한 번의 상세 조회에서 선택한 range 수(q≤18), handoff 정렬 시점의 임시 pending 크기(V≤9; overflow 제거 뒤에는≤8) |

Map/Set 조회의 기대 평균 O(1)은 JavaScript 엔진의 일반적인 해시 자료구조 가정이다. 문자열 키 만들기·정규화·JSON.stringify·SHA256 비용은 O(해당 입력 길이)로 따로 센다. 네트워크, LLM 추론, 패키지 설치와 라이브러리 내부 ZIP/XML/PDF 파싱 비용을 애플리케이션의 O(1)로 숨기지 않는다. 모든 판단의 식별자는 파일명 대신 documentId/runId/criterionId/itemId이며, 셀 식별자는 시트까지 포함한다. 서로 다른 파일/시트/시료의 같은 항목명을 같은 결과로 합치지 않는다.

## 7.2 수명과 소유권을 갖는 자료구조

| 구조 / 실제 위치 | 키·값 / 선택 이유 | 수명·상한·무효화 |
|---|---|---|
| DocumentStore `Map` (`server/documents.mjs`) | UUID → 원본 Buffer, kind/role/mime, modelParts, preview, 디지털 검증 자료. 파일명 충돌을 허용한다. | 프로세스 메모리. 파일 20 MiB, 보관 100개, 누적 원본 250 MiB. 예약 byte/pending count를 파싱 **전** 증가하고 실패 시 반환한다. delete 시 원본 byte 차감. TTL/디스크 영속성 없음. 이 상한은 Buffer만의 상한이며 파서/인코딩/복제까지 250 MiB라는 뜻이 아니다. |
| ReviewEngine `runs: Map` (`server/review.mjs`) | runId → 기준/결과/분석/audit/events/listeners/controller. 삽입 순서 보존. | start는 **새 run 삽입 전** open 상태 running/awaiting_confirmation/awaiting_documents가 이미 3개면 reject한다. 통과 후 새 run을 Map에 넣고, **삽입 후** total>40인 동안 삽입 순서로 만나는 non-open 기록을 삭제한다. 이 pruning 뒤 run.started를 emit하고 perform을 시작한다. 예: 기존 40개에서 새 run 삽입으로 잠시 41개가 된 뒤 종료 기록 1개를 제거해 40개가 된다. terminal 40개와 active 3개를 별도 보관하는 계약이 아니다. |
| 분석 캐시 (`ReviewEngine.analyzeOne`) | 문서의 `sandboxAnalysisResult` → analyzedDocument. 내부에 `analysis`, `modelParts`, `sandboxProfile`, `sourceSheets`, `sourceRows`, `verificationPages`, `pdfPageImages`, `activityContext`와 시각 문서의 transcription을 보유한다. 현재 batch는 Map<documentId, analyzedDocument>로 연결한다. | 성공한 complete/partial 결과를 원본 문서에 저장한다. 새 analyzedDocument를 만들 때 이전 sandboxAnalysisResult/analysisPromise를 제외하여 연결된 캐시 사슬을 방지한다. ensureAnalyzed는 결과를 재사용하지만 analyzeOne 직접 호출은 새 분석한다. content-addressed TTL/파서버전 캐시는 없다. |
| 진행 중 분석 `analysisPromise` (`ReviewEngine.ensureAnalyzed`) | document object의 진행 Promise 하나를 공유해 중복 분석 방지 | 첫 호출자의 signal이 소유 작업을 제어한다. 나중 호출자의 취소는 자신의 기다림만 중단한다. 저장된 결과가 있으면 재사용하고, 완료 뒤 진행 Promise를 제거한다. 소유자의 abort와 다른 대기자의 abort를 같은 전역 cancel로 취급하지 않는다. |
| 물리 샌드박스 `WeakMap` (`document-sandbox-resources.mjs`) | sandbox object → {id,kind,SHA256,source Promise,parsers Promise,query Promise}. source/upload/install/query 단일 준비를 공유한다. | 같은 실제 sandbox + 같은 id/kind/원본 digest만 허용. 다르면 throw. 종료 후 객체가 도달 불가능하면 GC 대상. 실패한 promise를 자동 reset/retry하지 않는다. 각 helper가 digest를 다시 계산하므로 hash는 O(B)다. host key나 sandbox object를 문서에 저장하지 않는다. |
| 기준 셀 `Map` (`criteria-sandbox.mjs`) | `sheet + U+0000 + cell` → 실제 text/formula/comment/merge record | 하나의 workbook discovery 호출 내 누적. 다음 round에서 같은 셀 reread 결과로 덮어쓴다. 문서 간 공유하지 않는다. 병합 continuation은 독립 기준이 아니다. |
| 기준 탐색 `used:Set`, `examinedRanges:Array`, `regionAssessments:Map` | used=`sheet!normalizedRange`; examined은 실제 반환 complete/cellsRead; assessment key는 inventory region.id | 2회 탐색 내 유지. used는 같은 rectangle 중복 방지이지 겹친 좌표 전체의 합집합이 아니다. repeat repair도 area budget을 다시 소비한다. “선택했음”과 “전부 읽음/전부 추출됨”을 분리한다. |
| 기준 후보 `proposals:Array`, dispositions:Array | 후보는 proposalKey, 교체는 replacesIndex+동일 source anchor 또는 이전 invalid+동일 label 확인. disposition identity는 kind+정렬된 target 셀들 | findIndex로 이전 후보를 찾아 수정한다. 무조건 새로 append하지 않는다. 양쪽 동일 label만으로 source identity를 바꾸지 않는다. 후보 250개가 기준 acceptance 상한이지 중간 배열의 모든 append가 즉시 250에서 중단된다는 뜻은 아니다. |
| semantic dedup `Map` (`criteria-context.mjs`) | 정렬된 document IDs + 정규화 label + 비교식(operator,value,upper) 또는 rule + unit + scope + categoryPath + sampleName + 정렬 중복제거 conditions + required | 한 정규화 호출. 첫 후보 의미를 유지하고 근거를 병합, confirmation 플래그는 OR. 자료 경로/조건/문서가 다른 후보는 별도. 같은 수치라는 이유만으로 합치지 않는다. |
| source record/coverage 인덱스 (`table-records.mjs`) | sourceSheets → {sheet,row,label,cells:[header,cell,value]}[]; covered Set=`sheet!row` | 문서 검토 중 recordRows로 재사용. 명시 식별자 헤더가 있는 표만 record로 인식한다. 내부 빈 값은 `''`로 보존한다. 이미 있는 Map 인덱스가 아닌 find/some 스캔도 남아 있다. |
| 활동 저장소 (`integrations/src/activity.mjs`) | Map<taskId,Task> + Set<listener>; parentTaskId/waitingForTaskId 및 명시 handoff edge | 기본 terminal retention 목표20; unfinished가 많으면20초과 가능. task당 일반30/log12 각각 오래된 동일 종류부터 제거하며 omitted count를 남긴다. snapshot은 reverse+structuredClone. 이벤트 revision은 publication마다 증가한다. |
| run.events/run.analysisActivity/audit | 배열; event sequence=`events.length+1`, structuredClone payload | 현재 run별 hard cap 없음. 활동 저장소의20/30/12가 이 배열의 한도는 아니다. reconnect replay/감사 의미를 유지해야 하므로 임의로 이벤트를 버리는 최적화는 호환 수정이 아니다. |
| Dashboard jobs (`server/dashboard.mjs`) | Map<jobId,job> + active pointer. job은 immutable snapshot과 sourceItems, controller, design/html/logs | router당 active 1개, 다른 생성 요청409. jobs≥10일 때 가장 오래된 terminal 하나 제거. logs는 최신80. delete는 abort+Map remove; finally에서 자신이 active일 때만 해제. ready 결과는 생성 시점 스냅샷이다. |
| 고정 차트 runtime (`dashboard-chart-runtime.mjs`) | 프로세스 모듈 변수에 escaped runtime 문자열 | 처음 한 번 readFileSync 후 재사용. 파일 변경에 자동 invalidation 없음; 재시작/새 module instance가 필요. 원문 데이터나 사용자별 plan은 이 캐시에 넣지 않는다. |
| 검토대장 proposal fingerprint (`ledger.mjs`) | SHA256(JSON.stringify({result,note,counts,sourceDocumentId,sourceDocumentName,incomplete})) | export 직전 재계산, 불일치409. 원본 XLSX hash와 mapping 검증은 별도. 모든 humanNote/audit 변경을 직접 hash하는 것은 아니다. proposal에 실제 반영되지 않는 변경은 fingerprint도 그대로다. |

CSV/XLSX/PDF 미리보기와 원문 분석 결과의 상한은 다르다. 화면의 100×100 preview만 읽고 전체를 완료했다고 판단하지 않는다. public DTO에 원본 Buffer/base64/private profile을 포함하지 않는다. snapshot/structuredClone은 안전한 격리를 위해 필요하지만 비용은 크기에 비례한다.

## 7.3 원문을 전부 확인하되 유한하게 멈추는 읽기 알고리즘

### A. Sparse workbook inventory → 실제 범위 조회

1. 허용 형식/서명/ZIP 제한 검증 후 원본 바이트를 보존한다. workbook formula용/data_only용 두 인스턴스를 읽는다. 외부 링크/매크로/수식을 실행하지 않는다.
2. `max_row × max_column` 전체를 순회하지 않는다. `sheet._cells`에서 실제 저장된 의미 있는 셀을 고르고 좌표순 정렬한다. sheet state, 병합, hidden rows/columns, formulas/cache, comments, drawings inventory를 별도 보존한다.
3. workbook profile은 populated row를 인접 그룹으로 묶고, 각 row band 내 populated column을 인접 그룹으로 묶어 sparse region을 만든다. region의 최대24개 고른 sample은 **샘플**이며 원문 상세가 아니다.
4. LLM에게 전체 inventory의 각 region 분류/범위를 요청한다. 코드가 작은 inventory 영역을 보완하므로 모델이 “최고 표 하나”만 고른 것을 completeness 근거로 쓰지 않는다.
5. 모든 range를 실제 sheet명, A1 bounds, 면적, 횟수에 대조한다. sandbox의 고정 Python script만 실행하여 실제 셀을 회수한다. 모델 문자열은 command가 아니다.
6. 기준·단위·조건·분류 source citations를 실제 `sheet\0cell`에 대조한다. 정적 row/column 역할 검사와 numeric candidate 검사, region accounting, source context disposition 검사에서 남은 문제를 다시 LLM에 전달한다.
7. 미반영 후보/미확인 region/context/followUp을 다음 same-sandbox 조회 범위로 만든다. 한도에 닿으면 명시 partial/needsConfirmation과 remainingRanges를 남기고 HITL로 간다. “답이 나올 때까지 무한 반복”은 구현 목표가 아니다.

**분석:** 정렬 자체 O(N log N), sparse 저장 O(N). 실제 parser는 read_only streaming 모드가 아니며 두 workbook을 적재한다. profile의 row/column grouping도 정렬을 포함한다. detail reader는 각 range마다 해당 sheet 저장 셀을 정렬/스캔하므로 q개 범위에서 보수적으로 O(q·N log N), q≤18; 반환 셀 수6000 제한만으로 parse/scan CPU가6000에 한정되는 것은 아니다. 서식만 있는 매우 먼 셀은 직사각형 순회를 방지하지만 OOXML 로딩 비용까지 사라지지 않는다.

### B. 전체 문맥 검증 → 재조회 → 전체 대체

1. Reader profile SHA256/kind를 검증하고 source를 만들며 최대 1,200,000자를 150,000자씩(최대 8구간) 순차 해석한다. **각 모델 응답의 structure는 최대 160개**이며 161개면 validateDocumentContext가 응답을 거부한다. 실패 구간은 건너뛰되 contextSegmentsComplete=false와 warning을 남긴다. 유효한 구간의 structure는 합쳐지고, 최종 공개 analysis.structure에는 앞 1,000개를 저장한다. 이 최종 slice 자체에는 별도의 잘림 경고를 추가하는 분기가 없다.
2. `checkDocumentContext`가 실제 시트/행·셀·헤더·Word block/text line coverage를 비교한다. 이어 별도의 LLM 검증이 각150,000자 source segment와 proposed analysis를 대조한다. checked=true와 issues형식을 확인한다.
3. issues는 `code + normalized message` key로 중복 제거하여 최대80개. 구역 전체 구조와 정렬된 issue code+typed request를 stable-key JSON으로 만들고 SHA256 fingerprint를 계산한다.
4. issues0이면 verified. source_limit면 limited, 전회와 fingerprint동일이면 no-progress human review, 3회면 round limit. 모델이 자신의 요약에 동의했다는 이유만으로 완료하지 않는다.
5. 유효한 selector를 JSON-key Map으로 중복 제거하여 최대 8개 reread. 불완전 reread는 수정 성공으로 취급하지 않는다. LLM은 일부 patch가 아니라 **올바른 기존 구역을 보존한 전체 context**를 반환한다. repair 전체 응답도 같은 160-entry validator를 통과해야 한다. 초기 구간 합계는 160개를 넘을 수 있지만 repair가 그 크기를 그대로 수용한다는 보장은 없다.
6. validate 후 context 교체, contextSegmentsComplete=true로 다시 검사한다. 전체 대체 이후에도 static coverage/independent verification가 재실행된다. 일반적인 **비취소** 재조회/repair 실패는 보유 context와 issues를 needs_review 또는 limited로 반환한다. 반면 caller/session signal이 abort된 경우 catch에서 먼저 abort(signal)을 확인해 예외를 전파하므로 retained context 분석값을 반환하지 않는다. 문서 세션 deadline도 session signal을 abort하고 상위 analyzeDocumentInSandbox가 timeout 오류로 매핑한다. 모델 요청 자체의 실패와 세션/caller 취소를 같은 반환 경로로 취급하지 않는다.

**분석:** 텍스트 line coverage는 유효 구간을 시작점순으로 정렬한 뒤 source lines와 단일 포인터 sweep: O(M log M + L), O(M + L) (원문 line array 포함). 거대한 range를 모든 line의 Set으로 확장하지 않는다. workbook cell coverage는 H개 헤더의 cells.find와 N개 셀의 M개 region 비교가 있어 보수적으로 O(H·N + N·M); 문자열 대조 비용은 별도다. 임의 사각형을 interval tree로 조회하는 구현은 현재 없다. fingerprint/JSON 생성은 구조 및 issue 문자열 길이에 비례한다. 최대 모델 호출 수는 초기 K + 검증 3K + repair 최대 2; 실제로 early stop/오류/시간한도가 먼저 끝낼 수 있다. 이 수는 해당 문맥 단계만의 수이며 eligibility·criteria·review는 포함하지 않는다.

### C. PDF/이미지 전사와 독립 검증

P≤30 페이지를 요청당3개씩 순차 전사한다. 전체 시간180초, 요청당 최대60초의 bounded wrapper를 쓰고 기본 SDK HTTP timeout30초도 존재한다. 후보 page는 Map<pageNumber,page>로 보유한다. requestedPages 밖의 페이지/중복 ID/잘못된 table parent/셀 구조를 reject한다. 같은 페이지 repair는 전체 page를 교체하고 다른 페이지는 보존한다. 문서 전체 페이지 수·원문 디지털 text alignment 및 독립 VLM judge의 concrete issue를 합친다. 최대3round; content/issue 상태가 진전 없거나 time/output/page/확인 한도에 닿으면 멈춘다. 250,000자 전사 JSON 상한, 다음 추출 전달 직렬화는650,000자 상한이다. 모든30페이지가 항상180초 안에 처리된다는 보장은 없다.

일반 reader의 PDF inventory300페이지와 VLM30페이지는 서로 다른 상한이다. 31페이지 원본을 reader가 열었다고31페이지를 시각 검증했다고 표시하지 않는다. 개별 40MP 초과 standalone image는 unsupported일 수 있고, embedded image limit은 partial 처리될 수 있다. 모든 한도 초과를 동일 오류로 묶지 않는다.

## 7.4 기준 정리·매칭·판정의 계산 순서

| 알고리즘 | 입력 → 결정 / 필수 순서 | 분석상 비용과 범위 |
|---|---|---|
| row/column 역할 탐색 | 각 sheet를 두 orientation으로 나누고 line Map+정렬. 항목/기준/min/max/unit/condition header group을 찾는다. repeated block은 다음 item header/merged section에서 끝낸다. result/note 제외 역할이 충돌보다 우선한다. | tableLine 정렬 O(N log N); 모든 header group이 뒤쪽 line을 다시 볼 수 있어 보수적으로 O(N²). 현재 구현을 단순 O(N)이라고 명명하지 않는다. 후보1000개 상한과 실제 읽은 셀 한도는 별도다. |
| 비교식 parse | 원문 rule 보존 → 인정하는 numeric grammar만 비교식으로 변환 → 조건/단위 별도 보존. ND/uncached formula/불확실값을0으로 만들지 않는다. | 문자열 scan에 비례. 도메인별 label hard-code/파일명별 분기는 필요 없다. 정규식 구현의 모든 입력에 대한 선형시간 보장을 측정/증명한 것은 아니다. |
| source grounding | 후보별 정확한 label/rule/unit/condition/scope/hierarchy 인용과 좌표를 기록 Map에서 검사. 인접 sibling header를 잘못 상속하지 않는다. | 유효 citation 평균 Map 조회 O(1) + quote 문자열 비교비용. relation/coverage는 추가 scan; 전체 O(C)라고 단정하지 않는다. |
| context disposition | 폐기/대체/기록전용/외부참조 신호는 hint로 수집; 실제 원문+target+replacement citations가 검증된 disposition만 적용 | source signals 발견은 source×pattern 및 시트명 참조 scan. invalid disposition은 기준을 조용히 삭제하지 않고 unresolved를 만든다. |
| semantic dedup | §7.2의 의미 key로 첫 후보를 찾는다. 공통 근거 union은 evidenceCells/citations/sourceEvidence에서 만들고 evidenceCells/sourceEvidence에 저장한다. 별도 병합 allowlist는 hierarchyEvidence, hierarchyCitations, unitCitations, conditionCitations, scopeCitations, sampleCitations, ignoredSourceNotes다. **sampleEvidence는 이 목록에 없고 첫 후보의 필드가 남는다.** contextIssues와 플래그의 별도 분기는 03에 따른다. | key 생성은 문자열 처리·조건 정렬 비용. **반복 병합은 누적 근거를 매번 다시 직렬화/중복 제거한다.** 같은 의미인 C개 후보가 서로 다른 근거 e개씩을 더하고 근거 문자열 길이가 ℓ로 일정하면 근거 처리만 Θ(C²·e·ℓ)가 될 수 있다. Map 조회 O(1)이 전체 병합을 선형으로 만들지 않는다. 최종 살아 있는 근거 저장은 O(C·e·ℓ), 중간 배열 생성/GC 비용도 있다. dedup 후 coverage를 재검사한다. |
| 독립 필드 추출 | 승인 기준을 주지 않고 대상의 모든 관측 fact를 추출, 같은 원문 row/text와 value를 확인 | 최대300 fields, evidence8. field마다 label/region/다른 label 스캔이 있어 F·source + F² 성분이 가능. source-backed mismatch는 uncertain을 올린다. |
| 의미 매칭 제안 | 승인 semantic criteria + 대상 구조 + 독립 fact → 실제 criterionId/subject별 RawFinding | LLM의 비용은 별도. 파일당250 findings; record/criterion 조합 전체가 넘으면 remainingWork를 명시한다. 빈 items는 현재 정규화기에서 오류이며 프롬프트의 empty 허용 문구와 차이가 알려져 있다. |
| 서버 판정 정규화 | 기준ID 찾기·shape/evidence admission → requiredness/필수누락·수치 판정 → conditions → applicability → 독립 추출 mismatch → CSV/XLSX 표시 label 보정 → final machineStatus (정본은03 §5; 후속 guard는 이전 판정/설명을 덮어쓸 수 있다) | 현재 criteria.find로 O(I·C) + evidence/field/source scan. 기준ID Map을 새로 만들면 lookup 개선 가능하나 원본은 선형 lookup이다. LLM status를 그대로 최종값으로 저장하지 않는다. |
| record coverage | 실제 row list, 반환 evidence row, 명시 out-of-scope exclusion → missingRows | sheet row Set membership은 평균O(1). XLSX는 evidence별 record scan으로 O(I·E·R), exclusion마다 records.some 추가. CSV/XLSX 제외 이유 정책은 완전히 동일하지 않으므로03의 차이를 보존한다. |
| 필수 누락 | 완전한 reader/transcription/review coverage + applicability + 독립fact의 모순 없음 + blank/source 근거 → confirmed missing fail | 검사 중첩과 동일 source 재검색이 남아 있다. lookup 최적화가 근거 유효성 검사를 생략하는 이유가 되어선 안 된다. 읽기 불확실/ND/빈 formula cache는 confirmed missing이 아니다. |
| HITL approve/revise | revision gate → 원본 provenance 보호 → 사용자 semantic edit표시 → version 증가 → frozen approved criteria | 배열 비교·source check가 있어 O(C²) 부분 가능. 사용자 feedback은 모호한 patch로 덮어쓰지 않고 지정 ID만 변경하고 새 근거를 검사한다. |

정확한 grammar/의미/인용 규칙은 [03-algorithms.md](03-algorithms.md), wire schema는 contracts/types.ts에 따른다. 위 표의 비용은 반복문의 구조에 대한 보수적 설명이며 네트워크/메모리 벤치마크 결과가 아니다.

정규화 함수가 모두 pure하거나 모든 입력을 deep-clone한다고 가정하지 않는다. 일부 조건 보존/처리 지침 정리는 criterion 객체 또는 배열을 갱신한다. source evidence, 사용자 수정 draft, 승인된 frozen criteria의 소유권 경계를 지키고, 원본과 같은 mutation/반환 동작이 필요한 부분은 03의 edge-case 계약으로 검증한다. UI memo의 참조 동등성만 믿고 서버 쪽 mutation을 숨기지 않는다.

## 7.5 비동기 자원 예산과 실행 순서

| 계층 | 실제 cap / 자료구조 | 의미 |
|---|---|---|
| 프로세스 Gemini adapter | TaskPool(2), waiting Map default100 | 모든 createGemini client가 공유. API request가 끝날 때까지 slot 유지. stream은 소비/early-return/finally까지 예약 유지. 역할 extract/explore에 별도2개씩 주는 것이 아니다. |
| 프로세스 E2B adapter | 독립 TaskPool(2), waiting Map default100 | 문서·기준·대시보드가 공유. work와 kill이 모두 settle하기 전 release 금지. |
| ReviewEngine model queue | engine instance별 active2, waiting Array | legacy outer gate. 취소 filter/shift는 O(Q); pending hard cap 없음. 내부 Gemini adapter와 중첩하지만 다른 pool이다. |
| run admission | open run3 | 동일 run의 문서만2개라는 뜻이 아니다. 완료기록 수 제한과 독립. |
| 문서 분석/기준 자격판별/대상 검토 | 각각 shared next++와 worker2개, Promise.all([worker(),worker()]) | 파일별 무제한 Promise.all이 아니다. 한 파일의 extraction→matching은 의존 순서. 결과는 완료순으로 발생해도 documentId로 연결한다. |
| 한 문서의 유지 세션 | local TaskPool(1), waiting 기본100 | 같은 고정파일 paths를 쓰는 reread 직렬화. **이미 global sandbox slot을 보유한 상태에서 또 global slot을 얻지 않는다.** local runner는 동일 physical sandbox를 받는다. |
| Dashboard router | active job1; 병렬 HTTP 요청409 | 별도 API idempotency key는 없다. 요청 재시도는 active 충돌/새 job일 수 있다. |

TaskPool의 exact 절차: 이미 abort면 enqueue 안 함 → active가limit 이상이고 pending이maxPending 이상이면 POOL_FULL/429 → Symbol key로 waiting Map 삽입 → queued abort listener가 해당 token 삭제/reject → drain이 insertion-order 첫 entry를 삭제하고 active++ → microtask에서 signal 다시 확인 후 work 실행 → resolve/reject 뒤 finally active-- 및 다음 drain. 실행 중 abort가 호출자에게 빨리 응답했다고 active--를 먼저 하지 않는다.

재구현 의사코드에서 `defer`는 Promise microtask, `settle`은 resolve 또는 reject 중 한 번이다. 이 코드는 의사코드이므로 source import 없이 구현할 수 있어야 한다.

```text
submit(work, signal):
  reject immediately if signal already aborted
  if active >= limit and waiting.size >= maxPending: reject POOL_FULL
  token := fresh identity
  waiting[token] := {work, signal, promise completion}
  attach abort listener:
    if waiting.delete(token) succeeded:
      remove listener; reject this queued completion
  drain()

drain():
  while active < limit and waiting is nonempty:
    entry := remove first insertion-order waiting entry
    remove its queued abort listener
    active := active + 1
    defer:
      check signal again, then await entry.work(signal)
      settle entry completion from work result/error
      finally:
        active := active - 1
        drain()

physicalSandbox(work, signal):
  acquire one GLOBAL sandbox slot
  create sandbox with configured lifetime and create-request timeout
  cleanupPromise := unset
  killOnce(): cleanupPromise := existing cleanupPromise OR new sandbox.kill()
  attach abort listener that requests killOnce()
  check signal; await work(sandbox); check signal
  finally: remove listener; await killOnce()
  release GLOBAL slot only when previous finally settled

documentSession(document, signal):
  start wall deadline BEFORE requesting GLOBAL slot
  compose caller signal and deadline signal
  enter physicalSandbox once
  localQueue := TaskPool(1)
  retainedRunner(work) := localQueue.submit(work on SAME sandbox)
  initial trusted reader uses retainedRunner
  context/verifier model calls release their LLM slots after each response
  every requested reread uses retainedRunner, never physicalSandbox again
  finish complete/partial/failure path; physicalSandbox finally cleans up
```

LLM slot은 sandbox를 기다리는 동안 상시 보유하지 않는다. 기준·대시보드에서 sandbox를 보유한 채 LLM 응답을 기다릴 수 있지만, 그 LLM 호출이 두 번째 global sandbox slot을 요구하도록 구성하면 안 된다. observer parent/child 관계는 관측 관계이며 새 resource 예약을 뜻하지 않는다.

동시성 상한은 환경변수로 자동 조정되는 adaptive scheduler가 아니다. 현재2/100 등의 값은 생성자/코드 상수다. API키 존재 여부·모델명·E2B template은 설정이지만 throughput limit env는 없다. 기능을 그대로 재현하려면 이 층들을 하나의 거대한 Promise.all로 바꾸지 않는다.

## 7.6 LLM ↔ 샌드박스 루프의 소유권과 중단

| 단계 | 실제 왕복 데이터 | 같은 환경이 유지되는 범위 | 종료/추가 호출 조건 |
|---|---|---|---|
| 문서 이해 | sandbox→원본 SHA/kind/inventory/source; LLM→context; verifier→issues+typed selectors; sandbox→선택 range의 실제 source; LLM→전체 repaired context | 한 document analysis 세션 전체; source·parser·query promises 한 번 준비 | 최대3quality round, 동일 fingerprint, source/time 한도, 실패/취소. local requery는 새 global sandbox가 아니다. |
| workbook 기준 | inventory→LLM ranges/classification; 원본 cells→LLM criteria/citations/dispositions; deterministic omitted/region/context 문제→same sandbox reread→LLM 수정 | criteria discovery의2round 전체 | 최대2round/area/range/출력상한. generic document analysis 세션은 이미 끝났고 이 단계는 기본적으로 별도 sandbox이다. inventory만 재사용한다. |
| dashboard | 검토 immutable snapshot+요청+baseDesign→LLM14field plan; trusted renderer의HTML+data/plan→sandbox DOM validator; bounded diagnostic→LLM plan수정 | 최초 계획 뒤 만들어진 하나의 sandbox/install을 모든 validation repair에서 유지 | 전체 plan attempts최대3; provider IntegrationError는 local JSON repair로 무조건 retry하지 않는다. 실패fallback은 standard라고 표시. validator는 브라우저 visual 검사와 다르다. |

문서 세션 wall timer 기본300,000ms는 global pool 취득 **전** 시작한다. physical lifetime도300,000ms이며 caller의 sessionTimeoutMs는1..300,000 범위다. 부모 취소+deadline은 AbortSignal.any로 합친다. generic withSandbox lifetime 기본60,000ms 허용10,000..300,000; create request30,000ms, kill request15,000ms. dashboard physical lifetime240,000ms; validator20,000ms/install60,000ms. 기준 install60,000ms, profile/read command45,000ms. 일반 문서 parser install90,000ms, reader/requery command180,000ms. 이들은 동일한 하나의 timeout이 아니다.

withSandbox는 kill Promise를 memoize하여 abort/normal finally가 같은 cleanup을 기다린다. 생성 중 abort면 생성결과가 늦게 도착한 뒤 signal을 확인하고 finally에서 kill한다. cleanup 실패는 CLEANUP_FAILED로 유지하며 성공 또는 단순cancel로 숨기지 않는다. SDK command에는 runObservedCommand가 명시 abortSignal을 전달하지 않으므로 command 자체의 즉시 협력취소를 가정하지 않는다. 문서 소유 세션의 abort→sandbox.kill과 command timeout/후속 signal check로 수명/결과 게시를 제어한다.

generic request/network 자동 exponential retry나 무한 재설치 루프는 없다. business repair만 명시한 최대횟수로 돈다. 같은 sandbox의 rejected parser promise는 자동 재설치를 하지 않는다. 다른 문서나 다음 기준단계/새 대시보드 job에서 별도 sandbox를 만들면 설치가 다시 보일 수 있으며 이를 '같은 loop에서 반복 설치'와 구분한다.

## 7.7 이벤트·로그·UI 비동기 상태

서버 event sequence는 run별 단조 증가한다. SSE 재연결에서 원래 이벤트 ID/sequence를 재사용하여 replay한다. 클라이언트 generation/runId/lastSequence gate가 이전 run·늦은 GET·역순/중복 이벤트를 버린다. command snapshot은 새revision을 확인하여 같은 sequence에서도 명령 결과가 반영될 수 있다. 이 gate는 백엔드 작업의 exactly-once 실행이나 전송 성공을 보장하는 protocol은 아니다.

`runObservedCommand`는 stdout/stderr callback을 동기적이고 짧게 유지한다. 허용된 진행 메타데이터만 표시하고 원문/code/command/key는 직접 전달하지 않는다. default throttle600ms, heartbeat8초, 최대24log; pending Map8개/seen Set100개, FIFO eviction. channel별 입력 마지막16,000자, 미완성 line8,000자, feed당최근40line. dedup key=`channel|title|detail`; finish에서는 마지막3개까지 실제 pending메시지를 보낸 후 timer/Map 해제. heartbeat는 "다음 응답 대기"이며 가짜 완료수치가 아니다. 대시보드 wrapper는 observer의 info만 전달하여 install start/end 중복 표시를 막는다.

활동 SSE는 전체 bounded activity snapshot을 publication마다 전송하고15초 heartbeat를 보낸다. writableLength>512KiB면 느린 연결을 종료한다. run SSE는 별도이며 현재 res.write false/drain 기반 흐름제어와 run event cap이 없다. 그러므로 '전체 서버에 완전한 backpressure'라고 쓰지 않는다. 클라이언트 run SSE 역시 모든 수신을 rAF로 합쳐 publish하는 구현은 없고, 이벤트마다 상태 반영한다.

### 프런트엔드 구조와 화면 비용

| 구조/작업 | 구현됨 | 효율·정합성 조건 |
|---|---|---|
| review event history | 최근80; analysis activity merge는 id/position Map으로 dedup 후 최근120 | 화면 history cap이며 서버 전체 감사/결과를 자르는 것이 아니다. |
| Activity dock 입력 | 유효한 task를 먼저 걸러 **제공된 배열의 뒤 100개**(`slice(-100)`)를 보존한다. 각 task의 events는 제공된 배열 뒤 200개를 먼저 선택한 뒤 유효 event를 필터링한다. 문자열 길이도 제한한다. | task를 시각순으로 정렬해 최신 100개를 고르는 구현이 아니다. 중앙 store snapshot은 newest-first라 100개를 초과하면 오래된 쪽 100개가 남는다. 기본 terminal retention 목표는 20이지만 unfinished는 제거하지 않아 이 한계를 만날 수 있다. |
| presentation session memory | Map 최대30, first insertion FIFO | 접근 시 순서를 갱신하지 않으므로 LRU라고 명명하지 않는다. |
| handoff queue | pending8, seen256; 외부 session seen512/visitedGroups100; 안정(time,sequence)순 정렬 | 삽입 O(V log V), 정렬 시 임시 V≤9, overflow 제거 뒤≤8. overflow는 가장 오래된 pending을 제거하고 omitted를 올린다. 실제 판정 데이터는 제거하지 않는다. |
| handoff eligibility / light | 현재 context/file, liveSince 이후; age -5000..15000ms; transfer1400ms | 연결 끊기면 남은 시간 보존 pause. **앱 모션 OFF**로 useAppReducedMotion이 true일 때만 active+pending을 제거한다. OS prefers-reduced-motion만 켜면 관련 CSS 효과는 줄어들지만 이 JS 큐는 제거되지 않는다. 명시 인과 edge 또는 실제 활동 관계만 표현한다. |
| 판정 flying packet | 최대6, 1800ms flight +75ms stagger +120ms expiry;350ms cleanup은 packet이 있을 때만 | packet은 장식용 window이고 items의 보존/합계와 독립. status lane 최신 item만 보여줘도 결과항목을 삭제하지 않는다. |
| Dashboard modal lazy lifecycle | React.lazy로 dialog/evidence 분리, open 시260ms content 지연; 요청 poll1.2초 | 한 번 본 chart iframe은 원문 탭에서 hidden으로 유지해 file/filter 선택을 보존하고 새 생성 작업 중에는 unmount한다. hidden iframe에 명시 pause 메시지는 없다. 닫기 시 timer/request/컴포넌트 해제와 늦은 결과 guard가 필요하다. |
| Dashboard preview cache | Map<runId,Preview> 최대5개; write 시 delete/set으로 최근 쓰기순 퇴출 | read 시 갱신하지 않으므로 LRU가 아니다. HMR data에서 보존될 수 있으나 영속 저장은 아니다. 검토결과 수정과 생성 시점 snapshot을 구분한다. |
| Dashboard polling | 응답이 끝난 후 1200ms 다음 요청, 오류 2회 재시도 후 세 번째 종료 | 동시 poll은 1개. AbortController+sequence/alive guard; 일반 API fetch의 독립 기본 timeout은 없다. |
| Dashboard 마지막 handoff 표시 | 생성 완료의 finish(true) 시 presentationBusyRef가 true이면 **한 번 1600ms timer**를 예약하고, 아니면 즉시 finishPresentation한다. | onPresentationBusyChange(false)가 먼저 오면 timer를 취소하고 즉시 마친다. 결과 보기 버튼/취소/정리도 종료 경로다. 이는 DashboardModal 자체 lifecycle이며, dependency 변경에 따라 재예약되는 App의 페이지 전환 timer와 다르다. App 전환은 04의 별도 계약을 따른다. |
| PDF preview | PDF.js worker, 현재 한page canvas, DPR최대2, page/render cleanup, ResizeObserver 폭반응 | URL변경/언마운트는 loadingTask.destroy; page/zoom 변경은 renderTask.cancel. 원본 전체 모든페이지 canvas를 매번 만들지 않는다. |
| 결과/원문 인덱스 | React useMemo로 file scopes, highlights, chart datasets 재계산 범위를 제한 | dependency가 changed items/documents/evidence를 포함해야 한다. 이름만key로 다른파일 cache를 재사용하지 않는다. |

visibilitychange/document.hidden에 따른 모든 애니메이션 pause는 현재 구현되어 있지 않다. 운영체제 reduced-motion과 앱 모션 설정의 적용 범위도 완전히 동일하지 않으며04의 컴포넌트별 우선순위를 따른다. 모든 CSS 애니메이션이 compositor-only라고 보장하지 않는다. 현재 animate하는 transform/opacity/SVG path와 필터·그림자·canvas비용은 실제 브라우저에서 측정해야 한다.

활동 관찰자는 최초 HTTP snapshot 뒤 SSE를 열고 동시에 HTTP 요청 하나만 유지한다. 요청 timeout10초, backoff4→8→…최대60초, 첫 SSE 오류는 즉시 snapshot 재연결,15초 내 반복 오류는 backoff를 적용한다. 진행 작업이 예상되는데15초 무소식이면 재연결하고 완료 기록을 보고 있다는 이유만으로 주기적 HTTP polling을 계속하지 않는다. dispose/generation/AbortController가 이전 연결의 늦은 응답을 막는다. dock 경과시간 interval은 실제 active 작업+live 연결일 때1초이며 연결 끊김에는 frozenAt을 쓴다.

`replaceReviewItem`은 배열 `.some`+`.map`이므로 O(I)이고 U개의 추출 항목을 reduce하면 O(U·I+U²)가 될 수 있다. 하이라이트의 정확한 셀 좌표는 Map으로 찾지만 좌표 없는 quote fallback은 source/evidence마다 전체 preview 셀을 검사할 수 있다. 주소 범위 확장은 100×100으로 한정한다. 표 DOM 및 결과목록 전체 가상화는 현재 없다. file-review 모델은 Map/Set과 source evidence를 재사용하되 D개 문서별 criteria 검사/정렬 때문에 완전히 O(I)는 아니다.

## 7.8 크기·시간·토큰 예산 단일 표

범위 예산 의사코드는 단순한 중복 제거와 좌표 합집합을 혼동하지 않기 위해 고정한다. `repeat`는 누락/검증 문제를 고치기 위한 명시 재조회다.

```text
selectRanges(requests, inventory, used, budget, repeat=false):
  selected := []
  for request in input order:
    parse/normalize A1 rectangle; reject unknown sheet or invalid bounds
    key := sheet + "!" + normalized rectangle
    if used contains key and repeat is false: skip
    if selected already contains same sheet and normalized rectangle: skip
    if selected.size >= 18 OR rectangle.area > 12000
       OR budget.area + rectangle.area > 24000:
      retain a warning that this exact range remains unread; skip
    used.add(key)
    budget.area += rectangle.area
    selected.append({sheet, normalized rectangle})
  return selected

verifyContextRound(context, round):
  issues := deterministic source/region/header coverage checks
  for source segment in original order:
    append independently validated model issues, or review_failed issue
  issues := first80 unique(code + normalized message)
  if issues empty: return verified
  fingerprint := SHA256(stable-key JSON of structure and sorted code/selectors)
  if source_limit OR round == 3 OR fingerprint == previousFingerprint:
    return limited / needs_review with reason
  proposed := issues' truthy request values in issue order
  candidateRequests := proposed if proposed.length > 0 else fallback(profile)
  requests := normalize+filter candidateRequests, JSON.stringify Map dedup, first8
  # fallback: first8 profile sheets' retained-cell bounding ranges (empty -> A1:A1);
  # else BLOCK1:min(200,blockCount); else L1:min(1000,splitlinesCount); else [].
  # No second fallback if all candidates become invalid; no per-round cursor.
  reread exact original, checking hash/kind/selector order/coverage
  if an error occurs:
    if caller/session signal aborted: throw, do not return retained analysis
    otherwise return needs_review or limited, retaining context and issues
  if incomplete: return needs_review or limited, retaining context and issues
  repair COMPLETE context; validate; next round rechecks all retained segments
```

| 처리 | 상한 / 초과 의미 |
|---|---|
| upload | 파일20MiB, 한요청10개, store100개/250MiB, JSON body2MiB; batch중 실패면 이번batch 추가분 rollback |
| 로컬 source/preview | source1,500,000chars, preview60,000chars/100rows/100columns, PDF verification30pages/25초 |
| trusted reader | input20MiB, ZIP expanded100MiB/20,000entries,100,000cells/100,000populatedrows/100sheets, text1,500,000chars,300PDFpages,8images/40MP,150초 soft readerbudget |
| sandbox profile transfer | JSON bytes32MiB; embedded visual 합16MiB/8images; 원본 digest/kind 일치 확인 |
| context | retained 1,200,000 chars / chunk 150,000 chars. **모델 응답마다 structure ≤160**; 초과 응답은 reject. 구간 병합 이후 공개 structure는 앞 1,000개, warnings 100 / questions 40. 최종 structure.slice(0,1000)에는 별도 잘림 경고 분기가 없음. |
| context repair | max3qualityround,8selectors; blocks200개/text1000lines; reread JSON180,000chars/source120,000chars/cells10,000 |
| criteria inventory | 모든 sheet metadata 유지; 첫100개 sheet만 cells profile 대상, 누적200,000profilecells/300regions. 101번째 이후 빈 sheet는 complete=true일 수 있고 populated/comment sheet는 incomplete. generic reader의100sheet 중단과 다름. sample24; merged/hidden요약300/style80 |
| criteria detail | round 2, range 18/round, rectangle 12,000 coordinates, total 24,000 coordinates. Python read마다 고유 (sheet,cell) 6,000개와 **고유 셀 record별 JSON 문자열 길이 합 220,000자**를 계산한다. 전체 반환 JSON 길이가 아니다. 겹친 range는 이미 센 셀을 다시 결과에 넣어 출력이 더 커질 수 있고 wrapper 문자도 별도다. JS는 읽은 raw result JSON의 string.length가 1,500,000을 넘으면 reject한다. overlap/repeat는 JS coordinate budget을 다시 소비한다. |
| criteria output | 250criteria, hierarchy8levels; partial/drop/omitted counts표시. static layoutcandidate1000 |
| visual transcription |30pages,3pages/request,3round,180초wall/60초wrapper,250,000JSONchars; 전달650,000chars |
| model tokens | adapter1..32768 default2048; initialcontext9000, independentcontext6000, repair12000, criteria-plan5000, workbookextract16000, naturalcriteria32768, overlay8000, eligibility4096, HITLrevision16384, dashboardplan2000 |
| target review | findings250/document; approvedcriteria>50이면32768outputtokens 아니면12000; XLSXpromptrecord요약250; 독립fields300 |
| dashboard | snapshot1..2000items, instruction1500chars, design14fields, HTML1000..8,000,000 JSstringlength, attempt3; standalone chart runtime 포함 |

표의 source bytes/UTF-16 JSstringlength/UTF-8JSONbytes/Pythoncharacter count를 임의로 한 단위로 바꾸지 않는다. 정확한 수치는 불완전 결과를 거짓 complete로 만드는 truncation을 피하기 위한 계약이며 성능 SLA가 아니다.

## 7.9 재현 시험·음성 시나리오·성능 계측

아래 검증은 **실행해야 할 acceptance**다. 이 문서의 존재 자체가 통과 증거는 아니다. 실제 앱/어댑터의 fake dependency로 외부 API 없이 결정적으로 검증할 수 있는 항목부터 수행한다. 실제 LLM/E2B 호출은 기존 사용자 승인 범위와 환경에서 별도 통합 검증한다. 원본 test 경로는 출처/예시이며 새 프로젝트가 같은 의미의 테스트를 제공하면 된다.

| ID | 입력·스케줄 | 필수 결과 / 원본 시험 근거 |
|---|---|---|
| EF-01 | TaskPool(2)에 장기 작업 2개와 대기 요청 101개 | active 최대 2, pending 최대 100, 추가 요청 429. 대기 취소된 work 호출 0회. `integrations/test/concurrency.test.mjs`, `server/task-pool.test.mjs` |
| EF-02 | 실행 중 abort, work/kill의 settle을 지연 | 실제 slot 해제 전 후속 작업 시작 0회, kill 1회. cleanup 실패는 CLEANUP_FAILED. `integrations/test/concurrency.test.mjs` |
| EF-03 | 동시 문서 2개, 각각 두 차례 이상 재조회 | physical sandbox 문서당 1, global peak 2, local command peak 1. 설치/원본 쓰기 한 번, 파일 내용 혼합이나 중첩 교착 없음. `server/document-sandbox-session.test.mjs` |
| EF-04 | 같은 sandbox에서 documentId/kind/hash 중 하나 변경 | 쓰기/설치 전에 reject. 실패한 parser Promise를 조용히 재시도하지 않음. 위 session test |
| EF-05 | 먼 열·행의 sparse workbook, hidden/전치/반복 block, 시트 순서 변경 | maxRow×maxColumn 전체 순회 없이 stored cells 검색. 모든 region accounting, 한도에서는 partial. 파일명/골든 ID에 의존하지 않는 합성자료. `server/document-reader.test.py`, `server/criteria-generalization.test.mjs`, `server/criteria-matrix-regression.test.mjs` |
| EF-06 | 첫 모델 계획이 시트를 누락. followUp=[]이지만 정적 threshold가 남음 | omitted/region problem이 bounded repair를 요구. 2 round 후 미해결은 remaining/HITL. `server/criteria-sandbox.test.mjs` |
| EF-07 | 같은 context 구조·issues 반복, source_limit, 실패 구간의 후속 repair | no-progress/source-limit 조기 종료, 무한 호출 없음. 전체 replacement의 coverage가 회복되어야 verified. `server/document-quality.test.mjs` |
| EF-08 | 31 page, 빈 raster, invalid table parent, 재전사에도 같은 문제 | 전체 검증 표시 금지. 각 page coverage와 stopReason·uncertainty 보존. `server/visual-transcription.test.mjs` |
| EF-09 | 기준 파일 3개에 같은 label, 다른 category·조건·unit. note에 28일 | 의미가 다른 기준은 합치지 않음. note만 제외하고 실제 condition의 28일은 유지. `server/criteria-context.test.mjs`, `server/criteria-notes.test.mjs`, `server/conditions.test.mjs` |
| EF-10 | 필수 누락, 선택 항목 공란, unreadable, ND, uncached formula, 부분 읽기 | 완전히 확인된 required missing만 fail. header를 missing 근거로 highlight 금지. `server/missing-result.test.mjs`, `src/components/item-source-highlights.test.mjs` |
| EF-11 | run A의 늦은 GET/SSE 뒤 run B 시작. 역순/중복 sequence, 같은 sequence의 명령 snapshot | gate가 stale 결과를 버리고 확정 명령은 revision 규칙대로 반영. `server/use-review-commands.test.mjs`, `server/review-state.test.mjs` |
| EF-12 | stdout 수만 줄, 비밀처럼 생긴 값, 무응답 8초 | allowlist 진행만 bounded 수신. log 24, pending 8, seen 100, finish 최대 3. heartbeat를 가짜 완료로 쓰지 않음. `server/command-progress.test.mjs` |
| EF-13 | handoff 폭주, 중복, 다른 파일, 연결 끊김, 앱 모션 OFF와 OS reduced-motion을 각각 시험 | queue 8/seen 상한, 올바른 방향/남은 시간 유지/생략 count. 앱 OFF만 active+pending을 제거하고 OS 설정만으로 JS 큐를 제거하지 않는다. 결과 I개 불변. `server/handoff-queue.test.mjs`, `server/activity-scope.test.mjs` |
| EF-14 | CURRENT_REPRODUCTION: invalid plan→DOM 실패→세 번째 plan 성공; plan 생성 최대3회, 각 유효 plan의 build/DOM 검사 | 같은 sandbox/설치1회, snapshot 불변, 늦은poll 차단·취소 유지. `server/dashboard.test.mjs`, `server/dashboard-plan-validation.test.mjs`는 baseline 근거다. OPTIONAL_FUTURE의 별도 semantic judge/constrained repair/합계3호출 예산은 기본 재현에 적용하지 않는다(05 D05b). |
| EF-15 | 결과 변경 뒤 ledger export. proposal이 불변인 humanNote 수정도 별도 시험 | proposal 변경에 409. 모든 audit 변경에 무조건 409라고 잘못 검증하지 않음. `server/ledger.test.mjs` |
| EF-16 | 최대 크기 원문/2,000-item dashboard에서 modal 열기·닫기·파일 전환 10회 | 실제 browser performance trace/heap/long-task/RAF samples 기록. lazy+cleanup, 누적 iframe/canvas/listener 누수 확인. 고정 FPS 목표를 발명하지 않고 아래 계측 계약으로 비교. |

성능 증거에는 source/build/package hash, 브라우저/OS/CPU/RAM, viewport/DPR, 모션 설정, 입력 N/R/C/I/B, 워밍업 여부를 남긴다. request/response 시간, active/pending peak, 설치/생성/kill 횟수, API 호출/토큰 사용량, 외부 대기와 JS 계산 시간을 분리한다. client는 navigation/interaction Performance marks, long-task 수·duration, modal frame interval 분포, mount/unmount resource count를 기록한다. 각 시나리오를 같은 환경에서 5회 이상 실행하고 median/p95와 표본 수를 함께 표시한다. 측정값 없이 '60fps', '50% 절감', '선형 처리'를 합격으로 쓰지 않는다. acceptance는 기능 동등성과 상한/정리 불변식이며 환경의 절대 latency를 임의로 발명하지 않는다.

## 7.10 알려진 효율 한계와 호환 개선 선택

다음은 **향후 개선**이며 baseline 완료 기능으로 체크하지 않는다: run SSE byte backpressure와 retention/snapshot cursor, ModelQueue의 bounded Map FIFO 통합, source region/cell/criterionId 재사용 index, activity snapshot delta 전송, SSE React publication rAF batch, hidden-tab motion pause, cached source digest 재사용, 큰 결과 목록의 virtualization, XLSX streaming 파서/worker 분리. 개선 시 같은 ID/order/coverage/취소/근거/CSS motion 결과를 유지하는 differential test가 필요하다. 한도를 높여도 무한한 문서나 임의 구조의 완전한 처리를 보장하지 않는다.

이 절의 성능 개선안은 **OPTIONAL_FUTURE**다. CURRENT_REPRODUCTION의 필수 시험은 관측된 정합성·취소·자원 상한과 알려진 한계를 그대로 확인한다. 과거 보강 gate에 연결되었다는 이유로 원본에 없는 새 guard나 더 높은 처리 상한을 현재 재현에 추가하지 않는다. 개선안을 선택하면 원본과 달라지는 결과를 별도 변경 명세·시험으로 기록한다.

구체적인 **OPTIONAL_FUTURE 개선안**은 semantic dedup의 누적 근거 재직렬화 제거다. 현재 동작이 아닌 별도 변경이며, 선택하지 않은 현재 재현에서는 원래 병합 순서와 관측 가능한 결과를 따른다.

1. 기존 semanticKey를 그대로 사용하고, 그룹마다 공통 근거 union과 §7.4의 명시된 7개 provenance allowlist에만 insertion-order Map을 둔다. sampleEvidence 등 나머지 필드를 추가로 합치지 않는다. key는 기존과 동일한 `JSON.stringify(citation)`이며 문자열 생성 비용을 O(1)로 취급하지 않는다.
2. 기존 `criterionCitations`의 순서(evidenceCells → citations → sourceEvidence)와 각 필드의 flatten 규칙을 보존한다. 처음 본 key의 위치는 고정하되 같은 key가 다시 오면 **그 위치의 value는 마지막 객체로 갱신**한다. 이는 현재 `new Map(values.map(...))`의 위치/값 동작과 같다.
3. 같은 그룹으로 들어오는 새 후보의 근거만 accumulator에 추가한다. 기존 결과의 evidenceCells/sourceEvidence는 동일한 union 배열을 가리키도록 최종화하고, 원래 남는 citations 필드 등은 멋대로 삭제하지 않는다. 첫 criterion의 비근거 속성, confirmation OR, contextNeedsConfirmation 시 comparison 삭제, classificationReason/source 합치기와 반환 순서를 유지한다.
4. 중첩 객체의 mutation/참조 관계를 baseline과 비교한다. deep clone을 새로 추가하거나 값이 같은 다른 객체를 임의로 하나로 고정해 관측 가능한 동작을 바꾸지 않는다. 처리 중간 결과를 외부에 노출하지 않는다는 동일 호출 경계를 유지한다.
5. 같은 의미/상이한 의미, 반복 citation, 내용은 같지만 key 순서가 다른 객체, 빈 필드, hierarchy/unit/condition/contextIssues, confirmation 충돌을 differential test로 비교한다. 승인 목록과 원본 evidence가 변경되지 않는 것도 확인한다.
6. 같은 의미 그룹에 각기 다른 근거가 늘어나는 합성 자료로 직렬화 횟수·CPU·할당량을 측정한다. 이 근거 병합 부분은 새 citation 총 길이에 비례하도록 개선할 수 있지만, semanticKey·조건 정렬·다른 source/reason 누적 연산까지 모두 선형이 되었다고 주장하지 않는다.

정확한 baseline의 연산 횟수 확인 예: label=`synthetic check`, rule=`10 이하`, unit=`%`, 같은 documentId, 다른 B1..BN sourceEvidence가 아닌 evidenceCells 1개를 가진 N개 후보를 병합하고 JSON.stringify 호출을 센다. 이 입력에서 N=50은 3,872회, N=100은 15,247회였고 출력은 기준 1개/고유 근거 N개였다. 이는 네트워크 없는 정적 함수 호출 계수이며 처리시간/FPS benchmark가 아니다. 각 criterion의 다른 속성과 인용 필드 배치에 따라 정확한 계수는 달라진다.

활동 dock의 `slice(-100)`과 중앙 newest-first snapshot의 조합도 알려진 한계다. 100개 초과 시 최신 작업 보존 정책으로 조용히 해석하지 않는다. 현재 동작을 재현하는 시험은 입력 배열 순서와 tail 선택을 확인하고, 최신 100개로 바꾸는 개선은 별도의 제품 변경으로 평가한다.

실행 순서는 **전체 source inventory → 제한된 실제 범위 검증 → 제한된 동시 실행 → 근거가 있을 때만 bounded repair → 미완료 범위 표시 → 화면 효과와 권위 데이터 분리**다. 빨리 보이게 하려고 값을 만들거나 animation queue에 맞춰 실제 작업 완료 순서를 조작하지 않는다.

## 7.11 모듈 연결과 출처

CORE-01/02/03/04/13/15는 §§7.2, 7.5–7.8의 소유권/풀/취소/저장 경계를 구현한다. CORE-05/06/07/08/09는 §§7.3–7.4, 7.8의 coverage/repair/형식 검증을 구현한다. CORE-10/11/12/14/16은 §7.4와 EF09–11/15의 버전/누락/근거/내보내기를 구현한다. CORE-17/18은 §7.6 dashboard loop, §7.2 snapshot/jobs와 EF14/16을 구현한다.

UI-01/04/05/06은 generation/revision/분석/입력 state, UI-02/03/07/08/09/10은 bounded motion/activity, UI-11/12/13/14/17은 원문/결과 index, UI-15/16/18은 lazy/dashboard/export lifecycle를 구현한다. UI-01..18 모두 이 문서의 관련 사항을 적용하되 외관은 04의 정확한 style/motion 계약을 따른다.

감사출처: integrations/src/{task-pool,gemini,sandbox,activity,command-progress}.mjs; server/{documents,review,sandbox-documents,document-sandbox-resources,document-quality,document-requery,criteria-sandbox,criteria-layout,criteria-context,field-extraction,criterion-applicability,missing-result,table-records,ledger,dashboard,dashboard-plan,dashboard-plan-validation,dashboard-chart-runtime}.mjs; server/{sandbox-document-reader,criteria-workbook-profile,document-requery}.py; src/{useReview,review-state,App}.tsx/ts; src/{handoff-queue,activity-observer,activity-scope}.mjs; src/components/{SandboxActivityDock,SandboxWorkroomScene,ReviewTheater,DashboardModal,DocumentPreview}.tsx. 기계목록의 각 항목에 실제 존재하는 파일과 symbol을 연결한다.

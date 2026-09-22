# 01. 사용자 상태와 HTTP·SSE 계약

이 문서는 빈 프로젝트에서 구현할 **CURRENT_REPRODUCTION: 현재 기준 버전의 동작 계약**이다. 파일명·함수명은 책임 배분을 위한 권장 이름이며 기존 소스가 없어도 아래 본문과 [타입 선언](../contracts/types.ts), [예시](../contracts/examples/)만으로 구현해야 한다. 더 상세한 문서 읽기·모델 입력은 [02-backend-pipeline.md](02-backend-pipeline.md), 기준 의미와 수치 판정은 [03-algorithms.md](03-algorithms.md), 대시보드 API는 [05-dashboard-exports.md](05-dashboard-exports.md), 대장은 [05a-ledger-export.md](05a-ledger-export.md)가 소유한다. 서로 다른 범위의 제한은 합치지 않는다. OPTIONAL_FUTURE의 추가 DTO·guard·상한 변경은 이 HTTP 계약에 자동 편입되지 않는다. 문서·run·item UUID와 실제 시각은 동적으로 생성하며 예시의 식별자/시각을 상수로 사용하지 않는다.

## 1. 소유권과 데이터 수명

| 책임 | 권장 모듈 | 공유하면 안 되는 상태 |
|---|---|---|
| 브라우저 페이지/입력/미리보기/모달 | `src/App.tsx` | 진행중 업로드의 inputEpoch를 새 작업과 공유하지 않는다 |
| HTTP 명령과 run SSE | `src/useReview.ts`, `src/api.ts` | 이전 run의 응답/연결을 현재 run에 적용하지 않는다 |
| 순서·revision race 방지 | `src/review-state.ts` | 전역 최근 응답 하나로 여러 run을 합치지 않는다 |
| 문서 원본/preview | `server/documents.mjs` | 클라이언트에는 buffer/modelParts/API 키를 전송하지 않는다 |
| run 상태·감사 이력·승인본 | `server/review.mjs` | 승인 후 mutable 초안을 적용 기준으로 사용하지 않는다 |
| router/보안 headers/export | `server/app.mjs` | 읽기와 업로드 취소를 제품 전체 리셋으로 구현하지 않는다 |
| 관측 activity | `integrations/src/activity.mjs` | 서로 다른 document/context 사이 handoff를 만들지 않는다 |

서버는 로컬 단일 프로세스의 메모리 저장소다. 문서 원본, run, activity, 대시보드는 서버 재시작 시 사라진다. DB·사용자 계정·브라우저 새로고침 후 run 자동 복구는 현재 기능이 아니다. run 새 생성 시 전체 run Map이 40개를 넘으면 열린 상태가 아닌 오래된 run을 순회 삭제한다. 열린 상태는 `running`, `awaiting_confirmation`, `awaiting_documents`이며 최대 3개다. 이는 “완료 run 40개와 열린 run 별도”라는 보장이 아니라 실제 전체 Map 기반 pruning이다. run events는 run이 보존되는 동안 전부 메모리에 보관한다.

pruning 순서는 새 run을 먼저 `runs.set`한 뒤 Map insertion order로 순회하며 `size>40 && !OPEN_STATUSES.has(old.status)`인 entry를 삭제하는 것이다. terminal40개에서 새 open run1개를 생성하면 잠시41개가 된 다음 가장 오래된 terminal1개를 삭제하여40개(terminal39+open1)다. pruning 후 insertion이라41개를 유지하는 구현은 다르다. 열린 run은 삭제하지 않는다.

문서 저장소는 파일당 20 MiB, 합계 250 MiB, 문서 100개. 업로드 요청당 10개이며 삭제를 하지 않는 새 검토/reset은 서버 문서 저장소를 비우지 않는다. 문서가 어떤 retained run의 target/criteria/analysis 목록에라도 들어 있으면 삭제는 409다. 삭제 API는 새로 업로드했으나 아직 run에 사용하지 않은 파일 제거에만 성공한다. UI 입력 목록에서 reset으로 제외한 문서의 자동 서버 삭제는 없다.

## 2. 사용자 페이지와 전이

`intro → criteria-input → criteria-analysis → criteria-confirm → targets → review → results`를 페이지 내 workflow로 구현한다. 기준 확인과 분석은 팝업이 아니다. 상단 4단계는 “기준 입력 / 기준 확인·확정 / 검토 파일 입력 / 파일별 결과”; `criteria-analysis`와 `criteria-confirm`은 2단계, `review`와 `results`는 4단계다.

| 현재 페이지/상태 | 사용자 행위 또는 서버 결과 | 다음 화면과 효과 |
|---|---|---|
| intro | 시작 | criteria-input |
| intro 또는 input | 경비 예제 | `/api/samples` expenses, inputMode=text, 자연어 기준 입력; sampleTargets는 별도 보관하고 승인 뒤에만 추가 가능 |
| criteria-input | 파일 방식/말로 입력 방식 선택 | 파일 방식은 criteria 파일만 모델에 전송하고 text는 빈 문자열. text 방식은 파일 없이 text만 전송한다. 탭에 보관된 다른 입력을 은밀히 섞지 않는다 |
| criteria-input | 기준 정리하기 | 선택 방식의 입력이 비어 있거나 locked이면 금지. 새로운 criteria_first run 생성, live 분석 페이지로 이동 |
| criteria-analysis | awaiting_confirmation 수신 | criteria-confirm. 실제 마지막 motion만 유한하게 정리한 뒤 이동; 전체 이벤트 재생 완료를 기다리지 않는다 |
| criteria-confirm | 직접 수정/선택 해제/추가 | 로컬 draft 유지. 서버 승인 전 target 분석은 금지 |
| criteria-confirm | 자연어 수정 요청 | 현재 선택한 출처의 documentId와 **현재 로컬 초안**을 revise에 전달; criteria-analysis. 성공/실패 모두 다시 confirmation, 실패해도 기존 서버 기준 보존 |
| criteria-confirm | 기준 확정 | confirm POST 성공 시 awaiting_documents/targets. 현재 승인 기준/version 요약 표시 |
| targets | 파일 업로드 또는 golden 성적서 선택 | awaiting_documents 때만 UI에서 target 추가 가능. uploaded는 아직 분석되지 않은 문서 |
| targets | 이 기준으로 검토하기 | 1~10 target ID, 승인 version 전달. review 페이지, 단계별 이벤트 관측 |
| review | completed 또는 partial | results 기본 탭=파일별 결과. failed는 자동 성공 화면으로 보내지 않고 작업 화면의 오류와 복귀 경로 유지 |
| results | 파일·항목 선택 | 동일 페이지에서 원문/판정 근거 즉시 보여주고 문서 선택과 highlight 연결. 전체 요약의 항목 선택도 파일별 결과로 이동 |
| results | 분석 범위 탭 | 읽은 문서/구조/coverage/quality 표시. `analyses.some(a => a.quality && a.quality.status !== 'verified')`일 때만 탭 주의 표시; quality 객체가 없는 analysis만 있으면 주의 표시 없음 |
| results | 최종 판정 수정 | 근거 메모 필수. 서버 저장 후 item/summary 갱신; machineStatus 보존 |
| 분석 중 | 작업 중지 | local generation 즉시 변경, SSE 종료, cancelled 표시, cancel API 요청; 늦은 응답 무시 |
| 비진행 화면 | 기준 입력으로 | 현재 run 취소 시도, criteria 파일만 UI에 남기고 criteria-input |
| 비진행 화면 | GSPEC 새 검토/새 검토 | run reset 및 inputEpoch 변경; intro, 문서·기준문구·예제대상·preview·항목선택 초기화, inputMode=file/결과탭=files/분석탭=live, dashboardOpen·ledgerOpen·exportOpen=false 및 진행 연출 해제. goldenMode·confirmationRunId·dragOver·uploading·sampleLoading·startedAfter는 직접 초기화하지 않음. 정확한 대입 목록은 [I1](../ui/interaction-contract.md#i1-입력예제페이지-수명주기-ui-010304) 참조 |

`pending = connecting || pendingAction != null || run.status ∈ {running, queued, awaiting_criteria}`. `locked = pending || uploading || sampleLoading`. 클라이언트의 내부 busy에는 awaiting_confirmation도 포함할 수 있지만 화면 잠금을 이 값으로 결정해 확인 편집을 막으면 안 된다. confirmation 편집 UI만 submitting/revising/feedbackSending 중 잠금. 대시보드 버튼은 run이 completed/partial이고 E2B 설정 여부가 true일 때 활성. export API는 failed에도 items가 있으면 허용하지만 현재 results 페이지 자동 이동은 completed/partial만 한다.

## 3. run 상태 기계

| 명령/작업 | 전제 | 결과 `status / stage` | version |
|---|---|---|---|
| start | 유효 ID/입력·Gemini 설정·열린 run <3 | running / analyzing | 1; criteriaRevision=0 |
| 구조 분석 후 기준 추출 | 취소 아님 | running / criteria | 유지 |
| criteria.ready 다음 체크포인트 | 기준 후보 0개도 제외사유와 함께 가능 | awaiting_confirmation / criteria_confirmation | 유지 |
| revise 접수 | mode=criteria_first, awaiting_confirmation | running / criteria_revising | 접수 시 유지 |
| revise 완료 | 같은 revisionToken, 미취소 | awaiting_confirmation / criteria_confirmation | version+1; criteriaRevision+1 |
| revise 실패 | 같은 revisionToken, 미취소 | awaiting_confirmation / criteria_confirmation | 유지, revisionError/feedback.failed 기록 |
| confirm | awaiting_confirmation | criteria_first: awaiting_documents / awaiting_documents | `criteria` 배열을 전달했다면 +1; 생략하면 유지 |
| legacy confirm | awaiting_confirmation | running; 서버 stage는 다음 작업에서 갱신 | 동일 규칙; legacy 대기 Promise 해제 |
| attachDocuments | criteria_first, awaiting_documents, approvedCriteria 존재 | running / analyzing_targets | 승인본 version 강제 사용 |
| target review | 분석된 target 최소 1개 | running / extracting → reviewing | 고정 |
| 정상 종료 | 아래 집계식에서 failed/partial 조건에 해당하지 않음 | completed / complete | 고정 |
| 부분 종료 | 전체 target 실패는 아니고 아래 집계식의 partial 조건이 truthy | partial / complete | 고정 |
| 모두 실패/상위 오류 | target 전체 failed 또는 준비 불가 | failed / complete 또는 failed | 고정 |
| cancel | 열린 상태 | cancelled / cancelled | 고정 |

run 완료는 모든 판정이 pass라는 뜻이 아니다. `completed`에도 fail/review 결과가 정상적으로 들어간다. item의 review는 사람 확인 필요 판정이며 run.partial과 별개다. 각 target은 **정규화·optional 항목 제거 후** items.length≥250, 모델 reviewCoverage.complete가 정확히 false, analysis.coverage.complete가 정확히 false, missingRows.length>0 중 하나면 partial이다. 나머지 성공 target은 completed다. 오류는 해당 target failed로 처리한다. 문서 오류 설명의 우선순위는 02 §2.9를 따른다.

target workers 종료 후 현재 run 집계는 다음 식 그대로다. 모든 coverage boolean을 AND하는 더 강한 완료 guard로 바꾸지 않는다.

```js
const failures = run.documents.filter(d => d.status === 'failed').length;
const incompleteCriteria = run.criteriaDiscovery.some(report =>
  report.coverage?.inventoryComplete === false ||
  report.coverage?.allSheetsInventoried === false ||
  report.coverage?.unresolvedRanges?.length ||
  report.coverage?.remainingRanges?.length ||
  report.coverage?.imagesNotRead > 0 ||
  report.coverage?.criteriaLimitReached ||
  report.coverage?.droppedCriteria > 0 ||
  report.coverage?.classificationLimitReached ||
  report.coverage?.droppedHierarchyLevels > 0);
run.status = failures === run.documents.length ? 'failed'
  : failures || run.documents.some(d => d.status === 'partial')
    || run.analyses.some(analysis => analysis.status !== 'complete')
    || incompleteCriteria ? 'partial' : 'completed';
run.stage = 'complete';
```

coverage 또는 위 optional 필드가 없으면 그 항목은 incomplete 신호가 아니다. false 비교 두 필드는 undefined/null/true에서 실패하지 않고, 배열 length는0이면 false, count는>0일 때만 true, limit 플래그는 truthy일 때 true다. 반면 존재하는 analysis의 status가 없거나 complete가 아니면 partial이다. 빈 analyses/criteriaDiscovery 배열은 some=false다. criteria coverage의 `allRegionsExamined`, `extractedCriteriaComplete`, `contextComplete`, `rejectedDispositions`는 이 집계식이 **직접 검사하지 않는다**. 이 값이 실제 producer에서 unresolvedRanges 등으로 함께 드러나면 간접 반영되지만 그 관계를 새 독립 guard로 만들지 않는다. 합성 예로 target completed1개/analysis complete1개, 위9개 신호 모두 없음 또는 false·빈배열·0인 report의 extractedCriteriaComplete=false만으로는 run partial이 되지 않는다. 상위 준비/worker 밖 예외는 별도 catch에서 status=failed/stage=failed이며 이 정상 집계의 stage=complete와 구별한다.

취소는 run.controller.abort(), legacy resume 해제, running feedback을 cancelled, queued/processing target을 cancelled로 표시한다. cancelled가 된 뒤 run.cancelled 이외 이벤트는 emit하지 않는다. 이미 terminal이면 cancel은 상태 변경 없이 snapshot 반환하는 멱등 no-op. 즉 브라우저 disconnect가 run 자체 취소를 뜻하지 않는다. hook unmount는 연결만 닫으며 서버 cancel은 reset/new run/사용자 stop에서 수행한다.

문서 status의 폐쇄 집합은 `queued|processing|completed|partial|failed|cancelled`다. run stage의 폐쇄 집합은 `analyzing|criteria|criteria_confirmation|criteria_revising|awaiting_documents|analyzing_targets|extracting|reviewing|complete|failed|cancelled`다. `RunDocument.status`와 `RunSnapshot.status`는 서로 다른 enum이며 `document.completed` event의 status를 run status에 대입하지 않는다. 구체 타입은 [types.ts](../contracts/types.ts)의 `RunDocumentStatus`, `RunStage`를 따른다.

브라우저 stop은 **낙관적 로컬 취소**다. 연결과 진행 action을 즉시 해제하고 로컬 run을 status=cancelled/stage=idle로 바꾸며 cancel POST의 응답 snapshot은 적용하지 않는다. 명시적 stop POST가 실패하면 현재 generation일 때 error를 표시하고 false를 반환하지만 로컬 cancelled를 원복하지 않는다. 별도의 `cancelRemote` helper(이전/폐기 run 정리)는 오류를 삼킨다. 따라서 취소 화면은 원격 cleanup 성공 확인이 아니다. 늦은 명령/GET 응답은 generation gate가 버린다. 서버의 run 취소와 E2B 자원 종료는 별도 수명이며 §8과 02 §2.8의 cleanup 관측 계약을 따른다. `idle`은 이 클라이언트 전용 표시값이며 서버 RunStage enum에 추가하지 않는다.

## 4. 공통 HTTP 계약

동일 origin `/api`를 사용한다. JSON 요청은 `Content-Type: application/json`, 최대 2 MiB. 성공 JSON과 SSE는 UTF-8. 기본 error는 `{ "error": "사용자용 한국어 설명" }`. 알려진 Review/Integration/Document/Extraction/Sandbox/Criteria 오류만 메시지 공개, 기타 exception은 `문서 처리 중 오류가 발생했습니다. 파일 형식과 내용을 확인한 뒤 다시 시도해 주세요.`. stack, key, 내부 명령 출력은 금지다. ledger/dashboard는 자체 안전 오류를 갖는다.

API에 `Cache-Control: no-store`; SSE만 `no-cache, no-transform`로 덮어쓴다. 모든 응답 `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; X-Powered-By 비활성. GET/HEAD/OPTIONS 외 요청에 Origin이 **있으면** hostname이 `127.0.0.1`, `localhost`, `[::1]`인지 검사(다른 포트인 localhost도 허용). 불일치 403 `이 로컬 앱에서만 요청할 수 있습니다.`, malformed Origin 403 `요청 출처를 확인할 수 없습니다.`. Origin 없는 요청은 허용하므로 이것을 인증/멀티테넌트 보안이라고 설명하지 않는다. CORS wildcard를 추가하지 않는다. 로컬 서비스 배포 경계는 실행환경 문서를 따른다.

클라이언트 HTTP 에러 표시 우선순위는 `data.message`, `data.error.message`, 문자열 `data.error`, 기본 `요청을 완료하지 못했어요. 다시 시도해 주세요.`다. JSON POST 성공 뒤 window의 `trace:activity-refresh`를 dispatch하여 proxy/backend 재시작 후 activity 관측을 갱신한다. 실패한 4xx 명령을 자동 재전송하지 않는다.

### 4.1 문서·샘플·상태

| Method/path | 요청 | 성공 | 주요 오류 |
|---|---|---|---|
| GET `/api/health` | 없음 | 200 HealthResponse; model=modelExtract alias | 키의 실제 값 없음 |
| POST `/api/documents` | multipart `files` 1~10, `role` target/criteria/ledger | 201 `{documents: PublicDocument[]}` | role/빈 파일/형식 400, 파일크기 413, 저장용량/100개 초과 413 |
| GET `/api/documents/:id/content` | id | 200 원본 bytes, 원래 MIME, inline UTF-8 filename | 404 재업로드 안내 |
| DELETE `/api/documents/:id` | 없음 | 200 `{deleted:true}` | retained run이 참조 409; 없는 문서 404 |
| POST `/api/samples` | `{kind:'expenses'|'materials'}` | 201 SampleResponse | 다른 kind 400; 배치 실패 시 이미 추가한 문서 rollback |
| GET `/api/golden` | 없음 | 200 GoldenCatalog | 기대 정답 JSON은 runtime에 노출하지 않음 |
| POST `/api/golden/load` | GoldenLoadRequest | 201 GoldenLoadResponse | 목록/모드/중복/형식 400; 배치 rollback |

업로드 memory multipart의 한도는 files=10, fields=3, fieldSize=100 bytes, parts=13, fileSize=20*1024*1024. 파일 크기 오류 메시지 `파일당 20MB까지 업로드할 수 있습니다.`; 그 밖의 Multer 한도 오류는 400 `한 번에 최대 10개 파일까지 업로드할 수 있습니다.`. UTF-8 filename이 latin1로 전달된 경우, 각 문자 codepoint≤255일 때만 latin1 bytes를 UTF-8 decode하여 replacement character가 없으면 복원한다. 문서 이름은 경로 basename만 보관하고 control 문자를 제거하며 최대 240자. 지원 확장자 `pdf docx xlsx csv txt md json png jpg jpeg webp`; `.xls`와 `.xlsm`은 미지원. 확장자만 신뢰하지 않고 signature/OOXML ZIP/Text UTF-8 검증을 한다.

PublicDocument는 id/name/kind/mime/size/role/url/preview만 포함한다. URL=`/api/documents/<id>/content`. PDF/image preview는 type만; text preview는 최대 60,000자; table public preview는 최대 30시트×100행×100열에 전체 60,000자 예산이다. 시트/행/열/전체 예산 절단은 truncated=true지만, 개별 cell 문자열을 public 2000자로 자르는 것만으로는 이 플래그가 켜지지 않을 수 있다. 내부 XLSX source cell은 개별3000자 제한 없이 displayedValue 전체를 보존하고 source 전체1,500,000자 예산의 적용을 받는다. `truncated=false`를 모든 원문 글자가 공개되었다는 증명으로 쓰지 않는다. **preview 한도는 원본 분석 한도가 아니다.** 원본 bytes는 그대로 보존한다. 한 업로드의 중간 파일이 실패하면 그 요청에서 앞서 추가한 파일을 삭제하여 응답 전체 실패 처리한다.

XLSX 로컬 미리보기 한도 초과는 새로운 preview 타입이나 빈 업로드가 아니다. HTTP는 정상 201이고 `preview={type:'text',text:'로컬 텍스트 미리보기 일부 생략: <reason>\\n원본 파일은 유지되며 샌드박스에서 전체 구조 분석이 필요합니다.',truncated:true}`다. 이미지 전용은 text=`텍스트 미리보기 없음. 샌드박스에서 이미지/구조 분석 필요`. private source에는 `LOCAL_PREVIEW_INCOMPLETE:` 안내가 들어가고 `sourceSheets:[]`로 부분 시트 전부를 버리며 원본 buffer를 유지한다. 사용자는 업로드한 원본을 다운로드할 수 있고 분석은 반드시 원본의 샌드박스 reader로 이어진다. 상세 exact source 문자열은 02 §2.2, 합성 wire 예시는 examples/01에 있다.

golden 요청 default mode=all, format=pdf. criteria 모드는 criterionId C01–C20 하나이고 certificateIds는 undefined여야 한다(null도 거부). target 모드는 P01–P13 중 중복 없는1~10 certificateIds, pdf/png이며 criterionId는 undefined여야 한다(null도 거부). 두 mode의 ledgerId는 **truthy이면 거부**, null/빈 문자열/false/0/생략은 무시한다. all은 criteria+targets 필수, ledgerId L01–L06 선택이며 null/빈 문자열/생략만 미선택으로 허용(false/0은 유효ID검사 실패). 실제 경로는 데이터셋 구조의 `golden/criteria/Cxx.xlsx`, `golden/certs/Pxx.<format>`, `golden/ledger/Lxx.xlsx`이고 외부 임의 경로를 받지 않는다. golden은 편의 선택기일 뿐 분석 로직에서 ID를 조건으로 쓰지 않는다.

### 4.2 run과 명령

| Method/path | 요청과 검증 | 성공 |
|---|---|---|
| POST `/api/runs` | StartRunRequest. mode default legacy; documentIds/criteriaDocumentIds default []; criteriaText default ''. ID 문자열≤100, 중복 금지, 각각≤10. legacy target≥1; criteria_first target=0. criteriaText≤12000, text 또는 criteria 문서 필수. analysisDocumentIds≤30 중복 금지 | 202 `{runId}`; 작업은 즉시 비동기 시작 |
| GET `/api/runs/:id` | 없음 | 200 RunSnapshot |
| GET `/api/runs/:id/events?after=N` | N은 0 이상 정수; 아래 SSE 계약 | 200 stream |
| POST `/api/runs/:id/criteria/revise` | ReviseCriteriaRequest; feedback 공백 제외 필수≤12000, scope 선택≤1000, eligible documentId 또는 natural-language/unassigned; 20회까지 | 202 RunSnapshot, 완료는 SSE/GET으로 확인 |
| POST `/api/runs/:id/criteria/confirm` | ConfirmCriteriaRequest, 유효 선택 기준 1~250 | 200 RunSnapshot |
| POST `/api/runs/:id/documents` | AttachDocumentsRequest; target IDs 1~10, analysis IDs 0~20, 중복 금지; extras는 이 요청 target 또는 ledger만 | 202 RunSnapshot |
| POST `/api/runs/:id/cancel` | `{}` | 200 RunSnapshot |
| POST `/api/runs/:id/items/:itemId/resolve` | `{status:'pass'|'fail'|'review',note:string}`; trim 필수, note≤2000 (UI≤1000) | 200 `{item,summary}` |
| GET `/api/runs/:id/export?format=json\|csv\|xlsx` | default json; completed/partial/failed이면서 items≥1 | 200 다운로드; [export 상세](05a-ledger-export.md) |

존재하지 않는 run은 전 경로 404 `검토 기록이 없습니다. 서버를 재시작했다면 다시 실행해 주세요.`. run start 시 target ID는 role=target, criteria ID는 role=criteria만; analysis는 등록된 target/criteria/ledger만. criteria_first 분석 목록은 criteriaDocumentIds의 부분집합이어야 한다(409). 열린 run 3개 한도 429, Gemini 키 미설정 503. E2B 오류는 실제 읽기에서 실패로 보고한다. start 성공 응답 전에 끝난 작업도 SSE replay로 받아야 한다.

criteria_first의 revise/confirm/attach는 **정수 expectedCriterionVersion 필수**(누락400). 현재 version과 다르면 409 `기준이 변경되었습니다. 최신 기준을 확인한 뒤 다시 시도해 주세요.`. legacy에서 version은 선택적이나 전달되면 동일 비교. 잘못된 상태에서 revise/confirm/attach/resolve는 409. revise의 20회에는 실패 요청 중 접수되어 feedback 항목을 만든 횟수도 포함. semantic 검증 전에 거부된 요청은 포함하지 않는다. 원래 기준에서 제외한 documentId를 revise에 넣으면400. resolve는 terminal completed/partial/failed에 허용, cancelled에는409. 존재하지 않는 item404. export 상태 오류409, 미지원 format400.

알 수 없는 `/api/*`는404 `{error:'API 경로를 찾을 수 없습니다.'}`. malformed JSON400 `요청 JSON 형식이 올바르지 않습니다.`. 내보내기 Content-Disposition은 ASCII fallback과 `filename*=UTF-8''...`를 함께 제공한다.

`POST /api/runs`의 body shape 오류도 현재 middleware/engine 순서를 따른다. body와 Content-Type을 모두 생략하거나 `Content-Type:text/plain`으로 `{}`를 보내면 req.body가 만들어지지 않아 **500 + 공통 안전 오류**다. `application/json`의 빈 body, `{}`, `[]`는 모두400 `문서와 기준 입력을 확인해 주세요. 문서는 각각 최대 10개입니다.`이며, JSON literal `null`은 parser에서400 `요청 JSON 형식이 올바르지 않습니다.`다. 모든 잘못된 입력을 같은400으로 바꾸는 새 root-object guard는 현재 계약에 없다. 이 결과는 해당 start endpoint의 입력 오류 분기이며 다른 명령의 destructuring/default 동작까지 일반화하지 않는다.

## 5. HITL 초안·명시적 승인·원문 보존

Criterion 최소 필드는 id/label/rule/needsConfirmation. label≤500, rule≤8000, id≤100이고 중복 금지. source 문자열≤4000; scope≤1000; categoryPath 0~8단계, 각 1~200자; sampleName≤300. 타입이 없는 문서는 categoryPath=[]/sampleName 없음, classificationStatus=not_applicable이며 정상이다. 분류가 실제 모호한 경우에만 ambiguous/classificationNeedsConfirmation=true. `sourceDocumentId='natural-language'`는 직접 입력, `unassigned`는 확인되지 않은 출처다. 출처가 하나이고 자연어 입력이 없을 때만 그 하나를 기본 출처로 부여할 수 있다. evidence가 서로 다른 source ID를 가리키면 unassigned/needsConfirmation으로 처리한다.

서버 criteria validator의 conditions 한도는64개×1200자지만 현재 편집 UI는12개×500자, textarea6500자. 공통 의미 없는 scope 조건은 normalize에서 제외. 수치 comparison operator=`lt,lte,gt,gte,eq,range`, finite value, unit≤80, range finite upper≥value. 잘못된 comparison은 validate 단계에서 채택하지 않는다. `comparatorConfirmed=true`인데 유효 비교식이 없으면 승인 오류다.

편집 카드는 inclusion checkbox, 항목/규칙, 유형경로(줄당 단계), 시료, 적용대상, 숫자/정성 선택, 연산자/기준값/상한/단위, 조건을 제공한다. 직접 rule 텍스트를 바꾸면 기존 comparison을 제거하고 mode=choose로 바꾸어 판정 방식 재선택을 요구한다. 숫자 입력의 빈 문자열을 0으로 바꾸지 않는다. 숫자 컨트롤 수정은 규칙 문구도 갱신하고 comparatorConfirmed를 명시한다. `range` 양 끝 포함이다. 정성 선택은 comparison을 생략한다.

직접 추가 기준 ID는 `human-<UUID>` 패턴이어야 한다. 기존 ID를 제출 목록에서 빼면 적용 제외이며 원본 criteria와 승인본은 audit에 남는다. source/sourceEvidence/hierarchyEvidence 등 provenance는 **기존 서버 기준에서만** 복제한다. 제출자가 기존 기준의 source를 바꾸거나 새 기준에 가짜 원문 evidence를 넣어도 받아들이지 않는다. 새 기준 source='사용자 입력', 허용 sourceDocumentId 이외는 natural-language. 각 criteria source가 제외 문서인지 승인 전후 모두 검사한다.

원래 rule 및 비교식이 동일하면 비교식을 유지한다. rule 또는 수치식이 달라졌으면 comparatorConfirmed=true인 새 유효 비교식만 유지한다. comparison을 생략하면 명시적 정성 선택으로 해석한다. 원래 contextNeedsConfirmation=true는 **의미 변경 없이 승인 버튼만 눌러서는** 해제되지 않는다: context flag 유지, needsConfirmation=true, 수치 비교식 제거. rule/required/conditions/comparison/scope/categoryPath/sampleName 중 검증 후 살아남은 실제 semantic edit가 있어야 해당 문맥 불확실성을 해제하고 userOverride/overrideSource='사용자 직접 수정' 표시를 기록한다. label 변경만으로 문맥 해결로 보지 않는다.

revise는 미완성 draft(빈 label/rule/숫자 raw strings 포함)를 모델에 전달할 수 있지만 confirm은 빈 항목명/규칙·빈 선택목록을 거부한다. draftState는 mode/operator/value/upper/unit/issues만, value/upper≤100, unit≤80, issues≤20×500. revise 성공 시 모델 결과 validate→source 조건 보존→group, version/revision 증가; 실패 시 이전 서버 기준을 유지하고 feedback 오류 노출. 클라이언트의 아직 확정하지 않은 draft는 confirmation component를 분석 화면에서 hidden 유지하여 보존한다.

confirm의 approvedCriteria는 `{criteria: deepClone,criterionVersion,approvedAt}`를 깊이 freeze한다. attach 시 run.criteria와 version을 이 승인본으로 다시 지정한다. target 내용을 보고 원래 기준을 몰래 수정하지 않는다. confirmation/revision audit와 item.resolved audit는 내보내기 JSON에 보존한다. item 수정은 machineStatus를 최초 상태로 한 번만 설정하고 최종 status/humanNote/reviewedByHuman=true를 갱신한다. 동일 상태를 확인해도 사람이 확인한 이력을 남긴다.

## 6. run SSE: 이벤트와 수신 규칙

요청 cursor는 `query.after ?? Last-Event-ID ?? 0`; Number로 변환 후 0 이상 정수가 아니면400 `이벤트 순서가 올바르지 않습니다.`. `?after`가 있으면 header보다 우선한다. SSE frame은 아래처럼 **event: 행 없이** 일반 message 이벤트로 전송한다. type은 JSON 안 필드다.

```text
id: 7
data: {"type":"criteria.confirmation_required","runId":"run-demo","sequence":7,"timestamp":"2026-09-21T00:00:00.000Z","mode":"criteria_first","status":"awaiting_confirmation","runStatus":"awaiting_confirmation","stage":"criteria_confirmation","criterionVersion":1,"criteria":[]}

```

응답 headers: text/event-stream, no-cache/no-transform, keep-alive, X-Accel-Buffering=no; 즉시 flush. `sequence=run.events.length+1`, timestamp ISO UTC, 매 event에 mode/status/**runStatus**/stage/criterionVersion 포함. payload가 status를 덮어쓸 수 있으므로 **runStatus가 run의 권위값**이다. 특히 document.completed의 status는 `completed|partial` 문서 상태다. criteria.*에는 현재 excludedCriteriaDocuments/criteriaDocumentAssessments도 항상 포함한다. 구조화 clone 후 append하고 listener에 발행한다.

연결 즉시 저장된 events 중 sequence>cursor를 순서대로 replay한 뒤 listener 등록을 동기적으로 수행한다. run은 한 프로세스의 event loop이므로 replay와 subscribe 사이 완료 누락이 없어야 한다. 같은 연결에서 `sent`보다 작은/같은 sequence는 전송하지 않는다. 15초마다 `: heartbeat\n\n`. request close에 heartbeat clear/listener 삭제. run SSE는 현재 서버에서 history cap, explicit backpressure cap, terminal 시 서버 측 자동 close를 두지 않는다. 클라이언트가 terminal 때 닫는다. 이벤트가 유실된 재접속은 GET snapshot으로 보완한다.

| JSON type | payload 고유 필드 | UI/reducer 의미 |
|---|---|---|
| run.started | documents | running/analyzing 초기 |
| document.analysis.started | documentId,name,role | analysis processing upsert; active document |
| document.analysis.progress | documentId,activity | 분석 activity 갱신; 실제 task 관측도 별개 |
| document.analysis.completed | documentId,analysis | 분석 결과 upsert; payload status 없으면 complete |
| document.analysis.failed | documentId,analysis,message | analysis failed; target doc failed/error |
| criteria.started | 없음 | criteria stage |
| criteria.document.assessed | documentId,assessment | 기준서 자격과 제외/불확실 목록 반영 |
| criteria.discovery.progress | documentId,activity | 기준 탐색 진행 |
| criteria.ready | criteria,criteriaGroups,criteriaDocuments | 후보 반영; 아직 승인 아님 |
| criteria.confirmation_required | criteria,criteriaGroups,criteriaSources,criteriaDiscovery,analyses | awaiting_confirmation; active document 해제 |
| criteria.revision.started | criteriaRevision,criteriaFeedback | running/criteria_revising, 이전 오류 해제 |
| criteria.revision.completed | criteria,criteriaGroups,criteriaRevision,criteriaFeedback | awaiting_confirmation, 이어 confirmation_required |
| criteria.revision.failed | message,revisionError,criteria,criteriaGroups,criteriaFeedback | 초안 유지 + 오류, confirmation 복귀 |
| criteria.confirmed | criteria,criteriaGroups,approvedCriteria,criterionVersion | 승인본 반영 |
| run.awaiting_documents | criteria,criteriaGroups,approvedCriteria | target 입력 가능 |
| documents.attached | documents,approvedCriteria | running/analyzing_targets |
| document.started | documentId | 문서 processing/reading |
| document.extracted phase=fields | documentId,phase,fields,referenceNumber,extraction,items=[] | 시각문서 독립 원문 추출 저장 |
| document.reviewing | documentId | reviewing |
| document.extracted phase=review | documentId,phase,items(모두 pending),선택적 extraction/fields/referenceNumber | item ID 기준 pending upsert |
| item.decided | item | 해당 item ID 교체/추가, reviewing |
| document.incomplete | documentId,message,reviewCoverage 또는 missingRows | doc partial/error |
| document.completed | documentId,itemCount,status | doc completed 또는 partial. incomplete 뒤에도 발행할 수 있음 |
| document.failed | documentId,message | 해당 문서만 failed |
| run.completed | summary,status(completed/partial) | complete 화면; 연결 종료 |
| run.failed | message,선택적 summary | failed; 연결 종료, 오류 노출 |
| run.cancelled | 없음 | cancelled; 연결 종료 |
| item.resolved | item,summary | human override와 카운트 반영 |

`human.required`는 현재 hook이 구독 이름으로 받아들일 뿐 baseline 엔진이 발행하지 않는 호환 예약명이다. 임의 synthetic human.required를 실제 작업 activity인 것처럼 만들지 않는다. 모든 event 종류가 독립 endpoint는 아니다. 정상 순서는 문서 병렬 실행 때문에 서로 interleave되며 배열 순서와 완료 순서를 동일시하지 않는다.

## 7. 클라이언트 race·재연결 알고리즘

ReviewRequestGate의 ticket은 `{generation,runId,sequence,revision,localRevision}`. begin은 generation+1, 지정 runId 또는 null, 나머지0. new run/reset/cancel/unmount에 begin. start 응답이 옛 generation이면 반환 runId를 원격 cancel하고 화면에 바인딩하지 않는다. bind는 현재 generation+runId가 동일할 때만 수행한다.

1. SSE는 현재 generation/runId/connection 인스턴스이며 event.runId가 같고 sequence가 safe integer이고 마지막 sequence보다 클 때만 수용. 수용 후 sequence 갱신/revision+1. duplicate/out-of-order/malformed JSON 무시.
2. 일반 GET snapshot은 요청 ticket의 generation/runId/sequence/revision이 **모두** 아직 같고 snapshot.id가 현재 runId일 때만 적용한다. snapshot.events 최대 sequence까지 cursor를 올리고 revision+1. 늦은 GET이 최근 SSE나 사람 수정 결과를 덮어쓰지 않는다.
3. 명령 POST 직전 touch로 revision/localRevision을 둘 다 증가한다. 응답은 generation/runId/localRevision이 같아야 한다. snapshot.events가 있으면 응답 snapshot의 이 run 최대 sequence가 현재 sequence 이상일 때만 적용한다. 이 규칙 때문에 POST 사이 도착한 선행 SSE 뒤의 더 최신 command snapshot은 수용 가능하다. events 없는 legacy 응답은 엄격 GET 규칙 사용.
4. start/revise/approve/targets는 action token 하나로 중복 전송 금지. resolve는 item별 최신 Symbol token을 보관하여 같은 항목의 늦은 응답만 버린다. 서버 저장 성공 직후 UI item/summary를 직접 갱신한다. resolve 동안 touch하여 오래된 snapshot을 차단한다.
5. EventSource URL은 생성 당시 last sequence를 `?after=`에 넣는다. browser 기본 reconnect가 replay를 다시 보내도 duplicate gate가 제거한다. onerror는 동시 recovery 하나만 수행하며 GET으로 현재 상태 확인. terminal이면 close; 아직 실행 중이면 native EventSource reconnect 유지.
6. recovery GET도 실패하면 현재 ticket과 revision이 변하지 않았는지 재확인. 그 사이 SSE가 살아난 상태(readyState OPEN)이면 연결됨으로 복귀. 그렇지 않으면 close/touch, UI failed, `연결이 끊어졌어요. 서버 실행 상태를 확인한 뒤 다시 검토해 주세요.`. 이때 서버 작업은 자동 cancel되지 않았을 수 있다. 재시작 후 ID404는 복구 가능한 영속 run으로 표시하지 않는다.

UI events 패널은 최근80개, analysisActivity는 id별 merge 후 최근120개. **서버 run.analysisActivity와 run.events는 이 클라이언트 cap을 적용하지 않고 전체 이력을 보관**하므로 GET payload와 화면 이력 길이가 다를 수 있다. 서버 상태가 terminal/confirmation/revision completion/awaiting_documents이면 GET 최종 snapshot을 받아 events에 없는 전체 메타데이터도 정합시킨다. 데이터 흐름 reducer에서 event.stage와 event.runStatus가 우선하고, 없는 경우 document.*의 status를 run status로 덮어쓰지 않는다.

## 8. activity SSE: 실제 서비스 관측 계약

GET `/api/activity` →200 ActivitySnapshot. GET `/api/activity/events` → named `event: activity`, `id: <store.revision>`, data 전체 snapshot. cursor replay API가 아니다. 접속 즉시 snapshot, 이후 변경마다 전체 snapshot. run SSE와 다른 연결이며 run/context/document 필터를 UI에서 적용한다. 15초 heartbeat, 응답 writableLength>512*1024이면 destroy하여 느린 client가 재접속하게 한다. close시 unsubscribe/timer 정리.

task kind=document/criteria/dashboard/sandbox, runtime=e2b/gemini, status=queued/running/completed/failed/cancelled. create가 queued 실제 이벤트를 생성하며 observeActivity는 **실제 service request await 구간**에만 running을 붙인다. 작업 상태에 맞춘 completed/failed/cancelled만 terminal. terminal 이후 report/transition 무시. task phase와 currentOperation은 step 기준이며 stdout log를 새로운 handoff로 해석하지 않는다.

취소 후 cleanup 실패의 관측 채널은 **global E2B activity task**다. 이 task는 work와 kill이 모두 settle되기 전 terminal로 만들지 않는다. signal aborted이면서 kill 실패면 마지막 transition은 `failed`, phase=`cleanup`, title=`실행 환경 종료를 확인하지 못했습니다`; 성공 cleanup 후에는 `cancelled`다. 이미 cancelled인 run의 status는 유지되고 추가 `document.analysis.progress`/run 실패 event는 차단된다. 먼저 취소된 LLM 자식 task를 다시 failed로 바꾸지 않는다. `/api/activity` 또는 그 SSE를 계속 관측하면 cleanup 실패를 확인할 수 있지만, **현재 UI stop 화면이 그 실패를 반드시 다시 띄워 준다는 보장은 없다**. 이를 보장하려면 별도 terminal-run cleanup 알림 기능과 검증이 필요하며 현재 구현 완료로 주장하지 않는다.

runId/contextId/documentId/parentTaskId는 `[A-Za-z0-9_-]{1,100}`. parent의 document/context와 충돌하면 parent 연결 생략. parentTaskId가 있고 parent가 running이면 waitingForTaskId 표시. 자식 종료 시 부모의 waitingForTaskId가 해당 자식일 때만 제거. handoff는 fromTaskId와 현재 toTaskId가 서로 다르고 식별자가 유효하고 알려진 from의 document/context가 현재와 충돌하지 않을 때만 수용. 근거 없는 반복 LLM↔sandbox 빛 이동을 만들어 내지 않는다.

기본 retention=20 tasks; unfinished는 보존하고 terminal만 오래된 것부터 pruning하므로 동시에 미완료 task가20개 이상이면 snapshot이20개를 넘을 수 있다. task별 일반 event30개/log12개, 초과분 oldest를 종류별 제거하고 history.omittedEvents/omittedLogs 증가. latest-first task 순서. attempt/maxAttempts는1~10, issueCount0~10000, roundStatus=verified/retry/needs_review. UI가 누락된 이력도 “모두 재생했다”고 주장하면 안 된다.

sanitizeActivity는 명시한 secrets≥4문자 제거, control 문자→space, URL→[주소], local path→[경로], key/token/secret/password/authorization assignments 및 API key 패턴→[비공개]. code/command로 보이는 text는 일반 상세 안내로 대체. 기본 detail300, title100, event title160, filename240, phase50자. activity endpoint는 코드 콘솔이 아니다. 원문 인용과 판정 evidence는 별도 run 데이터 계약을 따른다.

## 9. 대장 HTTP 계약

대장 알고리즘/OOXML 보존/일반 export 형식은 [05a-ledger-export.md](05a-ledger-export.md). 여기서는 왕복 계약을 고정한다. 두 POST 모두 필요하면 original XLSX를 먼저 ensureAnalyzed하며 request abort/response premature close가 해당 분석 AbortController로 연결된다. contextId 선택값은 `[A-Za-z0-9_-]{1,100}`. source 문서는 kind=xlsx여야 하며 현재 구현은 role='ledger'만으로 제한하지 않는다.

| Method/path | 요청 | 응답/오류 |
|---|---|---|
| POST `/api/ledgers/analyze` | LedgerAnalyzeRequest: documentId, key≤200 공백 제외 필수; runId/sourceDocumentId 선택(둘 중 하나라도 보내면 proposal 생성 시 둘 다 유효해야 함) | 200 `{mapping,proposal?,analysis?}`; mapping.blocked도200. 문서 없음/비xlsx404, 잘못된 키400, proposal run이 completed/partial 아님409 |
| POST `/api/ledgers/export` | LedgerExportRequest: confirmed=true, documentId,key,runId,sourceDocumentId,mapping,proposalFingerprint; 추가 note≤1000 | 200 xlsx attachment 사본; confirmed 누락400; key와 mapping.key 불일치400; 결과 fingerprint 변경409; mapping/sourceDigest/기존값 변화409 |

mapping은 ready/blocked, code/reason/key/sheet/keyColumn/resultColumn/noteColumn/matchingRows/targetCells/existingValues, 가능한 경우 headerRow/sourceDigest/candidates. ready는 정확히 2 targetCells이고 순서는 [판정 셀, 비고 셀]. blocked 코드 전체는 contracts/types.ts. proposal은 result/note/counts/sourceDocumentId/sourceDocumentName/incomplete/fingerprint. fingerprint는 현재 proposal(그 fingerprint 제외)을 JSON.stringify한 UTF-8 bytes의 SHA-256 hex. export가 현재 run으로 proposal을 다시 만들어 비교하므로 **이 직렬화 payload가 달라졌을 때만** 기존 fingerprint가409다. `humanNote`, `reviewedByHuman`, audit 자체는 hash 입력이 아니다. 같은 status로 메모만 수정하거나 proposal.note에 포함되지 않은 항목 설명이 바뀌면 fingerprint가 같을 수 있다. 모든 사람 수정이 무조건 기존 제안을 무효화한다는 계약이 아니다.

서버는 요청의 임의 result를 쓰지 않고 현재 proposal.result만 기록한다. note는 proposal.note + 선택적 `사용자 확인: <추가 의견>`를 개행 결합. 원래 업로드 bytes를 덮어쓰지 않고 `<원본명>_검토반영.xlsx`를 다운로드한다. UI는 대장파일/성적서번호/연결 target가 바뀌면 기존 mapping/proposal/basis를 무효화하며 분석 후 정확한 대상 셀/현재값/새값을 사용자가 확인해야 export 버튼이 활성이다.

## 10. 요약·내보내기·검증 기준

summary는 total/pass/fail/review/documents/completedDocuments/failedDocuments/incompleteDocuments/unreviewedRows/humanReviewed. total=items.length, pass/fail/review는 **최종 item.status** 개수, humanReviewed는 reviewedByHuman 개수. unreviewedRows는 각 doc.missingRows.length 합계. pending을 pass/fail/review에 배분하지 않는다. `total = pass+fail+review`는 모든 item이 최종 상태일 때만 성립한다.

문서 카운트는 `documents=run.documents.length`, `completedDocuments=count(status==='completed')`, `failedDocuments=count(status==='failed')`, `incompleteDocuments=count(status==='partial')`다. queued/processing/cancelled는 세 부분 카운트 어디에도 더하지 않는다. 예: completed1/partial1/failed1/cancelled1인 4문서는 documents4/completedDocuments1/incompleteDocuments1/failedDocuments1이며 세 카운트 합이 documents보다 작아도 정상이다. `humanReviewed`는 `reviewedByHuman` truthy인 item 수다.

JSON export에 id/mode/status/createdAt/criterionVersion/approvedCriteria/criteriaFeedback/summary/criteria/criteriaDiscovery/analyses/documents/items/audit 포함. CSV는 UTF-8 BOM, CRLF, 모든 셀 double quote와 quote escaping, 선행 공백 뒤 `[=+@-]`면 `'` prefix하여 formula injection 방지. XLSX는 검토 결과/적용 기준/확인 이력/검토 범위 시트. 상세 열/너비/보존 범위는 대장·export 문서가 소유한다.

필수 검증 시나리오(실행 결과를 별도 evidence에 기록; 이 목록 자체는 통과 증거가 아니다):

1. start→confirmation 전에 target attach409; 승인 version 누락400/stale409; 승인본 deep immutable; confirm 시 submitted criteria 있으면 version+1.
2. criteria 0개 + 모두 비기준서 제외는 confirmation UI에 제외사유/원문만 제공하고 확정 버튼 숨김. 새 입력으로 복귀 가능.
3. 완료 이벤트가 POST start 응답보다 빨라도 SSE replay로 복원. duplicate sequence, 다른 run, 오래된 GET, cancel 뒤 늦은 resolve/start 응답 모두 무효.
4. 사람 수정→snapshot GET race에서 수정 보존. machineStatus 최초 값과 모든 audit before/after 보존. note blank400.
5. 두 target 중 하나 실패하면 다른 target 결과 보존+run.partial. 모든 target 실패는 failed. 결과250개에서 complete로 위장하지 않음.
6. SSE heartbeat/close cleanup; native reconnect의 replay 중복 제거; server restart404를 사용자 안내. activity backlog로 actual 실행 상태를 늦추지 않음.
7. 잘못된 origin403, invalid JSON400, 업로드 실패 rollback, file20MiB 경계413, retained evidence delete409. API/error/activity에 비밀키/stack 없음.
8. ledger proposal의 result/note/counts 등 hash 입력을 바꾸는 사람 수정은 기존 fingerprint를 무효화하고, 메모만 바꿔 proposal payload가 같으면 fingerprint 유지. blocked mapping export 금지. JSON/CSV/XLSX는 최종 status를 내보내며 machineStatus는 최초 기계 판정으로 보존한다.

## 11. 서버 프로세스 종료의 현재 경계

기준 서버는 `PORT || 8787`, host=`127.0.0.1`로 listen한다. SIGINT/SIGTERM마다 현재 engine.runs를 순회해 `engine.cancel(run)`을 호출한 후 `server.close(() => process.exit(0))`를 등록한다. cancel은 열린 run에 abort를 전달하고 terminal run은 no-op다. 이는 **모든 sandbox cleanup Promise를 await하는 shutdown supervisor가 아니다**. live SSE를 명시적으로 닫지 않으며 shutdown deadline, 강제 연결 종료, cleanup 실패별 exit code, dashboard/ledger 별도 AbortController 일괄 취소가 없다. HTTP connection이 남으면 close callback이 지연될 수 있고 반대로 cleanup을 별도로 기다린다고 보장할 수도 없다.

프로세스 종료 전 모든 작업/kill 정산, 모든 stream 종료, 제한 시간, 실패 exit code가 필요하면 추가 설계·구현·process-level 테스트 대상으로 분리한다. 문서의 `finally kill` 단위 계약만으로 현재 process shutdown까지 통과했다고 판정하지 않는다. 기존 source 기준 동작은 위 시그널 핸들러이며, 확장 gate에는 SIGINT during create/install/stream + SIGTERM + failed kill 각각의 종료/자원 evidence를 요구한다(현재 패키지 작성 중 미실행).

`contracts/examples/*.json`는 합성 문서명/값/ID로 만든 계약 예시다. 실제 golden 모델 결과나 사용자 업로드를 복제한 것이 아니며 라이브 검증 실행 결과라고 해석하지 않는다. 제품 재현 gate는 별도 PLAN/acceptance 문서의 실행 로그를 요구한다.

## 독립 감사 보충: 실제 samples recipe

[sample-recipes.json](../contracts/sample-recipes.json)은 /api/samples의정확한고정내용·순서·role/MIME·bytes/hash·criteriaText다. expenses는UTF-8/LF453bytes CSV1개(target),materials는P01/P07/P13 PDF target순서후C01 XLSX criteria1개다. 가변UUID/url/timestamp는고정하지않는다. materials원문은출발데이터셋의명시된경로/hash를읽으며별도합성대체파일을만들지않는다. intro의3개장식EXAMPLE및SAMPLE-01의UI전이fixture와API실제내용을혼동하지않는다. 요청중하나라도read/add실패면그요청에서추가한문서만rollback한다. 어느branch도분석/확정을시작하지않는다. 현재제품실행은NOT_RUN이다.

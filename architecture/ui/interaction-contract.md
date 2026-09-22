# UI 상호작용·상태·시간 정본

이 문서는 `specs/04-ui-motion.md`와 `detail-controls.md`를 보완한다. 현재 소스를 읽어 정의한 **CURRENT_REPRODUCTION 재현 계약**이며 실행 성적표가 아니다. `interaction-fixtures.json`의 모든 사례는 `NOT_RUN`이다. 시각 선언의 정본은 [VISUAL-CONTRACT.md](VISUAL-CONTRACT.md), 업무 API/경쟁 제어의 정본은 [01-state-api.md](../specs/01-state-api.md)다. 아래 시간은 테스트 fake clock 밀리초이며 요청 지연을 애니메이션으로 위조하지 않는다. I8.1/I9.1과 I9.2의 OPTIONAL_FUTURE는 현재 제품에 없는 별도 개선안이다. 개선안의 기존 gate 이름은 미래 시험 추적용이며 현재 재현의 필수 정답을 대체하지 않는다.

## I1. 입력·예제·페이지 수명주기 (UI-01/03/04)

`locked=pending||uploading||sampleLoading`. 전송 전 locked/빈 파일을 거부하고 target 업로드는 run.status=awaiting_documents만 허용한다. drag-over는 preventDefault 뒤 unlocked일 때만 dragOver=true, leave/drop은 false. 업로드 때 파일 선택/삭제/방식 전환은 disabled지만 기존 파일 원문 열기와 preview 닫기는 허용한다. 문구는 `파일을 불러오고 있습니다`, Loader2 29px. **20MB/파일은 안내이며 App 사전 검사 없음**; FormData에 선택 파일 전부+role을 보내고 서버가 20×1024²bytes/파일,10files,3fields,100bytes/field,13parts를 검사한다. 성공 append, 실패 기존 목록·preview 보존+alert. 업로드의 epoch가 달라진 응답은 무시한다.

파일 click은 preview만, 닫기는 preview=null만. 삭제는 unlocked에서 DELETE 성공 후 해당 ID 제거하고 **요청 시작 시 closure의 preview**와 ID가 같으면 닫는다. 삭제 자체는 pending/uploading을 올리지 않으며 epoch/AbortSignal/문서별 요청 dedupe가 없다. 따라서 삭제 대기 중 다른 파일 B를 열어도, 시작 때 삭제 파일 A가 preview였으면 A의 성공 응답이 B의 preview를 닫을 수 있다. 실패 목록/preview 유지+오류이며 늦은 오류에 epoch guard가 있다고 주장하지 않는다. 마지막 기준 파일 삭제 후 file-mode 기준 정리 버튼은 disabled. 방식 변경은 preview를 닫고 file/text 입력은 보존한다. 파일 input의 onChange는 전송 시작 직후 value=''로 비워 동일 로컬 파일 재선택을 허용한다. 문서의 filename/bytes에 의한 UI 중복 제거는 없으며 응답 document ID마다 append한다.

|경비 예제 단계|page/documents/text/sampleTargets/preview|busy 표시|
|---|---|---|
|POST `/api/samples` `{kind:'expenses'}` 대기|모두 이전 값 보존, 오류 초기화|sampleLoading=true/locked=true; CTA spinner|
|성공|review.reset; criteria-input/text; documents=응답 criteria만; text=응답 criteriaText; sampleTargets=응답 target만; preview=null|finally false|
|실패|이전 page/documents/text/sampleTargets/preview 그대로; 오류 banner|finally false|

sample load 자체에는 inputEpoch 검사/AbortSignal이 없다. UI 잠금은 정상 조작의 중복 시작을 막으나 이를 모든 외부 강제 reset 경쟁까지 처리한 코드라고 부르지 않는다.

Golden App 경로는 criteria/target만이다. all은 컴포넌트 기본값·격리 테스트 경로이고 App에서 접근할 수 없다. criteria 요청 `{mode:'criteria',criterionId}`, target 요청 `{mode:'target',certificateIds,format}`. onLoad는 호출 시 role에 맞는 반환 문서만 append하고 picker/preview를 닫는다. 선택 0 target이면 load disabled/API0. criteria catalog가 비어도 기본 C01가 남아 load 가능하다는 현재 한계가 있다. 로드 성공은 분석이나 기준 확정을 시작하지 않는다. GET catalog 실패는 오류/닫기 허용; load 대기는 X disabled/Escape 무시; POST 실패는 선택 보존/loading=false.

**중단:** 즉시 hook gate.begin→SSE 종료→action/resolving/connecting/activeDocument 초기화→로컬 run.status=cancelled/stage=idle. POST cancel snapshot은 적용하지 않는다. 실패는 alert이고 취소 상태를 되돌리지 않는다. 이후 늦은 응답은 gate로 거부. **reset:** inputEpoch++; review.reset(); page=intro, documents=[], criteriaText='', sampleTargets=[], inputMode=file, preview=null, selectedItemId=null, resultTab=files, exportOpen=false, dashboardOpen=false, ledgerOpen=false, analysisTab=live, presentationBusy=false, reviewFlowBusy=false. **직접 대입하지 않는 App 상태:** goldenMode, confirmationRunId, dragOver, uploading, sampleLoading, startedAfter. 정상 UI의 locked는 대부분의 동시 reset 진입을 막지만 이 값들이 reset 함수에서 초기화된다고 주장하지 않는다. **기준 입력으로:** run reset+criteria role 문서만 보존, criteria-input, preview/selection/presentation 비움; text/inputMode/sampleTargets는 reset()처럼 전부 지우지 않는다.

Terminal effect 의존성은 정확히 `run.id,run.status,pending,page,analysisTab,presentationBusy,reviewFlowBusy,preference.enabled`. pending이면 아무 이동 없음. awaiting_confirmation→criteria-confirm, awaiting_documents→targets, completed/partial→results. 다른 상태는 목적지 없음. 현재 페이지가 목적지이면 없음. ON+live탭+현재 analysis/review+목적지≠targets에서만 delay를 선택한다: reviewFlowBusy1800, 아니고 presentationBusy1600, 아니면120. 의존성 변경 시 기존 timeout 취소하고 다시 계산. 그렇지 않으면 즉시 이동. callback은 captured epoch가 같을 때만 page/preview를 바꾼다. 최초 terminal 수신 후 절대 deadline은 없으며 **마지막 의존성 변경으로부터** delay를 검증한다(TIMER-01).

### I1.1 App의 탭·원문 대체·메뉴 수명주기

이 절은 App이 하위 화면을 실제 mount하는 조건이다. CSS로 숨겨 놓고 모든 화면 상태를 보존하는 구현과 구별한다.

| 영역/행동 | 다음 App 상태 | 하위 화면 수명 |
|---|---|---|
| 기준 확인에서 피드백 재정리 | page=criteria-analysis, analysisTab=live, preview=null | confirmationRunId===run.id이고 page가 confirm/analysis이면 같은 run.id key의 CriteriaConfirmation을 유지하고 `hidden`만 변경. 확정 후 targets 또는 다른 page면 unmount |
| 기준 분석/대상 review의 `읽은 문서와 구조` | analysisTab=structure, preview는 보존 | preview가 없으면 live pane을 unmount하고 DocumentAnalysis를 mount. 서버 작업/검토 SSE는 중단하지 않음 |
| 같은 화면의 `실시간 작업` | analysisTab=live, preview=null | DocumentAnalysis/상단 sourcePreview를 unmount하고 live pane을 새로 mount. LiveReviewFlow key는 run.id 또는 starting + startedAfter |
| 분석/review/results에서 App `viewSource` | mergedDocuments에 ID가 있으면 preview={document,evidence:[source]}; unknown ID면 무동작 | sourcePreview가 현재 pane보다 우선하여 그 pane을 대체하고 unmount. 닫기 preview=null 후 해당 tab pane을 새로 mount |
| 결과 `파일별 결과`/`전체 요약` | resultTab=files/summary, preview=null | FileReviewResults/ResultsVisuals/DocumentAnalysis 중 선택 pane만 mount. 단순 탭 이동 때 hidden 상태로 세 pane을 보존하지 않음 |
| 결과 `분석 범위` | resultTab=analysis, preview는 보존 | sourcePreview가 열려 있으면 계속 표시. 닫힌 뒤 분석 pane이 mount |
| 전체 요약의 항목 선택 | selectedItemId=id, resultTab=files | ResultsVisuals unmount 후 FileReviewResults가 외부 selectedItemId를 받아 해당 파일 상세를 선택 |

하위 컴포넌트의 local filter/tooltip/scroll/drawer 상태는 unmount 시 소멸한다. App의 selectedItemId/resultTab/analysisTab은 위 표에 지정된 대입 외에는 보존된다. 따라서 summary 필터는 나갔다 돌아오면 all이고, file 상세 선택은 App selectedItemId를 통해 복구할 수 있지만 이전 목록 scrollTop까지 App이 저장하는 것은 아니다. I8의 목록복귀 scroll 복원은 **동일 FileReviewResults mount 내** 계약이다. targets에서는 sourcePreview가 승인기준 설명 카드를 대체하지만 업로드 카드는 유지한다.

결과 내보내기 메뉴는 exportOpen 하나로 열고 같은 버튼으로 toggle한다. xlsx/csv/json은 `/api/runs/{id}/export?format={format}`의 `download` 링크이고 클릭 즉시 exportOpen=false다. `검토대장에 기록`은 메뉴를 닫고 ledgerOpen=true. 외부 클릭/Escape/blur로 메뉴를 닫는 App listener는 없으며 결과 탭 전환만으로 exportOpen을 초기화하지 않는다. 메뉴가 열린 채 탭을 바꾸면 계속 열려 있다. 결과 외 page에 잠시 안 보이더라도 exportOpen state의 값이 자동 소멸한다고 가정하지 않는다(reset은 명시 false).

## I2. 실제 자료 문맥과 동시 파일 (UI-07)

대상 배열은 입력 documents의 target 순서. 기준은 `approvedCriteria?.criteria || run.criteria || []`; 승인 빈 배열도 truthy라서 draft로 fallback하지 않는다. milestone 읽기=target ID의 complete/completed/ready analysis unique 수, 추출=target.fields.length 합, 판정=전체 run.items 중 pending이 아닌 수다.

activeOperation은 busy && operation.status=running && operation.documentId가 target인 경우다(연결 live 조건 없음). active file 우선순위: activeOperation → reverse run.events에서 status processing 대상의 최신 event → 첫 processing 대상 → reverse analysisActivity의 첫 대상 ID → 첫 대상. active stage는 operation phase verify/review→reviewing, extract→extracting, read/files/structure/context/transcribe/reread/quality→analyzing_targets, 그 외 run.stage||analyzing. stage와 event를 시간순으로 보인다는 이유로 업무 상태를 임의 완료하지 않는다.

source records는 fields가 있으면 label/formatValue+unit, 없으면 analysis.structure(name||sheet||page쪽||원문 구역, range||description||kind||구조 확인). source/criteria 각각 독립2개/page, count>2일 때만 이전/다음. 페이지는 modulo ceil(count/2), 양끝 순환. 파일 변경만으로 page state를 reset하지 않으며 새 자료 수로 modulo한다. 파일별 판정 수=resultCount.

|상태|제목|expanded/모션|footer 왼쪽|
|---|---|---|---|
|busy && !observing|마지막으로 확인한 검토 자료|true/is-working 없음|연결 확인 중 · 마지막 수신 자료|
|busy && observing && reviewing|원문 항목과 확정 기준을 대조합니다|true/is-working|항목 · 단위 · 적용 범위 확인 중|
|busy && observing && extracting|문서에서 검토 항목을 추출합니다|true/is-working|원문에 있는 값과 위치 추출 중|
|busy && observing 기타|원문의 구조와 맥락을 읽습니다|true/is-working|페이지 · 시트 · 표의 구조 확인 중|
|!busy (completed/partial/failed/cancelled 포함)|검토에 사용한 자료|사용자가 open을 정했으면 그 값, 아니면 resultCount==0일 때 열림; 모션 없음|검토 입력 기록|

observing=`operation?.connectionLive??true`. 파일 없음 `문서 연결 중`; source0 `원문을 읽으면 추출한 내용이 여기에 연결됩니다`; criteria0 `확정된 기준을 연결합니다`. footer 오른쪽: resultCount>0이면 `이 파일의 판정 N개 도착`, 아니고 reviewing이면 `판정 응답 대기`, 그 외 `실제 읽은 자료만 표시`. busy에서는 접기 버튼 없음. completed icon은 !busy&&resultCount>0일 때 Check. Theater는 observing을 전달받지 않으므로 연결 단절만으로 busy 배경 스캔이 정지하지 않는다.

파일 nav의 상태 문구는 아래 우선순위를 따른다(문서별 counts는 전체 items를 documentId로 묶는다). `completed/complete→검토 완료`, `failed→읽기 확인 필요`, `partial→일부 확인 필요`가 최우선이다. terminal 파일이 아니면 active file+reviewing 또는 counts.pending>0→`기준 대조 중`; 아니고 counts.total>0→`판정 도착`; 아니고 analyzed 집합 포함→`항목 추출 중`; 아니고 file.status=processing→`원문 읽는 중`; 나머지는 busy→`원문 분석 중`, done→`판정 없음`, 그 외→`대기`다. is-processing class는 counts.pending>0 또는 file.status=processing이며 위 문구와 독립이다. counts가 존재하면 pass/fail/review 숫자 3개(0도 표시), 존재하지 않으면 ScanLine13을 쓴다. 파일 button은 선택된 작업실 그룹을 바꾸지 않고 `{documentId}`를 App viewSource로 보낸다.

LiveReviewFlow의 selectedId/focusWorkroom/operation 초기값은 null/false/null이다. theater 항목 선택 시 파일 nav를 인라인 판정 근거로 대체한다. 원문 버튼은 evidence[0]이 있을 때만 보이며 해당 source를 App에 전달한다. `작업 크게 보기`는 focusWorkroom을 toggle하고 CSS `is-workroom-focused`로 primary를 display:none 처리한다. 이때 primary/theater/context를 React unmount하지 않으므로 숨겨진 동안 받은 snapshot·packet timer·counts는 계속 갱신된다. `검토 흐름과 함께`는 같은 mount의 primary를 다시 보인다. 이것을 I1.1의 App 탭 전환/unmount와 혼동하지 않는다.

## I3. Theater packet·lane·클릭 (UI-08)

문서 ID sorted join context. 최초 snapshot, context 변경, 빈 데이터는 baseline. OFF는 현재 signature를 baseline으로 기록하고 packets를 제거; ON만으로 과거 도착을 재생하지 않는다. context 변경은 latestIds도 비우지만 빈 데이터는 latestIds를 남긴다(일치 없으면 아래 fallback). 동일 signature 재수신은0새packet. item signature=[status,value,unit,label]; fields key=documentId:index:label/signature=[value,unit].

변경 decided 항목의 마지막 pass/fail/review 각각을 먼저 배열에 넣고 changed.slice(-6)를 이어 붙여 Map으로 ID dedupe(첫 삽입 순서). 최근 변경 field가 있으면1slot 예약하여 **field 먼저**, verdict 후보의 앞(6-reserved)개를 추가한다. 이전 아직 유효/서명 동일 packet+새packet의 마지막6개만 유지. 예100개 pass+field1개 동시 도착이면 `[field,pass100,pass95,pass96,pass97,pass98]`, 전체 counts는 즉시100이다. 애니메이션은 샘플이지만 데이터는 생략하지 않는다.

lane마다 matching의 `latestIds[status]`와 일치하는 첫 항목, 없으면 matching.at(-1). count는 matching.length padStart(2,'0'). 빈 busy lane=분류 대기, 빈 idle=—. live decided 카드는 enabled button으로 선택 항목의 인라인 근거(값/단위·파일·기준·설명·첫 evidence 원문)를 파일 nav 자리에서 보인다. close는 selectedId=null. preview 카드는 비상호작용 div. 떠다니는 packet은 pointer-events:none/aria-hidden이며 클릭 handler 없음.

이동 수치/좌표는 04 §5와 시각 catalog. 신규 delay index×75ms; verdict1800ms/extraction1300ms; expires=now+delay+1920ms,350ms sweep. failed/cancelled/busy=false만으로 기존 packet을 버리지 않는다. OFF/context변경/empty는 clear, unmount interval 정리 및 onPresentationBusy(false). width≤760에서 packetlayer/stations display:none이어도 state/timer/count는 존재. Live 출력 ambient branch는 disabled; preview만 명시적3개 예시 repeat. review busy 배경 scan은 새 결과 증거가 아니다.

## I4. Dock scope·선택·관찰·로그 (UI-09)

정규화 뒤 받은 순서를 유지한다. 유효 id/status task들에 **slice(-100)**; 서버 snapshot은 newest-first라 overflow는 oldest100을 보존하는 현재 한계. events는 slice(-200) 뒤 유효 title 필터. 이를 최신순 보존으로 몰래 고치지 않는다.

scope predicates를 아래 순서로 전부 AND한다. 부모에게서 누락 필드를 보충하지 않는다.

1. runId undefined=제한없음, null=모두제외, 문자열=task.runId 동일.
2. contextId undefined=제한없음, null/빈문자열=모두제외, 문자열=(task.contextId||task.dashboardId) 동일.
3. finite startedAfter 또는 parse 가능한 날짜: task.startedAt≥cutoff. invalid/missing cutoff=제한없음.
4. taskKinds가 nonempty면 kind 포함.
5. documentNames는 lowercase+공백제거 후 title에 full name 포함 또는 name.length>48이면 앞48 포함.

|호출|run/context/cutoff/kinds|busy/초기/autoCollapse|
|---|---|---|
|기준 분석/재수정|run?.id??null / context undefined / command 직전 Date.now / kinds undefined|pending / expanded=true / false|
|검토 LiveReviewFlow|같은 run / context undefined / startTargets 직전 Date.now / kinds undefined|pending / expanded=true / **true**|
|대시보드|run.id / create응답 전 null, 이후 job.id / POST 직전 Date.now / ['dashboard']|modal busy / true / false|
|대장|run undefined / analyze마다 fresh UUID / cutoff undefined / kinds undefined|analyze일 때만 mount, busy=true / compact / false|

documentNames는 실제 네 호출 모두 undefined. inline prop은 받아도 root는 항상 is-inline. Group은 scope 통과 task로만 만든다: document이면 `document:${contextId||runId||''}:${documentId}` → dashboard kind+context이면 `dashboard:${contextId||dashboardId||runId||'current'}` → 사용 가능한 parent identity(순환 guard) → task:id. groupTasks의 parent identity 상속은 순환 guard와 parent 존재만 확인하며 document/run/context 호환 검사가 없다. 자기 document나 dashboard identity가 없는 child는 contextB여도 contextA/documentD parent의 그룹을 상속할 수 있다. 실제 빛 전달 후보 actualTransfers의 양측 scope guard와 이 그룹화를 혼동하지 않는다. 따라서 run 바운드에서 child.runId 없는 child는 parent를 찾기도 전에 제외된다.

group 순서는 최초 encounter, group 내 task는 startedAt 오름차순. executing=running&&!waitingForTaskId, active=running||queued. activeCount는 waiting parent 포함; runningCount는 executing만; queuedCount=activeCount-runningCount. preferredTask=startedAt 오름차순 group의 끝부터 첫 executing(최신 executing)→group 앞부터 첫 active(가장 오래된 active)→last. selected group이 존재하면 유지, 아니면 첫 active group→첫 group. 수동 task selection은 해당 task 존재하는 동안 유지. group selection은 manual=false와 preferred로 초기화. current operation은 **선택 group의 첫 executing→전체 active의 첫 executing→active[0]→선택task**라서 수동 이력 선택과 다를 수 있다.

activeCount0→양수: 펼침/history=false/manual=false. 그룹 목록은 active/selected 전부+나머지 완료 첫2, history 토글에서 전부. 자동접힘 조건 `autoCollapse&&!busy&&activeCount===0&&!presentationBusy&&connectionLive&&tasks.length>0`가800ms 유지. 사용자의 toggle은 timer 취소 후 rAF로 대체 toggle focus(preventScroll). 조건 변화/unmount는 timer 정리. all failed/cancelled task도 기록을 지우지 않는다.

로그 follow=scrollHeight-scrollTop-clientHeight<28(엄격부등호). false이면 새 event/outputOnly 변화에도 scrollTop 보존+최신 내용 button. button=follow true+bottom. TaskDetail은 task.id key이므로 선택 바뀌면 follow true/outputOnly false. outputOnly는 log&&channel!=status. quiet=executing&&live&&now-last(nonlog OR stdout/stderr)>3000, status heartbeat 제외. quiet label은 gemini `LLM 응답 기다리는 중`, 그 외 `새 출력 기다리는 중`. clock1s는 active&&live일 때만. active end는 live now/비live frozenAt; terminal end는 updatedAt. TaskDetail active start=operation.startedAt||lastnonlogrunning.time||task.startedAt, terminal start=task.startedAt. 상단 currentOperation start=operation.startedAt||task.startedAt. 재연결은 wall elapsed로 다시 계산하므로 정지 구간 경과가 숫자에 반영될 수 있다.

Observer는 initial GET(timeout10s)→activity SSE; invalid JSON 무시. quiet15s에 busy 또는 **scope 전 전체 snapshot active task**가 있으면 재연결; 모두 idle이면 HTTP없이 quiet timer만. 첫 SSE error는 즉시 GET;15s내 반복이면4/8/…60s backoff. HTTP failure도4/8/…60s. 정상 snapshot은 HTTP backoff/connection live/frozenAt0/lastConfirmedAt 갱신. busy=false가 observer를 닫지는 않는다. online은 nonlive/source없음/lastConfirmed age≥15s이며 in-flight 아닐 때만 reconnect. 반면 refresh(trace:activity-refresh)는 조건 없이 reconnect하여 진행 중 request도 abort/교체한다(disposed면 무동작). dispose generation++,source/timer 종료,request abort. scoped idle인데 다른 작업 때문에 quiet GET가 있을 수 있다.

## I5. 실제 handoff 큐와 수명주기 (UI-10)

다른 runtime(e2b/gemini) task 사이의 parent+수신 첫 nonlog running event 또는 nonlog explicit handoff만 후보. 양쪽에 있는 document/run/context가 다르면 거부. 수신 task.parentTaskId===송신task.id이면 canonical `parent:${from.id}:${to.id}`. parent 시작 후보의 raw key는 `start:${task.id}:${start.id}`지만 유효 부모 관계이면 위 canonical로 바뀐다. 부모 관계가 없는 explicit handoff의 key는 정확히 `handoff:${event.id}`이며 taskId/from/to를 포함하지 않는다. tasks/events 순회에서 같은 canonical key는 **구조 검사를 통과해 먼저 추가된 인계**만 남는다. 시간/liveSince eligibility보다 먼저 dedupe하므로 너무 오래된 첫 인계가 같은 key의 최근 두 번째 인계를 가릴 수 있다(HANDOFF-DUP-TIME). 따라서 동일 event.id를 다른 endpoints로 수정해도 seen key가 같아 새 전송으로 재생되지 않는 현재 동작이다(HANDOFF-KEY). key가 같으면 timestamp/title/log 업데이트만으로 재생 안 함. 방향은 e2b→gemini forward, 역방향 backward.

session key=`${runId??''}:${contextId??''}:${startedAfter??useId}`. max30 Map FIFO(읽기시 refresh 없음). liveSince=finite cutoff 또는 session 생성 now. session seen512/visitedGroups100 Set은 삽입 FIFO. filekey는 groupId 우선, 아니면 earliest task(startedAt||firstevent.time,invalid0)의 `${runId||contextId||''}:${documentId}`, 아니면 task.id, 아니면empty. 파일 전환은 timer/current/pending/busy 비움. 최초 live file 예외는 !visited && 이전file가 null/empty일 때뿐. 그 외 파일/이력 선택은 baseline. 모든 관찰 key는 eligibility 검사 **전에** memory seen으로 기록. finite eventtime≥liveSince, now-eventtime∈[-5000,15000]일 때만 unseen 후보 재생. offline에도 새key enqueue는 가능하지만 timer 시작은 live에서만.

internal queue는 time+수신seq 안정 정렬. pending8+active1. overflow oldest pending부터 버리고 omitted++/seen 유지. queue seen256은 enqueue/take/clearPending에 delete+add하는 최근 사용 순서. clearPending은 seen/omitted 보존; reset은 전부 제거. **한 effect에서 H01…H20 enqueue하면 H13…H20 남고 omitted12, 곧바로 H13 active/pending7.** 이미 P active면 P+pending8이며 다음에 H13. 동일 snapshot은 omitted 증가 없음.

1400ms hold/CSS1300ms+trail70ms. disconnect500ms 지점이면 remaining900ms 저장, timer 종료; 실제 dock descendant/pseudo animation-play-state=paused!important로 CSS도 동일 위치 정지. reconnect 뒤900ms 후 advance. failed/cancelled/completed는 queue purge 조건이 아니다. OFF는 pending/current/timer/busy 비우되 seen보존; ON에 과거 replay없음. OS CSS reduce는 그림만 정지하므로 JS queue/busy는 진행한다. unmount timer+busyfalse, 실제 unmount localqueue 소멸/session seen존속. StrictMode effect cleanup은 seen refs 보존한다.

최근3개 작은 이력은 handoff만의 목록이 아니다. 모든 nonlog/nonempty title 중 step upload/files/read/reread/transcribe/structure/profile/explore/context/model/extract/quality/verify/validate/build/repair 또는 title 수신|전달|읽기|추출|검증을 time순으로 모으고 `${taskId}:${rawTitle}` delete+reinsert dedupe 후 last3. 모바일≤760에서는 last2만 시각 표시. 클릭은 originatingtask선택. 별도 인계 caption은 activepulse 또는 lastactualtransfer, forward결과/backward요청, from→to/title/+pending. active title `방금 발생한 실제 인계`, idle `최근 실제 인계`.

## I6. Workroom 선택·아이콘·SVG 장면 (UI-10)

global selected=selectedTaskId match||firstexecuting||lasttask. 각 runtime chamber current=active transfer endpoint(최신 task찾기,없으면캡처)→해당runtime global selected→firstexecuting→firstrunningwaiting→firstqueued→first runtime task. 전송이 잠깐 그림/제목/click대상을 바꾸지만 global selected를 바꾸지 않는다. 현재없으면 disabled. click=currenttask선택, aria-pressed는 global selected와 같을 때.

Header Cpu15/1.4+샌드박스, Sparkles15/1.4+LLM. capacity 우선: 연결끊긴 active면 상태 확인 → waiting이면 응답 대기 → runtimeexecuting N실행 → queued N대기 → 현재 phase label → —. footer unknown이면 연결 확인 중, 아니면 phase label, 없으면 실행 환경/문서 이해. source FileText26/1+FileSpreadsheet32/1, caption원본; output Braces20/1.1+3rows, caption결과. 완료Check11/실패CircleAlert11은 global selected 기준이며 transfer 수신task기준 아님.

phase label: ready/prepare/create준비, upload원본 전달, read문서 읽기, reread원본 재조회, transcribe시각 읽기, structure구조 파악, profile전체 구조, explore구조 탐색, context맥락 이해, model내용 이해(대시보드 화면 설계), extract항목 추출(기준 기준 추출), install도구 설치, build화면 제작, repair보완, quality/verify/validate검증, retry재검토, cleanup마무리, complete완료, work작업, 기타작업 중. status queued대기/completed완료/failed확인 필요/cancelled중단이 phase보다 우선.

stage는 completed status 또는 phase complete/cleanup→4, 그 외 queued→0. 나머지 dashboard install1/model|build|repair|work2/validate|verify3/기타0. 문서는 read|reread|transcribe1/structure|profile|explore2/context|model|extract|quality|verify|validate|repair|retry|work3/기타0. failed/cancelled 전용 stage는 없다. **그림 선택 우선순위**: phase install이면 Install(stage무관)→stage0Transfer→dashboard의stage1Install/그외Dashboard→문서stage1Read(reread추가역방향)→stage2Structure→stage3 중 quality|validate|verify|retry는Verify/그외Context→stage4Collected. dashboard quality/retry는 stage0이다.

|SVG|필수 구조(viewBox0 0 278 80)|running loop|
|---|---|---|
|Transfer|겹친3sheet(23,25)(29,20)(35,15),wire x98…187 y38,2circles,CPU201,15 45×46+pins|paper3.8s/transfer2.8s(2번째+1.4s)|
|Read|희미한58×43sheet51,20+81×62sheet98,8,brackets/scanstrip/laser/오른쪽3cell; reread는 right→left dashed return|scanner/cells3.5s(각+.3/.6),return4s|
|Structure|57×43sheet x25/108/191 y27; header49×9 y12; 수직/가로connector|headers4.3s(+.3/.6)|
|Context|59×47sheet21,18,route circle124,41→3branches rowsx190 y13/33/53|routing4s,bins3.9s(+1.3/2.6)|
|Install|isometric3cubes x29/63/97→wire→51×48inventory192,13+3rows|packages3.4s(+.3/.6)|
|Verify|94×59table81,10/highlightrow,magnifier181,39+handle,왼쪽2checks|magnifier4s(3.6s verifier는 이 그림에 없음)|
|Dashboard|browser33,7 211×66,titledivider+3dots,donut+4bars+3rowlist; stage3 lower-rightcheck; completed finalcheck|stage2에서만 tiles4s(+.4/.8); stage3 validate/verify의 verifier3.6s; completed checkdraw.48s|
|Collected|stacked2sheets87×48+3gatheringsquares,completed check208,39/otherwise tidying3strokes|gather3.5s(+.4/.8)|

공통 floor M15 75h248/non-scaling strokes, unique gradient #bdf57a opacity0→.23. 그림 entrance.48s/checkdraw.48s. SVG loops의 is-running class는 status=running일 때 붙는다. OFF에서도 이 class는 남고 data-reduced-motion=true 및 전역 CSS가 움직임을 중단한다. waiting/nonlive chamber는 queued로 전달. rail은 chamber 안에서는 숨김; 밖 문서 준비/읽기/구조/맥락/정리, dashboard 준비/설치/제작/검증/정리. 아래 rail 대체는 **kind!=dashboard**에만 적용: phase install 첫도구설치/reread둘재조회/transcribe둘시각읽기/profile셋전체구조/extract넷기준·항목추출/quality·validate·verify넷검증/retry넷재검토/repair넷보완. queued current대기. aria label은 문서 또는 대시보드+실행 대기/작업 완료/확인이 필요해요/작업 중단/현재단계 중+작업 흐름. chamber CSS 기본 e2b#c8eaa0/LLM#91d6e4는 최종값이 아니다. charcoal-workroom 높은 specificity의 최종 e2b#70f3c4/LLM#92adff, 실패 output amber이며 scene전체를 빨강으로 바꾸지 않는다. 완전한 path/선택자 값은 visual catalogs.

## I7. 문서 분석의 네 독립 상태 (UI-06)

파일목록, phase rail, quality rail, coverage seal을 하나의 완료 flag로 합치지 않는다. 목록 status 선택 우선: busy+해당문서 latest running qualitystep→step; quality존재&&!=verified→limited/그외partial; analysis.status; latestfailed→failed; latest존재&&busy→latest.step||reading; elsewaiting. `analysis.status=needs_review` 자체는 attention set에 없으나 quality.status=needs_review는 partial로 정규화된다.

|목록 상태|라벨|아이콘/class|
|---|---|---|
|ready/complete/completed/analyzed/done|완료|Check10/is-complete|
|limited|검증 제한|CircleAlert10/is-attention|
|review/needs_confirmation/confirmation/partial/unsupported/failed/blocked/error|확인 필요|CircleAlert10/is-attention|
|queued/pending/waiting/idle/빈값|대기|dot/is-pending|
|대소문자무시 reread 포함|재조회|dot/is-pending|
|repair/retry 포함|보완 중|dot/is-pending|
|quality/validate/verify 포함|검증 중|dot/is-pending|
|기타|탐색 중/구조 분석/전사/항목 정리|dot/is-pending|

phaseFor regex는 **case-sensitive**이며 quality|validate|repair|retry→structure; extract|field|normalize|organize|ground|verif→extract; transcri|vision|vlm|content|read_page→transcribe; struct|profile|header|explor|inventory|analy|context→structure; 그외read. rail아이콘15px FileScan/Table2/AlignLeft/Layers3; 라벨 파일 탐색/구조 분석/내용 읽기/항목 정리. 완료면 마지막단계. 목록 완료 count는 finished&&(!quality||verified)만.

quality 또는 과거 quality event하나라도 있으면 quality rail로 대체. documentId 없는 global event도 selectedEvents에 포함. quality없는상태+busy+마지막qualityevent running+그event가현재마지막selectedevent일 때만 active. verified=ShieldCheck18/검증 통과 Check11; limited=CircleAlert18/제한 · 확인 필요; 나머지 quality=CircleAlert18/확인 필요. 객체없음=RotateCw18,단계검증/범위 재조회/재해석, active중/failed확인필요/busy다음단계/else진행정지. positive integer attempt events→quality.rounds동일attempt우선→오름차순. first검증1/후속보완N, verifiedCheck10/retryRotateCw10/needs_reviewCircleAlert10. verifiedclick context/그외checks. 최대회차는실제maxAttempts만.

arc1 unitsRead/unitsTotal,complete readerComplete. arc2 analysis.coverage.transcription 객체가 있으면 transcribedPages.length/expectedPages,라벨페이지 전사; 없으면contextSegmentsRead/Total,라벨맥락 해석. **둘째complete는둘다contextComplete**. finite≥0와분모>0일때분수및0…1clamp; 숫자없음+complete면check/full,그외—/0. seal complete→범위 확인Check15; readerfalse→읽기 확인; readertrue&&visualpending또는transcriptionfalse→전사 확인; readertrue→해석 확인; 그외확인 필요CircleAlert15. width≤1100seal숨김. readingSummary는readerfalse,또는readertrue&&complete===false에서만출력(D3.1).

|빈 상태|정확한 문구|
|---|---|
|documents0|분석할 파일이 아직 없습니다. / 파일을 넣으면 구조가 펼쳐집니다 / 시트 · 페이지 · 표 · 머리글|
|analysis없음+idle|분석을 시작하면 구조가 펼쳐집니다|
|groups0+active|문서의 구조를 찾고 있습니다(quality면검증/재조회/보완문구)|
|analysis있음+inactive+groups0|구조 확인이 필요합니다|
|inventorygroup regions0|ScanLine24 / 구조 미확인|
|contextsummary0|분석 내용이 아직 도착하지 않았습니다.|
|checks0|검토에 사용할 해석을 확인해 주세요.|
|transcription0|전사 결과가 아직 도착하지 않았습니다.|
|logs0|파일 분석이 시작되면 실제 수행한 작업만 이곳에 기록됩니다.|

region sheet/page없으면 range만 있어도 disabled. sheet AA8:AC99클릭은sheet+첫cellAA8,90°page는pageID만전달(이컴포넌트가회전하지않음). hidden badge와 범위는inventory그대로. detailopen closefocus/Escape닫기,triggerfocus복원없음. logs busy전환open/idleclose,28pxfollow는Dock과별개로동일경계.

## I8. 결과·상세·편집·빈 상태 (UI-12/13/14)

파일은target입력순,items는원본순,appliedcriteria는**그파일 item.criterionId로참조한 것만** 원본criteria순. unmapped항목을별도경고. criteria article 자체click없고sourcebutton만이동. 상태는 fileId/selected/source/filter/tab/currentPage/listScroll/restoreFocus.

|행동|정확한 전이|
|---|---|
|파일선택|fileId=id,selected/source=null,filterall,tabitems,page1,listScroll0,restoreFocusnull,callbacknull|
|항목선택|현재목록scroll저장,filter밖이면all,selected=id,tabitems,source=첫active-targetevidence||null,callbackid; page직접reset없음|
|목록복귀|restoreFocus=selectedid;selected/source=null,callbacknull;filter/page/tab보존|
|필터|목록복귀→nextfilter(동일status재클릭all)→tabitems/listScroll0|
|criteria/items탭|tab만변경;선택/source/filter/page보존;items복귀시선택상세다시표시|
|source선택|known문서일때source만변경;unknown무동작|
|페이지선택|source={activeTargetId,page},currentPage=page;선택/필터/탭보존|
|검토 대상으로|source=null만|
|이전/다음|visibleItems현재filter순에서만chooseItem;양끝disabled/순환없음|
|외부selectedId|local선택;target이면file/source/filterall/tabitems변경;page/listScroll직접reset없음|

selected status가수정으로filter밖이면all. 목록복귀시scrollTop복원→해당button.focus(preventScroll)→restoreFocus비움. inspector heading도focuspreventScroll. highlight는filter와무관한활성파일전체항목. ≤780선택+items시detailorder-1/rowsswap하며 **section.file-review-results** scrollTo(top0),window/원문scroll아님. 상세 outer200ms opacity0/x12,compactInspector자체initialfalse. fulllegacyInspector220ms opacity0/y14(앱일반경로미사용). 비교grid.85fr:1.15fr/gap10/padding11px12px/radius8/value27px,line1.3/unit11/criterion12,line1.65. compactreason12/1.75,heading15/1.5(모바일14). 긴상세는focusedinspector내부scroll.

|상태|출력|
|---|---|
|target0|검토할 파일을 기다리고 있어요 / 대상 문서를 추가하면 파일별 원문과 결과를 확인할 수 있어요.|
|file.error|role=status warning에그대로;viewer유지|
|filepillcount0|error/failed이면문서 확인 필요,그외아직 판정 없음|
|fileitems0|busy 이 파일의 검토 결과를 기다리고 있어요 / idle 이 파일에 도착한 판정이 없어요; 원본은 왼쪽에서 확인할 수 있어요.|
|items있음/filter0|이 판정에 해당하는 항목이 없어요|
|linkedcriteria0|연결된 적용 기준이 없어요 / 실제 판정의 기준 ID가 확인되면 표시됩니다.|
|unmappedN|기준 연결 확인 · N개 / 기준 ID가 연결되지 않은 판정은 항목별 근거에서 확인하세요.|

Inspector effect [item.id,status,humanNote]는editingfalse/status(pending→review)/notehumanNote||''/error'';saving은reset안함. editdisabled=disabled||pending. save는error''/savingtrue→resolve(status,note원문)→성공editingfalse/실패alert+폼유지→finallysavingfalse. savebutton=saving||!note.trim(). select/textarea는저장중에도editable. cancel은editingfalse만이고in-flightabort없으며note/status/error즉시clear없음. 성공도상세가아닌편집폼만닫음. 항목바꾸기/늦은save경쟁은backendgate와별도인UI특성으로시험한다.

**CURRENT_REPRODUCTION:** Summary tooltip은width280,left=max(12,min(centerX-140,innerWidth-292));target.top<220면below(bottom+9),그외above(top-9,translateY-100%). pointer-eventsnone,각p3lineclamp,heading높이제한없음. hover/focusopen,mouseleave/blur/click/mapscroll닫기. Escape전용닫기없음,windowresize/scroll위치재계산없음,세로clamp/maxheight없음. TOOLTIP-LIMIT은 이 관측을 현재 재현의 정답으로 보존한다. 긴 설명이 잘리는 현상까지 인지하고 구현하며, 다음 개선안으로 조용히 대체하지 않는다.

### I8.1 G13 툴팁 개선안: OPTIONAL_FUTURE

[DECISIONS](../DECISIONS.md)의 현재 재현 정책에 따라 다음은 **별도 승인 후에만 적용하는 개선안**이다. 현재 재현에서는 위 baseline이 정본이다. 원본에서 구현됐거나 측정됐다는 주장이 아니다. 새 치수는 baseline 280px/12px와 구분한 의도적 변경이며 기존 설계 검토 질문과 반례는 삭제하지 않는다.

1. viewport 좌표의 `position:fixed` portal을 사용한다. `margin=8px`, `width=min(276px,max(0,innerWidth-16px))`, `maxHeight=max(0,innerHeight-16px)`, `box-sizing:border-box`, `overflow-y:auto`, `overflow-x:hidden`, 긴 단어 `overflow-wrap:anywhere`. 제목·본문 전체를 읽을 수 있도록 line-clamp를 해제한다. 이 제한은 border/padding을 포함한 실제 외곽 상자에 적용한다.
2. 정해진 width로 렌더한 자연 높이를 `naturalHeight`로 측정하고 `height=min(naturalHeight,maxHeight)`를 사용한다. `centerX=(rect.left+rect.right)/2`. `preferredX=centerX-width/2`; `left=clamp(preferredX,8,innerWidth-8-width)`. `rect.top<220`이면 `preferredY=rect.bottom+9`, 아니면 `preferredY=rect.top-9-height`. `top=clamp(preferredY,8,innerHeight-8-height)`. 최종 transform은 none이며 above의 `translateY(-100%)`를 중복 적용하지 않는다. 따라서 viewport 폭/높이가16px 이상일 때 네 가장자리8px를 유지한다. 16px 미만의 축은 available size0/position0으로 툴팁을 숨기며 열리지 않았다고 보고한다.
3. content/width 변경을 ResizeObserver로 감지하고, 열린 동안 window resize 및 document의 capture-phase scroll(내부 map 스크롤 포함)에서 source rect와 높이를 다음 requestAnimationFrame 한 번으로 재측정한다. 여러 event를 같은 프레임으로 합친다. trigger가 사라지거나 viewport와 교차하지 않으면 닫고 focus를 강제로 옮기지 않는다. 열린 trigger가 남아 있으면 스크롤만으로 닫지 않는다. close/unmount 때 observer, resize/scroll/key listener 및 pending frame을 모두 정리한다.
4. trigger hover 또는 keyboard focus로 연다. `role=tooltip`, 고유 id, trigger의 `aria-describedby`를 연결한다. 본문은 pointer-events:auto여야 마우스 wheel로 내부 스크롤 가능하다. trigger 또는 tooltip에 hover/focus가 머무는 동안 유지한다. tooltip `tabIndex=0`으로 키보드 focus/스크롤도 허용한다. trigger에서 tooltip으로 포인터 이동할 수 있도록 둘 다 떠난 뒤120ms에 닫고, 재진입하면 취소한다. 내용은 설명만 담고 실행 버튼은 넣지 않는다.
5. 열린 동안 Escape는 preventDefault+stopPropagation 후 즉시 닫고 닫힘 지연 timer도 정리한다. 연결된 원래 trigger가 남아 있으면 `focus({preventScroll:true})`로 돌아간다. focus 복귀 자체가 다시 tooltip을 열지 않도록 dismissal latch를 설정한다. latch는 trigger에서 focus와 hover가 모두 떠난 뒤 해제한다. Escape가 underlying 항목의 click/선택을 발생시키면 실패다. 실제 trigger click으로 항목을 선택하는 기존 기능은 유지하되 tooltip은 먼저 닫는다.

정확한 좌표·재배치·내부 스크롤·Escape 기대값은 `TOOLTIP-G13-REBUILD`이다. 개선안을 선택한 미래 제품에서만 이 fixture의 viewport별 bounds와 키보드 동작을 검증한다. 현재 재현 G13의 정답은 TOOLTIP-LIMIT이며 두 상반된 출력을 동시에 요구하지 않는다. 현재 실행 상태는 NOT_RUN이다.

## I9. renderer별 근거 검증과 추가 acceptance

현행 공통 missing전처리는검증된누락의target근거를색칠에서제거하고원본상세근거는보존한다. PDF는item-name witness/유일행/축정렬검사를하지만표는유효cell좌표가주어지면quote불일치검사를하지않는다. DOCX는plain text quote매칭,이미지는bboxoverlay없음. criterion-itemlabel보충만단일record/정확인용/머리글/유일label조건으로엄격히제한된다. 따라서 “모든형식에서틀린근거는항상안칠해진다”는문장은금지한다.

추가 acceptance는 현행 구현의 통과 주장이 아니다. tooltip 세로 clamp/keyboard dismiss를 포함한 개선안은 아래 I9.2의 OPTIONAL_FUTURE 분류를 따른다. 현재 재현은 baseline을 사용하며, 개선안을 섞으려면 별도 제품 변경으로 기록한다. 각 요구의 기준·개선 fixture와 실행 상태를 분리한다.

Coverage의 전사 카운트/완료는 `analysis.coverage.transcription`이고, 전사 원문/페이지 wrapper 존재는 별도 `analysis.transcription.markdown` 및 객체 존재다. 둘을 같은 필드로 합치지 않는다(ANALYSIS-PDF).

PDF page admission은 `!source.page || source.page === pageText.page`인 quote만 현재 페이지 matcher로 보낸다. 명시된 다른 page의 동일 quote는 현재 page에서 제외하지만, page 생략(또는 falsy0)은 모든 현재 page에서 탐색된다. 따라서 여러 page의 동일 문구에 생략된 page를 유일한 위치로 판정하는 보호는 없다. PREVIEW-PDF-PAGE에 명시/생략 입력과 현재 page별 bbox를 정의한다.

### I9.1 G05/G07/G12 표 하이라이트 검증 개선안: OPTIONAL_FUTURE

현재 좌표 우선 bypass는 `PREVIEW-WRONG-CELL`의 **CURRENT_REPRODUCTION** 정답이다. 다음 규칙은 원본에 없는 개선안이며 현재 재현에 추가하지 않는다. 별도로 이 개선안을 채택한 제품에서는 검증을 통과한 셀만 판정색으로 표시한다. 검토 판정 자체와 원문 설명은 그대로 보존하며, 위치 검증 실패를 새로운 합격/불합격 또는 업무 누락 판정으로 바꾸지 않는다.

검증 입력은 원본 해시에 묶인 물리 셀 값, sheet 이름/크기, 원본 구조 분석이 확인한 header/record 경계, item label과 source citations다. 축약 preview에서 잘린 행을 원본 전체로 취급하지 않는다. 최소 record 증거는 `{sourceDigest,documentId,sheet,recordId,row,startColumn,endColumn,itemLabelCells,valueCells,unitCells,headerRows,verification:'source-cell-check'}`다. 이 증거는 원본 reader의 실제 셀과 구조를 독립적으로 대조해 만든 host 결과여야 한다. 모델이 `verified:true`라고 출력한 것만으로 신뢰하지 않는다. 원본 hash, item label 위치와 field 역할이 검증되지 않았으면 위치 확인 대상으로 남긴다.

검증 순서와 통과 조건:

1. **출처:** citation.documentId가 현재 문서와 같고 sourceDigest가 현재 원본과 같아야 한다. 명시 sheet와 cell qualifier가 지정한 이름을 NFKC→Unicode 기본 소문자→공백 축약한 키로 비교하여 실제 sheet 하나로만 해석해야 한다. 같은 키의 sheet가 둘 이상이면 거부한다. sheet 생략은 원본에 sheet가 정확히 하나일 때만 허용한다. 다른 sheet에서 quote를 찾아 옮기지 않는다.
2. **좌표:** A1/range는 D1.3 parser를 사용하되, **clip하기 전 전체 범위**가 양의 safe integer이며 실제 row/column bounds 안이어야 한다. 10,000셀 초과 expansion, 여러 physical row에 걸친 range, 여러 record로 갈라지는 범위는 이 새 1차 renderer에서 거부한다. UI preview 밖의 유효 좌표는 위치 확인/다른 범위 안내만 남기고 보이는 다른 셀을 대신 칠하지 않는다. 병합 값은 실제 값을 소유한 top-left 셀로 원본 reader가 명시적으로 확인한 경우만 허용하며 자동 forward-fill을 하지 않는다.
3. **실제 텍스트:** `normalize(s)=String(s).normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim()`를 사용한다. locale별 추정, 기호 제거, 숫자 변환, 부분 숫자 추정은 하지 않는다. 이 함수는 Unicode 기본 lowercase이며 독일어 ß→ss 같은 full case-fold 확장은 하지 않는다. quote는 비어 있으면 거부한다. quote 전체가 선택한 셀 하나의 normalized 원문 안에 연속 포함돼야 한다. 여러 셀의 문자열을 이어 붙여 quote를 만들지 않는다. 범위 quote가 여러 셀에 각각 일치하거나 한 셀에서 여러 번 일치하면 위치가 모호하므로 거부한다. 여러 셀에 걸친 인용은 생산 단계에서 셀별 quote로 나누어 다시 검증해야 한다.
4. **숫자 경계:** normalized 원문의 숫자 token은 `[+\-−±]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+\-]?\d+)?`의 겹치지 않는 longest match다. quote의 일치 interval은 원문 숫자 token과 겹치면 그 token 전체를 포함해야 한다. 또한 interval 밖의 바로 인접 문자가 digit이고 그 사이 separator가 comma/dot/sign이면 거부한다. 예: quote `1` in `10`, `2.8` in `-2.8`, `5` in `5.0`/`5e3`, `52,000` in `152,000`은 거부; `10` in `10 MPa`는 허용. 판정 엔진의 단위/수치 동등성 검증은 별개이며 이 위치 matcher가 단위를 재해석하지 않는다.
5. **같은 record의 항목 anchor:** 선택 셀 전부가 검증된 한 record의 label/value/unit 역할 셀에 속해야 한다. header row/cell만으로 이루어진 citation은 거부하며, header를 항목 anchor로 사용하지 않는다. record의 itemLabelCells 중 normalized 전체 셀 값이 itemAnchorLabels 중 하나와 정확히 같은 셀이 하나 있어야 한다. 후보가 여러 개이면 모호성으로 거부하되, 독립적으로 검증된 field-anchor 좌표가 정확히 하나를 지정하고 그 셀의 값·역할·원본 hash도 다시 일치할 때만 그 anchor를 사용한다. 단순 근접 행/옆 셀이라는 이유로 anchor를 고르지 않는다.
6. **범위 내 모든 셀의 근거:** 선택 범위의 각 셀은 (a) 위 검증을 통과한 quote가 실제 포함된 셀, (b) 확인된 item-name anchor, (c) 같은 verified field의 unitCells 중 item.unit과 NFKC/공백 축약 후 **대소문자를 보존하여** 정확히 같은 셀 중 하나여야 한다. 여기에도 해당하지 않는 메모/시료명/빈 셀/머리글을 범위에 끼워 넣어 색칠하지 않는다. value-only citation도 같은 record에 검증된 label anchor가 있으면 정상 허용한다. 그림에는 제출된 검증 셀들과 확인된 item-name anchor만 추가하고 인용하지 않은 다른 값 셀은 추가하지 않는다.
7. **원자적 반영:** 한 item의 현재 문서 판정색 후보 citation 중 하나라도 위 검증을 실패하면 그 item의 이 문서 highlight 셀은0개이고 `근거 위치 확인 필요` chip을 보인다. 모든 citation을 통과하면 union을 row-major로 중복 제거하여 칠한다. 상세에는 원래 quote/좌표/설명을 유지한다. filter와 무관한 파일 전체 색칠도 이 검증을 통과한 item만 포함한다. 실패 이유는 document/sheet/range/quote/numeric-boundary/record/anchor로 구분하여 진단할 수 있지만 사용자 화면에는 짧은 위치 확인 안내를 우선한다.

이것은 미래 table renderer의 제안 범위다. 전치표나 여러 행짜리 record를 한 range로 임의 채색하는 대신 source-cell-check를 통해 field별 단일 행 citation으로 분해하거나 위치 확인으로 남긴다. 빈/알 수 없는 record metadata를 검증 완료로 바꾸는 허용 경로는 없다. `TABLE-HIGHLIGHT-REBUILD`의 정상 value+label+unit, wrong-cell/다른 행 quote/header-only/숫자 일부/범위/anchor 반례는 개선안을 채택할 때 G05/G07/G12에서 실행한다. 현재는 OPTIONAL_FUTURE/NOT_RUN이며 현재 제품의 PREVIEW-WRONG-CELL 출력을 대체하지 않는다.

### I9.2 감사에서 확정한 개선 범위

| 항목 | 결정·우선순위 | 정확한 목표/검증 |
|---|---|---|
| 표 좌표/quote | OPTIONAL_FUTURE P1 | I9.1, TABLE-HIGHLIGHT-REBUILD. 현재 재현은 D1.3/PREVIEW-WRONG-CELL 좌표 우선 경로. 미래 G05/G07/G12, NOT_RUN |
| PDF chip page | OPTIONAL_FUTURE P2 | 제안: page가 safe integer이며1..실제numPages일 때만 navigation.0/소수/NaN/Infinity/범위밖은 위치확인chip, 이동0. 현재 재현은 D1.2의 요청 prop 경로(Number.isInteger)와 chip 경로(truthy/범위검사, 2.5 수용)를 구별한다. 개선안 PDF-PAGE-INTEGER는2/2.5/0/numPages+1; 미래 G10/G12, NOT_RUN |
| 빈 출처 chip 추가 총상한 | OPTIONAL_FUTURE | 기존 D1 SourceChips의분류·slice 상한을 baseline으로 재현. 전체추가cap 값은 필수요구가아니다. 최적화를택하면표시에서생략한수와원문접근을보존하고G13에서측정한다. NOT_RUN |
| activity 최신100 보존 | OPTIONAL_FUTURE | 필수동등성은I4의tail100. 최신순으로변경하려면별도제품변경으로기록하고newest-first105개→첫100개fixture를사용. 기존모션큐나업무결과를조용히제거하지않음. 현재새최신100요구는없음 |
| 앱/OS 모션 일관성 | OPTIONAL_FUTURE P1 | 제안: enabled=false 또는 matchMedia('(prefers-reduced-motion: reduce)').matches면 reduced. OFF또는OSreduce전환은CSS/Motion/차트 animation0,전달active/pending/timer/busy비움·seen보존,다시ON해도과거replay0. 업무API와counts계속진행. root html/data-motion와MotionConfig에도같은effective값적용. 기본사용자저장toggle은on/off그대로. 현재 재현은04 §8의app-only provider와컴포넌트별OS반응. 미래 G10/G13, NOT_RUN |
| inspector 저장중취소 | OBSERVED_BASELINE 유지 | G02/G10: 저장전취소는API0·서버변경0. 저장중취소는폼만닫고이미전송한resolve를abort/rollback하지않는다. INSPECTOR-SAVE와아래draft-only trace가정답. disable/rollback개선은이번필수요구아님 |

저장전 fixture: editing=true→draft 변경→cancel→editing=false/API0/machine·human 상태불변. 저장중 fixture는 INSPECTOR-SAVE의 전송 후 cancel→늦은성공적용/실패알림을 유지한다. 두 취소를 합쳐 “취소하면 서버 변경 없음”이라고 쓰지 않는다.

공통 값/제목/health/크기/mobile pane/raw mark/terminal announcement는 [auxiliary-contract](auxiliary-contract.md) A1..A7의 자족적 정본을 읽는다. source/geometry의 선택 확장안은 [08](../specs/08-rebuild-coverage-geometry.md)이며 현재 재현의 image/scanned PDF에 bbox를 추가하지 않는다.

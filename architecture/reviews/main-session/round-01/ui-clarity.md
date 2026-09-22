# UI 명확성 검토 — Round 01

architecture만 열람했다. 원본 src/server/history, 실제 앱 및 provider를 사용하지 않았다. 평가 모집단은 18개 모듈, 108개 질문이다. 현재 pass 62, fail 45, unverified 1; 비통과 질문은 46개이며 미해결 이슈 34개다. 현재 입력 해시를 seal하여 역사적 Round 01 기록으로 고정한다. 시각 참조 재수집은 진행 중이므로 UI-02-C06은 unverified다. 이후 수정은 Round 02에서 다시 검토하며 이 판정을 새 해시에 재사용하지 않는다.

| 모듈 | Pass / 6 | Fail | Unverified |
|---|---:|---:|---:|
| UI-01 | 5 | 1 | 0 |
| UI-02 | 3 | 2 | 1 |
| UI-03 | 4 | 2 | 0 |
| UI-04 | 3 | 3 | 0 |
| UI-05 | 5 | 1 | 0 |
| UI-06 | 4 | 2 | 0 |
| UI-07 | 1 | 5 | 0 |
| UI-08 | 4 | 2 | 0 |
| UI-09 | 2 | 4 | 0 |
| UI-10 | 2 | 4 | 0 |
| UI-11 | 6 | 0 | 0 |
| UI-12 | 1 | 5 | 0 |
| UI-13 | 2 | 4 | 0 |
| UI-14 | 5 | 1 | 0 |
| UI-15 | 2 | 4 | 0 |
| UI-16 | 5 | 1 | 0 |
| UI-17 | 2 | 4 | 0 |
| UI-18 | 6 | 0 | 0 |

이 점수는 선언된 질문의 구현 명확성만 의미한다. 실행 성공이나 원본 정확성 점수가 아니다. 각 질문의 판정·근거는 ui-clarity.json에 전부 기록했다.

## R1-UI-001 · UI-01 · high

- 질문: UI-01-C04
- 위치: specs/04-ui-motion.md — §5.4; §9 UI-07
- 문제: Terminal 전이 timer 재시작과 ≤2.3s gate가 양립하는 clock 계약이 없다.
- 해석 A: busy flag가 바뀔 때마다 1800/1600ms를 새로 기다린다.
- 해석 B: 첫 terminal 관측 기준 absolute deadline 안에서만 남은 연출을 보여준다.
- 필요한 결정: first-terminal 기산점, effect dependency, deadline을 고정하고 busy 토글 trace의 이동 시각을 지정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-002 · UI-02 · high

- 질문: UI-02-C01
- 위치: specs/04-ui-motion.md — §2.1 + ui/detail-controls.md D5
- 문제: GoldenPicker의 최종 색상과 전역 차콜 override의 우선순위가 충돌한다.
- 해석 A: D5 lime/청록은 명시된 observed dialog 예외로 구현한다.
- 해석 B: §2.1 최종 단일 테마에 따라 GoldenPicker 선택/버튼도 코발트로 덮는다.
- 필요한 결정: GoldenPicker의 최종 computed color 표를 제공하고 대장처럼 예외 여부/우선순위를 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-003 · UI-02 · medium

- 질문: UI-02-C04
- 위치: specs/04-ui-motion.md — §5.3 + ui/motion-catalog.json
- 문제: 모션 prose와 precise catalog의 유효 값이 다르다.
- 해석 A: scan8.4s, native module y10/row y5를 쓴다.
- 해석 B: scan6.4s, native module y8/row y4를 쓴다.
- 필요한 결정: 활성 selector의 최종 유효값과 문서/카탈로그 parameter precedence를 하나로 고정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-004 · UI-02 · high

- 질문: UI-02-C06
- 위치: ui/reference/README.md — 화면 범위; 캡처 절차
- 문제: 필수 뷰포트와 안정화된 정적 시각 참조가 미완성이다.
- 해석 A: 1440×960/390px만으로 다른 요구 viewport까지 동등성 통과 처리한다.
- 해석 B: 1600×960/1280×800도 별도 reference가 있어야 판정한다.
- 필요한 결정: 요구 viewport별 manifest/측정값을 제공하거나 모집단 변경 이유·영향을 기록한다. reveal 중 캡처는 안정화하여 재수집하거나 동적 phase 참조로 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-005 · UI-03 · high

- 질문: UI-03-C03, UI-03-C05
- 위치: specs/04-ui-motion.md — §3 경비 예제
- 문제: sampleLoading과 sample 실패 이후 상태가 불완전하다.
- 해석 A: intro에서 API 성공까지 대기하고 실패시 intro/기존 입력 유지한다.
- 해석 B: 요청 시작과 동시에 criteria-input으로 이동하거나 기존 documents/text를 초기화한다.
- 필요한 결정: intro/input 각각의 요청 전/진행/성공/실패 page, documents, criteriaText, sampleTargets 및 CTA/spinner 행렬을 확정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-006 · UI-04 · medium

- 질문: UI-04-C03
- 위치: specs/04-ui-motion.md — §3 입력 상태
- 문제: drag-over/uploading/preview 닫기의 상태별 조작과 배치가 누락됐다.
- 해석 A: 업로드 중 원문 선택/닫기는 허용하며 preview 닫으면 중앙 카드로 복귀한다.
- 해석 B: locked가 모든 row/preview 조작도 막고 preview 자리 두 열을 유지한다.
- 필요한 결정: 파일picker/drop enter/leave/upload/실패/delete/preview close의 enabled·label·배치를 표로 지정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-007 · UI-04 · medium

- 질문: UI-04-C05
- 위치: ui/detail-controls.md — D5 GoldenPicker
- 문제: all mode의 현재 앱 진입 가능 여부가 불명확하다.
- 해석 A: all 모드는 내부 지원만 하므로 앱에 criteria/target 두 진입만 만든다.
- 해석 B: 일반 sample 선택 진입에서 all dialog를 열게 만든다.
- 필요한 결정: 현재 App에서 all 미호출 여부 및 허용 진입점 목록을 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-008 · UI-04 · medium

- 질문: UI-04-C06
- 위치: ui/detail-controls.md — D5/D6
- 문제: criteria/target golden의 별도 입력/상태 검증 사례가 없다.
- 해석 A: generic mode unit case만으로 두 앱 진입의 사용성을 통과한다.
- 해석 B: 각 앱 진입에서 exact payload/성공 append/0개/삭제까지 검증한다.
- 필요한 결정: 두 mode별 입력·조작·요청·반환 documents·오류/빈 상태 oracle를 추가한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-009 · UI-05 · medium

- 질문: UI-05-C06
- 위치: ui/detail-controls.md — D2.1/D6
- 문제: 복수출처/동명파일/다중sheet/계층압축을 판정할 expected tree fixture가 없다.
- 해석 A: provenance가 같은 criterion을 탭마다 반복할 때 전체 count도 중복 증가한다.
- 해석 B: 탭에는 반복해도 global selected count는 ID별1개로 유지한다.
- 필요한 결정: 복수출처·동명·유형없음·제외·피드백 fixture에 tree, selected count, source 좌표를 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-010 · UI-06 · medium

- 질문: UI-06-C03
- 위치: ui/detail-controls.md — D3.1–D3.2
- 문제: 문서분석 no-data/오류/부분/품질제한의 label/icon/seal 전체 출력표가 없다.
- 해석 A: status complete면 complete icon을 표시하고 limited는 보조 badge만 추가한다.
- 해석 B: quality limited면 주 icon/seal도 확인필요 상태로 바꾼다.
- 필요한 결정: 각 status+quality+coverage 조합의 주 라벨·icon·seal·빈 상태를 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-011 · UI-06 · medium

- 질문: UI-06-C06
- 위치: ui/detail-controls.md — D3.2/D6
- 문제: 구조지도 특수형태의 조작 및 coverage 기대값 fixture가 없다.
- 해석 A: hidden sheet/rotation은 설명만 보이고 source 이동은 생략한다.
- 해석 B: 지도 region에서 sheet/page와 첫 cell로 이동하고 분수/불완전 경고를 같이 검증한다.
- 필요한 결정: hidden sheet/회전 PDF/다중region/부분coverage의 입력·선택·좌표·분수·문구를 추가한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-012 · UI-07 · medium

- 질문: UI-07-C02
- 위치: specs/04-ui-motion.md — §4.1
- 문제: currentOperation phase/step에서 live theater stage를 산출하는 매핑이 없다.
- 해석 A: structure는 읽기 stage, context는 추출 stage로 간주한다.
- 해석 B: structure/context 모두 판단준비 stage로 간주한다.
- 필요한 결정: phase→stage 표와 unknown/absent fallback, approvedCriteria 선택 우선순위를 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-013 · UI-07 · high

- 질문: UI-07-C03, UI-07-C04, UI-07-C05
- 위치: specs/04-ui-motion.md — §4.1; §10
- 문제: context no-data/관측중단/완료/취소와 theater 연결 prop 경계가 불명확하다.
- 해석 A: busy만으로 .is-working을 켜고 끊긴 연결에서도 theater ambience를 유지한다.
- 해석 B: busy&&observing에서만 context 모션을 켜고 모든 theater packet까지 동결한다.
- 필요한 결정: 패널별 busy/observing/no-data/completed/partial/cancelled 행렬과 정확한 기존 theater gap, CSS class gate를 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-014 · UI-07 · medium

- 질문: UI-07-C06
- 위치: specs/04-ui-motion.md — §9 UI-07/UI-08
- 문제: interleave/burst/무출력 trace의 expected activefile/context/counts가 없다.
- 해석 A: latest analysis 이벤트가 현재 파일을 즉시 바꾼다.
- 해석 B: 실행중 operation 파일을 유지해 늦은 다른 파일 이벤트는 선택을 바꾸지 않는다.
- 필요한 결정: timestamp가 있는 복수문서 trace와 매 snapshot의 activefile/context/milestone/counts를 고정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-015 · UI-08 · high

- 질문: UI-08-C05
- 위치: specs/04-ui-motion.md — §2.5/§5.2/§8
- 문제: mobile packet layer와 OFF/취소의 기존 arrival 정리 범위가 불명확하다.
- 해석 A: 모바일에서 선만 숨기고 DOM packet은 계속 이동시킨다.
- 해석 B: 모바일 packet layer를 숨기고 OFF/취소에서는 packet과 cleanup interval을 즉시 제거한다.
- 필요한 결정: width≤760px layer 표시, OFF/취소/context변경/unmount별 packet/sweep/baseline 처리를 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-016 · UI-08 · medium

- 질문: UI-08-C06
- 위치: specs/04-ui-motion.md — §5.1/§9 UI-07
- 문제: 세 레인 카드 클릭 동작과 수신시각별 packet oracle가 없다.
- 해석 A: live 카드 클릭은 item의 원문/상세를 연다.
- 해석 B: live 카드는 시각화만 하고 클릭은 results 이후에만 허용한다.
- 필요한 결정: 카드/packet click handler 목적지·enabled gate와 0/1/burst trace의 packet 좌표/수량/count를 정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-017 · UI-09 · high

- 질문: UI-09-C01
- 위치: specs/04-ui-motion.md — §4.2; specs/01-state-api.md §8
- 문제: 사용처별 activity filter contract가 없어 이전/다른 작업이 섞일 수 있다.
- 해석 A: 현재 runId만 일치하면 오래된 context/task까지 표시한다.
- 해석 B: contextId/startedAfter/kind/document whitelist까지 함께 적용한다.
- 필요한 결정: criteria/review/dashboard/ledger의 정확한 filter predicate와 ID 누락/parent 상속 우선순위를 제시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-018 · UI-09 · high

- 질문: UI-09-C03
- 위치: specs/04-ui-motion.md — §4.2 autoCollapse 문단
- 문제: autoCollapse 기본값을 원본 구현 확인으로 남겼다.
- 해석 A: 기준분석 dock도800ms후 접힌다.
- 해석 B: 명시 true인 대상review만 접히고 기준분석은 유지한다.
- 필요한 결정: 각 도크 위치의 autoCollapse prop/default를 자체 포함 표로 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-019 · UI-09 · medium

- 질문: UI-09-C05, UI-09-C06
- 위치: specs/04-ui-motion.md — §4.2/§9
- 문제: dock 자체 로그 autoscroll/최신복귀와 다중context 상태 oracle가 없다.
- 해석 A: DocumentAnalysis의28px 규칙을 dock에 복제한다.
- 해석 B: dock은 항상 follow하거나 다른 임계값을 쓴다.
- 필요한 결정: dock scroll cutoff·사용자복귀 동작과 waiting/interleave/disconnect/terminal trace의 group/elapsed/activeCount를 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-020 · UI-10 · high

- 질문: UI-10-C01, UI-10-C06
- 위치: specs/04-ui-motion.md — §4.3/§5.3
- 문제: phase별 SVG 장면/아이콘/문구와 최근3개 전달 기록의 정보구조가 없다.
- 해석 A: phase index별로 임의 아이콘 하나를 그린다.
- 해석 B: 실제 chamber 안 문서/reader/bin/quality 도형을 상세 배치한다.
- 필요한 결정: 활성 scene별 SVG 구조·viewBox/도형/아이콘/문구/loop와 최근 기록3개의 정렬·선택을 자체 포함한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-021 · UI-10 · high

- 질문: UI-10-C03
- 위치: specs/04-ui-motion.md — §4.3 규칙4–7
- 문제: session/group/liveSince·history 재방문 및 seen eviction 기준이 불완전하다.
- 해석 A: liveSince=mount now로 완료된 기존 handoff를 전부 배제하고 FIFO 사용한다.
- 해석 B: liveSince=run start로 최근 완료 handoff를 재생하며 LRU 사용한다.
- 필요한 결정: session/group keys, liveSince 초기화, first-live/history선택, failed/cancelled/OFF의 queue/seen, 단일 eviction 정책을 고정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-022 · UI-10 · high

- 질문: UI-10-C04
- 위치: specs/04-ui-motion.md — §4.3 규칙7/§10
- 문제: disconnect에서 시간만 freeze인지 빛의 위치도 freeze인지 최종 결정이 없다.
- 해석 A: presentation timer만 멈추고 CSS travel은 끝까지 간다.
- 해석 B: CSS animation-play-state까지 pause하고 남은 위치/시간에서 재개한다.
- 필요한 결정: 재현 기본 동작 하나와 알려진 source gap/deviation을 분리하고 disconnect/resume 좌표 assertion을 추가한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-023 · UI-12 · high

- 질문: UI-12-C01, UI-12-C03
- 위치: specs/04-ui-motion.md — §2.4/§7
- 문제: 적용기준 탭과 상세 이전/다음/filter의 상태 전이가 누락됐다.
- 해석 A: 적용기준은 파일에 연결된 criterion만, 이전/다음은 현재filter 경계에서 disabled다.
- 해석 B: 전체승인 기준을 보이며 이전/다음은 모든항목 또는 wrap-around다.
- 필요한 결정: tab별 포함/정렬, chooseFile/chooseItem/chooseFilter/clearItem/prev-next의 selection/source/filter/page/scroll/focus 표를 고정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-024 · UI-12 · high

- 질문: UI-12-C04
- 위치: specs/04-ui-motion.md — §2.5 결과 responsive
- 문제: 모바일 선택상세 순서와 scroll 기준점이 모호하다.
- 해석 A: 원문 첫행/상세 둘째행을 유지하고 workspace 위로 스크롤한다.
- 해석 B: 상세를 첫행으로 옮긴 다음 workspace scrollTop0으로 간다.
- 필요한 결정: ≤780px 선택 전/후 DOM 또는 CSS order, row size, 이동 scrollport/offset을 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-025 · UI-12 · medium

- 질문: UI-12-C05, UI-12-C06
- 위치: specs/04-ui-motion.md — §7/§9
- 문제: 오류/빈결과/필터0/기준0 상태와 상세 복귀 검증 oracle가 빠졌다.
- 해석 A: 필터0과 문서failed를 동일한 빈목록으로 표시한다.
- 해석 B: 각기 다른 안내·원문링크·복귀 CTA를 표시한다.
- 필요한 결정: 각 empty/error 문구와 viewer 유지 여부, A/fail/detail/criteria/back 경로의 bounds·scroll/focus assertion을 추가한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-026 · UI-13 · high

- 질문: UI-13-C01, UI-13-C03, UI-13-C04, UI-13-C05
- 위치: specs/04-ui-motion.md — §7 inspector
- 문제: compact/full inspector의 edit·cancel/item-swap·geometry/motion 계약이 부족하다.
- 해석 A: cancel은 local 편집만 닫고 saving 중 비활성, item swap은 note/error 모두 초기화한다.
- 해석 B: cancel은 in-flight resolve까지 abort하고 note는 항목별로 보존한다.
- 필요한 결정: normal/edit/full/compact wireframe과 비교칸 치수·220ms/y14/compact 무진입, swap/save/cancel/pending controls·focus·scroll을 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-027 · UI-14 · medium

- 질문: UI-14-C05
- 위치: specs/04-ui-motion.md — §6 tooltip
- 문제: tooltip 높이/세로 clamp가 없어 긴 문구에서 viewport 유지 요구를 결정할 수 없다.
- 해석 A: top<220이면 아래 고정하고 내용 높이만큼 화면 밖으로 넘친다.
- 해석 B: available-height를 계산해 max-height/내부scroll 또는 반대편 배치를 쓴다.
- 필요한 결정: long Korean label/quote에서 최대높이·vertical clamp/flip/scroll와 focus tooltip escape/dismiss를 정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-028 · UI-15 · medium

- 질문: UI-15-C01
- 위치: specs/05-dashboard-exports.md — D09
- 문제: 4개 제안 버튼의 exact instruction과 입력 대체 방식이 없다.
- 해석 A: 제안을 누르면 textarea 전체를 대체한다.
- 해석 B: 기존 요청 뒤에 제안 문구를 추가한다.
- 필요한 결정: 각 버튼 label/full payload/대체·추가/baseDesign 전달 조건을 표로 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-029 · UI-15 · high

- 질문: UI-15-C03
- 위치: specs/05-dashboard-exports.md — D03/D04/D09
- 문제: appliedTag와 job×builder×workroom×view 상태표가 없다.
- 해석 A: 라이트 제안 선택 즉시 tag를 라이트로 바꾼다.
- 해석 B: ready job.design.theme 수신 때만 실제 적용 tag를 바꾼다.
- 필요한 결정: 입력과 실제 적용태그를 분리하고 실패/취소/기존preview/finishing별 UI 상태를 고정한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-030 · UI-15 · high

- 질문: UI-15-C05
- 위치: specs/05-dashboard-exports.md — D03/D09
- 문제: ready+missing/empty HTML 응답 처리가 없다.
- 해석 A: ready를 성공으로 처리하고 빈 iframe을 보인다.
- 해석 B: 오류로 처리하고 기존 preview를 유지한다.
- 필요한 결정: HTML 검증/오류문구/최종 job 및 DELETE/재시도/이전preview 상태를 명시한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-031 · UI-15 · medium

- 질문: UI-15-C06
- 위치: specs/05-dashboard-exports.md — D11
- 문제: modal 재열기/전환/재구성의 mount·selection oracle가 없다.
- 해석 A: cache HTML만 보존하여 재열기 때 파일/filter 선택을 초기화한다.
- 해석 B: iframe 내부 선택까지 별도 보존해 복원한다.
- 필요한 결정: 첫열기/재열기/source전환/재구성의 mount 수·shell/content 시각·선택 유지·export 검사 시나리오를 적는다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-032 · UI-16 · medium

- 질문: UI-16-C06
- 위치: specs/05-dashboard-exports.md — D08/D11
- 문제: 3복합요청/18조합 browser 검증 matrix가 없다.
- 해석 A: 두 HTML fixture와 DOM validator만으로 visual 통과를 선언한다.
- 해석 B: 18 viewport/design의 실제 canvas 및 surface/detail 조건까지 별도로 측정한다.
- 필요한 결정: 각 case ID, complete input/expected plan, viewport와 browser assertions를 선언하고 미실행은 NOT_RUN으로 남긴다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-033 · UI-17 · high

- 질문: UI-17-C02
- 위치: specs/05-dashboard-exports.md — D02/D10
- 문제: normalized ready sourceItems에서 원래 pending을 복구할 정보가 없다.
- 해석 A: ready sourceItems만 사용하므로 pendingCount는 항상0이다.
- 해석 B: live raw items를 섞어 pending을 복구하여 frozen snapshot과 어긋난다.
- 필요한 결정: frozen rawStatus/pendingItemIds를 추가하거나 pending표시가 legacy-only임을 명시하여 데이터 계약을 정합화한다.
- 상태: open / resolution: null / recheckedBy: null

## R1-UI-034 · UI-17 · high

- 질문: UI-17-C03, UI-17-C04, UI-17-C06
- 위치: specs/05-dashboard-exports.md — D10/D11
- 문제: source view 직접파일변경/reset·독립scroll/compact와 교차근거 test oracle가 부족하다.
- 해석 A: 다른 파일에서도 filter/source/evidenceIndex를 유지하고 전체 source를 단일 scrollport로 둔다.
- 해석 B: 파일 변경시 all/source초기값/index0/선택해제하며 원문과 상세가 각각 스크롤한다.
- 필요한 결정: 파일/원문/근거/filter/selectionVersion 표, pane height/overflow/compact/mobile 규칙, 2파일교차근거 fixture의 data-* 기대값을 추가한다.
- 상태: open / resolution: null / recheckedBy: null

## 검토 범위와 추가 메모

- No claim of original-source accuracy or completed app/browser acceptance. Missing runtime measurements are not silently treated as pass.
- Ledger lime is explicitly an intentional tool exception in 05a §6.1; the theme issue targets GoldenPicker/precedence instead.
- D01 describes 15 dashboard schema fields, while schema/default have 14; record as editorial correction without failing UI-16-C01 because the authoritative field set is unambiguous.



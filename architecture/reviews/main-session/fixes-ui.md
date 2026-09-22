# R1 UI 작성자 교정 기록

이 파일은 작성자의 수정 위치/책임 기록이다. 독립 재심 통과 판정이나 브라우저 실행 결과가 아니다. round-01 원본 review JSON/MD를 변경하지 않았다. 현재 소스의 한계는 baseline 사실로 남기고 개선 acceptance와 구분했다.

소유 파일: specs/04-ui-motion.md, ui/tokens.json, ui/detail-controls.md, 신규 ui/interaction-contract.md 및 ui/interaction-fixtures.json. 프로덕션 파일·review reports·05/05a·visual catalogs는 변경하지 않았다.

## 정확성 47건

| Issue | 작성자 처리 | 수정 위치와 설명 |
|---|---|---|
| R1-UIA-001 | 명세 교정 / 재심 대기 | 04 §3; interaction-contract I1; CANCEL-01 |
| R1-UIA-002 | 명세 교정 / 재심 대기 | 04 §5.3; tokens.motion.nativeEntrance |
| R1-UIA-003 | 명세 교정 / 재심 대기 | 04 §2.1/2.5; tokens.layout.mobile/review.compact |
| R1-UIA-004 | 계약 교정 / 일부 추가 캡처 NOT_RUN | 04 §9; VISUAL-VIEWPORTS; visual owner manifest (partial viewport-state evidence remains NOT_RUN) |
| R1-UIA-005 | 명세 교정 / 재심 대기 | 04 §3; detail D5; interaction I1; UPLOAD-01 |
| R1-UIA-006 | 명세 교정 / 재심 대기 | detail D5; interaction I1; GOLDEN-02 |
| R1-UIA-007 | 명세 교정 / 재심 대기 | GOLDEN-01/02/EMPTY; UPLOAD-01/02 |
| R1-UIA-008 | 명세 교정 / 재심 대기 | detail D2.2; CRITERIA-LIMIT |
| R1-UIA-009 | 명세 교정 / 재심 대기 | detail D2.4; CRITERIA-LIMIT |
| R1-UIA-010 | 명세 교정 / 재심 대기 | CRITERIA-TREE/REVISION; detail D2.1–3 |
| R1-UIA-011 | 명세 교정 / 재심 대기 | interaction I7; ANALYSIS-SHEETS/EMPTY |
| R1-UIA-012 | 명세 교정 / 재심 대기 | detail D6 detail-10 complete=false; ANALYSIS-SHEETS/PDF |
| R1-UIA-013 | 명세 교정 / 재심 대기 | 04 §4.1; interaction I2; FLOW-INTERLEAVE/STATE |
| R1-UIA-014 | 명세 교정 / 재심 대기 | interaction I2 state matrix; FLOW-STATE |
| R1-UIA-015 | 명세 교정 / 재심 대기 | 04 §5.2/§10; interaction I2; FLOW-INTERLEAVE |
| R1-UIA-016 | 명세 교정 / 재심 대기 | FLOW-INTERLEAVE; ARRIVAL-BURST; DOCK-LOG |
| R1-UIA-017 | 명세 교정 / 재심 대기 | 04 §5.1; tokens.motion.theater; visual catalog effective cascade |
| R1-UIA-018 | 명세 교정 / 재심 대기 | 04 §5.2; interaction I3; THEATER-SELECT |
| R1-UIA-019 | 명세 교정 / 재심 대기 | 04 §2.5/§5.2–3; ARRIVAL-BURST mobile oracle |
| R1-UIA-020 | 명세 교정 / 재심 대기 | interaction I4 exact predicates/callsites; DOCK-SCOPE |
| R1-UIA-021 | 명세 교정 / 재심 대기 | 04 §4.2; interaction I4; DOCK-CAP observed limitation |
| R1-UIA-022 | 명세 교정 / 재심 대기 | 04 §4.2; interaction I4; DOCK-LOG |
| R1-UIA-023 | 명세 교정 / 재심 대기 | DOCK-SCOPE/LOG/RECONNECT; FLOW-INTERLEAVE |
| R1-UIA-024 | 명세 교정 / 재심 대기 | interaction I5 recent3 and I6 full SVG/icon/caption map; SCENE-MAP |
| R1-UIA-025 | 명세 교정 / 재심 대기 | 04 §4.3/§5.2; interaction I5; HANDOFF-LIFECYCLE |
| R1-UIA-026 | 명세 교정 / 재심 대기 | HANDOFF-20; interaction I5 exact retained keys |
| R1-UIA-027 | 명세 교정 / 재심 대기 | interaction I6; SCENE-MAP; HANDOFF-20/LIFECYCLE |
| R1-UIA-028 | 명세 교정 / 재심 대기 | detail D1.2; PREVIEW-PDF-FRACTION (no finite/integer guard in chip path) |
| R1-UIA-029 | 명세 교정 / 재심 대기 | detail D1.4; PREVIEW-PDF-FRACTION geometry |
| R1-UIA-030 | 명세 교정 / 재심 대기 | PREVIEW-LABEL/REJECT; detail D1.3 |
| R1-UIA-031 | 명세 교정 / 재심 대기 | 04 §7; interaction I8; RESULT-SELECTION |
| R1-UIA-032 | 명세 교정 / 재심 대기 | 04 §2.5; tokens.layout.result; interaction I8; RESULT-MOBILE |
| R1-UIA-033 | 명세 교정 / 재심 대기 | interaction I8 empty matrix; RESULT-EMPTY |
| R1-UIA-034 | 명세 교정 / 재심 대기 | interaction I8; full220ms/y14 vs compactinitialfalse; RESULT-MOBILE |
| R1-UIA-035 | 명세 교정 / 재심 대기 | 04 §6; interaction I8/I9; TOOLTIP-LIMIT |
| R1-UIA-036 | 별도 05 작성자 위임 | 05 dashboard owner: defaultInstruction/presets (no edit in this author scope) |
| R1-UIA-037 | 04 부분 교정 / 05 위임 | 04 §9 UI-10 hidden iframe distinction fixed; 05 owner handles shell OS/callsites |
| R1-UIA-038 | 별도 05 작성자 위임 | 05 dashboard owner: exact14 fields |
| R1-UIA-039 | 별도 05 작성자 위임 | 05 dashboard owner: bounded fallback example plans |
| R1-UIA-040 | 별도 05 작성자 위임 | 05 dashboard owner: complex plan/18-combination fixtures |
| R1-UIA-041 | 별도 05 작성자 위임 | 05 dashboard owner: source selection reset table |
| R1-UIA-042 | 별도 05 작성자 위임 | 05 dashboard owner: source-view layout/scroll |
| R1-UIA-043 | 별도 05 작성자 위임 | 05 dashboard owner: two-file source trace |
| R1-UIA-044 | D4.3 교정 / 05a 동기화 위임 | detail D4.3 and tokens.color.ledger corrected; parent routed matching 05a palette |
| R1-UIA-045 | 명세 교정 / 재심 대기 | tokens.json strictJSON parse correction 0-prefix numeric literals |
| R1-UIA-046 | 명세 교정 / 재심 대기 | 04 §2.1; tokens brand32×32/radius9/tracking-1.7 |
| R1-UIA-047 | 명세 교정 / 재심 대기 | detail D5; tokens.color.golden/dialog; interaction I1 |

## 명확성 34건

| Issue | 작성자 처리 | 수정 위치와 설명 |
|---|---|---|
| R1-UI-001 | 명세 교정 / 재심 대기 | interaction I1 exact effect dependencies; TIMER-01; 04 §5.4/§9 absolute deadline removed |
| R1-UI-002 | 명세 교정 / 재심 대기 | detail D5; tokens golden; VISUAL-CONTRACT normative precedence |
| R1-UI-003 | 명세 교정 / 재심 대기 | 04 §5.1/5.3 native8/4 scan6.4 trace1.7; visual catalog normative |
| R1-UI-004 | 계약 교정 / 추가 캡처 일부 NOT_RUN | 04 §9 supplied vs additional NOT_RUN viewports; visual owner manifest |
| R1-UI-005 | 명세 교정 / 재심 대기 | interaction I1 sample matrix; SAMPLE-01 |
| R1-UI-006 | 명세 교정 / 재심 대기 | interaction I1; UPLOAD-01/02; Golden1/2 |
| R1-UI-007 | 명세 교정 / 재심 대기 | detail D5; GOLDEN-02 App all unreachable |
| R1-UI-008 | 명세 교정 / 재심 대기 | GOLDEN-01/02/EMPTY |
| R1-UI-009 | 명세 교정 / 재심 대기 | CRITERIA-TREE/REVISION; explicit duplicate-name source IDs/coordinates |
| R1-UI-010 | 명세 교정 / 재심 대기 | interaction I7 full status/quality/seal/empty matrix |
| R1-UI-011 | 명세 교정 / 재심 대기 | ANALYSIS-SHEETS/PDF/EMPTY |
| R1-UI-012 | 명세 교정 / 재심 대기 | 04 §4.1; interaction I2; FLOW-INTERLEAVE |
| R1-UI-013 | 명세 교정 / 재심 대기 | interaction I2 state table; FLOW-STATE; theater connection limitation |
| R1-UI-014 | 명세 교정 / 재심 대기 | FLOW-INTERLEAVE; ARRIVAL-BURST; DOCK-LOG |
| R1-UI-015 | 명세 교정 / 재심 대기 | interaction I3; ARRIVAL-BURST; HANDOFF-LIFECYCLE distinctions |
| R1-UI-016 | 명세 교정 / 재심 대기 | interaction I3; THEATER-SELECT; ARRIVAL-BURST exact6sample order |
| R1-UI-017 | 명세 교정 / 재심 대기 | interaction I4 per-callsite predicates; DOCK-SCOPE |
| R1-UI-018 | 명세 교정 / 재심 대기 | 04 §4.2; interaction I4 autoCollapse false default/review true; DOCK-COLLAPSE |
| R1-UI-019 | 명세 교정 / 재심 대기 | interaction I4; DOCK-LOG/SCOPE |
| R1-UI-020 | 명세 교정 / 재심 대기 | interaction I5 recent history actual semantics; I6 SVG full map |
| R1-UI-021 | 명세 교정 / 재심 대기 | interaction I5: session/group/liveSince/three eviction policies; HANDOFF-20/LIFECYCLE |
| R1-UI-022 | 명세 교정 / 재심 대기 | 04 §4.3/§10; interaction I5; actual dock CSS pauses; HANDOFF-20 |
| R1-UI-023 | 명세 교정 / 재심 대기 | interaction I8 complete selection table; RESULT-SELECTION |
| R1-UI-024 | 명세 교정 / 재심 대기 | interaction I8; RESULT-MOBILE; 04 §2.5 |
| R1-UI-025 | 명세 교정 / 재심 대기 | interaction I8 empties/previous-next bounds; RESULT-EMPTY/SELECTION |
| R1-UI-026 | 명세 교정 / 재심 대기 | interaction I8 edit/save/cancel/current source limitations; INSPECTOR-SAVE |
| R1-UI-027 | 명세 교정 / 재심 대기 | 04 §6; interaction I8/I9; TOOLTIP-LIMIT |
| R1-UI-028 | 별도 05 작성자 위임 | 05 dashboard owner: exact prompts/presets |
| R1-UI-029 | 별도 05 작성자 위임 | 05 dashboard owner: modal state product matrix |
| R1-UI-030 | 별도 05 작성자 위임 | 05 dashboard owner: missing/empty HTML job response |
| R1-UI-031 | 별도 05 작성자 위임 | 05 dashboard owner: reopen/retention state oracle |
| R1-UI-032 | 별도 05 작성자 위임 | 05 dashboard owner: complex requests and18 combinations |
| R1-UI-033 | 별도 05 작성자 위임 | 05 dashboard owner: pending/presence normalization information boundary |
| R1-UI-034 | 별도 05 작성자 위임 | 05 dashboard owner: source selection/reset/scroll/oracle |

## 교차 영역 후속 지적

- CORE-14 / core-clarity R1-011…015: 04 §7.4와 detail D1.3/I9에서 표 좌표 경로는 quote 검증을 우회함을 명시. PREVIEW-WRONG-CELL은 현재 잘못된 색칠이 가능한 입력/기대값이며, 추가 보호를 baseline 통과로 세지 않는다. PDF item-name witness와 missing 전처리는 별도 범위다.
- CORE-15: autoCollapse 기본값 false/대상 review만 true를 I4에서 완결. 외부 소스 조회를 독자에게 요구하지 않는다.
- cancel POST 실패는 현재 요청일 때 오류/false, reset/abandoned cancelRemote와 다름. I1/CANCEL-01에 반영.
- 초기 10 main CSS만의 설명을 eager5+main10 및 dynamic catalog 정본으로 보완. 모션 색인은 전체 cascade를 대신하지 않는다.
- hidden chart0는 닫힌 모달/미방문 hidden 신규 mount에만 적용. 기존 표시한 iframe 유지가 의도된 source 탭 전환은 05 D09와 일치하도록 04 UI-10 교정.

## 검증 상태

- strict JSON: tokens.json 및 interaction-fixtures.json 파싱, 사례 ID 중복, 문서 내 로컬 링크 존재, 전체 사례 NOT_RUN 명시를 정적 검사한다.
- 43개 합성 fixture는 검증 설계이며 실행 완료로 주장하지 않는다. 실제 API/서버/브라우저를 이 작업에서 호출하지 않았다.
- visual owner가 제공한 manifest/screenshot만 실제 캡처로 취급한다. 신규1600×960/1280×800의 live-review/결과목록 등 미보유 조합은 추가 acceptance NOT_RUN이다.
- 독립 reviewer가 R2에서 수정의 정확성과 문서만으로의 재현 가능성을 다시 판정해야 한다.

## 의도적으로 남긴 원본 한계

표 좌표→quote 불일치, fractional PDF chip page, 빈출처 추가 상한, task oldest100 보존, tooltip 세로overflow/Escape미지원, 부분 OS reduce, theater 연결단절 ambience, 저장 중 편집 취소가 요청을 abort하지 않음, sample load epoch미검사. 이들은 문서를 고쳐 이미 기능이 개선됐다고 주장할 대상이 아니다.


R2 준비 교차 보완: I1 RESET-EXACT는 reset 직접 대입/보존 값을 구분한다. I5 HANDOFF-KEY는 정확한 handoff:event.id와 parent:from:to 키 및 동일 eventID endpoint 변경시 비재생을 규정한다.

정적 검사 결과: tokens/fixtures JSON 파싱 2/2, 43개 고유 fixture ID 및 모두 NOT_RUN, 로컬 Markdown 링크 8/8 존재, R1 issue 행 47+34 모두 대응, 지정한 7개 구형 단정 문자열 잔존0. coverage.transcription과 별도 analysis.transcription 경계도 명시했다.

R2 추가 정확성 보완: workroom 최종 mint/cobalt와 compact reason12/1.75, coverage 전사 nesting, 실제 preview cells/in-bounds 보충 거부/도착 후 pointer 검사, raw handoff20 payload+9거부/parent변형, scene24대표variant, oldest-active fallback, 강제refresh와online 차이, 절대epoch clock 변환, PDF explicit/omitted page bbox fixture를 반영했다.

R2 최종 보완: duplicate handoff는 시간 유효성보다 앞서 구조적 first-added로 dedupe(HANDOFF-DUP-TIME); dashboard rail에는 문서 phase 이름 대체 미적용; 모션 OFF의 is-running class는 유지하고 CSS/data-reduced-motion이 정지함을 구분.

## R2 D18/G13 필수 툴팁 및 scene 보완

- I8.1 REQUIRED_REBUILD: margin8px/width cap276px, 실제 높이로 clamp, max-height viewport-16px, 내부 스크롤과 line-clamp 해제, resize/scroll 재측정, Escape 소비+trigger focus/latch/cleanup 명시. baseline280px/12px/overflow 동작은 그대로 기록한다.
- TOOLTIP-LIMIT은 BASELINE_OBSERVATION으로 G13 제품 정답에서 제외; TOOLTIP-G13-REBUILD에 네 좌표 상태와 scroll/Escape/cleanup oracle 추가. 현재 NOT_RUN이며 프로덕션 수정 없음.
- SCENE-MAP에 dashboard running install → stage1/Install/설치/loop true를 명시하여 총25개 대표 variant. fixture 전체44개.

- R2 CORE14-C04: I9.1에서 D18/G05/G07/G12 표 위치 검증을 필수화. 원본hash/sheet/bounds/단일record/물리셀quote/숫자token/실제itemanchor/unit 역할을 명시. PREVIEW-WRONG-CELL은 baseline, TABLE-HIGHLIGHT-REBUILD는 정상·음성20variant의 필수 제품 oracle. 문서45fixture/scene25variant이며 모두 NOT_RUN.

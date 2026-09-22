# 현재 구현 재현: core 설계 감사

검토일 2026-09-21. 검토자 `/root/audit_core`. 범위는 specs 01/02/03/07, contracts types/internal-pipeline/algorithm-edge-cases, pipeline prompt assembly다. 제품 `src`, `server`, `integrations`는 읽기만 했고 수정하지 않았다. 다른 평가자가 전달한 지적은 아래에 구분한다. 이 보고서는 전체203/235질문 평가나 제품 실행 합격 보고서가 아니다.

## 기준과 확인 방법

사용자의 목표는 현재 프로젝트 재현이다. 현재 소스에서 관측한 동작을 CURRENT_REPRODUCTION 정답으로 삼고 이전 설계의 제품 개선 제안은 OPTIONAL_FUTURE에 남겼다. 개선안의 예상값으로 현재 결과를 바꾸어 재현 성공이라고 계산하지 않는다. 명확한 약한 validator는 안전한 validator가 아니며, 한계의 명확성을 제품 안전성 점수로 해석하지 않는다.

01의 HTTP/status/version/approval/terminal 상태를 review.mjs의 해당 분기와 대조했다. 02의 reader·VLM·session/repair 경계, 03의 일반 admission·조건복구·shape normalization·최종 machineStatus, 07의 반복 budget을 집중 점검했다. 원래 카탈로그의 템플릿 문자열과 해시는 독립 정적 검사로 대조했다. 모든 원본 파일/분기를 새로 전수 실행한 것은 아니다.

## 수정한 계약

| ID | 현재 원본 근거 | 설계 위치 | 수정 및 기본 재현 정답 |
|---|---|---|---|
| CR-CORE-01 | `server/review.mjs:137`, `:147`, `:164` | 03 §5/15, algorithm-edge-cases | 일반 finding admission은 위치 형식만 검사한다. A0/역 range/없는 sheet·quote에도 무조건 numeric pass가 가능하다. SOURCE-GROUNDING 개선 guard를 기본에 넣지 않도록 분리하고 실제 반례3개를 baseline fixture로 추가했다. |
| CR-CORE-02 | `server/conditions.mjs:20`, `:48` | 03 §3.3, algorithm-edge-cases | sourceEvidence-only 후보는 evidenceCells 행 제약을 받지 않는다. 같은 label의7일/28일 조건이 둘 다 병합되는 현재 결과를 baseline으로 추가하고 행 증명 강화는 향후 제안으로 분리했다. |
| CR-CORE-03 | `server/review.mjs:89`, `:469`; `server/criteria-revision.mjs:20`, `:136`, `:170`, `:247`, `:250`, `:269` | 03 §2/13.2, pipeline-prompts의 overlay절 | 일반 validator의 ungrounded hierarchy 유지/invalid comparison 삭제, 원래 프롬프트의 hierarchy 문구 충돌과 required 열거 누락을 현재 계약으로 보존한다. HIERARCHY_SCOPE_V2/REQUIRED_PATCH_V2를 기본 assembly에 append하던 지시를 제거했다. schema가 required:boolean patch를 받는 것과 모델이 이를 항상 생성한다는 주장을 구별했다. |
| CR-CORE-04 | `server/visual-transcription.mjs:7`, `:11`, `:251`, `:356`; `server/sandbox-document-reader.py:31`, `:493` | 02 마지막 절 | 이미지8/VLM30페이지/180초 상한과 partial을 현재 정답으로 고정했다. 별도 window/session 전수처리와 geometry DTO는 현재 기능이 아니다. |
| CR-CORE-05 | `server/review.mjs:189`–`:202` | 03 §5의9/10 | label 보정은 단일셀 evidence의 row Set만 사용하고 range/좌표 없는 인용은 Set에서 제외한다. 보정 조건을 만족하지 않으면 raw label을 유지한다. machineStatus는 raw 모델 status가 아니라 서버 guard를 거친 최초 정규화 판정이다. |
| CR-CORE-06 | `server/document-quality.mjs:14`, `:39`, `:190`, `:247` | 02 §2.5.1 및 기존 pseudocode, 07 §7.8 | source-blind `/root/clarity_core`가 발견한 fallback 선택 공백. proposed 유무를 먼저 결정하고 정규화·dedup·앞8 순서로 처리한다. first8 retained-sheet bounding→BLOCK1..200→L1..1000 분기, 빈 시트/A1, splitlines, no second fallback/cursor와 사례를 추가했다. |
| CR-CORE-07 | `server/criteria-workbook-profile.py:24`, `:48`, `:78`–`:118` | 03 §11.1a | source-blind `/root/clarity_core`가 발견한 sample 선택 공백. sparse cell 정렬→행 band→열 group 순서, Python round 기반24개 index 공식, N1/25/47, 값/수식/comment clipping과 truncated 조건을 명시했다. |
| CR-CORE-08 | `server/criteria-revision.mjs:212`, `:269`; `server/review.mjs:628` | 02 §2.8 | 별도 정확성 평가자가 조정자를 통해 전달한 오류. document context repair는 현재 E2B 세션 재사용, XLSX discovery는 별도 E2B, HITL revision은 Gemini-only1회로 정정했다. 사용자 revision이 sandbox를 만든다는 이전 설명은 틀렸다. |
| CR-CORE-09 | 현재 snapshot/runtime 경계는 05의 소유 평가에서 대조 | 07 EF-14, internal-pipeline의 미래 DTO 주석 | 기본 dashboard의 plan3회 loop에 별도 semantic judge/repair 합계3예산을 강제하던 혼합을 제거했다. RequiredRebuild* 타입 이름은 역사 참조용이며 current HTTP에 추가되지 않는다는 주석을 명시했다. 구체 dashboard 정확성 평가는 exports 담당 범위다. |
| CR-CORE-10 | `server/review.mjs:548`–`:563`, `:574`–`:577` | 01 §3, 02 §2.9, 03 §11.2 | 최종 accuracy_core의 후속 지적을 현재 소스로 확인했다. target partial의 정규화 items count/strict-false 의미, 최종 error 우선순위와 event 순서, run의9개 criteria 신호 exact predicate 및 누락값 처리를 명시했다. discovery complete 계열 전부를 직접 검사한다는 stronger guard 오해를 제거했다. |
| CR-CORE-11 | `server/review.mjs:152`–`:202`, `:542`–`:549` | efficiency-inventory EA-06 | 최종 accuracy_core의 CORE19 X01 후속 지적으로 추가 허용받은 파일이다. numeric/missing→conditions→applicability→독립추출 mismatch→표시 label→machineStatus 순서를 소유 명세03 §5와 일치시켰다. 독립 fields 추출은 PDF/image target 경로임을 명시하고 row coverage를 별도 단계로 구별했다. |

01 머리말에도 CURRENT_REPRODUCTION과 동적 UUID/시각 경계, 미래 DTO 제외를 명시했다. 03의 마지막 중복 절번호14는15로 정리했다. 변경된 참조는 현재 문서 안에서 §15로 연결하며 조정자에게 외부 앵커 갱신을 알렸다.

## 실제 실행한 검사

- `node .cache/architecture-current-reproduction/core-probes.mjs`: 5/5 local source probe 통과. 세 위치 admission 반례, sourceEvidence-only 조건 병합, shape normalization을 실행했다. 출력은 [core-probes.json](core-probes.json). 첫 작성 시 preserveSourceConditions import 경로 오류로1회 실패했고 conditions.mjs로 정정한 뒤 성공했다. 제품 파일 변경이나 provider 호출은0이다.
- `node .cache/architecture-current-reproduction/check-core-contracts.mjs`: 44/44 통과. 카탈로그에 template 문자열이 있는 entry들의 현재 원본 literal 일치, criteria catalog sourceSnapshots3개 SHA256, fixture ID 고유성과 profile 일관성을 검사했다. 출력은 [core-contract-checks.json](core-contract-checks.json). 이는 모델 의미 정확도 검사가 아니다.
- algorithm-edge-cases는27개다. CURRENT_REPRODUCTION12개, OPTIONAL_FUTURE15개이며 기존 mode 문자열과 기존 fixture는 보존했다. 이번 probe가27개 모두를 실행한 것은 아니다.

## 독립 재검토와 남은 경계

`/root/clarity_core`가 CR-CORE-06/07의 새 상세절을 문서만으로 재검토하여 지적 공백 해소를 회신했다. 기존 02 pseudocode의 fallback 시점을 같은 순서로 동기화하라는 후속 지적도 반영했다. 다른 변경은 작성자 검증이므로 조정자의 별도 정확성/명확성 검토와 입력 freeze가 필요하다. 이 보고서 자체에 자가평가100점을 부여하지 않는다.

현재 scope에서 확인한 미기재 fallback/sample 규칙과 잘못된 HITL sandbox 설명은 수정했다. 모델 출력의 비결정성, 원본의 약한 일반 원문 검증, 조건 병합 한계, 원래 prompt 모순, 한도 초과 partial은 그대로 드러나 있다. 실제 Gemini/E2B, 전체 파일 workflow, 새 프로젝트 재구현, browser/UI, live provider/holdout은 이번 검사에서 **NOT_RUN**이다. 문서가 더 명확해졌다는 것과 현재 프로젝트의 실제 재현이 입증되었다는 것은 구별한다.

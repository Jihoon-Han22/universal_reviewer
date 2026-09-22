# 현재 재현 설계의 독립 평가 방법

사용자 목표는 현재 프로젝트의 재현이다. [DECISIONS](../../DECISIONS.md)와 [REPRODUCTION](../../REPRODUCTION.md)이 범위를 고정한다. 과거 개선판 목표는 OPTIONAL_FUTURE다. 이 범위 변경은 사용자 요청에 근거하며 문구 변경 전후를 population-changes.json에 보존한다. 이전 235질문은 삭제하지 않는다.

## 역할과 독립성

- 작성/교정: `/root`, `/root/audit_core`, `/root/audit_ui`, `/root/audit_exports`, `/root/audit_verification`. 마지막 반례 검토의 수정은 `/root/last_core_challenge`, `/root/last_ui_challenge`가 맡고, `/root/last_blind_challenge`는 원본 없이 문서 반례와 수정 후 독립 계산만 수행한다. 이 보조 검토는 아래 지정된 최종 평가자를 대체하지 않는다.
- 문서만 읽는 명확성 평가: `/root/clarity_core`(CORE-01..19), `/root/clarity_ui`(UI-01..18), `/root/clarity_verification`(CORE-20..21). 원본 제품 코드와 과거 점수/작성자 보고서는 읽지 않는다.
- 정확성 평가: `/root/accuracy_core`(CORE-01..13/15/19), `/root/accuracy_ui_exports`(UI 전체와 CORE-14/16/17/18), `/root/review_verification`(CORE-20..21)이 작성에 참여하지 않고 원본과 고정 문서를 대조한다. 실제 보고서의 reviewerId를 seal에 기록한다. 같은 ID가 명확성/정확성 양쪽을 평가하지 않는다.

사전 검토에서 발견한 모호함을 교정한 후 `node architecture/reviews/current-reproduction/audit.mjs freeze`로 입력을 고정한다. 최종 평가자는 current-inputs.json SHA-256을 평가 의견에 기록한다. 수정이 발생하면 다시 freeze하고 영향을 받은 의견을 실제 재검토한다. 새 해시만 기계적으로 덮어써 이전 의견을 현재 의견으로 만들지 않는다.

이전 승인본의 입력·모집단·의견·점수·seal은 `round-01-accepted/`에 원래 바이트로 보존한다. 그 폴더는 과거 평가 기록이며 당시 규범 파일 전체를 복원하는 배포본이 아니다. 후속 평가는 이전 입력 목록과 현재 목록의 해시 차이를 전수 확인하고, 변경된 문서가 영향을 주는 기존 질문 및 새 질문을 다시 판정한다. 변경되지 않은 질문 의견의 유지와 실제 재검토 범위를 보고서에 밝힌다. 과거의 통과 점수를 전체 최신 검토로 표시하지 않는다.

## 질문별 판정과 산식

각 JSON은 `role`(clarity 또는 accuracy), `reviewerId`, `evaluatedInputsSha256`, `questionResults`, `issues`를 가진다. 각 질문 의견은 `id`, `moduleId`, `status`(PASS/FAIL/UNVERIFIED), `evidence`(패키지 내부 문서 path+section, 정확성은 원본 경로:줄도 포함), `rationale`이 필요하다. 어떤 입력에서 어떤 동작을 결정할 수 있는지 구체적으로 작성한다.

명확성 PASS는 원본을 읽지 않고 필요한 입력·출력·분기·제한·기대값을 결정할 수 있음을 뜻한다. 정확성 PASS는 그 계약이 현재 제품과 일치함을 뜻한다. OPTIONAL_FUTURE와의 구별은 검사하지만 그 기능의 구현을 요구하지 않는다. 미실행 제품 테스트는 설계 평가 근거의 범위를 넘지 못한다.

- 명확성 = clarity PASS 수 / 전체 질문 수 × 100.
- 모호성 = 100 − 명확성. 별도의 보편적 품질 척도가 아니다.
- 정확성 = accuracy PASS 수 / 전체 질문 수 × 100.
- 미해결 모호성 질문 = FAIL + UNVERIFIED + 미검토.
- 설계 인수 = 두 역할에서 전 질문 PASS AND 열린 이슈 0 AND 현재 입력/보고서 해시 일치.

질문별 판정과 별도로 발견한 새 누락은 새 질문으로 추가한다. 분모 축소, 중복 의견, 근거 없는 통과, 오래된 해시의 통과를 허용하지 않는다. 이슈에는 id/severity/설명/관련 질문/수정 필요 사항/status를 기록한다. 열린 이슈가 있으면 점수가 100이어도 인수하지 않는다.

## 재현 가능한 계산

`audit.mjs freeze`는 norm 문서/자산/질문/도구와 비밀 제외 원본을 고정하고 population.json을 생성한다. 리뷰 결과/evidence/manifest는 순환 해시를 피하려고 규범 해시에서 제외한다. 이 PROTOCOL, audit.mjs, 기존 독립 score.mjs/score.test.mjs는 규범 해시에 포함한다.

`audit.mjs score REPORT.json ...`은 모든 역할 의견을 읽어 점수와 report seal을 저장한다. `audit.mjs check --source`는 현재 설계/원본/질문/보고서/점수를 다시 대조한다. 배포한 빈 프로젝트에서는 `check`로 원본 freshness 검사를 생략하고 그 상태를 NOT_RUN으로 표시한다. 누락·불일치는 실패다.

실제 새 앱 재구현과 provider·브라우저·공개 데이터 전수 시험은 수행하지 않았다면 NOT_RUN이다. 패키지/검증기 selftest와 설계 100점은 제품 재현 성공의 대체 증거가 아니다. 사용자가 요구한 절대적 재현 가능성은 실제 독립 재구현으로만 추가 확인할 수 있다.

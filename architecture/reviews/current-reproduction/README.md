# 현재 프로젝트 재현 감사

2026-09-21 사용자의 “지금 이 프로젝트 그대로” 요청과 마지막 재검증에 대한 현재 평가 진입점이다. 목표는 [CURRENT_REPRODUCTION](../../REPRODUCTION.md)이며, 현재 동작의 한계나 버그를 임의로 고치는 것은 OPTIONAL_FUTURE다.

현재 상태: **선언한 설계 평가 범위에서 완료**. 독립 평가자 6명의 의견을 고정 입력과 묶어 재계산했다. 실제 새 제품 재현은 NOT_RUN이다.

마지막 반례 검토에서 원문 직렬화, 분석 화면 그룹 병합, text reader 한도 equality에 관한 세 공백을 발견하고 보완했다. [마지막 검토 보고서](LAST-CHECK.md)에 발견 입력·수정·독립 계산·원본 probe·원본 없는 초기화 시험과 실행 한계를 기록했다. 앞선 240질문의 100/0은 모든 설계가 완전하다는 증명이 아니었다.

| 최종 평가 | 결과 |
|---|---:|
| 모듈 / 질문 | 39 / 243 |
| 명확성 | 243/243 = 100 |
| 모호성 (100−명확성) | 0 |
| 원본 정확성 | 243/243 = 100 |
| 미검토 / 열린 이슈 | 0 / 0 |
| 규범 파일 / 비밀 제외 원본 파일 | 319 / 210 |
| 이전 240질문 변경 / 삭제 | 0 / 0 |
| 이번 추가 질문 | 3 |

고정 입력 SHA-256은 `f3f78e1ffa4e28cc684e6ce2752c4492392a9fc806e357f53a14a4c9551c72fa`다. [고정 입력](current-inputs.json), [전체 질문](population.json), [변경 원장](population-changes.json), [평가 방법](PROTOCOL.md)을 함께 확인한다. 최초 235질문은 모두 보존했고, 이전 라운드의 목표 정렬 17개와 누적 질문 추가 8개를 원장에 남겼다.

## 독립 평가

| 평가자 / 역할 | 담당 질문 | 보고서 |
|---|---:|---|
| clarity_core / 원본 없는 명확성 | 105 | [core](final-clarity-core.json) |
| clarity_ui / 원본 없는 명확성 | 120 | [UI](final-clarity-ui.json) |
| clarity_verification / 원본 없는 명확성 | 18 | [검증](final-clarity-verification.json) |
| accuracy_core / 원본 대조 정확성 | 83 | [core](final-accuracy-core.json) |
| accuracy_ui_exports / 원본 대조 정확성 | 142 | [UI·exports](final-accuracy-ui-exports.json) |
| review_verification / 원본 대조 정확성 | 18 | [검증](final-accuracy-verification.json) |

각 역할은 총 243질문을 담당한다. 평가자들은 이전/현재 규범의 해시 차이를 전수 확인하고, 변경된 근거가 영향을 주는 기존 질문과 새 질문을 실제 재검토했다. 변경 없는 질문의 유지 근거와 직접 재검토한 ID는 각 보고서에 공개했다. 243개 전체를 처음부터 다시 읽거나 실제 제품으로 실행했다고 주장하지 않는다. 작성/수정 에이전트와 지정된 최종 평가자는 별개다. 명확성 평가의 원본 미열람 및 초기 검토에서의 우발적 요약 노출은 해당 보고서의 방법론에 공개되어 있다.

[계산 결과](scores-final.json)와 [보고서 seal](evaluation-seal.json)은 현재 입력과 모든 의견의 해시를 묶는다. 과거 승인본 `a62da86c…502ea178`의 입력·의견·점수·seal은 [이전 결과](round-01-accepted/scores-final.json)와 [이전 설명 원문](round-01-accepted/README.md.snapshot)에 바이트 그대로 보존했다. 과거 점수는 현재 평가에 합산하지 않는다.

## 실제 확인 범위

원본 직렬화 함수와 입력/출력 fixture, Python reader 한도, UI 순수 helper를 비교했다. 별도 평가자가 문서만 보고 만든 함수도 동일 fixture 및 최초 반례를 만족했다. 원본 소스 없는 별도 폴더에서 bootstrap 4/4와 CSS 28개 source·30개 산출물 복원 검사를 통과했다. 각 수치의 분모와 첫 sandbox EPERM 실패/재실행 경위는 [마지막 검토](LAST-CHECK.md)에 있다.

이전 라운드의 검증기 selftest·audit CLI·상속 profile 검사는 당시 증거이며 이번에 모두 반복 실행한 것이 아니다. 관련 검증 도구의 해시가 그대로임을 확인했다. 상세 실패/수정 이력은 [검증 감사](verification-audit.md), 이전 core/UI/exports 보완은 [core](core-audit.md), [UI](ui-audit.md), [exports](exports-audit.md)에 남아 있다.

원본 제품 210파일의 해시는 기준과 동일하다. 제품 코드·비공개 환경·데이터셋은 수정하지 않았다. 새 제품 재구현, 실제 Gemini/E2B 전수, 새 앱 build·브라우저·모션·접근성·holdout는 **NOT_RUN**이다. 설계 100/0은 선언한 질문의 독립 판정이며 임의 입력의 완전성·같은 LLM 결과·제품 재현 성공을 보장하지 않는다.

## 사용할 진입점과 재계산

[GOAL.md](../../GOAL.md)의 현재 `/goal` 문구를 사용한다. 재현자는 [README](../../README.md) → [DECISIONS](../../DECISIONS.md) → [REPRODUCTION](../../REPRODUCTION.md)부터 읽는다. 새 제품의 완료는 [실제 실행 gate](../../specs/06-verification.md)로 별도 증명한다.

```powershell
node architecture/reviews/current-reproduction/audit.mjs check --source
node architecture/tools/verify-package.mjs
```

원본이 없는 배포 환경에서는 `--source`를 생략하며 원본 freshness는 NOT_RUN으로 표시된다. 실제 재구현에서 차이가 발견되면 해당 입력/출력을 새 계약과 평가 질문으로 추가한다.

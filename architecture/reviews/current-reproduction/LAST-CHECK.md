# 마지막 반례 검토 — 2026-09-21

**앞선 100/0은 더 세밀하게 설계할 부분이 전혀 없다는 뜻이 아니었다.** 기존 240질문 밖에서 새 에이전트 3명이 반례를 찾았고, 실제 재현 결과가 달라질 수 있는 세 공백을 보완했다. 현재 제품 동작을 바꾸는 개선은 추가하지 않았다.

최종 결과: 선언한 243질문에서 명확성 243/243=100, 모호성 0, 원본 정확성 243/243=100, 미검토·열린 이슈 0이다. 아래 실행 증거와 설계 점수는 구별한다. [현재 평가](README.md), [계산 결과](scores-final.json), [보고서 seal](evaluation-seal.json)에 고정 입력과 독립 평가자 6명의 의견을 묶었다.

## 발견과 수정

| 발견 | 현재 계약으로 고정한 내용 | 새 질문 |
|---|---|---|
| 원문을 모델에 보내는 직렬화 형식이 충분히 고정되지 않음 | JSON 공백·key/record 순서·undefined 생략·metadata·개행·셀값·보조 record 전체와 JS UTF-16 단위. 같은 내용도 공백 차이가 150,000자 분할/1,200,000자 잘림을 바꾸는 반례를 해결 | CORE-05-C06 |
| 분석 화면 그룹 병합 순서와 중복 처리가 불명확 | inventory alias와 직접 배열 처리, Map 삽입 순서, 중복 값 덮어쓰기와 자리 유지, 새 구조 그룹 추가, 페이지 wrapper 병합 | UI-06-C07 |
| text reader의 한도 도달/초과가 혼동됨 | Python 문자 수 기준 1,500,000자까지 ready, 초과 시 partial. 다른 reader cap과 JS 모델 source 예산에 일반화하지 않음 | CORE-04-C06 |

[직렬화·reader 경계 입력/출력](../../contracts/source-serialization-cases.json), [UI 그룹 입력/출력](../../ui/document-analysis-structure-cases.json), [파이프라인 명세](../../specs/02-backend-pipeline.md), [화면 상세 계약](../../ui/detail-controls.md)에 원본 없이 적용 가능한 규칙을 남겼다. 추가로 실제 원본이 허용하는 raw profile·context shape와 `/api/runs` 오류 상태를 기존 검증 조항에 보충했다. DTO 선언보다 강한 검사를 임의로 넣어 현재 동작이 달라지지 않도록 했다.

기존 240질문은 변경·삭제 0개이며 새 질문 3개를 추가했다. 최초 235질문 기준으로는 이전 라운드의 표현 정렬 17개와 누적 추가 8개다. 이전 승인본의 원래 입력·의견·점수·seal은 [round-01-accepted](round-01-accepted/scores-final.json)에 보존했다. 해당 기록은 이전 문서 전체의 복원본이 아니며 현재 통과로 재사용하지 않는다.

## 실제 수행한 확인

| 확인 | 결과와 정확한 범위 |
|---|---|
| 원본 직렬화 함수 | 직접 명시한 문자열 4개와 길이 경계 recipe 6개 일치. UTF-8 해시와 JS 길이를 별도 확인 |
| 원본 Python reader | ASCII 1,499,999 / 1,500,000 / 1,500,001자 파일 3개를 Reader.read로 실행, 상태·coverage·잘림·경고 확인 |
| 원본 UI 순수 helper | 8개 입력의 전체 JSON 그룹 출력 일치. 브라우저 렌더 시험은 아님 |
| 문서만 읽은 독립 재구성 | 직렬화 4개·경계 6개·원래 반례 2개, UI 8개·원래 반례 2개 일치. reader 경계 3개는 문서 predicate 계산이며 실제 reader 실행 아님 |
| API/정규화 보조 probe | fake 서비스로 loopback HTTP body shape 6개, context coercion과 raw profile admission 확인. 실제 provider 호출 0 |
| 원본 소스 없는 별도 폴더 | architecture의 bootstrap 도구·환경 템플릿·폰트만으로 오프라인 초기화 시험 4/4 PASS. 실제 앱 구현·설치·build 시험 아님 |
| 별도 폴더 CSS 복원 | 패키지 style catalog만으로 CSS source 28개, 산출물 30파일 생성 및 check-generated PASS. 원본 소스·외부 패키지 미사용 |

부트스트랩 첫 시도는 Windows sandbox의 child process `EPERM` 때문에 1/4였다. 같은 오프라인 검사를 승인된 실행 권한으로 재실행해 4/4가 됐다. 이를 제품 결함 수정으로 계산하지 않는다. 관측 Node는 v24.21.0이며 패키지의 기준 런타임을 변경한 것이 아니다. 초기 실패를 숨기거나 두 실행 결과를 합산하지 않았다.

발견/해결 근거는 [원본 core 검토](last-check/core-findings.md), [원본 UI 검토](last-check/ui-findings.md), [원본을 보지 않은 검토](last-check/blind-findings.md), [부트스트랩 결과](last-check/bootstrap-portability.json)에 보존했다. 같은 fixture의 중복 확인을 더해 제품 테스트 포괄률로 표시하지 않는다.

## 범위와 남은 증명

이번 재평가는 이전/현재 입력 해시 전체 차이를 확인한 뒤 변경된 근거의 영향 질문과 새 질문을 다시 읽는 방식이다. 변경 없는 의견의 유지 여부와 실제 재검토 범위는 각 최종 평가자가 직접 기록한다. 새 해시만 바꾸어 예전 의견을 새 평가로 만들지 않는다.

제품 소스 210파일은 기준 해시와 동일하다. 새 제품의 독립 재구현, 실제 Gemini/E2B 실행, 새 앱 build·브라우저·화면 및 모션 비교는 **NOT_RUN**이다. 따라서 결론은 이번에 찾은 재현 공백을 해소하고 선언한 질문에 답할 수 있다는 데 한정한다. 모든 가능한 입력의 무누락이나 실제 제품 동일성은 아직 증명하지 않았다.

추가 설계가 필요한지를 가장 강하게 검증하는 다음 단계는 `architecture/`만 받은 별도 구현자가 빈 프로젝트에서 재현하고 기준 화면·행동과 비교하는 것이다. 구체적인 차이가 나오면 그 차이를 계약에 반영한다. 설계 점수만 반복해서 계산하는 것으로 그 실행 증거를 대체하지 않는다.

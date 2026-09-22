# 실제 실행 증거와 미실행 범위

이 디렉터리는 **이 패키지 작성 중 실행한 것만** 기록한다. source 조사와 screenshot synthetic replay를 실제 Gemini/E2B 검토로 해석하지 않는다. 과거 보고서의 성공 수치를 이번 결과로 재사용하지 않는다.

- `package-validation.json`: 자체 파일·link·schema·manifest 무결성 검사.
- `cleanroom-smoke.json`: architecture만 복사한 디렉터리에서 package validator/bootstrap 실행.
- `source-integrity.json`: 초기 210개 원본 파일 해시와 마지막 해시 대조. 보호된 운영 소스 수정 여부.
- `execution-log.json`: 이번 실행한 command/exit/evidence 요약.
- `design-review-scores.json`: 37개 모듈의 203개 질문을 명확성·정확성 두 차원으로 평가한 최종 점수와 평가표 해시.
- `verification-selftests.json`: 검증기 자체 테스트 83개의 실제 실행 결과. 제품 테스트 통과 수와 다르다.
- `bootstrap-portability.json`: 별도 이식성 검사 결과.
- `validation/`의 보고서: 독립 fixture/harness 테스트. 실제 제품/모델 성능 결과와 분리.
- `ui/reference/manifest.json`: 합성 데이터로 원본 React를 렌더한 PNG와 origin/viewport/브라우저 정보.

미실행: 새 앱 전체 재구현, 새 앱 npm build, 새 앱 실제 provider golden 전수 평가, 새 앱 holdout, 새 앱 접근성/성능 acceptance. 해당 gate들은 설계된 향후 완료 조건이지 이번에 통과한 결과가 아니다.


## 역사 표시

이폴더의기존실행증거는독립재감사수정전의역사다. 2026-09-21 independent-audit에서새로수행한명령·해시·점수는[별도기록](../reviews/independent-audit/README.md)에있다. 이폴더의과거pass를현재수정판이나새제품인수결과로재사용하지않는다.

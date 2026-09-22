# 마지막 검토의 보존 증거

이 폴더의 보고서·probe·결과는 `.cache/architecture-final-challenge/`에서 실제 수행한 검토를 바이트 그대로 복사한 기록이다. 제품 구현이나 배포용 도구가 아니다. 최초/수정 후 관측과 NOT_RUN 범위를 각 보고서에서 구별한다.

원본을 참조하는 probe는 기존 제품과 당시 로컬 의존성이 필요하며, 파일 안의 상대 경로도 원래 `.cache/architecture-final-challenge/` 위치를 기준으로 한다. 재실행하려면 그 경로에 해당 파일을 복사하고 프로젝트 루트에서 기록된 명령을 사용한다. `build-source-cases.mjs`는 계약을 생성하는 당시 작성 스크립트이므로 현재 인증본에 재실행하면 수정과 재평가가 필요할 수 있다. 증거를 읽기 위해 실행할 필요는 없다.

`recheck-source-doc-only.mjs`와 `recheck-ui-doc-only.mjs`는 원본을 읽지 않고 규범 문장을 별도로 코드로 옮긴 확인이다. 이 두 파일은 프로젝트 루트에서 실행하면 architecture fixture만 읽는다. 문서 명확성 확인이며 제품 전체 동일성 검사가 아니다.

`bootstrap-portability.json`은 원본 소스 없는 복사본에서 수행한 최종 오프라인 시험 결과다. 첫 sandbox EPERM 실패와 승인 후 재실행 경위는 [마지막 검토](../LAST-CHECK.md)에 기록했다. 원본 architecture/evidence의 과거 보고서는 덮어쓰지 않았다.

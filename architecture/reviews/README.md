# 독립 설계 검토

현재 인수 절차는 [현재 프로젝트 재현 감사](current-reproduction/README.md)와 [평가 프로토콜](current-reproduction/PROTOCOL.md)이다. 아래 main-session 설명과 점수는 과거 버전의 이력이며 현재 통과 주장으로 재사용하지 않는다.

- **명확성 평가자:** `architecture/`만 읽고 독립 구현의 선택이 결정되는지 확인한다.
- **정확성 평가자:** 고정한 원본과 설계의 필드·상태·수치·한계를 비교한다.
- **작성자:** 질문마다 필요한 계약을 보충하고 수정 위치를 남긴다. 자기 점수로 인수하지 않는다.

[과거 변경 이력](main-session/CHANGES.md)과 `main-session/round-*/`의 JSON/Markdown에는 당시 지적 사항과 검토 입력 해시가 있다. 당시 R1 36모듈/198질문은 37모듈/203질문으로 확장됐고, 이후 independent-audit에서 39모듈/235질문이 됐다. 현재 질문 수와 변경 이력은 [현재 모집단 변경 기록](current-reproduction/population-changes.json)에서 확인한다. 같은 질문을 명확성·정확성으로 각각 평가하며 미검토는 통과가 아니다.

critical은 재현 불가능·오판·노출을 필연적으로 만드는 공백, high는 중요한 구현 선택이 갈리는 공백, medium은 제한된 기능/검증의 누락, low는 표현·가독성 문제다. **설계 인수는 모든 필수 질문 통과와 지적 사항 전부 해소**가 필요하다. 낮은 심각도라고 조용히 버리지 않는다.

`dashboard-source-tests.md`와 `ledger-export-test-run.txt`는 작성 중 수행한 원본/참조 관련 시험 기록이며 새 앱 acceptance가 아니다. 실제 재구현은 [06 검증 계약](../specs/06-verification.md)의 별도 gate와 실행 증거를 만족해야 한다. 정확성 감사의 `source:` 해시는 저자 측 원본 대조를 위한 것이며, 원본이 없는 새 프로젝트에서 그 감사를 재실행해야 bootstrap이 되는 구조가 아니다.

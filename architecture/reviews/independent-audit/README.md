# GSPEC 독립 재감사

현재 작업은 설계와 검증 도구의 보완이며 새 제품 구현이 아니다. [평가 방법·역할](PROTOCOL.md), [모집단 변경](population-changes.json), [초기 입력 해시](initial-inputs.json)를 함께 읽는다.

수정 전 기존 203질문의 명확성은201/203(99.01%), 정확성은195/203(96.06%)였다. 새 발견을 포함한 동일235질문 분모의 초기 명확성은201/235(85.53%, FAIL7/미검토27), 정확성은202/235(85.96%, FAIL26/미검토7)다. 모호성은명확성의보수14.47%,미해결명확성질문34개다. 미검토는통과가아니다.

- [최초203개 점수](round-01/scores-original.json), [확장235개 초기 점수](round-01/scores-expanded.json)
- [문서만 읽은 초기 의견](round-01/clarity.md), [원본 UI 의견](round-01/ui-accuracy.md), [원본 core 의견](round-01/core-accuracy.md), [검증기 의견](round-01/verification-accuracy.md)
- [새 평가자의 독립 발견](round-02/cross-precheck.md), [검증기 수정](round-02/verification-fixes.json)

현재 설계는39모듈/235질문이다. 기존203질문은삭제0,새질문32개를추가했다. 독립proposal의ID충돌은별도ID로분리했고health의같은질문제안만하나의ID에두역할의의견을연결했다. 초기raw파일은수정하지않으며normalized파일은ID별명·근거객체의문자열투영만적용한채점용사본이다.

최종 독립 재평가는 사용자 요청으로 중단했다. [저장된 재개 지점](CHECKPOINT.md)에 완료 작업과 남은 검증·ZIP 작업을 기록했다. 과거 main-session의37모듈/203질문100점을현재결과로재사용하지않는다. 이번 고유에이전트는조정자를포함6명이며이전79명과합산하지않는다. 제품재구현·브라우저·실제provider·golden/v3전수는NOT_RUN이다.

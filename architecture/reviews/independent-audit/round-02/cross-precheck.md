# 독립 교차 사전검토

평가자 실제 ID: `/root/final_cross_review`. 역할: 설계·검증기 작성자가 아닌 최종 정확성 검토자. 이번 신규 1명, 재사용 0명, child 생성 0명. 이 문서는 초안 검토이며 최종 PASS 또는 현재 전체 질문 통과를 선언하지 않는다.

## 검토 입력과 실행

- `architecture/README.md`, independent-audit 프로토콜·초기 verification-accuracy, `score.mjs`와 테스트를 읽었다.
- `.cache/architecture-independent-audit/verification/draft/architecture/validation/`의 adapter-worker, run-gate, harness, acceptance, evidence schema, synthetic fixture, README 및 관련 selftest를 읽었다. 실제 제품·provider·브라우저·서버는 실행하지 않았다.
- 수정 진행 중 초안 selftest 36개와 당시 score selftest 4개를 독립 실행하여 40/40 PASS, failed 0, skipped 0을 확인했다. 작업 cwd는 `.cache/architecture-independent-audit/`였으며 생성된 자료도 그 아래에 있다. 이는 검증기의 대조실험 통과이며 제품 통과가 아니다. 이후 수정된 파일에는 이 결과를 재사용하지 않는다.
- 이후 synthetic 경로 probe와 score 음성 probe를 추가했다. probe는 `.cache/architecture-independent-audit/cross-probes.mjs`, 출력은 `cross-probe-data/result.json`이다. 첫 실행의 잘못된 상대 import는 실제 검사 전 실패했고, 경로 수정 후 재실행했다. 뒤이어 score가 동시 수정되어 기존 무인자 probe를 거부한 것도 기록했다.

## 독립 발견 및 전달

| ID | 중요도 | 발견 | 수정·재검증 상태 |
|---|---|---|---|
| CROSS-01 | medium | 최초 score는 동일 reviewerId가 명확성·정확성 두 역할을 맡아도 accepted:true였고, rationale 공백·evidence 문자열도 통과했다. 평가 입력 snapshot에 묶이지 않아 과거 PASS 재사용을 계산기 자체가 막지 못했다. | root에게 전달. 현재 수정본은 snapshot 필수·교차 reviewer 거부·nonblank rationale·evidence 배열 검증을 추가했다. 최종 freeze 후 새 테스트와 입력 해시를 재확인한다. |
| CROSS-02 | medium | harness는 양의 safe integer만 검사하여 Node timer 최대를 넘는 timeout도 허용했다. 2^31ms 이상은 Node가 1ms로 줄이므로 계약과 다르게 즉시 timeout될 수 있다. | verification_audit에게 전달. 초안에 1..21600000 범위, README 및 9종 잘못된 timeout의 조기 거부 테스트가 추가되었다. 최종 freeze 후 재확인한다. |
| CROSS-03 | medium | acceptance artifact의 최종 파일만 lstat해 부모 junction을 검사하지 않았다. 프로젝트 바깥 synthetic 파일로 연결된 proofs/proof.json을 inputs/artifacts로 제시하자 evidenceConsistent:true, errors:[]였다. | verification_audit와 root에게 재현 probe를 전달했다. 부모 경로 symlink/junction 거부 또는 realpath 경계 검증 및 음성시험이 필요하다. |

초기 203개 질문은 삭제하거나 감점 조건을 완화하지 않는다. 위 새 발견은 부모 조정자가 신규 질문 또는 명시적으로 확장한 검증 조건과 연결하고 최초 미검토 상태를 보존해야 한다.

## 최종 검토 대기 조건

최종 freeze 신호 뒤 CORE-20·CORE-21 전체 질문, 전수 source→design 추적 분모, 현재 snapshot/report/population 연결, 점수 집계, package validator와 배포 package의 무결성을 다시 확인한다. 작성자는 자신의 검증기 변경을 최종 승인하지 않는다. 최종 해시 봉인 전인 이 문서의 결과는 과거·초안 의견으로만 남긴다.

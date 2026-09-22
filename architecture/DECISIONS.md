# 범위와 단일 결정 원장

기준일: 2026-09-21, 원본은 Git 저장소가 아니다. 정확한 입력 소스는 [해시 manifest](baseline/source-snapshot.json)로 식별한다.

## 현재 목표: CURRENT_REPRODUCTION

사용자의 2026-09-21 요청은 **지금 이 프로젝트 그대로 재현**하는 것이다. 이 결정은 과거 개선판 제작 목표를 대체한다. 필수 profile은 `CURRENT_REPRODUCTION` 하나이며 [재현 경계와 비교 규칙](REPRODUCTION.md)을 적용한다. 현재의 화면·API·상태·알고리즘·처리 상한·오류·알려진 한계까지 동등성 기준이다. 설계의 오류는 고치되 제품 동작을 임의로 개선하지 않는다.

`OPTIONAL_FUTURE`는 미래 개선안의 보관 표기이며 이번 구현·인수 범위가 아니다. 과거 리뷰·fixture에 남은 `REQUIRED_REBUILD`는 당시의 개선 요구를 뜻한다. 이 표기를 현재 필수 요구로 승격하지 않는다. 같은 입력에 관찰값과 개선값이 있으면 현재 재현은 관찰값만 비교한다.

## 계약의 우선순위

`DECISIONS.md`의 명시적 결정 → 각 기능의 소유 spec → contracts의 필드 타입 → 예시 → 관찰 증거 순서다. 예시의 일부 필드 생략을 허용 스키마로 오해하지 않는다. 모순을 발견하면 evidence/issues.jsonl에 기록하고 소유 spec과 contract를 함께 수정한다. 파일명이나 과거 README만 근거로 모순을 덮지 않는다.

| ID | 고정 결정 | 소유 문서 |
|---|---|---|
| D01 | React 19.3.0 + TypeScript + Vite UI, Express 5.2.1 Node ESM API; 브라우저에 비밀키 없음 | environment |
| D02 | 기준 우선 wizard가 기본, combined legacy API는 호환 범위 | 01 |
| D03 | 원본 물리 읽기 완료와 문맥 해석 완료 별도 상태. 로컬 preview 성공은 E2B 읽기 성공 대체 불가 | 02 |
| D04 | 기준서 자격 판별 후 제외. 유형 계층은 optional; 무유형에 가짜 '기타' 분류 강제 금지 | 02,03 |
| D05 | 사람의 명시적 승인으로 criterionVersion을 freeze. 승인 전 target review 금지 | 01 |
| D06 | 비고 제거가 조건 열/독립 대체 기준을 제거하면 실패 | 03 |
| D07 | 확인된 필수 항목 부재는 fail, 판독 불가·실제 맥락 불확실은 review. 단순 수치라도 source/applicability/condition guard 우선 | 03 |
| D08 | 원문 없는 항목은 빈 source/누락 표시; 시료명·제목에 가짜 highlight 금지 | 03,04 |
| D09 | 실제 lifecycle/activity/handoff 이벤트로만 작업 상태/빛 전송. 대기·일반 장식과 실제 작업 성공을 혼동 금지 | 04 |
| D10 | 맞춤 dashboard는 react-chartjs-2 **5.3.1** + Chart.js **4.5.1**, Chart.js 2.x가 아님. 결과 요약/근거 미니차트의 Recharts는 별도 | 05 |
| D11 | 모델은 허용된 14개 디자인 설정 JSON만 생성하고 고정 renderer가 표시한다. 판정/원본 데이터는 불변이다. baseDesign은 prompt와 fallback에 전달되지만 정상 모델 응답의 미요청 필드 보존을 서버가 완전히 강제하지는 않는다. 현재 정규식 후처리와 최대 3회 plan 호출을 재현한다. 별도 semantic judge·notice DTO는 추가하지 않는다 | 05 |
| D12 | 다운로드 HTML은 런타임 차트 번들 포함, 외부망 없이 렌더; 원본 파일 bytes 미포함 | 05 |
| D13 | 서버 메모리 저장. 재시작 복원·로그인·영구 DB·멀티테넌트·협업·클라우드 배포는 현재 동등성 범위 밖 | 01 |
| D14 | golden/v3 모두 이미 공개된 회귀 자료. 이름만 holdout이라 붙이지 말고 구현 뒤 분리 생성·봉인된 변형만 holdout으로 평가 | 06 |
| D15 | 폰트/OS raster 차이는 허용하되 구조/색/위치/타이밍 기준으로 시각 동등성 판정 | 04 |
| D16 | 반응형·OS reduced-motion·키보드·성능·근거 정합성·자연어 범위 해석은 실제 적용 범위와 한계를 재현한다. 전체 일관성·새 접근성 문구·새 성능 수치를 임의로 강제하지 않는다. 기준선과 다른 동작을 동등성 성공으로 보고하지 않는다 | 각 소유 spec,06 |
| D17 | `/goal`은 공식 지속 목표 기능. Ralph loop는 사용자의 반복 검증 방식 별칭이며 별도 Ralph 플러그인 설치/명령을 의미하지 않음 | GOAL |
| D18 | CURRENT_REPRODUCTION의 정답은 명시된 현재 동작이다. 기존 추가 acceptance는 OPTIONAL_FUTURE로 분리하며 G00..G14에 과거 연결이 남아 있어도 현재 인수 조건으로 사용하지 않는다. gate 증거의 profile 누락·혼합은 실패다 | 아래 정책,06 |

## 원본 관찰과 재구현 요구가 다른 경우

외관·단계·정상 동작과 경계 동작은 기록된 기준선을 재현한다. 현재 구현에 없는 개선을 추가하면 사용자가 요청한 결과와 달라진다. 다음 원칙으로 시험의 정답을 하나로 결정한다.

1. `observed`, `baseline`, `OBSERVED_BASELINE`, `BASELINE_OBSERVATION` 및 원본 helper 출력은 현재 재현의 정답이다. 알려진 결함인지 여부도 함께 기록한다.
2. `additional acceptance`, `REQUIRED_REBUILD`, `OPTIONAL_FUTURE`의 개선 출력·확장 DTO·새 모델 호출·새 상한은 현재 목표에 적용하지 않는다. `NOT_RUN`은 실행 상태이며 필수 범위를 결정하는 표기가 아니다.
3. 동일 사례의 baseline과 개선값을 동시에 필수로 검사하지 않는다. 구현 에이전트가 설계와 기준 데이터를 바꿔 자신의 결과를 정당화하지 않는다.
4. DB-H01/02/03, SOURCE-GROUNDING, TABLE-HIGHLIGHT-REBUILD, PDF-PAGE-INTEGER, ARIA-TERMINAL, RB-COVERAGE/RB-GEOMETRY 및 툴팁/전역 모션 개선은 모두 OPTIONAL_FUTURE다. 현재 서버 DTO에 새 필드를 추가하거나 reader cap을 확대하지 않는다.
5. baseline에 없는 기능을 원하는 경우 별도 사용자 요청과 새 profile·설계 해시·검증 기대값이 필요하다. 현재의 평가 질문을 삭제하거나 미검토를 통과로 바꾸는 방식으로 범위를 정리하지 않는다.

이 정책은 사용자 목표 변경을 명시적으로 반영한 것이다. 기존 질문 수와 원래 문구는 감사 이력에 보존한다. 설계 평가자는 기준선 설명의 정확성과 재현 정답의 명확성을 각각 검사한다. 모든 질문 통과는 선언된 설계 범위의 평가이며 실제 새 제품의 재현 완료를 뜻하지 않는다.

## 재현에서 바꾸면 안 되는 경계

문서/모델 응답을 명령으로 신뢰하지 않는다. 확정 기준과 machine 판정은 사람이 수정해도 audit에 보존한다. 화면 요약, CSV/XLSX/HTML 수치가 같은 확정 결과를 참조해야 한다. 실패/부분완료를 완료로 미화하거나 생성한 fixture 결과를 실제 서비스 결과로 표시하지 않는다.

모델의 의미적 추출은 비결정적이다. 바뀐 모델 이름·공급자 SDK·E2B template/Python/OS에 대한 동일성을 추정하지 말고 새 evidence run으로 검증한다. 공급자 장애 또는 모델 접근 불가가 있으면 실제 통합 gate는 blocked/unrun이며 mock pass로 대체하지 않는다.

## 현재 원본 한계와 재현 정책

- 문서 읽기/전사/모델 context에는 상한이 있다. 전체 임의 문서의 완전 이해를 보장하지 않는다. 각 상한과 coverage 누락을 보이는 것이 계약이다.
- 각 phase가 동일 sandbox를 영구 공유하지 않는다. document context repair는 해당 세션을 재사용하지만 이후 spreadsheet criterion exploration은 별도 세션이고 VLM은 별도 단계다.
- 대시보드 E2B jsdom 검증은 실제 브라우저의 시각 품질 확인이 아니다. DOM success와 screenshot acceptance를 별도 gate로 둔다.
- OS reduced-motion이 전 모션에서 일관되게 적용되지 않는 것은 원본의 제한이다. 토글 OFF와 OS preference의 컴포넌트별 실제 적용 범위를 재현한다.
- 원본의 서버 메모리·loopback·무인증 모델은 개인 로컬 서비스 전제다. 외부 공개 배포 보안 설계 완료로 보지 않는다.

## D19. 과거 독립 재감사와 현재 요청의 차이

- 잘못된원본설명(logprefix,groupparentguard,citedpage검사,100sheetmetadata,normalize순서)은원본기준으로정정했다. formatter/health/sample/mobile/rawmark는빠져있던baseline계약이다.
- [I9.2](ui/interaction-contract.md), [SOURCE-GROUNDING](specs/03-algorithms.md), [RB-COVERAGE/RB-GEOMETRY](specs/08-rebuild-coverage-geometry.md), [ARIA-TERMINAL](ui/auxiliary-contract.md)의 확장은 현재 요청에서 OPTIONAL_FUTURE로 분리했다. 저장 전 취소와 저장 중 폼 닫기 등 baseline 분기는 그대로 구분한다.
- validation도구의deadline·현재packagehash·strictcount·경로junction거부는배포패키지검증기의수정이다. 제품src/server/integrations는변경하지않았다. 검증기selftest통과를새제품인수로옮기지않는다.

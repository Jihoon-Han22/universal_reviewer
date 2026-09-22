# GSPEC 재현 설계 패키지

이 폴더는 **원본 앱 소스를 볼 수 없는 구현 에이전트**를 위한 재현 계약이다. 출발 디렉터리는 `golden/`, `ralph-golden-v3/`, 비공개 `.env`, 그리고 **이 `architecture/` 폴더 전체**다. 두 데이터셋과 키만으로는 제품의 UI·행동·모션을 복원할 수 없다.

목표는 **현재 GSPEC 프로젝트 그대로의 기능·상태·시각·모션 동등성**이다. 필수 profile은 `CURRENT_REPRODUCTION`이며 [재현 계약](REPRODUCTION.md)에 비교 대상과 허용 차이를 고정했다. 현재의 처리 상한·오류·알려진 한계도 재현한다. 미래 개선안 `OPTIONAL_FUTURE`를 자동 구현하지 않는다. LLM 출력, ID, 시각, 번들 해시 또는 구현 코드가 byte-for-byte 같아지는 것은 보장하지 않는다. 이 패키지는 앱 구현물이 아니며 현재 작업에서 새 앱이나 goal을 시작하지 않았다.

## 읽는 순서와 권위

1. [범위·결정·충돌 해결](DECISIONS.md), [현재 재현 계약](REPRODUCTION.md): 현재 동작과 선택적 미래 개선을 구분한다.
2. [실행 환경](environment/README.md), [실제 버전](environment/versions.json): 두 npm lockfile과 초기 scaffold.
3. [전체 모듈 분해](decomposition/README.md), [상태·API](specs/01-state-api.md), [백엔드 파이프라인](specs/02-backend-pipeline.md), [판정 알고리즘](specs/03-algorithms.md).
4. [UI·모션](specs/04-ui-motion.md), [정밀 스타일·벡터 재현](ui/VISUAL-CONTRACT.md), [맞춤 대시보드·내보내기](specs/05-dashboard-exports.md), [로컬 시각 참조](ui/reference/README.md).
5. [검증 계약](specs/06-verification.md), [구현 순서](PLAN.md), [추적표](traceability.csv).
6. [복사할 goal](GOAL.md), [현재 독립 평가](reviews/current-reproduction/README.md), [과거 검토 이력](reviews/README.md), [과거 실행 증거](evidence/README.md).

`contracts/`는 전송·상태 구조, `prompts/`는 모델 지시 계약, `validation/`은 독립 검증 도구다. 문서의 원본 파일명은 조사 provenance일 뿐 원본 읽기가 재현 전제는 아니다. 모든 규범 링크는 패키지 내부에 있어야 한다. `baseline/source-snapshot.json`은 원본 소스의 해시 명세이며 원본 파일은 배포하지 않는다.

[자료구조·알고리즘·비동기 효율](specs/07-data-algorithms-concurrency.md)은 각 단계와 함께 읽는다. Map/Set/WeakMap의 키와 소유권, 캐시 무효화, 복잡도 가정, 동시 실행 상한, 취소·타임아웃·정리, 실제 이벤트와 화면용 모션 큐의 차이를 지정한다. [기계 판독 목록](contracts/efficiency-inventory.json)에는 계약과 원본 출처·시험이 연결되어 있다.

색과 모션을 임의로 새 디자인하지 않는다. 제공된 스타일 카탈로그에서 CSS를 재생성하고 컴포넌트 지도·상태 명세를 연결한다. 참조는 **34개 화면과 같은 상태의 DOM/계산 스타일**, 폰트 자산, keyframe·SVG 값까지 포함한다. 참조 데이터는 합성이며 실제 provider의 판정 결과인 것처럼 제시하지 않는다.

## 빈 디렉터리에서 시작

```powershell
node architecture/tools/verify-package.mjs
node architecture/tools/bootstrap.mjs
npm ci
npm --prefix integrations ci
```

그 다음 Codex에서 [GOAL.md](GOAL.md)의 한 줄 `/goal`을 붙여 넣는다. bootstrap은 설치 메타데이터와 최소 환경만 만든다. 아직 제품 소스가 없으므로 이 직후 build/dev가 성공한다고 주장하지 않는다. 구현은 PLAN의 M0부터 수행한다. `.env`는 덮어쓰지 않는다.

## 완료의 의미

- 필수 기능·API·보안·자료 정합성 검증 통과.
- 공개 데이터에 대한 현재 동작 대조와 실제 Gemini/E2B 통합 결과를 각각 기록. 별도 개선 성능/봉인 holdout는 OPTIONAL_FUTURE와 혼합하지 않음.
- 기준 승인 전 대상 처리 금지, 누락/불확실 구분, 원문 출처·coverage 검증.
- 주요 화면 PNG와 모션 trace, 반응형/모션 OFF/접근성의 현재 동작 대조.
- 검증 명령 exit code 및 입력·코드·결과 해시를 남기고 실패/미실행/skip을 통과로 계산하지 않는다.
- 설계 인수는 모듈별 명확성·정확성의 모든 필수 질문 통과 및 지적 사항 전부 해소. 미래 제품 인수는 별도의 실제 실행 gate를 통과해야 한다. 셀프 점수 또는 screenshot 한 장으로 완료 선언 금지.

현재 패키지 검증과 미래 앱 acceptance는 별개다. 실제 실행 범위는 evidence에 한정되며 전체 golden 모델 정확도나 새 앱 재구현 완료를 뜻하지 않는다.


## 현재 독립 재감사

[현재 프로젝트 재현 감사](reviews/current-reproduction/README.md)가 현재 평가 진입점이다. 기존 main-session, independent-audit와 evidence의 과거 점수는 변경 후 PASS로 재사용하지 않는다. 기존 39모듈/235질문을 보존하며 새 누락은 평가 모집단에 추가한다. [공통 UI 계약](ui/auxiliary-contract.md)과 [샘플 recipe](contracts/sample-recipes.json)는 현재 동작, [08 전수처리·스캔근거 확장](specs/08-rebuild-coverage-geometry.md)은 OPTIONAL_FUTURE다. 새 제품의 실제 검증은 수행 전까지 NOT_RUN이다.

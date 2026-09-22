# 현재 프로젝트 재현 계약

profile: **CURRENT_REPRODUCTION**. 사용자 목표는 2026-09-21 이 폴더에서 관찰한 GSPEC의 재현이다. 새 기능 기획이나 알려진 한계의 자동 개선은 포함하지 않는다. [DECISIONS](DECISIONS.md)가 우선하며, 각 소유 명세의 baseline 설명이 구체적인 정답이다.

## 무엇을 같게 만드는가

| 대상 | 반드시 일치할 값 | 허용 차이 |
|---|---|---|
| 환경 | 두 lockfile, 모듈/자산 역할, 포트·proxy·실행 순서 | 설치 경로, OS 경로 구분자 |
| API | method/path, 상태 코드, DTO 필드·누락/null 의미, 제한·정렬·상태 전이·SSE 의미 | 임의 생성 ID와 실제 시각. 참조 관계·상대 순서·검증 조건은 유지 |
| 결정 알고리즘 | 같은 정규화 입력에 같은 분류·수치·조건·누락·출처 처리 결과 | 내부 함수명·파일 분할·코드 문장 |
| UI | 페이지/단계, 문구, 버튼·disable 조건, 선택/초점/오류/로딩, 카탈로그의 스타일·SVG·타이밍 | OS 글자 raster와 폰트 anti-aliasing. 레이아웃 차이를 여기에 포함하지 않음 |
| 외부 모델 | prompt·schema·모델 선택 기본값·역할·호출/수정 예산·정제·fallback | 실제 모델의 비결정적 자연어 응답과 처리 시간. 고정 응답을 주입한 결정 경로는 같아야 함 |
| 읽기/표시 | 현재 page/sheet/cell/token/byte 상한·partial, 텍스트/스캔 fallback | 공급자 장애 시각·네트워크 지연. 상한 확대로 성공시키면 다른 구현 |
| 출력 | 동일 snapshot의 데이터·집계·컬럼/시트·escaping·대장 보존·오프라인 차트 | ZIP 메타데이터·bundle hash처럼 내용에 영향 없는 생성 차이 |

빈 디렉터리에 제공하는 입력은 `architecture/`, `golden/`, `ralph-golden-v3/`, 비공개 `.env`다. 원본 `src/`, `server/`, `integrations/src/`, `dist/`와 작성 작업의 `.cache/`는 제공하지 않는다. 문서의 원본 경로는 조사 출처다. 구현자가 그 파일을 읽어야만 알 수 있는 계약은 설계 누락이다. 패키지 안의 환경 템플릿·reference·스타일·타입·폰트는 사용 가능한 재현 자산이다.

## 기준선과 정답 선택

1. [원본 manifest](baseline/source-snapshot.json)의 파일 집합과 SHA-256이 현재 기준선을 식별한다. 저자의 이번 변경 전/후 대조는 감사 기록에 남긴다. 비밀키·사용자 원문·캐시는 manifest에 넣지 않는다.
2. 같은 사례에 `observed`/`baseline`과 `desired`/`required`/`rebuild`가 함께 있으면 **observed/baseline만** 현재 제품의 예상 결과로 채택한다. 개선값만 있고 baseline 값이 없다면 자동 선택하지 말고 설계 공백으로 기록한다.
3. [08](specs/08-rebuild-coverage-geometry.md)의 전수 처리·bbox DTO, 별도 dashboard semantic judge, 강화 source admission, 전역 OS 모션 적용 등은 OPTIONAL_FUTURE다. 현재 API/UI를 바꾸는 근거로 사용하지 않는다.
4. 공개 데이터의 이상적인 정답과 현재 제품 동작은 같다고 가정하지 않는다. 원본의 누락/오류/상한과 현재 재현의 차이를 분리 기록한다. 원본보다 정확해졌다는 사실만으로 동등성 PASS를 주지 않는다.
5. 실제 provider 결과에는 완전 일치 보장이 없다. 동일 고정 provider 응답으로 결정 부분을 비교하고, 실제 호출은 구조/흐름/범위와 결과 차이를 별도 기록한다. 합성 실행을 실제 provider 실행으로 표시하지 않는다.

## 구현 순서와 완료 경계

[PLAN](PLAN.md)의 M0..M9와 [06](specs/06-verification.md)의 CURRENT_REPRODUCTION gate를 따른다. **제품 gate에 제출하는 비교 fixture·실행 보고서**에는 profile과 origin을 기록하며 OPTIONAL_FUTURE 보고서를 현재 gate의 통과 증거로 재사용하지 않는다. `validation/fixture-generator.mjs`와 `harness.mjs`의 기존 합성 evaluator 진단 출력은 profile 없는 별도 형식이다. 이 출력은 도구 자체 시험 전용이며 현재 제품 gate 증거로 직접 제출할 수 없다. gate adapter/index에서 요구하는 CURRENT_REPRODUCTION profile·실제 구현 mode·기준 대조·원본 artifact 증거를 생략하는 근거로 사용하지 않는다. 설명된 원본 한계가 발생한 경우 원본과 같은 상태/표시인지 비교한다. 아무 결과나 허용한다는 뜻이 아니다.

정확한 설계가 실제 재현 성공을 보장하지는 않는다. 다음 두 결과를 별도로 보고한다.

- **설계 완료:** 고정한 전체 질문을 다른 에이전트가 문서만으로 명확성 평가하고 원본 대조로 정확성을 평가한다. 전 질문 PASS, 미검토 0, 열린 이슈 0, 현재 입력 해시 일치가 모두 필요하다. 명확성 = PASS/전체×100, 모호성 = 100−명확성이다. 새로운 누락은 질문을 추가하고 분모를 늘린다.
- **제품 완료:** 새 디렉터리 구현에서 필수 gate를 실제 실행하고 기준 화면/동작/데이터와 비교한 증거가 필요하다. 설계 점수 100, 패키지 검사 PASS 또는 원본 앱 테스트 PASS로 대체하지 않는다.

현재 요청의 산출물은 개선된 설계 패키지와 독립 평가다. 새 제품 구현·실제 provider 전수 실행은 수행한 경우에만 완료로 기록한다. [현재 감사](reviews/current-reproduction/README.md)에서 실행 범위와 잔여 이슈를 확인한다.

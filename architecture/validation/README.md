# 검증 도구 실행 계약

상위 규범은 [06-verification.md](../specs/06-verification.md)다. 모든 도구는 패키지 자체의 Node 표준 라이브러리만 사용한다. 예외인 `dashboard-dom-validator.cjs`는 jsdom 26.1.0을 설치한 작업 디렉터리에서 실행한다. 이 디렉터리의 도구는 제품 구현을 포함하지 않으며 어느 도구도 `completeProductAcceptance:true`를 출력하지 않는다.

기본 인수 profile은 **CURRENT_REPRODUCTION**이다. 현재 API/DTO/화면/상태/지원 한계와 일치하는지 검사한다. 기존 fixture의 이상적 의미 정답, v3 exactPass, 전수575쪽 판독, 신규 geometry,3seed holdout는 **OPTIONAL_FUTURE** 진단/추가 인수이며 현재 재현의 의무로 전환하지 않는다. 현재 profile도 미실행을 pass로 만들지 않으며, 현재 한계를 재현했다는 입력별 기준 근거가 필요하다.

## 지금 실행 가능한 검사

프로젝트 루트에서 PowerShell:

```powershell
node --test architecture/validation/selftest.mjs architecture/validation/acceptance-selftest.mjs architecture/validation/package-validator-selftest.mjs
node architecture/validation/evaluate-v3.mjs ralph-golden-v3 --selftest
node architecture/validation/inventory-datasets.mjs . .cache/architecture-verification/dataset-inventory.json
node architecture/tools/verify-package.mjs
node architecture/tools/test-bootstrap.mjs
```

첫 두 명령은 **검증기의 양성/음성 대조 실험**이다. 실제 앱·OCR·모델 정확도나 provider 연결을 측정하지 않는다. `inventory-datasets`는 제공된 두 데이터셋을 읽고 hash만 생성하며 `.env`를 읽지 않는다. `verify-package`는 파일·링크·lock·manifest를 검사한다. `test-bootstrap`은 원본 소스 없는 복사 패키지의 scaffold 생성·가짜 환경파일/데이터 보존·멱등성·충돌 사전검사만 실행한다. 실제 앱 acceptance와 분리한 [실행 증거](../evidence/bootstrap-portability.json)를 사용한다. 마지막 소유자가 모든 패키지 변경을 freeze한 뒤에만 `--refresh-manifest`로 manifest를 갱신하고, 별도 변경 없이 기본 명령을 다시 실행한다. `--report`는 evidence/package-validation.json에 쓰는 선택 옵션이다.

패키지 무결성에는 core/UI 두 module registry의 비어 있지 않은 모집단, module/question ID 중복, dependency 대상, specFiles의 실제 존재와 traceability의 질문별 대응도 포함한다. 질문 수는 현재 registry에서 계산하며 특정 개수에 고정하지 않는다. UI reference manifest에 연결된 입력·PNG·DOM·measurements·font/source manifest의 파일과 hash도 검사한다. 이 검사는 시각 자산의 무결성을 확인하며 screenshot의 의미나 모션 품질을 자동 승인하지 않는다.

## 실제 파일 변형과 adapter

이 절의 `harness`는 OPTIONAL_FUTURE의 합성 정답 비교기다. CURRENT_REPRODUCTION에서는 현재 제품과 다른 요구를 발견하는 진단용으로 쓸 수 있지만 이 비교기의 pass를 필수 인수로 요구하거나 fail을 자동으로 재현 실패로 간주하지 않는다. 현재 재현 비교는 아래 `runGate`의 기준/실제 artifact를 사용한다.

```powershell
node architecture/validation/fixture-generator.mjs .cache/rebuild/public-suite public-regression-v1
node architecture/validation/harness.mjs .cache/rebuild/public-suite ./scripts/acceptance-adapter.mjs .cache/rebuild/public-contract offline
node architecture/validation/harness.mjs .cache/rebuild/public-suite ./scripts/acceptance-adapter.mjs .cache/rebuild/live-contract live
```

`scripts/acceptance-adapter.mjs`는 **새 앱 구현자가 작성해야 하는 연결 모듈**이며 패키지에 완성된 앱 adapter가 있다는 뜻이 아니다. 명령의 위치 인자는 표시한 순서 그대로다. `live` 문자열은 기록용 주장일 뿐 실제 API 호출 인증이 아니다. harness는 fresh child process를 쓰지만 filesystem/network 보안 sandbox가 아니다. 같은 사용자 권한이면 oracle에 접근할 수 있으므로 holdout은 별도 평가자가 입력만 공개하는 격리 경계에서 실행해야 한다.

adapter는 다음 export를 구현한다.

```js
export async function runContract(request, { inputDirectory, runId, signal }) {
  // request: {schemaVersion:'1.0', documents:[{file,role,sha256}], criteriaText}
  // inputDirectory 안의 문서만 실제 upload/analysis/HITL confirm/review 흐름으로 처리.
  // signal abort 시 자신이 소유한 작업 취소. 출력은 adapter-result.schema.json 계약.
  throw Object.assign(new Error(), { code: 'NOT_IMPLEMENTED' });
}
export async function runGate(gateId, { projectRoot, inputDirectory, runId, signal, acceptanceProfile }) {
  // 06의 해당 gate 전체를 실제 구현에 실행. inputDirectory===projectRoot.
  // {gateId,acceptanceProfile,runId,state,executionKind,inputs,observations,artifacts,limitations} 반환.
  // inputs/artifacts: projectRoot 상대 경로와 실제 파일 SHA-256.
  // observations.tests: {selected,passed,failed,skipped}; selected>0, skips=0.
  throw Object.assign(new Error(), { code: 'NOT_IMPLEMENTED' });
}
```

`runContract`는 원문을 실측한 상태·값·비교식·condition·무유형 상태·출처·coverage를 [adapter-result.schema.json](adapter-result.schema.json)으로 투영한다. 비교기는 빈 expected/document 목록, 틀린 runId, 누락/중복 항목, 상태/수치/단위 오류, 비고 조건 혼입, 가짜 유형, source 좌표/quote 불일치, 부재 highlight, 누락 coverage 및 입력 hash 변경을 거부한다. fixture의 빈 결과셀은 구조 위치 evidence로 유지할 수 있지만 highlight는 비어 있어야 한다. 일반 제품의 완전히 없는 항목은 빈 source여야 하며 이 fixture 투영을 적용하지 않는다.

oracle.json/manifest.json은 평가자 전용이다. request에는 정답이 없다. 비교기의 `passed:true`는 synthetic 출력 일치만 의미한다. 의도적으로 정답을 복사하는 selftest adapter도 이 비교는 통과한다. 따라서 report는 `adapterExecuted:true`, `implementationExecuted:false`, `implementationExecutionVerified:false`, `completeProductAcceptance:false`로 기록한다. 앱 실행·provider 호출 진위는 별도 로그와 독립 관찰로 검증한다. timeout은 adapter child 생성부터의 전체 실행 한도다. deadline 뒤 반환된 정상 결과도 실패한다. 추가10초는 협조적 abort/cleanup을 기다린 뒤 child를 강제 종료하는 여유이며 성공 허용 시간이 아니다. signal이 abort된 뒤 worker가 결과를 반환해도 실패한다. harness의 프로그램 API timeoutMs는 기본900000ms, 최소1ms, 최대21600000ms의 안전 정수만 허용한다. Node timer overflow를 일으키는 큰 값·소수·문자열은 child 실행 전 거부한다. CLI에는 별도 timeout 인자가 없다. 표준 출력은 최대8MiB, stderr는 저장하지 않으며 provider exception을 그대로 직렬화하지 않는다. 불필요한 로그와 비밀을 adapter 출력에 넣지 않는다.

## gate 실행과 최종 증거 검사

```powershell
node architecture/validation/run-gate.mjs G02 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates
node architecture/validation/run-gate.mjs G07 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates 21600000
node architecture/validation/acceptance.mjs snapshot . .cache/rebuild/implementation-manifest.json
node architecture/validation/acceptance.mjs check . .cache/rebuild/evidence-index.json
```

`run-gate`는 `G00`..`G14`를 지원한다. 마지막 timeout은 ms, 기본3600000, 최대21600000이다. 파일에 남는 report 이름은 `G02.json`처럼 gate ID이며 재실행 전 이전 run의 출력 디렉터리를 별도로 보관한다. unknown gate/빈 테스트/skip/실행 중 구현 또는 adapter 수정은 실패다. provider 로그를 자동 수집하거나 진위를 인증하지 않는다. gate의 테스트 코드와 adapter도 구현 freeze 대상이며 실행 중 바꾸지 않는다. 실행 전후 현재 architecture의 기본 verify-package 검사(refresh 없음)를 수행하고 packageManifestSha256를 report에 저장한다. 패키지 변경/무결성 실패도 실패다.

정확한 위치 인자는 `GATE_ID ADAPTER_MJS PROJECT_ROOT OUTPUT_DIRECTORY [TIMEOUT_MS] [CURRENT_REPRODUCTION|OPTIONAL_FUTURE]`다. timeout 뒤 profile을 생략하면 CURRENT_REPRODUCTION이다. OPTIONAL_FUTURE는 `... .cache/rebuild/future-gates 21600000 OPTIONAL_FUTURE`처럼 명시한다. adapter context의 acceptanceProfile을 반환값에 그대로 포함해야 하며 누락·불일치하면 runner가 실패한다. report와 evidence index도 profile을 기록하므로 서로 다른 profile의 결과를 섞을 수 없다.

CURRENT_REPRODUCTION G01..G13의 observations에는 `reproduction:{comparedCases,matchedCases,unexpectedDifferences,baselineLimitationsPreserved,baselineReferences}`가 필요하다. comparedCases는 양의 안전 정수, matchedCases는 같은 수, unexpectedDifferences=0, baselineLimitationsPreserved=true, baselineReferences는1개 이상의 `{path,sha256}`다. 기준 파일도 다른 증거와 동일하게 실제 hash·프로젝트 내부 일반파일을 검사한다. 상세 artifact에는 사례별 입력·초기상태·기대/실제·기준spec/관측·불일치를 기록한다. 단순히 현재 제품이 불완전하다고 선언하여 임의 오류를 일치 처리하지 않는다. runner는 adapter dispatch/nonce/profile/테스트 수/코드 변경을 검사하며, 전체 baseline 참조·provider·profile 관측 조건은 최종 checker에서 검사한다.

CURRENT_REPRODUCTION의 G14는 `observations.openReproductionIssues:0`도 필수다. 모든 심각도의 미해결 재현 이슈가0개여야 하며 `openCriticalHigh:0`만으로는 충분하지 않다. 다른 독립 검토 선언과 함께 실제 이슈 목록/종료 근거를 artifact에 기록한다.

`snapshot`은 src/server/integrations/scripts/public와 root 설치·빌드 설정의 현재 hash inventory를 만든다. node_modules/.git/.cache/dist는 제외한다. 새 파일·삭제·수정도 digest를 바꾼다. 이 scope 밖에서 실행되는 프로젝트 코드가 있으면 위 디렉터리로 포함하거나 검증 계약과 inventory scope를 함께 확장한 후 독립 검토한다. `.env`는 hash하거나 출력하지 않는다. `check`의 index는 다음 구조다. SHA 문자열은 해당 파일 bytes의 SHA-256이며 예시를 그대로 사용할 수 없다.

```json
{
  "schemaVersion":"1.0",
  "acceptanceProfile":"CURRENT_REPRODUCTION",
  "implementationManifest":{"path":".cache/rebuild/implementation-manifest.json","sha256":"64-lowercase-hex"},
  "packageManifest":{"path":"architecture/package-manifest.json","sha256":"64-lowercase-hex"},
  "gateReports":[{"path":".cache/rebuild/gates/G00.json","sha256":"64-lowercase-hex"}]
}
```

실제 index에는 같은 acceptanceProfile의 G00..G14 각각 정확히1개가 있어야 한다. profile 누락·unknown·혼합은 실패한다. 모든 evidence 참조는 projectRoot 내부 상대 경로의 일반 파일이며 중간 디렉터리부터 최종 파일까지 symlink/junction/특수파일을 거부한다. report의 전체 구조는 [evidence.schema.json](evidence.schema.json), 추가 실행 종류/관측 조건은 [acceptance.mjs](acceptance.mjs)의 ACCEPTANCE_PROFILES와 검사 코드가 고정한다. checker는 schema 파일만 읽었다는 이유로 통과하지 않는다. index.packageManifest.path는 정확히 architecture/package-manifest.json이어야 하며 현재 전체 패키지를 verify-package로 다시 확인한다. 모든 gate의 packageManifestSha256가 현재 manifest hash와 일치해야 한다. 설계를 수정하고 manifest를 갱신하면 이전 gate를 새 설계의 통과 증거로 재사용할 수 없다. CURRENT_REPRODUCTION의 G03/G09와 모든 live_implementation report에는 providerCalls.gemini/e2b가 양의 안전 정수여야 한다. 현재 G06/G07/G08은 실제 구현에 대한 offline replay 비교도 허용한다. OPTIONAL_FUTURE에서는 G03/G06/G07/G08/G09 live 호출과 G08 heldoutSeedCount≥3 및 독립 봉인 조건이 필수다. 문자열·boolean·소수 counts는 거부한다. 현재 구현 digest, report/input/artifact/baseline bytes, 필수 gate, exit0, 양수 테스트 수/모두 pass/skip0, 선택profile 관측 및 독립 검토 선언을 확인한다. 파일 내용과 서명되지 않은 선언은 조작 가능하다. 따라서 exit0의 뜻은 `ready_for_independent_verification`이며 제품 완료 승인이 아니다. 독립 평가자가 실제 artifact와 실행을 대조해야 한다.

## v3 및 dashboard 전용 도구

```powershell
node architecture/validation/evaluate-v3.mjs ralph-golden-v3 .cache/rebuild/v3/prediction.json
```

prediction은 `fields`와 `writer_cells` 배열이다. fields의 key는 case_id+field_id, writer는 case_id+sheet+cell. 검사하는 field 속성은 value/unit/qualifier, operator/limit/criterion_unit, verdict, criterion_source의 전체 객체, report_pages의 중복 제거 집합이다. 숫자는 절대1e-10 또는 상대1e-8 중 큰 tolerance, 다른 값은 strict deep equality다. 정답의 예비 설명/이름/원본 raw_value는 채점하지 않는다. 35fields/105writer cells의 정확 일치가 필요하지만 bounding box, OCR, 앱 실행, 파일 보존은 별도 gate다. truth=prediction 실행은 evaluator selftest로만 취급한다.

위 exactPass는 OPTIONAL_FUTURE 의미 정확도 조건이다. CURRENT_REPRODUCTION에서는 원본의30쪽cap/가림/불확실·현재 writer 동작의 대조와 진단 결과를 따로 기록하며 exactPass를 강제하지 않는다. dashboard DOM 도구도 현재 소유 spec의 관찰 동작과 충돌하는 선택 개선 assertion은 현재 인수 gate에 자동 포함하지 않는다.

`dashboard-dom-validator.cjs`는 cwd에서 `dashboard.html`, `data.json`, `plan.json`을 읽고 `validation.json`을 쓴다. 새 앱의 dashboard 테스트가 세 파일과 jsdom26.1.0을 준비한 디렉터리에서 `node <absolute-path-to-architecture>/validation/dashboard-dom-validator.cjs`를 실행한다. DOM/CSP/interaction/data 검사에서 차트는 stub이다. `visualBrowser:false`이며 다운로드 실제 브라우저·오프라인 chart rendering 검증을 대체하지 않는다.

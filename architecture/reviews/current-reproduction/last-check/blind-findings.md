# 마지막 독립 반증 검토

**최종 상태(보완 후): BF-01/BF-02 모두 문서 명확성 관점에서 해결. 추가로 요청받은 Reader.text 1,500,000자 equality 회귀도 현재 문서에서 단일 결과로 결정된다. 이 한정 재검토의 열린 지적은 0건이다. 아래 최초 발견 기록은 변경하지 않고, 마지막 절에 독립 재검토와 한계를 분리했다.**

- 검토일: 2026-09-21. 대상 profile: `CURRENT_REPRODUCTION`.
- 방법: 기존 질문의 PASS를 반복하지 않고, 허용 문서만으로 입력이 같은 두 구현 중 하나를 선택할 수 있는지 검토했다.
- 읽은 범위: `architecture/{README,DECISIONS,REPRODUCTION}.md`, `specs/02,03,04,05,06,07`의 관련 절, `contracts/internal-pipeline.ts`와 관련 타입/fixture, `prompts/`의 조립 계약·catalog, `ui/`의 시각·상호작용·상세 계약·component map·fixture, `environment/README.md`, `validation/README.md`, `decomposition/`의 모듈 질문·UI 트리. 모든 허용 파일을 전수 정독한 검토는 아니다.
- 제외: 원본 `src/`, `server/`, `integrations/`, `.env`, `architecture/reviews/`, 과거 점수·평가·작성 캐시를 읽지 않았다. 설계 문서는 수정하지 않았다.
- 결론: 문서만으로 결정되지 않는 구체적인 두 지점을 발견했다. 이는 원본 구현의 오류 판정이 아니라 **현재 동작을 선택하기 위한 설계 명확성 공백**이다. 원본을 보지 않았으므로 어느 구현이 실제 baseline인지는 판정하지 않는다.

## BF-01 — profileSource의 직렬화 계약이 문자 수 기반 분기를 고정하지 못함

**문서 위치**

- `architecture/specs/02-backend-pipeline.md:157-179`: `profileSource`의 header/record 예시와 1,200,000자 cap·150,000자 character slicing.
- `architecture/prompts/pipeline-prompts.md:32-33`: source/retainedSource를 위 직렬화 문자열로 binding.
- `architecture/contracts/internal-pipeline.ts:34-110`: ReaderProfile의 필드 형태는 제공하지만 profileSource 문자열 encoder는 제공하지 않음.
- `architecture/REPRODUCTION.md`: 외부 모델 prompt·호출 예산·고정 응답을 주입한 결정 경로가 같아야 함.

**빠진 결정**

JSON 자리의 compact/pretty 여부, property 순서, optional metadata·formula/comment 등 전체 retained 필드를 어떤 문자열 순서/escaping/구분자로 넣는지 완결된 규범 encoder 또는 입력→정확한 문자열 fixture가 없다. 설명된 header와 모든 값을 유지하는 두 encoder도 문자 수가 달라진다. 이는 단순 코드 스타일 차이가 아니라 API의 sourceChars/sourceTruncated/contextSegmentsTotal과 provider 호출 수에 영향을 준다.

**가능한 구현 두 개**

1. A: 표시된 `INVENTORY`, `READ_COVERAGE`, `SHEET_METADATA`의 JSON을 `JSON.stringify(value)`로 넣고, 행 구분은 예시대로 유지한다.
2. B: 같은 위치에 동일 JSON 값을 `JSON.stringify(value,null,2)`로 넣고, 나머지 header/record·값·행 순서는 A와 같게 한다.

현재 본문의 `<JSON>`은 어느 쪽을 채택할지 명시하지 않는다. `JSON.stringify(profile.inventory)`인 별도의 prompt 앞부분과 `profileSource` 본문 encoder는 다른 위치다.

**구체적 입력 두 개와 다른 결과**

공통: 정상 XLSX를 읽은 profile. visible sheet `S`, 단일 A열, merged/hidden 없음. inventory에 `definedNames` 500개(`name=N001..N500`, reference=`S!A1`..`S!Z1` 반복)가 있다. 이는 문서가 정한 최대500개 이내다. reader coverage는 complete=true이며 모든 셀을 읽었다. 개별 셀은 Excel의 32,767자보다 짧다.

| 입력 | A 결과 | B 결과 |
|---|---|---|
| A1:A4 각각 `'x'.repeat(30500)`; textChars=122000 | sourceChars=140039, contextSegmentsTotal=1, sourceTruncated=false | sourceChars=153116, contextSegmentsTotal=2, sourceTruncated=false |
| A1:A40 각각 `'x'.repeat(29300)`; textChars=1172000 | sourceChars=1190969, contextSegmentsTotal=8, sourceTruncated=false | sourceChars=1204046, contextSegmentsTotal=8, sourceTruncated=true |

첫 입력은 최초 구조 요청과 검증 요청 수가 달라진다. 둘째 입력은 동일한 유효 모델 응답을 replay해도 B에서는 retained cap 및 complete gate가 달라진다. 1,500,000자 reader cap 확대나 새 기능 제안이 아니다.

**검증**: 같은 폴더의 `serialization-counterexample.mjs`를 Node로 실행해 위 길이를 확인했다. 이 스크립트는 두 해석의 차이를 입증하며, 원본 encoder라고 주장하지 않는다. 원본 파일·provider·테스트 결과를 읽지 않는다.

**필요한 최소 보완**: 원본 기준의 profileSource 문자열 encoder를 규범 pseudocode/정적 구현 또는 exact input/output fixture로 고정하고, 150,000 및 1,200,000 경계의 예상 sourceChars·구간 수·잘림을 포함한다. compact 방식을 무조건 더 낫다고 선택하자는 뜻이 아니다.

## BF-02 — DocumentAnalysis 구조 지도에서 inventory와 structure의 병합 순서가 정해지지 않음

**문서 위치**

- `architecture/ui/detail-controls.md:255`: inventory의 허용 shape 및 `sheet→page→document 키 순으로 그룹`이라는 요약.
- `architecture/ui/detail-controls.md:259,273`: 그룹 카드의 내용 및 group index에 따른 진입 지연.
- `architecture/ui/interaction-contract.md:154-172`: 상태·quality·arc·빈 그룹 문구는 구체적이지만 inventory/structure 병합 순서 없음.
- `architecture/ui/component-style-map.json`: DocumentAnalysis component(`sourcePath` entry 약31370행)의 `groups` 반복, `group.key`와 index-dependent transition; 전체 grouping helper 본문/결정 규칙은 없음. `inventoryFacts`/`inventoryParts`도 helper 호출 이름만 제공한다.
- `architecture/ui/interaction-fixtures.json`: ANALYSIS 계열은 숨김/회전/coverage/group count를 다루지만 inventory와 structure 순서가 충돌하는 expected group order를 지정하지 않음.

**가능한 구현 두 개**

1. A: inventory 순서로 Map에 모든 sheet/page 그룹을 먼저 생성한 후 structure를 해당 그룹에 append. inventory에만 있는 그룹도 보존.
2. B: structure의 최초 encounter 순서로 Map에 그룹을 생성한 후 inventory metadata를 merge하고 아직 없는 inventory 그룹을 뒤에 append.

두 구현 모두 sheet→page→document를 그룹 key 선택 우선순위로 사용하고, 모든 inventory/structure 및 빈 그룹의 `구조 미확인`을 보존할 수 있다. 문서의 다른 명시 규칙을 위반하지 않으면서 화면 순서가 달라진다.

**구체적 입력 두 개**

```json
{
  "case": "opposite-order",
  "document": {"id":"d1","kind":"xlsx","role":"criteria"},
  "analysis": {
    "inventory": {"sheets":[{"name":"B","state":"visible","maxRow":1,"maxColumn":1},{"name":"A","state":"visible","maxRow":1,"maxColumn":1}]},
    "structure": [
      {"name":"A 내용","kind":"text","sheet":"A","range":"A1:A1","headers":[],"description":"원문 A","orientation":"unknown","uncertain":false},
      {"name":"B 내용","kind":"text","sheet":"B","range":"A1:A1","headers":[],"description":"원문 B","orientation":"unknown","uncertain":false}
    ]
  }
}
```

같은 나머지 DTO/coverage를 갖추면 A의 카드 순서는 `[B,A]`, B의 순서는 `[A,B]`다. 모델의 structure 순서가 workbook 순서와 같아야 한다는 validator 계약은 없으며, 양쪽 모두 원문 위치를 보존한다.

```json
{
  "case": "empty-inventory-first",
  "document": {"id":"d2","kind":"xlsx","role":"criteria"},
  "analysis": {
    "inventory": {"sheets":[{"name":"빈표","state":"visible","maxRow":1,"maxColumn":1},{"name":"검사","state":"visible","maxRow":1,"maxColumn":1}]},
    "structure": [
      {"name":"검사 내용","kind":"text","sheet":"검사","range":"A1:A1","headers":[],"description":"강도","orientation":"unknown","uncertain":false}
    ]
  }
}
```

빈표에 populated cell/image가 없는 경우이다. A의 순서는 `[빈표,검사]`, B의 순서는 `[검사,빈표]`. 두 구현 모두 빈표에 `구조 미확인`을 표시한다. 단순 빈 그룹을 누락하는 잘못된 구현을 반례로 세우지 않았다.

**영향**: 카드 위치·DOM 순서·Tab 순서·index에 따른 80ms 진입 delay가 달라진다. 고정 CSS와 node map, 단일 상태 PNG만으로 일반 입력의 이 순서를 선택할 수 없다. 더 좋은 UX를 요구하는 것이 아니라 현재 카드 순서를 정하자는 것이다.

**필요한 최소 보완**: 원본의 inventory normalization → 그룹 최초 삽입 → structure append → 최종 정렬 여부를 명시하고 위 두 입력의 group key/name 배열을 추가한다. inventory의 여러 alias가 동시에 있을 때 선택 순서와 facts/parts text 규칙도 같은 helper 계약으로 묶을 수 있지만, 이번 확정 지적은 위 두 순서 반례로 제한한다.

## 새 질문 제안

기존 질문을 삭제하거나 기존 PASS를 재사용하지 않는다. 현재 registry와 ID 충돌 여부를 확인한 뒤 추가할 질문의 제안이다.

- `CORE-04-C06` 제안: 같은 ReaderProfile에서 profileSource의 정확한 문자열/길이/순서/escaping을 결정하고 150k·1.2M 경계의 provider 요청 수와 public coverage를 고정할 수 있는가?
- `UI-06-C07` 제안: inventory 순서와 structure 순서가 다르고 inventory에만 존재하는 빈 sheet/page가 있을 때 최종 그룹 배열·카드 순서·진입 지연을 문서만으로 결정할 수 있는가?

## 검토 한계와 판정하지 않은 항목

- 240질문의 재평가나 점수 계산을 하지 않았다. 이 발견을 기존 평가에 어떻게 반영할지는 전체 소유자가 결정해야 한다.
- provider의 비결정적 응답 자체, live 모델 가용성, 새 기능/접근성/성능 강화는 이슈로 세지 않았다. fake client 주입 port, adapter role/schema/token/오류, prompt catalog의 원문 제공은 확인했으며 존재하지 않는다고 주장하지 않는다.
- sourceLocator/원본 경로가 있다는 사실만으로 외부 의존 이슈를 세지 않았다. 대부분 provenance로 명시되어 있었다. 두 발견은 문서의 실제 값 선택 공백으로 제한했다.
- 다른 모든 입력/분기에서 공백이 없다는 보증은 아니다. 후속 보완은 위 두 유한한 반례를 원본 기준으로 닫으면 된다.

## 보완 후 독립 재검토 — 기존 3건 한정

재개 뒤 현재 보완 문서를 다시 읽고 아래 검증을 수행했다. 원본 코드·원본 helper·다른 작성자의 probe를 읽거나 import하지 않았다. 기존 리뷰/점수도 보지 않았다. 이 절의 결과는 문서에서 독립 구현을 결정할 수 있는지에 대한 검증이며, 원본 정확성 대조는 별도 평가자의 책임이다.

### BF-01 해결

`02-backend-pipeline.md §2.4.1`이 compact JSON, key/배열 순서, undefined/null, field 생략, formula cache sentinel, comments/format/hyperlink 순서, page/table/block/sections/CSV/image/warnings 순서, 줄바꿈과 종료 LF를 명시한다. `§2.4.2`는 UTF-16 code unit 기준의 `>`/slice/ceil을 명시한다. 따라서 최초의 A/B 중 pretty-print 구현 B는 이제 문서에 명백히 위배된다.

이 문서만 보고 작성한 `recheck-source-doc-only.mjs`에서 `source-serialization-cases.json`을 대조했다.

- 정확한 source 문자열 4개: 4/4 일치. 한글·false/0·빈 cache·extra records·CSV를 포함하며 UTF-8 SHA-256와 JS length도 일치했다.
- 149,999/150,000/150,001 및 1,199,999/1,200,000/1,200,001자 경계 6개: 6/6 일치.
- 최초 반례 2개: sourceChars=140039/chunks=1/truncated=false 및 sourceChars=1190969/chunks=8/truncated=false로 단일 결과를 얻었다.

**판정: BF-01 CLOSED — 문서만으로 기존 반례의 문자열과 경계 결과가 결정된다.**

### BF-02 해결

`detail-controls.md D3.2.1`이 inventory alias/직접 배열 해석, inventory-first Map 삽입, 중복 key 덮어쓰기와 첫 위치 보존, structure-only tail append, wrapper 처리 및 최종 추가 정렬 없음을 명시한다.

이 문서만 보고 작성한 `recheck-ui-doc-only.mjs`에서 신규 `document-analysis-structure-cases.json` 8개를 모두 일치시켰다. direct array, duplicate overwrite, 반대 순서, pages fallback, wrapper와 transcription 유무, alias/nullish 규칙을 포함한다. 최초 반례 2개의 최종 그룹은 각각 `[sheet:B,sheet:A]`, `[sheet:빈표,sheet:검사]`로 결정된다. 이 순서로 group index와 80ms 간격 지연도 결정할 수 있다.

**판정: BF-02 CLOSED — 문서만으로 기존 반례의 그룹 목록과 순서가 결정된다.**

### 추가 요청된 기존 Reader.text equality 회귀

이는 이 에이전트의 최초 발견 2건에 새로 덧붙인 감사 확장이 아니라, 소유자가 요청한 기존 세 번째 지적의 문서 명확성 회귀다. `02 §2.3`은 `len(text) > 남은 예산`에서만 partial을 만든다고 정확히 명시하며 TXT ASCII 1,499,999/1,500,000/1,500,001자의 결과를 따로 제공한다.

위 source 재검토 스크립트는 이 규칙으로 `readerTextBoundaryCases` 3개를 독립 계산해 모두 일치시켰다. 정확히 1,500,000자는 ready/complete=true/truncated=false이고, 한 자 초과만 partial/false/true이다. Python code point 수와 JS UTF-16 수를 구분하며 이 규칙을 모든 형식의 cap에 일반화하지 않는다는 제한도 명확하다.

**판정: 해당 equality 문서 공백은 해결. 실제 Python Reader나 E2B를 실행했다는 판정은 아니다.**

### 재검토 명령과 동결 내용

두 명령 exit code는 0이다.

```text
node .cache/architecture-final-challenge/recheck-source-doc-only.mjs
node .cache/architecture-final-challenge/recheck-ui-doc-only.mjs
```

검토 시 파일 SHA-256:

| 파일 | SHA-256 |
|---|---|
| architecture/specs/02-backend-pipeline.md | dea7190de8f0fa38fb7fe0572ad21a39e929d505f6049007131a28b60a839111 |
| architecture/contracts/source-serialization-cases.json | 671e66ab04aeb4ea504d7d4e31bda59fdda4aa827d2f5de501296ff3727d5399 |
| architecture/ui/detail-controls.md | 7bcedab9dfc8d342ec21e03a9c0268ec40801b6dda68edfb4e3af46f8288d0b1 |
| architecture/ui/document-analysis-structure-cases.json | 7936de19c1f4889fc4b26f8c4b02740f0198fff1ad513fa01cc93e4d2108e7c5 |

현재 한정 재검토에서 열린 지적은 0건이며 새로운 전체 감사를 확장하지 않았다. 실제 provider 실행·브라우저 렌더·새 제품 재구현 완료·전체 설계의 무누락을 주장하지 않는다. 원래의 반증 스크립트는 보완 전 모호성을 보여 주는 이력으로 남기며, 그 두 후보 구현을 현재 규범 구현으로 사용하지 않는다.

## 최종 문장 교정의 후속 delta 검토

`architecture/specs/02-backend-pipeline.md §2.4.2`의 header 예산 문장만 추가로 확인했다. 현재 문장은 `profileSource`의 `SANDBOX_READER`, `INVENTORY`, `READ_COVERAGE` 최초 세 행은 `source.length`에 **포함**하고, 그 문자열 밖에서 모델 요청에 덧붙이는 DOCUMENT 메타데이터와 SOURCE SEGMENT 안내만 **제외**한다고 구분한다.

이 문장은 이미 독립 작성한 `recheck-source-doc-only.mjs`의 산정과 일치한다. 그 스크립트는 최초 세 행을 emitted source에 넣은 뒤 전체 문자열을 측정하며, 별도의 모델 요청 header는 만들거나 더하지 않았다. 따라서 이전에 통과한 정확 문자열·길이·경계 결과를 바꾸는 교정이 아니고, 기존 문장의 header 용어 혼동을 해소한다. 이번 delta 검토에서는 원본을 읽지 않았고 규범 문서를 수정하지 않았으며 테스트를 재실행했다고 주장하지 않는다.

**후속 판정: header 예산의 포함/제외는 명확하며 기존 CLOSED 판정을 유지한다.** 이전 재검토 해시 `dea7190de8f0fa38fb7fe0572ad21a39e929d505f6049007131a28b60a839111`는 위 이력에 보존한다. 이번 문장 검토 시 현재 02 문서의 SHA-256은 **`43737c0b671f8626a92c7d3b096aed3101d181d5f213de70c0c483a1a5f65b2b`**다. 이 후속 확인은 명시된 문장 delta에 한정하며 새로운 전체 감사가 아니다.

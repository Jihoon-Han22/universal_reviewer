# golden — 시험성적서 자동검토기 골든 테스트 세트

생성 스크립트 3개와 규칙 표현식 케이스 1개로 구성된다. 모든 산출물(.xlsx/.pdf)에는
같은 stem 의 `.json` ground truth 가 나란히 놓인다. 스크립트는 멱등이며 항상 덮어쓴다.

```bash
uv run python golden/gen_criteria.py    # golden/criteria/C01..C20.xlsx (+ .json)
uv run python golden/gen_ledger.py      # golden/ledger/L01..L06.xlsx   (+ .json)
uv run python golden/gen_certs.py       # golden/certs/P01..P13.pdf     (+ .png, .json)
```

| 산출물 | 개수 |
|---|---|
| `criteria/` | 20 xlsx + 20 json |
| `ledger/` | 6 xlsx + 6 json |
| `certs/` | 13 pdf + 13 png + 13 json |
| `rules.json` | 기준 표현식 20 케이스 |

## 1. criteria — 기준서 (C01 ~ C20)

ground truth 스키마 (`expect: "adapter"`):

```json
{"id":"C02","desc":"...","expect":"adapter","sheet":"품질기준",
 "table":{"header_row":8,"data_from":9},
 "columns":{"item":"B","op_value":"E","unit":"D","note":"F"},
 "criteria":[{"item":"산화마그네슘","op":">=","value":2.0,"unit":"%"}]}
```

`expect: "flag"` 인 경우 `table`/`columns`/`criteria` 없이 `flag_reason` 을 갖는다.
`op` 허용값: `>=`, `<=`, `>`, `<`, `==`, `between`(value=[lo,hi]), `qualitative`(value=null).

| id | 무엇이 이상한가 | expect |
|---|---|---|
| C01 | A1에서 시작하는 깨끗한 표, 헤더 1행 | adapter |
| C02 | 로고 셀·병합 제목·안내문·빈행 뒤 헤더 8행 (표는 B~F열) | adapter |
| C03 | 헤더 12행 + 표가 C열에서 시작 (A,B열 비어있음) | adapter |
| C04 | 2행 병합 헤더 (7행 그룹헤더가 기준/단위 위로 병합, 8행 소헤더) | adapter |
| C05 | 3시트: `표지`(유사 컬럼의 미끼표) / `품질기준`(실제) / `변경이력` | adapter (sheet=품질기준) |
| C06 | 구역 캡션 `[화학성분]`/`[물리성능]` + 사이 빈행, 헤더는 5행 하나 | adapter |
| C07 | 데이터 중간(소계)·끝(합계) 집계 행 — 중지규칙에서 제외되어야 함 | adapter |
| C08 | 데이터 3행 아래 모서리 메모 셀 + 데이터 셀(B5)에 실제 openpyxl 코멘트 | adapter |
| C09 | 단위가 3곳에 흩어짐: 단위 열 / 값 안(`0.02% 이하`) / 헤더(`기준(%)`) | adapter |
| C10 | rules.json 의 20가지 기준 표현형이 모두 섞임 | adapter |
| C11 | A1에 로고 PNG 삽입 + 아래에 정상 표 | adapter |
| C12 | 기준이 삽입 이미지 안에만 존재, 셀은 비어있음 | flag |
| C13 | 아파트 동/호 그리드(층 15..1 × 101~104호) 배치표 | flag |
| C14 | 비고 열에만 수식(`=ROUND(...)`), 기준 값은 리터럴 유지 | adapter |
| C15 | 데이터 중간 2행 숨김(4,6행) + 시험방법 D열 숨김 | adapter |
| C16 | 동일 항목명(산화마그네슘)이 다른 한계값으로 2회 등장 (`uncertain` 포함) | adapter |
| C17 | 헤더 라벨에 공백·zero-width(U+200B) 문자 | adapter |
| C18 | 시트 폭 40열, 기준표는 AA~AE 열 | adapter |
| C19 | 20개 기준행 → 빈행 → 무관한 로그 4980행 | adapter |
| C20 | `품질기준` 시트는 코드만, 항목명은 `코드표` 시트 (`uncertain` 포함) | adapter |

## 2. ledger — 검토대장 (L01 ~ L06)

12개 데이터 행 중 12행의 성적서번호가 키 `2026-0891` 이며, 해당 행의 판정/비고 칸은
비어 있다(= 자동검토기가 채워야 할 `target_cells`).

```json
{"id":"L01","desc":"기본","expect":"ok","sheet":"검토대장","header_row":1,
 "key_column":"C","key_header":"성적서번호","result_column":"F","note_column":"G",
 "key":"2026-0891","target_cells":["F12","G12"]}
```

| id | 무엇이 이상한가 | expect |
|---|---|---|
| L01 | 기본 (키 C열, 판정 F열, 비고 G열) | ok |
| L02 | 키 E열, 판정 H열, 비고 I열 | ok |
| L03 | 키 `2026-0891` 이 5행·12행 두 곳에 존재 | flag (`duplicate key`) |
| L04 | 데이터 아래 `=SUM()` 합계 행 — 건드리면 안 됨 | ok |
| L05 | 데이터와 합계 사이에 메모 행 `← 09.03 확인 (박○○)` | ok |
| L06 | `ws.protection.sheet = True` (시트 보호) | flag (`protected sheet`) |

## 3. certs — 시험성적서 (P01 ~ P13)

reportlab 로 만든 **디지털 PDF** 이며, pypdfium2 로 1페이지를 scale 2.0 래스터화한
`P*.png` 가 함께 생성된다(스캔 경로 테스트용). 한글은 reportlab 동봉 CID 폰트
`HYSMyeongJo-Medium` 을 사용한다(실패 시 `HYGothic-Medium` 폴백).

```json
{"id":"P01","desc":"기본 3열 표","cert_no":"2026-0891",
 "fields":[{"item":"산화마그네슘","value":"2.8","unit":"%"}],
 "corrupt_fixture":false}
```

| id | 변형 | cert_no |
|---|---|---|
| P01 | 기본 3열 표 (시험항목/결과/단위) | 2026-0891 |
| P02 | 단위가 결과 셀 안에 병합 (`2.8 %`) | 2026-0892 |
| P03 | 단위가 헤더에만 (`결과(%)`), 단위 열 없음 | 2026-0893 |
| P04 | 한 페이지에 표 2개 (화학성분 + 물리성능) | 2026-0894 |
| P05 | 4열 표 (시험방법 열 포함) | 2026-0895 |
| P06 | 천단위 구분기호(`4,120`, `28,000`) 및 범위 값(`24.0~26.5`) | 2026-0896 |
| P07 | `N.D.` / `불검출` 값 포함 | 2026-0897 |
| P08 | 우측 하단 직인 텍스트 블록 + 시험원 성명 | 2026-0898 |
| P09 | 가로(landscape) 페이지 | 2026-0899 |
| P10 | 2페이지, 표가 페이지에 걸쳐 분할 | 2026-0900 |
| P11 | 항목명에 괄호 기호 (`산화마그네슘(MgO)`) | 2026-0901 |
| P12 | 장식용 헤더 행 추가 + 하단 각주 | 2026-0902 |
| P13 | P01과 동일하나 **정답 json 이 인쇄값과 불일치** (인쇄 0.025 / json 0.015), `corrupt_fixture: true` | 2026-0903 |

## 4. rules.json

기준 표현식 파서용 플랫 케이스 20개. 커버 범위:
`N 이상`, `N 이하`, `N 초과`, `N 미만`, `N~M`, `N 이상 M 이하`, `≤N`, `≥N`, `<N`, `>N`,
`min N`, `max N`, `N% 이상`, `N 이상(3회 평균)`, `N.D.`, `불검출`, `이상 없을 것`,
`적합할 것`, `-`, `KS F 2563 만족`.

## 구현 메모 (사양 대비 편차)

- **C14**: openpyxl 은 수식의 캐시값을 쓸 수 없으므로 사양의 note 를 따라 기준 값은
  리터럴로 두고 수식은 비고(D) 열에만 넣었다. `data_only=True` 로 읽으면 D열은 `None` 이
  된다. `expect` 는 `adapter`.
- **L03**: 키가 두 행에 있어 단일 `target_cells` 가 성립하지 않으므로 해당 키를 생략하고
  `duplicate_rows: [5, 12]` 를 추가했다. 나머지 5개는 `target_cells` 를 갖는다.
- **P13**: "P01과 동일"은 레이아웃을 뜻하며, 성적서번호는 대장 키와의 혼동을 피하기 위해
  별도 번호(`2026-0903`)를 부여했다.
- 단위는 ASCII 로 표기한다(`cm2/g`, `g/cm3`).

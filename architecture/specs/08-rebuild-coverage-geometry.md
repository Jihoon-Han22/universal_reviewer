# 선택 개선안: 전수 처리와 스캔 근거

아래 RB-COVERAGE와 RB-GEOMETRY는 **OPTIONAL_FUTURE, NOT_RUN**이다. CURRENT_REPRODUCTION에서는 구현하지 않으며 이 기능의 부재를 재현 실패로 계산하지 않는다. 현재 제품 재현은 reader/전사 cap과 공개 Evidence DTO를 02/03 및 contracts/types.ts의 OBSERVED_BASELINE대로 보존한다. 사용자가 별도로 선택한 미래 확장 profile에서만 아래 요구를 G03/G07/G09의 전수 coverage, G05/G07/G10/G12의 geometry 검사에 적용한다. cap 확대·새 public field·추가 provider 호출은 현재 제품과 다른 동작이다. 단순히 cap 숫자를 키운 것을 정확성 증거로 쓰지 않는다.

CURRENT_REPRODUCTION의 구체적 대조: 보조 image 최대8개, VLM 한 호출3쪽/문서 최대30쪽/전체180초, 공개 Evidence에 bbox/evidenceGeometry 없음, PDF.js text run 기반 강조와 이미지 bbox overlay 부재를 유지한다. 31쪽 이상 또는 스캔 사례는 현재의 coverage/stopReason/partial/review 규칙으로 판정하며, 미래 window를 추가하여 completed로 바꾸지 않는다. 기존 limitations 자체와 새 구현의 예상 밖 차이를 분리해서 기록한다. 이 파일의 아래 "새 구현" 및 "Gxx"는 모두 OPTIONAL_FUTURE에만 속한다.

## RB-COVERAGE: 전체 페이지와 각 호출 예산

원본 reader의 보조 image8개, VLM 한 호출3쪽/전체30쪽/180초는 **현재 원본 한 문서 단계의 상한**이다. 이를 유지한 한 번의 분석이 v3 575물리쪽의 완전 처리를 보장한다고 주장하면 안 된다. readerComplete/contextComplete/transcription complete는 각자 별도 검사한다. 전체575쪽은8개 report의 합계이며 한 문서가575쪽이라는 뜻은 아니다.

새 재구현은 문서별 실제 pageCount와 페이지 번호1..pageCount를 먼저 고정하고, 연속 최대8쪽의 window를 차례로 처리한다. text가 있는 페이지도 물리 inventory·reader/context 검사에서 생략하지 않는다. PDF page rendering은 해당 window에 한정하는 신뢰 reader selector를 추가한다. 기존 고정 reader가 이 selector를 지원한다고 쓰지 않는다. 각 window는 같은 원본 hash와 물리 page 번호를 유지하며 전체 문서를 잘라 새로운1쪽으로 바꿔 출처를 잃지 않는다.

- window 내부 render 최대8개, attachment 총16MiB, 각 VLM 호출≤3쪽, 각 window VLM 총180초·호출≤60초·각 repair round≤3을 유지한다. 이미 성공한 페이지는 새 판독 없이 재사용하되 입력/model/template/prompt 버전이 달라지면 재사용하지 않는다.
- 문서의 window는 직렬 처리한다. 프로세스 공용 Gemini/E2B pool 각각2와 대기100을 그대로 적용한다. 각 window는 새 문서 sandbox 세션을 만들고 설치1회, window 내부 reader/context repair는 그 세션을 재사용한다. 세션 종료·kill 완료 뒤 다음 window로 간다. 이후 기준 spreadsheet 탐색과 dashboard의 별도 세션 경계도 유지한다.
- document key=`sourceSha256`, page key=`sourceSha256:physicalPage`, 작업 기록에 windowId/startPage/endPage/readerPages/contextPages/visualPages/omissions와 시도 수를 저장한다. 집계는 page key Set 합집합이며 중복 판독은 분모·성공수를 늘리지 않는다.
- E2B lease는 기존 최대300,000ms, command/request/cleanup timeout은02와 같다. window가 남은 시간에 끝날 수 없으면 실패/partial로 남기고 세션을 정리한다. 무한 lease 연장이나 숨은 model retry는 없다. G07 전체 실행의 외부 deadline은 run-gate 최대21,600,000ms이며 각 window/call 시작 전 취소와 잔여시간을 확인한다.
- 문서 coverage.complete는 기대 페이지 전체가 reader/context를 통과하고 필요한 visual 페이지의 검증이 완료됐을 때만 true다. coverage 불완전이거나 판독 불확실이 남으면 omission 위치·사유 및 review 상태를 유지한다. 일부 결과를 보존할 수 있으나 G07은 FAIL이다. 원문에 없는 값을 완성하여 전수를 통과시키지 않는다.

입력/출력 계약은 contracts/rebuild-extensions.ts의 PageWindowRequest/PageWindowResult다. baseline public DTO에 `coverage` 숫자만 덮어써 완전 처리를 가장하지 않는다. parser/model 한도별 실패와 window 후반부 취소·중복응답·늦은응답·세션 kill을 G03/G09에서 검사한다. G07은8개 report의 실제 page inventory 합계575, window의 union/누락0,35field/105writer cell 및 의미/출처 정답을 각각 대조한다. 원본 image가 손상됐거나 필요한 값이 가려진 경우 읽기 coverage와 값의 uncertainty를 분리한다.

## RB-GEOMETRY: 텍스트가 없는 원문의 근거

baseline Evidence에는 bbox가 없고 PDF UI는 PDF.js text run을 매칭한다. 이미지 viewer는 bbox overlay를 제공하지 않는다. 따라서 source 타입이 이미 모든 스캔 좌표를 제공한다는 주장은 금지한다. G07의35개 field는 **모두 근거 검사 대상**이지 가려진 값에도35개 값 box를 만들라는 요구가 아니다.

새 구현은 baseline Evidence와 별도 `EvidenceGeometry`를 run snapshot에 전달한다. 공개 신규 필드는 선택적 `evidenceGeometry: EvidenceGeometry[]`이며 각 레코드는 itemId/documentId/sourceSha256/physicalPage/quote/locator/verification/bbox/rotation을 갖는다. source bytes는 포함하지 않는다. source hash와 item/document/page가 현재 원본에 맞지 않거나 bbox가 유효하지 않으면 렌더하지 않는다. bbox는 **회전 적용 후 실제 표시 페이지의 좌상단을(0,0), 우하단을(1,1)**로 하는 [x0,y0,x1,y1]이다. 네 값은 유한수, 0≤x0<x1≤1,0≤y0<y1≤1이어야 한다. two-up 페이지는 보이는 물리 한 페이지 전체를 이 좌표계로 삼는다. 원래 보고서의 논리 page를 물리page로 추정 변환하지 않는다.

위치 생산은 먼저 PDF.js text layer의 실제 quote/항목 witness를 사용한다. text run이 없을 때에는 window에서 실제 렌더한 page image와 해당 quote/항목/현재 관측값만 독립 locator에 제공하여 bbox 후보를 얻는다. locator는 코드 실행이나 oracle 접근 권한이 없으며 별도 Gemini 구조화 요청이다. 페이지당 후보 최대50, 응답256KiB/호출60초, 페이지당 최대2회(초기+host 형식/좌표 오류 repair1회), global Gemini pool2. 누락/판독불가 값 복원 요청을 하지 않는다. 후보의 itemId는 해당 페이지의 알려진 항목 ID여야 하며 host는 형식 오류를 통과시키지 않는다. 유효 후보가 준비된 뒤 verifier는 해당 bbox의 실제 pixel crop과 quote/항목/qualifier를 별도 요청으로 확인한다(후보50을 한 페이지에 묶어 최대1회/60초/256KiB). 결과는 모든 candidateIndex에 정확히1개, 일치하는 itemId와 boolean verified를 갖고 중복/누락/알 수 없는 ID는 거절한다. verifier 거절·불확실·오류 뒤에는 locator를 다시 호출하지 않고 geometry=[]와 위치 확인 필요로 남긴다. 총 locator2+verifier1 호출/페이지 상한이며 provider 예외/timeout/abort는 성공이 아니다.

host가 source identity·물리페이지·범위·quote 비공백과 기존 item-name/누락 witness를 검사하고 독립 verifier가 현재 보이는 값/qualifier를 확인한 후보에만 verification='verified'를 부여한다. 모델이 스스로 verified를 선언한 것만으로 통과하지 않는다. header/시료명만 있는 box, 잘못된 값/잘린 부호, 가려진 값의 추정 box는0개다. 판독불가/확인된부재 항목은 geometry=[]와 위치 확인/누락 상태를 유지하며 원래 evidence 설명은 보존한다.

표시는 CSS left=x0×width,top=y0×height,width=(x1−x0)×width,height=(y1−y0)×height이며 canvas DPR을 다시 곱하지 않는다. zoom/resize마다 동일 normalized 좌표를 새 CSS 크기에 투영한다. PDF와 단일 image 모두 동일 검증된 geometry에만 판정색을 사용한다. 좌표 존재만으로 verdict를 바꾸지 않는다. G07 독립 평가자는35field 모두의 원문/quote/geometry 또는 합당한 geometry=[]를 확인하고 screenshot에 값·qualifier가 들어가는지 검사한다. bbox 경계 허용은 실제 표시에서2CSS px이며 존재하지 않는 근거/잘못된 문구에는 tolerance를 적용하지 않는다. 이 추가 locator/verifier와 브라우저 검사는 현재 NOT_RUN이다.

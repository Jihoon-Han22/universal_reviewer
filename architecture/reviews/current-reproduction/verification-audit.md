# 현재 제품 재현: 검증 계약 감사

- 검토/수정자: `/root/audit_verification` (이 변경의 최종 독립 승인자가 아님).
- 범위: validation 도구,06 검증 계약,08 coverage/geometry 확장,확장DTO,document-negative-cases. src/server 제품 소스는 수정하지 않음.
- 목표: CURRENT_REPRODUCTION과 OPTIONAL_FUTURE를 분리하고 미실행·자기선언·과거 점수의 통과 오인을 방지.
- 제품 재구현/브라우저/실제Gemini·E2B/golden·v3 전수/봉인holdout: **NOT_RUN**.

## 확인한 문제와 수정

| ID | 기존 근거/문제 | 수정 및 검증 경계 |
|---|---|---|
| VER-01 | 06 §4의 G07은575쪽 전수/geometry, G08은3seed/39개 정답, G13은원본 미측정 목표를 의무화.08은원본에 없음을 인정하면서도 REQUIRED_REBUILD 선언 | 06 앞에 CURRENT_REPRODUCTION15gate와 입력-기대-실제 대조 규칙 추가. 기존확장 protocol은 OPTIONAL_FUTURE 절 전체로 한정.08 window/locator/geometry 및 확장DTO는 현재 재현 비목표 |
| VER-02 | acceptance.mjs는 profile 없이 모든G06/07/08에live, G08에봉인3seed를 강제. 기존 무profile evidence를 구분할 수 없음 | index/report acceptanceProfile 필수·일치 검사. runner 기본CURRENT_REPRODUCTION, adapter context/echo 강제, OPTIONAL_FUTURE만명시선택. 현재G06/07/08은실제구현의offline replay 허용 |
| VER-03 | 기존현재한계를이유로어떤결과도재현PASS라고할위험 | G01..G13 reproduction 비교수/일치수/예상밖차이0/기존한계보존과baselineReferences실제hash를요구. 상세사례와원본한계근거는독립review필수이며기계가의미정확도를인증한다고주장하지않음 |
| VER-04 | harness의합성expected와v3 exactPass를현재재현필수로오해할수있음 | validation README에서합성/ideal평가의OPTIONAL_FUTURE범위를명시. 각도구의completeProductAcceptance:false유지. 자기정답복사양성대조는실제제품검증이아님 |
| VER-05 | document-negative-cases의exact모델의미/새geometry 기대를현재baseline에동시에강제 | profile별적용경계추가. DN-01archive거부등현재계약은보존하고DN-03/04의모델문장/의미/geometry이상적기대는선택개선과분리 |
| VER-06 | 기존 G14의openCriticalHigh:0만으로낮은심각도의재현차이가남을수있음 | CURRENT_REPRODUCTION은openReproductionIssues:0도필수. 양성및누락/1/문자열0/false/null음성회귀통과 |
| VER-07 | 새profile lookup에서일반객체의상속키를unknown profile로즉시거부하지않으면잘못된gate조합이dispatch전검사를통과할수있음 | runGate첫줄Object.hasOwn검사로파일접근·adapter실행전거부. __proto__/toString/constructor/unknown4조합회귀통과 |

## 기존 감사 프로토콜 판정

[기존 PROTOCOL](../independent-audit/PROTOCOL.md)은질문삭제금지·미검토UNVERIFIED·별도평가자·현재hash·실행NOT_RUN을이미명시한다. [CHECKPOINT](../independent-audit/CHECKPOINT.md)는최종재평가중단을명확히기록한다. 이역사를수정하거나과거100을현재점수로사용하지않았다. 기존정확성정의에있는 REQUIRED_REBUILD는당시확장범위의역사적기준이며현재재현의무가아니다. 현재점수는새고정질문/설계hash에대한독립평가후에만산출해야한다.

[verify-package](../../tools/verify-package.mjs)는`implementationExecuted:false`/`completeProductAcceptance:false`,manifest현재bytes·required파일·link·registry/traceability·font/reference를검사하며refresh는작성용이다. 이검사는제품동작또는독립감사100을증명하지않는다. root소유도구는수정하지않았다.

## 수행 명령과 결과

1. `node --test architecture/validation/acceptance-selftest.mjs` (기본sandbox): **실행 시작 실패**, Node test subprocess spawn EPERM. 이것을테스트통과로세지않음.
2. 동일명령을오프라인synthetic Node child실행권한으로재실행: **14개 중13 PASS/1 FAIL, exit1**, 총1252.7초. 이프로세스는G14/상속키추가수정전모듈을로드했다. 실패는정상adapter의3초테스트예산초과이며,실제report의ADAPTER_TIMEOUT_OR_OUTPUT_LIMIT와시작06:10:53.413Z/종료06:10:59.854Z로확인했다. 이실패를소급하여PASS로기록하지않는다.
3. 정상package identity회귀의timeout만3000→30000ms로조정후 `node --test --test-name-pattern="successful gate records current package identity" architecture/validation/acceptance-selftest.mjs`: **1/1 PASS, exit0**,27.8초. 정상adapter의현재package hash와실행중package mutation거부를모두대조. 제품runner한도와의도적인20ms timeout음성회귀는변경하지않음.
4. `node --test --test-isolation=none --test-name-pattern="current reproduction rejects every unresolved issue" architecture/validation/acceptance-selftest.mjs`: **1/1 PASS, exit0**,195.5초. 최종G14코드의현재profile양성대조와5개미해결이슈선언음성대조.
5. `node --test --test-isolation=none --test-name-pattern="gate runner rejects inherited profile names" architecture/validation/acceptance-selftest.mjs`: **1/1 PASS, exit0**,0.53초. 상속키/unknown4조합이경로접근전profile오류로거부됨.
6. 전체첫회에서echo회귀의assertion은PASS였으나실제report를추가검사한결과3초timeout이었고,부차적인profile_mismatch만검사해의도한분기를확인하지못했음. 해당테스트도timeout30000ms로조정하고errors가정확히`['acceptance_profile_mismatch']`인지검사하도록강화. `node --test --test-name-pattern="gate runner rejects an adapter that does not echo" architecture/validation/acceptance-selftest.mjs`: **1/1 PASS, exit0**,4.56초. 이재실행은실제adapter반환뒤profile불일치만으로거절됐음을검증한다.

전체첫회14개와최종추가/수정targeted4개를구분해기록했다. 최종파일의16개전체를한프로세스에서다시실행한것은아니며그렇게주장하지않는다. 첫회13개통과에누락/혼합profile,현재baseline비교/기준hash,선택holdout경계,문자열/소수/boolean/unsafe provider·seed count,stale hash,skip,timeout,junction검사가포함된다. 첫회echo의assertion통과만으로해당거부분기검증을주장하지않고위추가검사·재실행을따로기록했다. 최종targeted검사는바뀐G14/상속키조건과정상dispatch·정확한echo거부분기를검증했다. 모든실행은synthetic fixture/metadata이며실제앱·provider를실행하지않음.

변경된회귀는누락/알수없는/혼합profile거부,adapter profile echo불일치거부,현재baseline비교누락/0/불일치/근거hash오류거부,현재G08에선택holdout비강제,OPTIONAL_FUTURE의엄격한provider/holdout count를포함한다. 기존stale hash·skip·timeout·junction 회귀도유지한다.

## 독립 최종 평가자가 확인할 잔여 사항

- 이검증기수정자는자기변경을최종승인하지않음. 별도평가자가현재파일hash와추가회귀를검토해야함.
- 패키지manifest는root가모든동시변경을freeze한뒤갱신/재검사. 이보고서작성시구manifest불일치는예상되며현재무결성pass라고기록하지않음.
- 증거checker는서명되지않은선언과hash일관성만검사. 가짜양성metadata도ready_for_independent_verification일수있으며제품pass는항상false. 실제artifact내용/독립성/provider진위는G14실행필요.
- 고정질문집합의모호성0/명확성100은그선언범위의설계평가이며모든미래입력의완전성보장이아님. 새로운누락발견은질문추가및재평가대상.

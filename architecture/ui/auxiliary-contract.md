# 공통 표시·시작 요청·작은 화면의 추가 계약

이 문서는 원본 소스 대조에서 빠져 있던 동작을 보완한다. 달리 표시하지 않은 내용은 OBSERVED_BASELINE이며 구현 완료/브라우저 실측 증거가 아니다. 스타일·벡터·CSS keyframe의 수치는 기존 시각 카탈로그를 유지한다.

## A1. 공통 값 표시

`formatValue`는 null/undefined를 `확인 불가`로 표시한다. 그 밖에는 `String(value)`를 만든 뒤 `^-?\d{1,15}(\.\d+)?$`와 일치할 때만 숫자로 변환하여 `Intl.NumberFormat('ko-KR',{maximumFractionDigits:12})`로 표시한다. 문자열을 trim하거나 단위를 추정하지 않는다. 부호+·지수·쉼표·공백·단위가 있거나 정수부16자리 이상이면 원문 문자열 그대로다. 선행0은 숫자 변환에서 사라지고 소수13자리 이상은 Intl 규칙에 따라 반올림된다. 이 함수는 표시용이며 원문·API 값·판정 비교식·다운로드 수치를 변경하지 않는다.

| 입력 | 표시 |
|---|---|
| null / undefined | 확인 불가 |
| 0 / '00012.50' / '-1234.5' | 0 / 12.5 / -1,234.5 |
| '1234567890123456' / '1e3' / '+1' | 원문 그대로 |
| ' 1234 ' / '1,234' / 'N.D.' / '' | 원문 그대로 |

기준 편집의 `numberLabel(value:string)`은 **다른 함수**다. trim 후 `^([+-]?)(\d+)(\.\d+)?$`에 맞으면 부호·정수 문자열·소수 문자열을 분리하고 정수에만 `/\B(?=(\d{3})+(?!\d))/g`로 쉼표를 삽입한다. Number 변환·자리수 상한·소수 반올림이 없다. `+1234`→`+1,234`, `001234`→`001,234`, `' 1234 '`→`1,234`,16자리 정수→5개의쉼표를넣은정수, `1.1234567890123`→같은13자리소수다. 정규식 불일치는 trim한 문자열이며 빈문자열도 그대로 빈문자열이다. null은 이 함수 입력 타입이 아니다.

## A2. 활동 제목의 공급자 이름

`formatActivityText`는 짧은 활동 제목·단계 요약에만 적용한다. 독립 단어 gemini/E2B를 대소문자 구별 없이 각각 `LLM`/`샌드박스`로 바꾼다. 원문, 문서명, 명령, 로그, 오류 body, runtime ID/API/config key에는 적용하지 않는다. 코드 fence, inline code, URL/www, 절대·상대 경로/@ 시작 token, 확장자가 있는 기술 token은 먼저 보호한다. 브랜드 앞의 `[\w@./\\-]` 또는 뒤의 `[\w./\\-]` 경계가 있으면 바꾸지 않는다. JS 정규식의 \w/\b 경계이며 모든 언어의 자연어 단어 분리기를 사용한다는 뜻은 아니다.

정확한 보호/치환 식:

```js
/(```[\s\S]*?```|`[^`\r\n]*`|(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>"']+|(?:[a-z]:[\\/]|\.{1,2}[\\/]|\/|@)[^\s<>"']+|\b[\w@.-]+(?:\.[a-z][a-z\d]{0,11})\b)|(?<![\w@./\\-])\b(gemini|e2b)\b(?![\w./\\-])/gi
```

첫 capture가 있으면 match 그대로, 아니면 두 번째 capture의 lowercase가 gemini이면 LLM, 그 외 샌드박스다. `Gemini → E2B`는 `LLM → 샌드박스`; `gemini-3.5`, `gemini.mjs`, `/e2b/file`, `@gemini`, inline-code `gemini`와 URL은 보존한다.

## A3. 앱 health 수명주기

App mount의 빈 dependency effect에서 GET `/api/health`를 한 번 시작한다. 초기값 null, 성공 response를 저장하고 실패는 null로 저장한다. 자체 재시도·timeout·AbortController·unmount/stale guard가 없다. dev React.StrictMode의 effect 재실행은 두 요청을 만들 수 있고 production의 한 mount당1요청과 구분한다. reset/새 검토만으로 다시 호출하지 않는다. header는 두 configured boolean이 모두 true일 때만 `LLM + 샌드박스`/connected, 그 외 `연결 확인 중`이다. 따라서 missing key와 HTTP failure를 별도 문구로 구분하지 않는 baseline이다. 나만의 대시보드 버튼은 terminal이 아니거나 e2bConfigured가 false/null이면 disabled다. health API가 모델 접근·실제 E2B 연결 시험을 수행한다는 뜻은 아니다.

## A4. 작업실 mobile pane

SandboxActivityDock mount 때 mobilePane='flow'. `처리 흐름`/`실행 내역` 버튼이 flow/log를 각각 선택하며 aria-selected와 workspace data-pane을 즉시 갱신한다. CSS는 viewport가 아니라 named `workroom` container 폭≤1050px에서 파일 select를 보이고 task sidebar를 숨긴다. container 폭≤680px에서 tabs를 보이고 workspace를 flex-column으로 바꾼다. flow는 detail/log-empty를 숨기고 log는 exchanges를 숨긴다. 넓은 container에서는 양 pane 배치가 기존 CSS에 따른다. reset effect의 dependency인 runId/contextId/startedAfter/defaultExpanded가 바뀌면 pane=flow, expanded=defaultExpanded, history=false, manualSelection=false, previousActive=false, selectedGroupId/selectedTaskId=null이 된다. 같은 dependency에서 파일/group·task 선택이나 새 snapshot·busy·viewport 변경만으로 pane을 reset하지 않는다. 모바일 파일 select는 selectGroup의 manual task 선택 해제와 preferredTask 규칙을 사용한다.

## A5. 실패·취소의 live announcement

baseline의 done은 `!busy && run && ['completed','partial'].includes(run.status)`다. role=status/aria-live=polite 문구는 done이면 `검토 완료. 추출 N개, 판정 M개.`, 그 외에는 `검토 진행 중. 추출 N개, 판정 M개.`다. 따라서 failed/cancelled/null 상태도 후자로 남는 한계가 있다. 시각 packet·큐의 종료 조건까지 이 문구로 바꾸면 안 된다.

**CURRENT_REPRODUCTION은 위 baseline 문구를 그대로 유지한다.** 다음은 OPTIONAL_FUTURE ARIA-TERMINAL(미래 G10/G13, 우선순위 P1, NOT_RUN): terminal status를 busy보다 우선하여 failed=`검토 실패.`, cancelled=`검토 취소.`, partial=`일부 확인 필요.`, completed=`검토 완료.`를 위 counts 앞에 사용한다. terminal이 아니면 null+!busy는 `검토 대기.`, 나머지는 `검토 진행 중.`이다. status 변경 뒤 polite announcement를 확인하되 business status·counts를 수정하지 않는다. 각 상태와 busy 조합을 독립 브라우저에서 확인해야 한다.

## A6. 파일 크기

App sizeLabel은 bytes>1,048,576에서 `(bytes/1048576).toFixed(1)+' MB'`, 그 외 `Math.max(1,Math.round(bytes/1024))+' KB'`다. Ledger는 MB 조건이 bytes≥1,048,576이며 나머지 연산은 같다. 0/1023bytes는 양쪽1KB, 정확히1MiB는 App1024KB/Ledger1.0MB,1MiB+1byte는 양쪽1.0MB다. 표시 단위는 실제 UI의 공백 포함 `1 KB`/`1.0 MB`로 쓴다. 업로드 크기 허용과 이 표시 반올림은 별개다.

## A7. 판정색과 다른 raw quote mark

raw `highlightedText(text,quotes)`는 각 quote의 trim 결과가 빈 경우 건너뛰고 **원래 quote 문자열**을 case-sensitive `text.indexOf(quote,offset)`로 찾는다. quote당 최대30개의 비중첩 위치, offset=start+quote.length다. 공백 정규화·숫자 경계·record witness가 없다. 모인 범위를 start 오름차순 정렬하고 다음.start≤이전.end이면 겹침/접촉 범위를 합쳐 일반 `<mark>`로 감싼다. 일치가 없으면 원문 그대로다. quote 개수에 추가 총상한이 있는 함수가 아니다.

표 cell의 primary 판정 highlight가 없을 때 해당 value에 raw fallback을 사용한다. text preview는 documentHighlights.length=0일 때 raw fallback이고, 하나라도 있으면 statusHighlightedText다. selectedContextOnly 상태는 quotes=[]로 raw 표시를 억제한다. PDF는 별도 text matcher, image는 baseline에서 overlay 없음이다. raw mark는 판정 근거 검증 결과가 아니며 I9.1의 검증된 판정색 witness로 승격하지 않는다.

설계 fixture(G10/G12, NOT_RUN): text='15',quote='5'는 baseline raw `<mark>`가5부분을감싼다; status numeric-boundary가 통과한다는 뜻은 아니다. text='x '.repeat(31),quotes=['x']면 앞30개만 mark이고 마지막x는원문; text='aaa',quote='aa'면 첫[0,2)하나; text='ABC',quote='abc'는0개; text='ab',quotes=['a','b']는접촉범위[0,2)하나로병합한다.

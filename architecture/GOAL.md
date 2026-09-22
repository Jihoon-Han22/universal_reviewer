# 공식 /goal 시작·중단·재개

2026-09-21에 OpenAI Docs 스킬 절차로 공식 문서를 검색하고 실제 페이지를 열어 확인했다. [Developer commands: Set or view a task goal](https://learn.chatgpt.com/docs/developer-commands?surface=cli)은 `/goal <objective>` 설정, `/goal` 조회, `/goal edit`, `/goal pause`, `/goal resume`, `/goal clear`를 명시한다. 목표 텍스트는 4,000자 이하여야 하므로 긴 구현 계약은 파일로 둔다. 예전 [CLI slash commands URL](https://developers.openai.com/codex/cli/slash-commands)은 새 문서로 이동한다.

CLI 세션에서 다음 한 줄을 붙여 넣는다. 앱에도 공식 명령 목록에서 `/goal`이 제공되지만 세부 메뉴/feature 노출은 설치·surface에 따라 확인한다. `/goal`은 shell/PowerShell 명령이 아니라 **Codex 입력창 명령**이다. 현재 이 설계 작성 세션에서는 goal을 생성하지 않았다.

```text
/goal architecture/README.md, DECISIONS.md와 REPRODUCTION.md를 시작점으로 CURRENT_REPRODUCTION profile의 GSPEC을 현재 기준선 그대로 재현하라. 제공된 golden/, ralph-golden-v3/, 비공개 .env 및 architecture/만 사용하고 원본 src/server/integrations 구현 접근을 전제하지 마라. environment의 두 lockfile, decomposition, PLAN과 specs/contracts/prompts의 baseline 계약을 따른다. 현재 UI 문구·상태·API·알고리즘·처리 상한·오류·알려진 한계를 보존하고 OPTIONAL_FUTURE 및 과거 REQUIRED_REBUILD 개선안을 자동 추가하지 마라. ui/VISUAL-CONTRACT의 스타일·SVG·폰트·34개 화면과 모션 값, 07의 자료 소유·캐시·동시성·취소·정리, LLM/E2B prompt·payload·재사용·교정 예산을 재현하라. 같은 fixture의 observed/baseline을 정답으로 사용하고 desired/개선값으로 대체하지 마라. .env와 원문을 공개 로그에 넣지 말고 기준 문서/데이터를 통과 목적으로 수정하지 마라. M0부터 순서대로 구현하고 06의 CURRENT_REPRODUCTION 필수 gate를 실행해 차이를 수정·재검증하라. provider 비결정성과 ID/시각을 문서의 허용 범위에서만 정규화하고 화면·고정 응답의 결정 결과·실제 통합을 각각 검증하라. checkpoint/evidence/이슈를 .cache/rebuild에 저장하고 재개 시 해시를 확인하라. 다른 에이전트의 독립 검토와 실행 증거를 남겨라. 모든 필수 gate 통과와 미해결 재현 이슈 0건 전에는 완료하지 마라. 설계 점수나 mock만으로 제품 완료를 선언하지 말고 외부 장애·미실행·허용하지 않은 차이를 명시하라.
```

사용자가 부르는 **Ralph loop**는 `구현 → 실행 → 실패 분석 → 수정 → 재실행`의 반복 방식이다. 공식 명령 이름이나 별도 패키지 이름이 아니다. 무한 재시작 shell을 설치하지 않는다. goal은 지속 목표를 유지하지만 토큰/시간/사용량·sandbox·승인 정책을 우회하지 않는다.

## 운영

- `/goal`: 현재 목표 확인. 일반 메시지로 제약이나 우선순위를 바꿔도 checkpoint를 유지한다.
- `/goal pause`: 사용자가 중단할 때 사용. 그 전에 가능하면 현재 stage, PID/port, 마지막 통과 gate, 다음 명령을 checkpoint에 저장한다.
- `/goal resume`: 같은 프로젝트/작업에서 재개. 먼저 입력 해시와 checkpoint를 확인하고 실패 gate부터 이어간다.
- `/goal edit`: 목표 내용 변경. acceptance 변경 이력을 남기고 기존 pass 재사용 가능성을 재검토한다.
- `/goal clear`: 지속 목표 제거. 파일 삭제나 앱 서버 종료 명령이 아니다.

CLI의 다른 `/resume`는 저장된 대화 복원 명령이므로 `/goal resume`와 구분한다. `/stop`은 background terminal 전체에 영향을 줄 수 있으므로 공유 환경에서 앱 하나 중단 용도로 쓰지 않는다. 서비스 종료는 이 구현 작업이 소유한 PID만 대상으로 한다.

공식 문서의 의미를 넘어 영원히 자동 재실행·무제한 예산·모든 모델 지원·정확히 같은 소스 생성을 보장하지 않는다. 명령이 보이지 않으면 해당 설치의 `/help`와 공식 명령 문서를 확인하고 현재 환경에 맞게 설정한다. 이 패키지는 검증되지 않은 feature flag 변경을 자동 수행하지 않는다.

# Core 명확성 검토 — Round 01

Reviewer: `/root/architecture_clarity_core`. `architecture/`만 읽었다. 원본 source/history, 비공개 `.env`, 외부 API 및 서버는 사용하지 않았다. 보조 평가자는 reader/schema, evidence/activity, dashboard/ledger를 나누어 읽었고 아래 최종 판단은 이 reviewer가 통합했다.

18개 CORE 모듈의 필수 질문90개를 전부 검토했다. **pass64 / fail26 / 미검토0**, 미해결 issue22개다. 점수는 `score.mjs`가 계산하며 자체 점수를 붙이지 않는다. PASS는 독립 구현 계약의 명확성이고 실제 제품/외부 서비스/원본 정확성의 통과가 아니다. 질문별 근거·두 해석·필요 결정은 같은 이름의 JSON을 참조한다.

| Issue | 모듈 | 심각도 | 결정이 필요한 내용 |
|---|---|---|---|
| R1-CORE-001 | CORE-08 | high | XLSX 탐색: 분석 세션 재사용과 별도 세션이 충돌 |
| R1-CORE-002 | CORE-09 | medium | 계층 prompt: section headings 허용과 section titles 금지 충돌 |
| R1-CORE-003 | CORE-10 | medium | 자연어 수정에서 required 허용 목록이 불일치 |
| R1-CORE-004 | CORE-13 | medium | 문서 status/stage와 summary 문서 수 predicate 누락 |
| R1-CORE-005 | CORE-07 | medium | Word/PDF native citation과 public/model Evidence 경계 미정 |
| R1-CORE-006 | CORE-04 | high | private analyzed Document 및 criteria inventory DTO 누락 |
| R1-CORE-007 | CORE-15 | medium | 취소 뒤 cleanup 실패 공개 경로 미정 |
| R1-CORE-008 | CORE-03 | medium | deferred XLSX preview wire shape 미정 |
| R1-CORE-009 | CORE-05 | medium | 초기 context chunk 실패의 repair 해제 조건 미정 |
| R1-CORE-010 | CORE-05 | medium | 전체 context repair의160/1000 structure cap 충돌 |
| R1-CORE-011 | CORE-14 | medium | dashboard snapshot이 missing highlight 보호 필드를 삭제 |
| R1-CORE-012 | CORE-14 | medium | spreadsheet/PDF highlight의 실제 위치 admission predicate 부족 |
| R1-CORE-013 | CORE-14 | medium | bridge acceptance runId와 token-only payload 불일치 |
| R1-CORE-014 | CORE-15 | medium | command log framing·replay·dedup 계약 누락 |
| R1-CORE-015 | CORE-15 | low | criteria-analysis autoCollapse 기본값이 원본 조회를 요구 |
| R1-CORE-016 | CORE-16 | medium | ledger fingerprint 범위와 human override409 약속 불일치 |
| R1-CORE-017 | CORE-17 | high | light blue 차트 요청이 dark 페이지 theme를 덮어씀 |
| R1-CORE-018 | CORE-17 | high | 파일별 막대 요청이 전체 pie를 bar로 덮어씀 |
| R1-CORE-019 | CORE-17 | medium | baseDesign 보존 보장과 prompt-only 성공 경로의 차이 |
| R1-CORE-020 | CORE-17 | low | 대시보드14/15 필드 수 충돌 |
| R1-CORE-021 | CORE-01 | high | Gemini adapter 메서드/반환/오류/용량 계약 누락 |
| R1-CORE-022 | CORE-02 | medium | API server signal 종료 순서·cleanup/exit 검증 누락 |

독립 실행한 범위는 패키지에 포함된 `reference/dashboard/design-functions.reference.mjs`의 두 순수 함수 입력뿐이다. `Keep the dark page; make the charts light blue.`는 `theme=light`, `전체는 파이, 파일별 결과는 비교 막대로`는 `distribution=bar, fileVisualization=bars`를 반환했다. 이는 생성 모델·브라우저 실행 증거가 아니며 각각 R1-CORE-017/018의 문서 대 코드 충돌을 확인한다.

`specs/06-verification.md`의 freeze 통보 후 재독해하여 oracle 격리·공개 전수·봉인 일반화·실제 실행과 문서 검토의 차이를 반영했다. 06은 adapter/shutdown 공백을 보충하지 않았으며 G11에도15design choices 표현이 남는다. 후속07은 이번 동결 모집단 밖이고 다음 round에서 별도로 검토한다.

수정 뒤 모든 영향 문서를 다시 읽고 해시를 새로 seal해야 한다. 현재 보고서의 pass를 수정된 입력에 재사용하지 않는다.


# R1 core API·pipeline 문서 수정 기록

작성 범위: specs/01-state-api.md, specs/02-backend-pipeline.md, contracts/types.ts, 신규 contracts/internal-pipeline.ts, contracts/examples/01~04. 운영 소스·서버·API와 decomposition registry는 변경하지 않았다. R1 clarity/accuracy issue ID는 번호가 겹치므로 아래에 reviewer role을 함께 쓴다. 수정했다는 기록이며 독립 재검토의 pass/점수를 대신하지 않는다.

| R1 issue | 수정 위치 | 결정·변경 |
|---|---|---|
| core-clarity:R1-CORE-004 | 01 §3/§10; types.ts Summary; internal-pipeline RunDocumentStatus/RunStage; examples01 | 문서/run 상태 enum 분리. incompleteDocuments는 partial만, 나머지 summary predicate와 4문서 예시 명시 |
| core-clarity:R1-CORE-005 | 02 §2.4; internal-pipeline InternalNativeCitation/EligibilityModelEvidence/NormalizedReviewEvidence; types.ts Evidence | block/table은 내부 table indexing. eligibility는 허용 키 외 거부. Word quote/PDF page+quote 공개 예시. review blank:true와 eligibility 차이 구분. specs03 수정은 별도 알고리즘 작성자 소유 |
| core-clarity:R1-CORE-006 | 02 §2.4; 신규 internal-pipeline.ts 및 types.ts 재export | private Stored/AnalyzedDocument, ReaderProfile, sourceCells/Rows, model parts, inventory regions/detail/requery 포트 완결. 수식 sentinel·원래 주소·sparse CSV·cache promise 반환 타입 명시 |
| core-clarity:R1-CORE-007 | 01 §3/§8; 02 §2.8; examples02~04 | cancelled run은 유지하고 후속 run event 차단. E2B global activity는 kill settle까지 생존, kill 실패를 failed/cleanup과 CLEANUP_FAILED로 공개. UI가 취소 뒤 반드시 알림을 재표시한다는 보장은 별도 미구현 기능으로 명시 |
| core-clarity:R1-CORE-008 | 01 §4.1; 02 §2.2; examples01; DeferredSpreadsheetParse | 정확한 text preview/truncated:true + private sourceSheets:[] + source marker 정의. 부분 시트 미보존, 원본 bytes 유지 |
| core-clarity:R1-CORE-009 | 02 §2.4/§2.5 | 최초 failed chunk의 context_incomplete는 성공 replacement 뒤 해제 가능. 다음 round 전체 retained source 재검증 필수, 최초 count 역사 보존, source cap/reader partial은 해제되지 않음 |
| core-clarity:R1-CORE-010 | 02 §2.4/§2.5 | chunk당160, initial merged validation 재호출 없음, 공개 structure 첫1000, repair 전체대체 기본160을 구분. repair161개는 실패·이전 context 유지 |
| core-clarity:R1-CORE-011 | 02 §2.4; internal-pipeline DashboardSnapshotItem/DashboardSourceItem/DashboardSnapshotCitation/FullReviewItem | 현재 projection은 presence/missingVerified/machineStatus/evidence.blank를 제거, null→빈 문자열/pending→review. metadata 보존은 현행으로 위장하지 않음. dashboard05의 별도 개선 gate와 연결 |
| core-clarity:R1-CORE-014 | 02 §2.9 명령 framing | stdout/stderr별 buffer/received, CRLF framing, 최종 aggregate fallback, sanitize 후 channel+title+detail dedup, cap/heartbeat/close/abort 소유권 명시 |
| core-clarity:R1-CORE-016 | 01 §9/§10 | ledger fingerprint는 proposal 직렬화 payload만. humanNote/reviewedByHuman/audit 자체는 hash에 없음. 같은 payload면 사람 수정 뒤에도 유지. 모든 override409 문구 삭제 |
| core-clarity:R1-CORE-021 | 02 §2.8.1; internal-pipeline GeminiAdapter/SandboxRunner/IntegrationFailure; examples02 | adapter 입력 우선순위, text/json/stream 반환, validate/blank 실패, token2048/default 및1..32768, SDK 오류 매핑/안전 메시지, pool과 stream 수명, E2B 포트 명시. 범용 bytes/parts cap과 자동 retry 없음 |
| core-clarity:R1-CORE-022 | 01 §11; 02 §2.8 | 실제 SIGINT/SIGTERM의 retained runs cancel→server.close callback→exit0. cleanup await/deadline/SSE강제종료/exitcode 정책 없음. 확대 shutdown은 별도 미실행 gate |
| core-accuracy:R1-CORE-001 | 02 §2.8.1 및 adapter 타입 | 위 adapter exact port와 phase-specific cap 경계로 수정 |
| core-accuracy:R1-CORE-002 | 01 §11 | 실제 signal 경로와 현재 미보장 cleanup을 명시. environment 문서 owner에게 연결 참조 요청 |
| core-accuracy:R1-CORE-003 | 02 §2.2 | ZIP local name/method, central bounds, inflate-length 대조로 한정. local size fields 비교 주장 제거. 예약 직전<100/예약 뒤≤100 명시 |
| core-accuracy:R1-CORE-004 | 01 §4.1; 02 §2.2 | local preview 모든 drawing 관계 제거, public per-cell2000자 절단만으로 truncated가 켜지지 않는 baseline 한계 명시. 내부 source는 displayedValue 전체, aggregate1.5M이며3000자 개별 cap이 아님 |
| core-accuracy:R1-CORE-005 | 02 §2.3 | cap별 unsupported/partial/incomplete/Node hard error 표. embedded image 오류와 standalone40MP 구분. Python unsupported JSON의 exit0와 Node identity gate 설명 |
| core-accuracy:R1-CORE-006 | 02 §2.9 추가 acceptance | malicious archive/macro/external-link end-to-end negative는 확인된 기존 실행으로 주장하지 않고 unexecuted 추가 gate |
| core-accuracy:R1-CORE-007 | 02 §2.9 추가 acceptance | nested DOCX 실물 reader와 모델 semantic orientation은 flat block fixture와 분리, 실행 evidence 없는 추가 gate로 명시 |
| core-accuracy:R1-CORE-008 | 02 §2.6 및 §2.9 예시 | 실제 limited/verified/no_progress/noRepairable/round_limit 분기 순서.31페이지도 no_progress/round_limit이면 needs_review, missing page/run.partial 유지 |
| core-accuracy:R1-CORE-009 | 02 §2.9 추가 acceptance | 두 문서간 evidence/bytes 혼합 음성 시험은 별도 미실행 gate. 한 문서내 page fixture로 교차 문서 안전성 입증했다고 하지 않음 |
| core-accuracy:R1-CORE-019 | 01 §9/§10 | proposal payload-only fingerprint와 human-note no-change 예시. ledger05a 작성자와 동일 결정 |
| ui-accuracy:R1-UIA-001 | 01 §3; examples03 | explicit stop은 status=cancelled/stage=idle 로컬 선반영, POST snapshot 무시. POST 실패는 current generation이면 error/false, 원복 안함. cancelRemote helper의 오류 삼킴과 구분. UI04 owner에 동일 결과 전달 |

## 독립 검토 전 검증

- internal-pipeline.ts는 types.ts 단일 export 경유하며 standalone TypeScript strict/noUnusedLocals 검사 exit0.
- examples01~04는 JSON 문법 검증. 합성 HTTP/부분 assertions/server-private/internal adapter summary 범위를 명시했으며 live provider 결과가 아니다.
- 원본 확인: documents.mjs, sandbox-documents.mjs, sandbox-document-reader.py, document-quality.mjs, visual-transcription.mjs, review.mjs, useReview.ts, index.mjs, integrations/src/{gemini,sandbox,errors,task-pool,config,activity,command-progress}.mjs.
- 사내/외부 provider 호출, 원본 서버 실행·종료, 실물 end-to-end 악성 fixture 시험은 이 문서 수정에서 실행하지 않았다.

## 남긴 현재 한계

UI stop은 원격 kill 성공 확인이 아니다. process signal handler는 cleanup supervisor가 아니다. repair whole-context160 제한은 large initial merged context와 차이가 있다. per-cell preview truncation flag는 완전하지 않다. dashboard source item metadata는 손실된다. 이를 숨기거나 운영 코드를 변경하지 않고 baseline 재현 계약과 추가 구현 gate를 분리했다.

R2 동결 전 사전 교차 검토 반영: 3000은 셀 cap이 아닌 예시 길이로 정정,3000×3000은 save_image 보조 이미지에만 적용, callback 식별은 report.taskId(반환값 아님), 불완전 재조회는 source_limit/limited이고 일반 replacement 실패는 needs_review로 분리했다. 이 반영은 아직 독립 R2 최종 pass 판정이 아니다.

추가 사전 교차 검토: VLM limited는 cap 존재가 아니라 최종 stopReason membership으로 결정, golden criteria/target의 ledgerId truthy 검사와 all의 null/빈값 예외 구분, IgnoredSourceNote는 quote Evidence가 아닌 text+native citation으로 타입화했다. 신규 contracts/document-negative-cases.json의 DN-01~04는 구체적인 malicious archive/genuine VBA+link/nested DOCX+전치/two-document VLM fixture 제작 및 operation/assertion을 제공하며 기존 G03/G12 adapter protocol에 연결한다. 이 fixture들과 실제 provider 시험은 모두 NOT_RUN이다.

R2 blind 추가 확인: 01 §1은 run을 먼저 insert한 뒤 prune(terminal40+new open1→최종40)하는 순서,02 §2.2는 drawings omitted의 실제 warnings 배열/source limitation과 truncated 키 부재/image-only 예외까지 명시한다.

전역 재구현 정책 정합: observed DashboardSnapshotItem/SourceItem은 현재 손실 계약 그대로 유지하되, DB-H01은 새 구현 필수이므로 RequiredRebuildDashboardSnapshotItem/SourceItem/ReviewSnapshot을 별도 추가했다. presence의4값(present/missing/unreadable/unknown)과 optional missingVerified(없는 값/false 구별)를 frozen snapshot과 sourceItems에 보존한다. live run 병합이나 새로운 API discriminator는 추가하지 않는다. 이는 타입·설계 요구이며 운영 수정 완료 증거가 아니다.

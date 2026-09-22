# 대장 명세 수정 기록

수정 범위: `specs/05a-ledger-export.md`만. 원본 제품 코드는 변경하지 않았다. 이 문서는 저자 수정 기록이며 독립 평가자의 재평가를 대신하지 않는다.

| Round 1 이슈 | 수정 위치 | 수정 내용 / 근거 |
|---|---|---|
| core-clarity `R1-CORE-016`, core-accuracy `R1-CORE-019` | §2.3 step5, §4.1, LED-13/14 | 모든 human override→409라는 의미를 배제. 실제 proposal6필드 해시, 포함되지 않는 humanNote/audit/revision, 동일 status·다른 문서·첫5개/6500자 밖 변경을 구분. `source:server/ledger.mjs` ledgerProposal 및 createLedgerRouter.export, `source:server/review.mjs` resolve 확인. |
| ui-accuracy `R1-UIA-044` | §6.1 전체 palette/레이아웃 수치 | higher specificity charcoal-dialogs의 실제 값으로 교체. 과거 lime 예외 설명 삭제, 코발트 버튼/민트 상태/차콜 배경과 backdrop blur12px, focus 예외도 분리. `source:src/main.tsx`, `source:src/components/charcoal-dialogs.css` 공통 dialog 규칙과 ledger overrides, `source:src/components/ledger-modal.css` 크기/모션 기본 선언 대조. |
| 위 UI 모듈 상태 정확성 보강 | §6, LED-15 | busy 중 닫기/원본 링크 허용, 업로드 교체 중 기존 카드, 분석 후 도구 접힘, 재분석 메모 유지 vs 선택 변경 초기화,409 후 수동 재분석, mapping 불완전 응답, 구체 오류 문자열을 명시. `source:src/components/LedgerModal.tsx` beginOperation/analyze/exportCopy 및 JSX. |
| 최신 사용자 효율 설계 요구 | §9 | Set/배열/object/Buffer, 실제 O(T²) 다음 헤더 검색, O(N) 집계, ZIP 메모리와 CPU 비용, await 순서, UI operation lock/sequence, AbortSignal 적용/미적용 범위를 문서화. 없는 worker/global semaphore/index cache는 현재 기능으로 주장하지 않고 미래 최적화로 분리. |

## 다른 소유 파일에 필요한 동기화

- `specs/01-state-api.md` §9 및 §10: 사람 확인 이벤트 자체가 아니라 직렬화 proposal이 달라질 때 fingerprint mismatch409. §4.1로 연결해야 한다.
- `ui/detail-controls.md` D4.3: 과거 ledger lime 예외 설명을 현재 차콜/코발트/민트로 교체하고 §6.1을 최종 computed palette 계약으로 참조해야 한다.
- `specs/04-ui-motion.md`에 대장 예외 palette가 있다면 동일하게 제거한다. 구조 해석 dock은 analyze 요청 중에만 존재하며 export에서 새 activity context를 만들지 않는다.

## 실시한 확인

2026-09-21, 원본 `ledgerProposal`을 import한 합성 메모리 객체5사례:

1. 동일 status에서 humanNote/reviewedByHuman/audit만 변경 → 해시 유지.
2. 여섯 번째 non-pass 사유 변경 → 해시 유지.
3. 첫 non-pass 사유 변경 → 해시 변경.
4. fail→pass로 count 변경 → 해시 변경.
5. 다른 문서 항목 추가 → 선택 문서 해시 유지.

결과 **5/5 통과**. 이는 원본 코드의 계약 확인이며 재구현 제품 검증이나 실제 LLM/E2B 실행 증거가 아니다. 모션/색상은 CSS 선언 및 명시도 대조이며 새 브라우저 렌더 검증은 별도 visual reference 검증이 담당한다.

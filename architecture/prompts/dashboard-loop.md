# Dashboard request / repair prompt contract

The active CURRENT_REPRODUCTION sections preserve the frozen source's 14-field prompt and actual host parser. The OPTIONAL_FUTURE override linked at the end is an unimplemented enhancement and must not be applied to current reproduction. Use Gemini role `explore`, `maxOutputTokens: 2000`, and the request AbortSignal. No document bytes or full evidence are needed to plan presentation.

Build the following string literally, omitting optional blocks only when their condition is false. `JSON.stringify` is compact JSON. Each `slice` below counts JavaScript UTF-16 code units.

```text
DESIGN REQUEST:
{instruction || "파일별 결과를 쉽게 이해할 수 있게 차트 중심으로 정리해 주세요."}
CURRENT DESIGN (retain choices the user did not ask to change):
{JSON.stringify(normalizeDashboardDesign(baseDesign))}
UNTRUSTED DATA CONTEXT:
{JSON.stringify(context)}
Previous design plan: {String(previous || "").slice(0,8000)}
Validation feedback (fix only supported plan choices): {String(diagnostic).slice(0,3000)}
```

- `CURRENT DESIGN` block: include iff baseDesign is supplied. It **asks** the model to preserve unrelated choices; this is not an enforced preservation guarantee. Successful LLM output is **not** merged mechanically over baseDesign and drift in untouched fields is not currently validated. The explicit override function below additionally protects recognized positive requests. Failed generation uses `baseDesign || {}` then override, thus retaining unrelated choices deterministically in fallback.
- `context = {summary:snapshot.summary,partial:snapshot.partial,reviewedFiles:snapshot.documents.filter(d=>snapshot.items.some(i=>i.documentId===d.id)).slice(0,12).map(d=>d.name),exampleLabels:[...new Set(snapshot.items.map(i=>i.label))].slice(0,12)}`.
- Include both previous/feedback lines iff either value is truthy. Initial call omits them.
- `previous` is normalized JSON of the last parseable plan, or the last raw model text when parsing failed. `diagnostic` is sanitized and bounded; never send raw SDK errors or credentials.
- Parse output after removing a leading JSON fence and trailing fence; reject >8000 characters, invalid JSON, non-object/array, extra keys, non-string or overlong title/subtitle, invalid accent and enum values. Stored/baseDesign compatibility requires only title/subtitle/accent/focus/density. The other9keys may be absent: layout=balanced,distribution=doughnut,theme=dark,emphasis=balanced,chartSize=standard,legend=right,motion=full,corners=rounded,fileVisualization=cards. A5-field input and old7-field input both normalize successfully. null or invalid present enum values are rejected. The provider schema requests all14fields, but the same host parser also accepts a5-field fresh model response and fills9defaults. There is no additional14-field host completeness check.
- CURRENT_REPRODUCTION runs `applyDashboardPreferences(parsed, instruction)` after parsing. `reference/dashboard/design-functions.reference.mjs` preserves those observed algorithms. Its broad regex preference override is part of the current algorithm, including the limitations below. Do not replace it with the OPTIONAL_FUTURE planner.
- Budget is **3 plan calls total**, shared across JSON parse errors and sandbox validation repair. It is not 3 retries per step. IntegrationError is rethrown immediately; abort always wins over fallback. Sandbox validation failure returns the same sandbox's diagnostic to the next plan call; rebuild only HTML/plan files, never install dependencies again.
- The current system prompt asks for unsupported-trend limitations in subtitle. Preserve that prompt; the archived validated notices channel belongs only to OPTIONAL_FUTURE. Numeric groups do not enable a rendered trend chart.

Desired semantic examples (the model instruction's target, not a claim that every deterministic matcher wording achieves it):

| request | intended model dimensions (not a host guarantee) |
|---|---|
| 라이트 테마, 빨간 파이, 차트를 크게 강조, 애니메이션 없이 | light/red/pie/emphasis=charts/chartSize=large/motion=none |
| 막대 말고 도넛 | distribution=doughnut |
| 파일은 비교 막대로, 전체는 파이 | fileVisualization=bars, distribution=pie |
| 파란색 말고 초록색 | accent=#198b58 |
| existing light/red/pie + 범례 아래로 | preserve light/red/pie; legend=bottom |

These are semantic targets, not filename- or case-ID-specific branches. Frozen-source observations and OPTIONAL_FUTURE gates are separated in `contracts/dashboard-customization-cases.json` and `specs/05-dashboard-exports.md` D05/D11. The deterministic current helper outputs are the current pass oracles (not proof of semantic correctness): `Keep the dark page; make the charts light blue.` yielded light, `전체는 파이, 파일별 결과는 비교 막대로` yielded global bar plus file bars, `밤 테마` did not change an existing light theme, and `파일만 막대로` changed global distribution to bar but left file cards. DB-H02/03 are OPTIONAL_FUTURE and excluded from current acceptance.

## OPTIONAL_FUTURE 위치

The unimplemented envelope/judge/notice instructions are archived in [dashboard-future-options.md](../reviews/current-reproduction/dashboard-future-options.md). Do not append them to CURRENT_REPRODUCTION model calls.

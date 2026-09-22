# UI clarity review — round 02

**108/108 checks pass across all18 UI modules; open ambiguities0.** The original question IDs and population are unchanged. All34 R1 issues and4 R2 findings have recorded resolutions.

Sealed after the final author freeze at 2026-09-20 17:35:11 UTC; 36 package input hashes are recorded in the JSON. The review is independent and architecture-only. No original application source, app/server/provider execution or future acceptance run was used.

A clarity pass means the package defines implementable behavior and verification outputs under DECISIONS D18. Required rebuilt behavior supersedes observed defect fixtures. It does not mean browser tests, external integrations or the rebuilt product passed.

## Final decisions

- Required tooltip behavior now has exact clamped bounds, internal scrolling, repositioning, Escape/focus restoration and cleanup. The observed overflowing tooltip remains a negative control.
- Required table highlights now validate original source, record/anchor, quote and numeric boundaries before rendering; invalid locations retain item data and show a location-check chip.
- Handoff behavior includes actual payloads, exact canonical identity, dedupe-before-age ordering,25 scene variants and disconnect/OFF lifecycle.
- Required dashboard plans now expect red/subtle as requested. Separate fixed notices preserve subtitle; independent semantic judging and all retries share the three-call budget.

## Evidence boundary

- Pass means a clear implementable contract under DECISIONS D18, including required rebuild behavior where specified. It is not a claim that the original or a rebuilt application has executed or passed acceptance.
- All synthetic interaction cases and the dashboard 18-combination browser matrix are NOT_RUN. They provide input and expected-output specifications, not execution evidence.
- The visual manifest records actual synthetic fixture captures. Direct sample inspection covered settled target input, selected result detail, 1280×800 result detail and dashboard source; the report does not claim manual inspection of every capture.
- Observed source limitations are retained as investigation evidence. Where DECISIONS D18/required gates mandate improved behavior, the required oracle supersedes those defect outputs; neither source defects nor negative controls count as rebuilt acceptance pass.
- Additional live-review/results-list captures at 1600×960 and 1280×800 remain NOT_RUN acceptance; supplied baseline captures and future required captures are now distinguished.
- Final global freeze was announced by the main author before sealing. Final re-read included45 NOT_RUN interaction fixtures,25 scene variants,20 required table-highlight variants, required tooltip geometry and the corrected dashboard notice DTO extensions.

## Question-by-question assessment

### UI-01

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-01-C01 | PASS | Seven pages, four displayed steps, terminal/confirmation/target destinations and explicit return actions are defined; failed and cancelled do not impersonate successful results. Evidence: `specs/01-state-api.md` — §2–3; `specs/04-ui-motion.md` — §3 |
| UI-01-C02 | PASS | Generation/run/sequence/revision/localRevision gates distinguish stale GET, command snapshots and item resolve; version mismatch and duplicate events have exact rejection rules. Evidence: `specs/01-state-api.md` — §4.2; §6–7; `specs/07-data-algorithms-concurrency.md` — §7.9 EF-11 |
| UI-01-C03 | PASS | I1 and RESET-EXACT enumerate reset assignments versus incidental preserved state, upload/sample lock, back-to-criteria retention and optimistic stop; failed cancel does not restore running. Evidence: `ui/interaction-contract.md` — I1; `ui/interaction-fixtures.json` — CANCEL-01; UPLOAD-02; RESET-EXACT |
| UI-01-C04 | PASS | The 1800/1600/120/0ms choice, exact effect dependencies and last-change timer origin are explicit; TIMER-01 resolves restart versus absolute-deadline interpretations while backend status stays completed. Evidence: `specs/04-ui-motion.md` — §5.4; §9 UI-07; `ui/interaction-contract.md` — I1; `ui/interaction-fixtures.json` — TIMER-01 |
| UI-01-C05 | PASS | SSE snapshot recovery, current-generation failure banner, terminal connection close, late error rejection and start-failure destination are specified independently from remote cleanup. Evidence: `specs/01-state-api.md` — §3; §7; `ui/interaction-contract.md` — I1 |
| UI-01-C06 | PASS | The seven-page scenario, cancellation/reset fixtures, partial-result scenario and EF-11 stale-response case give observable destinations and rejection expectations. They are execution requirements, not executed results. Evidence: `specs/04-ui-motion.md` — §9 UI-01/UI-02/UI-08; `specs/01-state-api.md` — §10 cases 1–6; `specs/07-data-algorithms-concurrency.md` — §7.9 EF-11; `ui/interaction-fixtures.json` — CANCEL-01; RESET-EXACT; TIMER-01 |

### UI-02

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-02-C01 | PASS | Global dark tokens, per-result/theater status differences, final golden/ledger overrides and the white source-paper exception are explicit; final cascade takes precedence over obsolete base declarations. Evidence: `ui/tokens.json` — color; `ui/VISUAL-CONTRACT.md` — §1; §3; `ui/detail-controls.md` — D4.3; D5 |
| UI-02-C02 | PASS | Eager/main/lazy stylesheet order, specificity handling, runtime component bindings, exact dependency versions and fixed font-profile requirements make the visual inputs portable. Evidence: `ui/VISUAL-CONTRACT.md` — §1–5; `ui/style-catalog.json` — ordered CSS rules/declarations; `ui/component-style-map.json` — runtime graph, nodes, style bindings; `environment/README.md` — dependencies and fonts |
| UI-02-C03 | PASS | Storage on/off, default ON, storage failure, root data-motion and MotionConfig are defined alongside queue cleanup and non-replay when toggled back on. Evidence: `specs/04-ui-motion.md` — §8; `ui/interaction-contract.md` — I3; I5; `ui/VISUAL-CONTRACT.md` — §8 |
| UI-02-C04 | PASS | The global 280ms curve and per-component motion catalogue are subordinate to effective cascade; application OFF and OS media-query coverage are separately stated, including gaps. Evidence: `specs/04-ui-motion.md` — §5; §8; `ui/VISUAL-CONTRACT.md` — §1; §7–8; `ui/motion-catalog.json` — Motion and CSS effect records |
| UI-02-C05 | PASS | Desktop, short-height, 760/780px and component-specific breakpoints, independent scroll areas, active CSS list and excluded sky styles are explicit. Evidence: `specs/04-ui-motion.md` — §2.5; `ui/VISUAL-CONTRACT.md` — §3–6; `ui/tokens.json` — layout |
| UI-02-C06 | PASS | Required viewports, contrast/focus/motion assertions and quantitative geometry tolerances are explicit. Delivered references are distinguished from the unexecuted 15-state acceptance matrix; this pass rates the verification contract only. Evidence: `specs/04-ui-motion.md` — §9; `ui/interaction-fixtures.json` — VISUAL-VIEWPORTS; `ui/reference/manifest.json` — capture viewport/state/provenance; `ui/reference/README.md` — capture environment and limits |

### UI-03

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-03-C01 | PASS | The exact landing copy and two entry destinations distinguish criteria file entry from expense-example text entry; sample targets wait for approval. Evidence: `specs/04-ui-motion.md` — §3 intro; `ui/detail-controls.md` — D5; `ui/interaction-contract.md` — I1 |
| UI-03-C02 | PASS | Preview theater uses EXAMPLE and empty real documents/items; sample POST data enters application state only through its defined success path. Evidence: `specs/04-ui-motion.md` — §5.2 preview/live; `ui/interaction-contract.md` — I1; I3 |
| UI-03-C03 | PASS | Sample pending/success/failure now explicitly lists retained inputs, spinner/lock, preview clearing and sampleTargets; the missing sample epoch guard is disclosed. Evidence: `ui/interaction-contract.md` — I1; `ui/interaction-fixtures.json` — SAMPLE-01 |
| UI-03-C04 | PASS | Hero 700ms/y16, CTA delay120ms, badge delay220+45ms, theater delay200ms and reduced initial=false are specified in motion recipes/cascade. Evidence: `specs/04-ui-motion.md` — §5.3; `ui/VISUAL-CONTRACT.md` — §7–8; `ui/component-style-map.json` — LandingIntro motion recipes |
| UI-03-C05 | PASS | Intro renders separately from input/confirmation; failed sample loading retains page and old input, releases the lock and displays the error. Evidence: `specs/04-ui-motion.md` — §3; `ui/interaction-contract.md` — I1; `ui/interaction-fixtures.json` — SAMPLE-01 |
| UI-03-C06 | PASS | Landing references and DOM text plus sample/CTA acceptance define GSPEC, formats, natural-language guidance and example consistency. No provider call is inferred from the synthetic capture. Evidence: `ui/reference/manifest.json` — 01 and 29–30 landing captures; `specs/04-ui-motion.md` — §9 UI-01; `ui/interaction-fixtures.json` — SAMPLE-01 |

### UI-04

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-04-C01 | PASS | File/text requests are exclusive; target upload requires awaiting_documents and uses the approved criteria summary in the right pane. Evidence: `specs/01-state-api.md` — §2; §4.1–4.2; `specs/04-ui-motion.md` — §3; `ui/interaction-contract.md` — I1 |
| UI-04-C02 | PASS | Extensions, 12000-character text, role endpoints and file preview metadata are defined; the 20MB label is distinguished from server validation and no App client prescreen is invented. Evidence: `ui/detail-controls.md` — D5; `ui/interaction-contract.md` — I1; `ui/interaction-fixtures.json` — UPLOAD-01 |
| UI-04-C03 | PASS | Drag, locked/uploading, append/delete, preview open/close, mode switches and samples have explicit button and state effects, including existing-preview access during upload. Evidence: `ui/interaction-contract.md` — I1; `ui/interaction-fixtures.json` — UPLOAD-01/02; SAMPLE-01; GOLDEN-01 |
| UI-04-C04 | PASS | Upload art, file-row y6/input-stage y12 entrances, final styles and responsive stacking are supplied by the mapped visual catalogue and input references. Evidence: `specs/04-ui-motion.md` — §2; §5.3; `ui/VISUAL-CONTRACT.md` — §4–7; `ui/component-style-map.json` — UploadVisual and App input-stage; `ui/reference/11-target-input-empty.png` — settled target input |
| UI-04-C05 | PASS | Catalog/load errors, P10 PNG notice, loading close lock and empty target selection are explicit; all-mode is component-only and the empty criteria catalog C01 request is documented as a baseline defect. Evidence: `ui/detail-controls.md` — D5; `ui/interaction-contract.md` — I1; `ui/interaction-fixtures.json` — GOLDEN-EMPTY; GOLDEN-02 |
| UI-04-C06 | PASS | Criteria and target fixtures provide exact request bodies, role-filtered success, deletion/failure/empty outcomes; the page contract forbids mixed file/text transmission. Evidence: `ui/interaction-fixtures.json` — GOLDEN-01/02/EMPTY; UPLOAD-01/02; `specs/01-state-api.md` — §2 |

### UI-05

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-05-C01 | PASS | ID-scoped file grouping, up to eight path levels, sample nesting, implicit general criteria and unlocated sources are deterministic; duplicate filenames do not merge groups. Evidence: `ui/detail-controls.md` — D2.1; `ui/interaction-fixtures.json` — CRITERIA-TREE; `specs/07-data-algorithms-concurrency.md` — §7.9 EF-09 |
| UI-05-C02 | PASS | Draft serialization, numeric/qualitative choice, comparison and inclusive ranges, conditions/source/revision and count limits are explicit. The empty-source add-cap defect is separately preserved. Evidence: `ui/detail-controls.md` — D2.2; `ui/interaction-fixtures.json` — CRITERIA-LIMIT |
| UI-05-C03 | PASS | Selection, exclusion, uncertain assessments, revision reset versus same-props retention and per-source feedback states are enumerated, including all-excluded recovery. Evidence: `ui/detail-controls.md` — D2.1–D2.3; `ui/interaction-fixtures.json` — CRITERIA-REVISION; `specs/01-state-api.md` — §5 |
| UI-05-C04 | PASS | Collapsed rows, expanded edit controls, shared preview highlights and selected evidence are mapped to exact DOM/styles; settled criteria references give the intended density and independent scroll. Evidence: `ui/detail-controls.md` — D2.4; `ui/VISUAL-CONTRACT.md` — §4–6; `ui/reference/manifest.json` — criteria-confirm references 31–32 |
| UI-05-C05 | PASS | Invalid numeric/range/blank/condition drafts reveal errors and block confirmation; feedback failed/sent/applied and draft preservation are distinct. Evidence: `ui/detail-controls.md` — D2.2–D2.3; D6 detail-06–09; `ui/interaction-fixtures.json` — CRITERIA-REVISION; CRITERIA-LIMIT |
| UI-05-C06 | PASS | CRITERIA-TREE/REVISION provide IDs, sheet cells, expected hierarchy and re-feedback; detail fixtures cover exclusions and preview label supplements are explicitly non-mutating. Evidence: `ui/interaction-fixtures.json` — CRITERIA-TREE; CRITERIA-REVISION; PREVIEW-LABEL; `ui/detail-controls.md` — D6 detail-07–09 |

### UI-06

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-06-C01 | PASS | File list, map, drawers, coverage and activity hierarchy and source callbacks are defined, with separate context/checks/transcription transitions. Evidence: `ui/detail-controls.md` — D3; `ui/interaction-contract.md` — I7 |
| UI-06-C02 | PASS | Reader/context/coverage completion, raw units and separate transcription metadata are distinguished; hidden/merged/rotated regions and preview truncation do not imply full reading. Evidence: `ui/detail-controls.md` — D3.1; `ui/interaction-contract.md` — I7; `ui/interaction-fixtures.json` — ANALYSIS-SHEETS; ANALYSIS-PDF; `specs/07-data-algorithms-concurrency.md` — §7.3 |
| UI-06-C03 | PASS | I7 enumerates file labels/icons, active map, quality rounds/seals and empty outputs independently; limited or needs-review does not increment complete counts. Evidence: `ui/interaction-contract.md` — I7; `ui/interaction-fixtures.json` — ANALYSIS-EMPTY; ANALYSIS-SHEETS |
| UI-06-C04 | PASS | Phase 550ms, region 520ms with capped75ms stagger, 400ms drawer and active-only map arrows/nodes are numerically defined with reduced behavior. Evidence: `ui/detail-controls.md` — D3; `ui/interaction-contract.md` — I7; `ui/VISUAL-CONTRACT.md` — §7–8 |
| UI-06-C05 | PASS | The strict 28px log follow boundary, busy-to-idle collapse, manual reopen and truncated/uncertain source messages have explicit outcomes. Evidence: `ui/detail-controls.md` — D3.1–D3.2; D6 detail-10–11; `ui/interaction-contract.md` — I7 |
| UI-06-C06 | PASS | Hidden-sheet multi-region and rotated-PDF fixtures specify counts, reading/context fractions, warning seals and exact source callbacks; no renderer rotation is invented. Evidence: `ui/interaction-fixtures.json` — ANALYSIS-SHEETS; ANALYSIS-PDF; ANALYSIS-EMPTY |

### UI-07

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-07-C01 | PASS | Milestone order, counts from actual analysis/fields/nonpending items and theater/workroom/context geometry are explicit. Evidence: `specs/04-ui-motion.md` — §4.1; §2.3; `ui/interaction-contract.md` — I2; `ui/VISUAL-CONTRACT.md` — §4–6 |
| UI-07-C02 | PASS | The active-document precedence, approved empty criteria array semantics and every operation-phase fallback are defined. Evidence: `ui/interaction-contract.md` — I2; `ui/interaction-fixtures.json` — FLOW-INTERLEAVE |
| UI-07-C03 | PASS | Busy/observing/terminal/no-data context titles and expansion behavior are tabulated; records fall back to structure and each side paginates independently two per page. Evidence: `ui/interaction-contract.md` — I2; `ui/interaction-fixtures.json` — FLOW-STATE |
| UI-07-C04 | PASS | Context reveal240ms/page160ms and bridge2.2s/status2.6s require busy&&observing; OFF is static. Evidence: `specs/04-ui-motion.md` — §4.1; §5.3; `ui/interaction-contract.md` — I2; `ui/VISUAL-CONTRACT.md` — §8 |
| UI-07-C05 | PASS | Disconnected context shows last received data and stops its motion; the theater receives no connection prop and can retain ambience. Cancellation/partial data are not fabricated success. Evidence: `ui/interaction-contract.md` — I2; `specs/04-ui-motion.md` — §10 |
| UI-07-C06 | PASS | Interleaved two-file extraction/decision, no-output wait and state variants specify active file, operation, counts and context outputs; cases remain NOT_RUN. Evidence: `ui/interaction-fixtures.json` — FLOW-INTERLEAVE; FLOW-STATE; ARRIVAL-BURST |

### UI-08

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-08-C01 | PASS | The 1120×300 routes include the center fail line, all lanes, document stack and engine; mobile hides packet/station layers and stacks the remaining information. Evidence: `specs/04-ui-motion.md` — §5.1; `ui/VISUAL-CONTRACT.md` — §4–6; `ui/component-style-map.json` — ReviewTheater SVG recipes |
| UI-08-C02 | PASS | Live identity includes id/status/value/unit/label, initial/context baselines suppress replay, and only changed nonpending results generate verdict packets; preview loops are isolated. Evidence: `specs/04-ui-motion.md` — §5.2; `ui/interaction-contract.md` — I3 |
| UI-08-C03 | PASS | I3 specifies baseline resets, latest lane selection, six-packet sampling/dedupe order and field reservation while counts use all real items; the burst fixture fixes the retained order. Evidence: `ui/interaction-contract.md` — I3; `ui/interaction-fixtures.json` — ARRIVAL-BURST |
| UI-08-C04 | PASS | Verdict1800ms/extraction1300ms/stagger75ms, chip geometry, expiry padding and 350ms cleanup are explicit; state expiry is separated from visual duration. Evidence: `specs/04-ui-motion.md` — §5.1–5.3; `ui/interaction-contract.md` — I3; `ui/tokens.json` — motion.arrival |
| UI-08-C05 | PASS | Ambience and event-driven packets are distinguished. Mobile hides their visuals without stopping state/timers; OFF/context/empty clearing differs from terminal and busy=false. Evidence: `ui/interaction-contract.md` — I3; `specs/04-ui-motion.md` — §10; `ui/interaction-fixtures.json` — ARRIVAL-BURST |
| UI-08-C06 | PASS | Timestamped arrival and click fixtures fix counts, lane color/source card, noninteractive flying chips and maximum six; live selection opens inline evidence and preview cards remain inert. Evidence: `ui/interaction-fixtures.json` — ARRIVAL-BURST; THEATER-SELECT; `ui/interaction-contract.md` — I3 |

### UI-09

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-09-C01 | PASS | Observer-only GET/SSE and exact undefined/null/string run/context, cutoff/kind/name predicates plus all four call-site scopes prevent inferred execution or scope inheritance. Evidence: `ui/interaction-contract.md` — I4; `ui/interaction-fixtures.json` — DOCK-SCOPE; `specs/01-state-api.md` — §8 |
| UI-09-C02 | PASS | Running versus waiting parent, group identity/order, event cap and raw-order slice(-100) are defined; newest-first input retaining oldest100 is explicitly a limitation. Evidence: `ui/interaction-contract.md` — I4; `ui/interaction-fixtures.json` — DOCK-CAP; `specs/07-data-algorithms-concurrency.md` — §7.7; §7.10 |
| UI-09-C03 | PASS | Active transitions, manual selection, operation versus selected history, review-only autoCollapse default, exact800ms conjunction and offline elapsed freeze/reconnect jump are explicit. Evidence: `ui/interaction-contract.md` — I4; `ui/interaction-fixtures.json` — DOCK-COLLAPSE; DOCK-RECONNECT; `ui/interaction-fixtures.json` — DOCK-PREFERRED |
| UI-09-C04 | PASS | Real title/phase/detail and one-second wall elapsed are distinct from three-second nonheartbeat-output silence; no fabricated percentage or token stream is permitted. Evidence: `ui/interaction-contract.md` — I4; `ui/interaction-fixtures.json` — DOCK-LOG |
| UI-09-C05 | PASS | Snapshot10s, quiet15s, first-error immediate recovery, repeated4..60s backoff, idle no-poll and strict log<28px follow/latest button are specified with disposal guards. Evidence: `ui/interaction-contract.md` — I4; `ui/interaction-fixtures.json` — DOCK-LOG; DOCK-RECONNECT; `specs/07-data-algorithms-concurrency.md` — §7.7; `ui/interaction-fixtures.json` — OBSERVER-REFRESH |
| UI-09-C06 | PASS | Scope, caps, logs, collapse/reconnect and interleave fixtures define membership, executing/active counts, operation selection, elapsed and connection expectations without triggering actual work. Evidence: `ui/interaction-fixtures.json` — DOCK-SCOPE; DOCK-CAP; DOCK-LOG; DOCK-COLLAPSE; DOCK-RECONNECT; FLOW-INTERLEAVE |

### UI-10

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-10-C01 | PASS | I5–I6 specify both chamber selections/statuses, phase captions/icons, actual recent-three history semantics and complete SVG art geometry through the component catalogue. Evidence: `ui/interaction-contract.md` — I5–I6; `ui/VISUAL-CONTRACT.md` — §4; §7–8; `ui/component-style-map.json` — SandboxWorkroomScene/SandboxWorkScene SVG nodes |
| UI-10-C02 | PASS | Parent-first-running and explicit handoff eligibility, runtime/scope rejection and event-ID versus parent canonical key are explicit. HANDOFF-KEY resolves changed endpoints reusing the same event ID. Evidence: `specs/04-ui-motion.md` — §4.3; `ui/interaction-contract.md` — I5; `ui/interaction-fixtures.json` — HANDOFF-KEY; HANDOFF-LIFECYCLE; `ui/interaction-fixtures.json` — HANDOFF-DUP-TIME |
| UI-10-C03 | PASS | Session/file key, liveSince, first-live exception, baseline/history/group handling, finite age, FIFO caps and terminal/OFF/reconnect queue rules are specified without conflating component seen and queue seen. Evidence: `ui/interaction-contract.md` — I5; `ui/interaction-fixtures.json` — HANDOFF-LIFECYCLE; HANDOFF-20; `specs/07-data-algorithms-concurrency.md` — §7.7 |
| UI-10-C04 | PASS | 1400ms hold/1300ms travel/70ms trail and directional one-shot routes are defined; disconnect at500ms preserves900ms and pauses both timer and descendant/pseudo CSS position. Evidence: `specs/04-ui-motion.md` — §4.3; `ui/interaction-contract.md` — I5; `ui/VISUAL-CONTRACT.md` — §8; `ui/interaction-fixtures.json` — HANDOFF-20 |
| UI-10-C05 | PASS | The exact 20-transfer schedule retains H13…H20, counts omitted12, preserves actual results and suppresses duplicate/history/log transfers; OFF does not erase seen history. Evidence: `ui/interaction-contract.md` — I5; `ui/interaction-fixtures.json` — HANDOFF-20; HANDOFF-LIFECYCLE; HANDOFF-KEY |
| UI-10-C06 | PASS | SCENE-MAP now separately specifies25 phase/condition variants, including transcribe/context/repair/read/complete/dashboard validate, OFF, disconnected and waiting chambers, with stage/art/caption/loop expectations. Evidence: `ui/interaction-contract.md` — I6; `ui/interaction-fixtures.json` — SCENE-MAP; `decomposition/ui-modules.json` — UI-10-C06 |

### UI-11

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-11-C01 | PASS | PDF/image/table/text/link precedence, source links, sheet/hidden metadata, PDF controls and unsupported/empty preview branches are explicit. Evidence: `ui/detail-controls.md` — D1.1–D1.2 |
| UI-11-C02 | PASS | Document/missing/anchor/priority rules are explicit. REQUIRED_REBUILD I9.1 overrides observed coordinate bypass with source-digest, unique-sheet, full-bounds, quote/numeric-boundary and verified-record/anchor checks; failed item admission yields no colored cells and a position chip. Evidence: `ui/detail-controls.md` — D1.3; `ui/interaction-contract.md` — I9; `ui/interaction-fixtures.json` — PREVIEW-WRONG-CELL; PREVIEW-MISSING; `ui/interaction-contract.md` — I9.1 REQUIRED_REBUILD; `ui/interaction-fixtures.json` — TABLE-HIGHLIGHT-REBUILD |
| UI-11-C03 | PASS | Document reset, page prop integer guard, zoom1–2/0.25, sheets/chips and missing-location states are defined; the chip fractional-page exception and error are now separately specified. Evidence: `ui/detail-controls.md` — D1.1–D1.3; `ui/interaction-fixtures.json` — PREVIEW-PDF-FRACTION |
| UI-11-C04 | PASS | Canvas DPR≤2, scale/transform, ResizeObserver140px minimum, internal selected-evidence scroll and reduced instant behavior plus table sticky geometry are quantitative. Evidence: `ui/detail-controls.md` — D1.1–D1.4; `ui/VISUAL-CONTRACT.md` — §4–6 |
| UI-11-C05 | PASS | Load/render/text/image/truncated failures and retained source link are separate; loadingTask.destroy, renderTask.cancel, observer cleanup and stale-result guard prevent old document overlays. Evidence: `ui/detail-controls.md` — D1.1–D1.2; D6 detail-01/05 |
| UI-11-C06 | PASS | PDF/missing/multi-sheet/label fixtures remain explicit, while20 required table variants now fix accepted cells and wrong-cell/header/numeric/range/anchor failures; negative observed outputs are separately classified, not copied as product acceptance. Evidence: `ui/interaction-fixtures.json` — PREVIEW-LABEL; PREVIEW-LABEL-REJECT; PREVIEW-MISSING; PREVIEW-WRONG-CELL; `ui/detail-controls.md` — D6 detail-02–05; `ui/interaction-fixtures.json` — PREVIEW-PDF-PAGE; `ui/interaction-contract.md` — I9.1; `ui/interaction-fixtures.json` — TABLE-HIGHLIGHT-REBUILD |

### UI-12

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-12-C01 | PASS | The file→summary→source/list-or-detail hierarchy and applied-criteria tab membership/order/nonclickable article behavior are explicit; selecting detail replaces the list immediately. Evidence: `specs/04-ui-motion.md` — §2.4; §7; `ui/interaction-contract.md` — I8; `ui/reference/15-result-detail-fail.png` — settled selected detail |
| UI-12-C02 | PASS | File scoping and all-item highlights remain independent of list filter; required I9.1 admission further limits those highlights to verified source cells without changing item verdict/value/evidence. Evidence: `ui/interaction-contract.md` — I8; `ui/interaction-fixtures.json` — RESULT-SELECTION; RESULT-EMPTY; `ui/interaction-contract.md` — I9.1; `ui/interaction-fixtures.json` — TABLE-HIGHLIGHT-REBUILD |
| UI-12-C03 | PASS | The chooseFile/item/filter/clear/tab/external state table specifies all resets, scroll/focus restoration and filtered nonwrapping previous/next; resolve escaping filter changes filter to all. Evidence: `ui/interaction-contract.md` — I8; `ui/interaction-fixtures.json` — RESULT-SELECTION |
| UI-12-C04 | PASS | Selected-detail200ms/x12, bar350ms and <=780px order=-1 plus workspace section scrollTop0 are numerical; source and window scroll are distinguished. Evidence: `specs/04-ui-motion.md` — §2.5; §5.3; `ui/interaction-contract.md` — I8; `ui/interaction-fixtures.json` — RESULT-MOBILE; `ui/reference/34-result-detail-fail-1280.png` — settled desktop-short detail |
| UI-12-C05 | PASS | No target, no decision, working, document failure, empty filter, missing criteria and unmapped criterion outputs are enumerated; original preview remains available where a document exists. Evidence: `ui/interaction-contract.md` — I8; `ui/interaction-fixtures.json` — RESULT-EMPTY |
| UI-12-C06 | PASS | RESULT-SELECTION/MOBILE define navigation, focus and scroll restoration and full-source highlights; visual tolerance and required viewport matrix define bounds checks without claiming unexecuted states were captured. Evidence: `ui/interaction-fixtures.json` — RESULT-SELECTION; RESULT-MOBILE; VISUAL-VIEWPORTS; `specs/04-ui-motion.md` — §9 |

### UI-13

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-13-C01 | PASS | Compact detail and edit form element order, comparison/value/rule/reason/source/CTA and save/cancel controls are explicitly mapped to DOM/styles and settled detail references. Evidence: `ui/interaction-contract.md` — I8; `ui/VISUAL-CONTRACT.md` — §4–6; `ui/component-style-map.json` — Inspector; `ui/reference/15-result-detail-fail.png` — settled compact hierarchy |
| UI-13-C02 | PASS | Resolve passes exact item ID/status/note, success updates current item/summary and human stamp while machine provenance remains; source buttons use document/page/sheet/cell. Evidence: `specs/01-state-api.md` — §4.2; §7; `specs/04-ui-motion.md` — §7; `ui/interaction-contract.md` — I8 |
| UI-13-C03 | PASS | Item id/status/humanNote effect resets editing/note/error, compact heading focuses preventScroll, pending/disabled blocks editing and saving disables resubmit. Saving itself is not reset on item swap. Evidence: `ui/interaction-contract.md` — I8; `ui/interaction-fixtures.json` — INSPECTOR-SAVE |
| UI-13-C04 | PASS | Full220ms/y14 versus compact initial=false, comparison .85:1.15, gap/padding/type sizes and independently scrolling long detail are explicit in I8 and effective styles. Evidence: `ui/interaction-contract.md` — I8; `ui/VISUAL-CONTRACT.md` — §4–7 |
| UI-13-C05 | PASS | Whitespace/1000-char/error behavior and local cancel are specified. Cancel before save causes no mutation; cancelling an already pending request does not abort it and a late success can close a reopened form. Evidence: `ui/interaction-contract.md` — I8; `ui/interaction-fixtures.json` — INSPECTOR-SAVE; `specs/01-state-api.md` — §7 |
| UI-13-C06 | PASS | Current item consumers recompute summary/file counts/highlights after resolve; existing dashboard data remains its generation snapshot and requires regeneration to reflect changes. Evidence: `specs/04-ui-motion.md` — §6–7; `specs/05-dashboard-exports.md` — D02; D09; `specs/01-state-api.md` — §7; §10 |

### UI-14

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-14-C01 | PASS | Three KPIs, distribution, per-file bars and named item map hierarchy are defined; clicking an item selects its file/detail in the results tab. Evidence: `specs/04-ui-motion.md` — §6; `specs/05-dashboard-exports.md` — D10 ResultsVisuals |
| UI-14-C02 | PASS | Total/completed/attention/pending formulas, document input order, empty targets/orphans and zero-data neutral ring are explicit; decorative ring1 is not a real item. Evidence: `specs/04-ui-motion.md` — §6; `specs/05-dashboard-exports.md` — D10 ResultsVisuals; `specs/01-state-api.md` — §10 |
| UI-14-C03 | PASS | Legend/donut toggle, filtered tile exit and empty results remain defined; rebuilt tooltip lifecycle now follows I8.1 hover/focus persistence, scroll reposition, Escape latch and trigger selection. Evidence: `specs/04-ui-motion.md` — §6; §5.3; `ui/interaction-contract.md` — I8; `ui/interaction-contract.md` — I8.1; `ui/interaction-fixtures.json` — TOOLTIP-G13-REBUILD |
| UI-14-C04 | PASS | 650ms count/850ms donut/800ms bars/300ms tiles, 22ms capped stagger, hover/tap and application/OS reduced conditions are quantitative. Evidence: `specs/04-ui-motion.md` — §5.3; §6; `specs/05-dashboard-exports.md` — D10; `ui/VISUAL-CONTRACT.md` — §7–8 |
| UI-14-C05 | PASS | Required I8.1 supersedes observed overflow: exact276px cap/8px clamp, max-height/internal scrolling, resize/capture-scroll rAF, accessible focus/hover, Escape restoration+latch and cleanup have numeric viewport oracles; real zero counts remain zero. Evidence: `specs/04-ui-motion.md` — §6; §10; `ui/interaction-contract.md` — I8–I9; `ui/interaction-fixtures.json` — TOOLTIP-LIMIT; `DECISIONS.md` — D18 and original observation versus required rebuild policy; `specs/06-verification.md` — §4 G13; `ui/interaction-contract.md` — I8.1 REQUIRED_REBUILD; `ui/interaction-fixtures.json` — TOOLTIP-G13-REBUILD |
| UI-14-C06 | PASS | Recharts summary and react-chartjs-2 generated charts have separate roles and value/type/click/motion acceptance; their differing datasets are not conflated. Evidence: `specs/04-ui-motion.md` — §1; §6; §9 UI-05; `ui/library-effects.csv` — ResultsVisuals/custom dashboard library rows; `specs/05-dashboard-exports.md` — D06; D10 |

### UI-15

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-15-C01 | PASS | Default instruction, all four complete presets and replace semantics,1500-character limit and builder/workroom/preview/source/download flow are defined. Evidence: `specs/05-dashboard-exports.md` — D09; D09a; `ui/dashboard-interaction-cases.json` — preset and modal scenarios |
| UI-15-C02 | PASS | POST/baseDesign, immutable snapshot/sourceItems, bridge origin/source/token/item validation and five-entry write-order cache are exact. Required notice metadata is defined separately from14-field design and the frozen review snapshot. Evidence: `specs/05-dashboard-exports.md` — D02; D03; D07; D09; `specs/07-data-algorithms-concurrency.md` — §7.2; §7.7; `specs/05-dashboard-exports.md` — D05b; `contracts/internal-pipeline.ts` — RequiredRebuildDashboardNoticeMetadata/PublicReadyJobExtension |
| UI-15-C03 | PASS | D09a enumerates job×builder×workroom×resultView states, retry/old preview and actual successful job.design applied tags; standard fallback is identified. Required fixed notice text communicates unsupported/partial/unapplied customization below toolbar/tags without rewriting subtitle. Evidence: `specs/05-dashboard-exports.md` — D03; D09a; `specs/05-dashboard-exports.md` — D05b |
| UI-15-C04 | PASS | 240ms shell/260ms content, lazy source view, memo iframe, first-visit mount gate, retained already-viewed hidden chart and cleanup/reduced scope are explicit. Evidence: `specs/05-dashboard-exports.md` — D09; `specs/04-ui-motion.md` — §9 UI-10; `specs/07-data-algorithms-concurrency.md` — §7.7; `ui/VISUAL-CONTRACT.md` — §8 |
| UI-15-C05 | PASS | Poll-after-response1200ms, third consecutive failure, sequence/alive/abort, close-before-POST DELETE, blank ready HTML failure/old-preview retention and final handoff limit are specified. Evidence: `specs/05-dashboard-exports.md` — D03; D09a; `ui/dashboard-interaction-cases.json` — MODAL-01…08 |
| UI-15-C06 | PASS | Eight modal scenarios state timing, mounts/remounts, selection retention, reopen/regenerate and standalone download/bridge exclusion expectations. They are unexecuted fixture contracts. Evidence: `ui/dashboard-interaction-cases.json` — MODAL-01…08; `specs/05-dashboard-exports.md` — D11 |

### UI-16

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-16-C01 | PASS | All14 fields have closed enums/defaults and observable DOM/CSS/chart effects, including layout/density/focus and fileVisualization independently from overall distribution. Evidence: `specs/05-dashboard-exports.md` — D05–D06; `contracts/dashboard-design.schema.json` — properties/required; `contracts/dashboard-design.default.json` — all14 defaults |
| UI-16-C02 | PASS | D05a/b separates observed matcher output from required scoped changes. Corrected red/subtle targets, independent semantic judge, fixed request-time base, approved-field host merge and shared3-call budget determine new behavior without claiming perfect model interpretation. Evidence: `specs/05-dashboard-exports.md` — D04–D05; `contracts/dashboard-customization-cases.json` — preference cases and expected plans; `prompts/dashboard-system.md` — design-only constraints; `DECISIONS.md` — D18; `specs/05-dashboard-exports.md` — D05a REQUIRED_REBUILD; `contracts/dashboard-customization-cases.json` — PREF-C01/PREF-C03 required targetExpected |
| UI-16-C03 | PASS | Reading order for four layouts, focus modes, filters/file/item detail selection and zero/one/many/long-content cases have explicit behavior and sizing. Evidence: `specs/05-dashboard-exports.md` — D05–D07; `reference/dashboard/standalone-reference.css` — layout/detail/empty rules |
| UI-16-C04 | PASS | Light palette includes axis/tooltip, doughnut cutout versus pie, actual chart sizes, legend placement, corners and full/subtle/none/reduced settings are numerical. Evidence: `specs/05-dashboard-exports.md` — D05–D06; `reference/dashboard/chart-entry.reference.jsx` — chart options; `reference/dashboard/standalone-reference.css` — themes, sizes and motion |
| UI-16-C05 | PASS | Required unsupported-trend handling preserves subtitle and verdict data, emits validated fixed notice codes in the app and exported HTML, and distinguishes no approved intent/partial intent/generated success under the bounded planner-judge-repair budget. Evidence: `specs/05-dashboard-exports.md` — D02; D04; D08; `prompts/dashboard-loop.md` — bounded repair/fallback; `specs/07-data-algorithms-concurrency.md` — §7.6; `DECISIONS.md` — D18; `specs/05-dashboard-exports.md` — D05a REQUIRED_REBUILD; `contracts/dashboard-customization-cases.json` — PREF-C01/PREF-C03 required targetExpected; `prompts/dashboard-system.md` — unsupported trend limitation in subtitle; `prompts/dashboard-loop.md` — unsupported trend limitation in subtitle; `specs/05-dashboard-exports.md` — D05b fixed notices, render placement and budget; `contracts/dashboard-customization-cases.json` — plannerEnvelopeContract; semantic negative cases; notices |
| UI-16-C06 | PASS | Corrected required target plans, multi-step full14-field sequence, semantic negative cases and18 viewport/design browser cases provide consistent expected outputs. All execution statuses remain NOT_RUN; this passes specification clarity only. Evidence: `contracts/dashboard-customization-cases.json` — full plans;18 browser cases; `specs/05-dashboard-exports.md` — D11–D12; `DECISIONS.md` — D18; `specs/05-dashboard-exports.md` — D05a REQUIRED_REBUILD; `contracts/dashboard-customization-cases.json` — PREF-C01/PREF-C03 required targetExpected |

### UI-17

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-17-C01 | PASS | File tabs/counts, original source/evidence, item detail and bridge selectionVersion transition are fully mapped; source capture matches the intended hierarchy. Evidence: `specs/05-dashboard-exports.md` — D07; D10a–D10b; `ui/reference/25-dashboard-source.png` — settled source hierarchy |
| UI-17-C02 | PASS | D02 now explicitly separates observed normalization from REQUIRED_REBUILD DB-H01: frozen snapshot/sourceItems preserve presence and missingVerified, including false versus absent, and suppress contextual target evidence for missing items without live merge. Evidence: `specs/05-dashboard-exports.md` — D02; D10a–D10b; `ui/dashboard-interaction-cases.json` — source trace; `DECISIONS.md` — D18 REQUIRED_REBUILD priority; `ui/dashboard-interaction-cases.json` — projectionCases observed versus required outputs; `contracts/internal-pipeline.ts` — RequiredRebuildDashboardSnapshotItem/SourceItem |
| UI-17-C03 | PASS | D10a action table fixes file/source/filter/evidence resets and target-first source selection; external repeated item selection has an explicit selectionVersion trace. Evidence: `specs/05-dashboard-exports.md` — D10a; `ui/dashboard-interaction-cases.json` — eleven-step source trace |
| UI-17-C04 | PASS | 320ms/y6 uses app OR OS reduced; compact source, independent pane scroll, responsive geometry and retained chart state are explicit. Evidence: `specs/05-dashboard-exports.md` — D09; D10b; `ui/VISUAL-CONTRACT.md` — §4–8 |
| UI-17-C05 | PASS | Legacy missing sourceSnapshot disables switch with regenerate guidance; unknown messages/items and absent source/evidence do not create guessed highlights. Evidence: `specs/05-dashboard-exports.md` — D07; D09; D10a; `ui/detail-controls.md` — D1 |
| UI-17-C06 | PASS | The two-file source trace supplies exact selection/evidence/filter attributes, and DB-H01 projection cases supply required flag roundtrips and missing-target suppression independently of observed negative controls. Evidence: `ui/dashboard-interaction-cases.json` — source trace; `specs/05-dashboard-exports.md` — D10a; D11; `ui/dashboard-interaction-cases.json` — projectionCases REQUIRED_REBUILD |

### UI-18

| Question | Status | Reason and package evidence |
| --- | --- | --- |
| UI-18-C01 | PASS | Standard export URLs/menu and ledger upload→target/key→mapping confirmation→copy-download flow are complete and distinct from a persistent ledger product. Evidence: `specs/05a-ledger-export.md` — §1–2; §6–7; `ui/detail-controls.md` — D4 |
| UI-18-C02 | PASS | Ready/two-cell/basis/fingerprint gate, full mapping request, server-recomputed proposal and confirmed:true button meaning fix download authorization and old/new value display. Evidence: `specs/05a-ledger-export.md` — §2.3; §4–6; `ui/detail-controls.md` — D4.2 |
| UI-18-C03 | PASS | Serialized operation lock, sequence/abort, automatically extracted key and input-change invalidation versus note-only retention are explicit. Evidence: `specs/05a-ledger-export.md` — §6; `ui/detail-controls.md` — D4.1–D4.3 |
| UI-18-C04 | PASS | 230ms/scale.985/y14, inline scoped observer during analysis, final charcoal/mint cascade, mapping comparison and <=780px scrolling layout are specified. Evidence: `specs/05a-ledger-export.md` — §6.1–6.2; `ui/detail-controls.md` — D4.3; `ui/VISUAL-CONTRACT.md` — §3–8 |
| UI-18-C05 | PASS | XLSX/size/one-drop validation, blocked candidates, malformed ready response, close abort, empty blob and inline HTTP errors have exact labels and disabled/retry behavior while retaining original bytes. Evidence: `specs/05a-ledger-export.md` — §2; §6; `ui/detail-controls.md` — D4; D6 detail-12–14 |
| UI-18-C06 | PASS | LED cases specify wrong/duplicate keys, basis/fingerprint mismatches, unchanged-payload exception, exact two-cell mutation, original-byte invariance, filename and added user note. Evidence: `specs/05a-ledger-export.md` — §4.1; §5; §8 LED-02/05/07/08/09/12 |

## Preserved issue history

R1 reports remain unchanged. Resolution means the amended architecture contract was re-read, not that its implementation or acceptance test ran.

| Issue | Module | Status | Resolution |
| --- | --- | --- | --- |
| R1-UI-001 | UI-01 | resolved | I1 exact effect dependencies and TIMER-01 set the clock origin to the latest dependency change, with cancelled deadlines and final navigation time. |
| R1-UI-002 | UI-02 | resolved | VISUAL-CONTRACT §1/§3, tokens golden values and detail D5 fix the effective charcoal dialog and cobalt selection cascade. |
| R1-UI-003 | UI-02 | resolved | Effective style/component catalogues are normative; 04 motion values now match the documented cascade and per-component overrides. |
| R1-UI-004 | UI-02 | resolved | Settled replacements and 34-entry manifest separate supplied viewport references from future NOT_RUN live/list captures; sample PNG inspection confirms readable final opacity. |
| R1-UI-005 | UI-03 | resolved | I1 and SAMPLE-01 specify pending, retained input, success reset/target storage and failure; no epoch guard is falsely added. |
| R1-UI-006 | UI-04 | resolved | I1 and UPLOAD-01/02 specify drag, controls, preview exceptions, append/delete/failure/epoch behavior. |
| R1-UI-007 | UI-04 | resolved | D5/I1/GOLDEN-02 explicitly restrict App to criteria/target; all-mode is a component-only path. |
| R1-UI-008 | UI-04 | resolved | GOLDEN-01/02/EMPTY specify mode-specific request, role-filtered success, zero selection, deletion and current empty-catalog behavior. |
| R1-UI-009 | UI-05 | resolved | CRITERIA-TREE/REVISION supply file-ID groups, duplicate filenames, sheets/cells, hierarchy and re-feedback expected output; PREVIEW-LABEL preserves original Criterion. |
| R1-UI-010 | UI-06 | resolved | I7 and ANALYSIS-EMPTY specify independent file/quality/seal/no-data states and exact labels. |
| R1-UI-011 | UI-06 | resolved | ANALYSIS-SHEETS/PDF specify hidden and rotated source data, multiple regions, coverage fractions and source callbacks. |
| R1-UI-012 | UI-07 | resolved | I2 explicitly maps operation phases and precedence; FLOW-INTERLEAVE fixes active-file/count/context outcomes. |
| R1-UI-013 | UI-07 | resolved | I2/FLOW-STATE specify context expansion, paging and observing behavior; disconnected theater remains a separately disclosed limitation. |
| R1-UI-014 | UI-07 | resolved | FLOW-INTERLEAVE/STATE, ARRIVAL-BURST and DOCK-LOG supply timestamped interleave and silence expectations. |
| R1-UI-015 | UI-08 | resolved | I3 distinguishes OFF/context/empty cleanup from terminal/busy=false and mobile CSS hiding from continuing packet state/timer. |
| R1-UI-016 | UI-08 | resolved | I3, ARRIVAL-BURST and THEATER-SELECT fix exact six-packet order, full counts and live-card interaction. |
| R1-UI-017 | UI-09 | resolved | I4 and DOCK-SCOPE define exact scope predicates and all four call-site filter combinations. |
| R1-UI-018 | UI-09 | resolved | I4/04 specify default false and review true plus the complete 800ms auto-collapse condition. |
| R1-UI-019 | UI-09 | resolved | I4 and DOCK-LOG/SCOPE/RECONNECT define strict28px follow, latest-button behavior and expected observed task/clock state. |
| R1-UI-020 | UI-10 | resolved | I5 recent-three history and I6/icon/SVG catalogue establish exact chamber scene/art/caption hierarchy. |
| R1-UI-021 | UI-10 | resolved | I5 defines session/group keys, liveSince, first-live exception, FIFO limits and terminal/OFF seen behavior; handoff lifecycle fixtures make the transitions observable. |
| R1-UI-022 | UI-10 | resolved | I5/04/VISUAL §8 specify timer and CSS pause at disconnect, retained900ms after500ms and reconnect continuation. |
| R1-UI-023 | UI-12 | resolved | I8 and RESULT-SELECTION fix applied criteria membership/order and complete filter/tab/selection/previous-next transitions. |
| R1-UI-024 | UI-12 | resolved | I8/RESULT-MOBILE fix <=780 detail order and workspace-only scroll reset, motion/focus and preserved source scroll. |
| R1-UI-025 | UI-12 | resolved | I8 and RESULT-EMPTY/SELECTION supply distinct empty/error text, source availability and sequence outcomes. |
| R1-UI-026 | UI-13 | resolved | I8, INSPECTOR-SAVE, effective component/style maps and settled detail references specify edit/cancel/save races, typography and full-versus-compact motion. |
| R1-UI-027 | UI-14 | resolved | I8 documents the observed limit; required I8.1/TOOLTIP-G13-REBUILD now explicitly replaces it for G13 with clamped geometry, scroll/reposition, Escape and focus behavior. This is a future required implementation contract, not a source fix. |
| R1-UI-028 | UI-15 | resolved | 05 D09a and dashboard interaction cases provide all four complete preset strings and replace semantics. |
| R1-UI-029 | UI-15 | resolved | 05 D09a supplies job×builder×workroom×view matrix and appliedTag sourced only from successful preview.job.design. |
| R1-UI-030 | UI-15 | resolved | 05 D09a defines blank/missing ready HTML as failure, keeps old preview, performs no DELETE or automatic retry. |
| R1-UI-031 | UI-15 | resolved | Eight MODAL cases supply mount/selection/reopen/reconstruction/download oracles and timing while remaining NOT_RUN. |
| R1-UI-032 | UI-16 | resolved | Dashboard customization cases provide complex full plans plus18 viewport/design combinations with nine assertion categories each; executionStatus NOT_RUN remains explicit. |
| R1-UI-033 | UI-17 | resolved | 05 D02/D10a distinguish normalized ready snapshot pending→review from raw legacy pending and explicitly identify lost presence metadata. |
| R1-UI-034 | UI-17 | resolved | 05 D10a/b and the eleven-step source trace fix file/filter/source/evidence selection reset, responsive independent scroll and repeated same-item selection. |
| R2-UI-001 | UI-10 | resolved | Final frozen SCENE-MAP includes25 explicit variants with phase art/stage/caption and OFF/disconnected/waiting expectations. HANDOFF-LIFECYCLE separately provides9 concrete rejection/parent variants. |
| R2-UI-002 | UI-14 | resolved | I8.1 and TOOLTIP-G13-REBUILD define required 276px width cap/8px margin, border-box clamp/max-height/scroll, rAF remeasurement,120ms pointer transition, Escape focus+latch and full cleanup; TOOLTIP-LIMIT is explicitly excluded from product G13 acceptance. |
| R2-UI-003 | UI-16 | resolved | Final PREF-C01.targetExpected.accent is red and PREF-C03.targetExpected.motion is subtle; frozen observed cobalt/full values remain separate negative controls. D05a and required sequence agree. |
| R2-UI-004 | UI-16 | resolved | D05b introduces separate validated notices with fixed host text, app/export placement and no subtitle mutation. Packaged system/loop instructions explicitly supersede the old subtitle sentence. Planner/judge/public ready/standalone extensions and3-call budget agree. |

## Input seal

The seal command succeeded with18 modules and36 inputs. Single-report scoring validated current hashes and showed clarity100/open0 for every UI module. Combined acceptance still requires the separate accuracy/core reports; this report makes no universal correctness claim.

| Package input | SHA-256 |
| --- | --- |
| `DECISIONS.md` | `29b743be0d89e94fd4fc8ea9b3b176e73f4616bbbee342d9324f8a68b7c82049` |
| `contracts/dashboard-customization-cases.json` | `e96442f6086dbac69ec88248888645d14834ac5d237ccdf34fd8ea8aeb3fcdba` |
| `contracts/dashboard-design.default.json` | `db93eada45386a7950f1ccc41053d9fef1e3359731e4d83820e2482e85e0f997` |
| `contracts/dashboard-design.schema.json` | `cff7fd6863b65743e3c6fc66a04dae98902c5862e7bd95f5d860fb724d7b5892` |
| `contracts/internal-pipeline.ts` | `75785d4c71661d35235b321ad9794290cc67da67d57392a117c269dc33e7c70b` |
| `decomposition/core-modules.json` | `cf51606f635ef5acb090c59f46fcbae350d9b12697e2bbad8e9c372f6969162e` |
| `decomposition/ui-modules.json` | `9a0306aeaf8cc3c8d272e0ab69db893a06d8c9ef42e460be6e6b13e3ac8dffab` |
| `environment/README.md` | `20fef8d11b0370d911419b1c0ed3b101e548ce3a2617f04e8dd83d7c075196eb` |
| `prompts/dashboard-loop.md` | `056426a15df4ee452661a2be9681b50268afc8c1276c25747390162a3a26c97e` |
| `prompts/dashboard-system.md` | `9688c6e90d3923c3260a2f889d6934322e372e7fddc9f4312e4e8a927f21f091` |
| `reference/dashboard/chart-entry.reference.jsx` | `29899aaadfb8a47bc3662c3cef567743bc0f6582da2edaa077bbec1d468092b0` |
| `reference/dashboard/standalone-reference.css` | `3c663b94047f6e7a4d5e02e95b8de124a3ab100b7c046efb22971493aca10e80` |
| `specs/01-state-api.md` | `e17e736dc6725b61bdaa397564fe2a848add2438d097262c1edfdb4b18b54024` |
| `specs/02-backend-pipeline.md` | `6d718ab72e0b435cd417eb5e779ee97579f2472bb75bc87d0cc46d7a78fa11f5` |
| `specs/03-algorithms.md` | `30ff7f4c4b396182e2757ed2972067e6a1e4a5d07d2dc49c904da2b7c1c9d389` |
| `specs/04-ui-motion.md` | `739e58c015ade3318558b23d5cb4df23a3f0770fabc74e9b38e3e0466c2131d8` |
| `specs/05-dashboard-exports.md` | `167b8fc7110de3a87bc8af7513fcdc980b60542fe329d52b3091e90226c45743` |
| `specs/05a-ledger-export.md` | `7297f0024bc878c89422636202fa59f870363622926388372b800078990a4f80` |
| `specs/06-verification.md` | `c139c30d7cec0c23af1b0592af05e61fea842a7b8bcbf1c2208595e9164f2889` |
| `specs/07-data-algorithms-concurrency.md` | `c53218ec4b1d57bfa179442805762e8dd2dda300bd0df4623e39b61f74731678` |
| `ui/VISUAL-CONTRACT.md` | `24df36ea02ed3728f7b06b24d7c3f9cf6ce1d4ec6f03f2672d0fa4eb26841f6e` |
| `ui/component-style-map.json` | `22049ab566dd9d3fa9c340fd190d2662915be91184fb46632fca725980a25ce8` |
| `ui/dashboard-interaction-cases.json` | `3e0c645495dfbc3bbabf5e7da4f417a28fce9e1c0003709cc3b8f958ad8c6ac4` |
| `ui/detail-controls.md` | `e1214fcdd2eacf3bf2b60e42192159befe9574f72f634a6b3dd162199a3e53b4` |
| `ui/interaction-contract.md` | `d228621fadc5fb785387d31226bac07ef50583710325dab5664aaa330db4f9db` |
| `ui/interaction-fixtures.json` | `175dcf310c7e60da833fdcc7c4fdf2fa84b0fcbb2945a969c5d840f98d8de358` |
| `ui/library-effects.csv` | `25326c447363c184d174cc3d9c48e0aaf79cff3b7d7677d17f0cf821b5edb784` |
| `ui/motion-catalog.json` | `81f45c1ae0ef402d7944ca4acc2699da1216c333d7f06a2c856ca504489475e6` |
| `ui/reference/11-target-input-empty.png` | `31ef3ba4c7dd4e8909c2d3ffa596159acd5d154b99b73d9d669aa3116cba4dea` |
| `ui/reference/15-result-detail-fail.png` | `80397646cc72ef734637abbc54cb48a9966ce43fda3b011e15ddedee441259a6` |
| `ui/reference/25-dashboard-source.png` | `69f01be24cf3816001467ba5bde23ee0ae32e0042672e1aec322537cc2037c6f` |
| `ui/reference/34-result-detail-fail-1280.png` | `a2624e86766ab3e8aef63ea90462fedd7aeb026756eab939c41133bf4e7ef9c0` |
| `ui/reference/README.md` | `bed158bb1bdeb74e8674ffc0564d0eaf3522f314f9a6c4b75f04f3f50d8bb8a5` |
| `ui/reference/manifest.json` | `9f066974df90c7af348b2be59853d21377469cb02c4961057d831a358e3f7d72` |
| `ui/style-catalog.json` | `47e76196ad50d2a2f9e42b09e7842b98f77f46850af917ad2869bb76ad1a3527` |
| `ui/tokens.json` | `c55ff8220c494c81c553de4dddca55b628e34e51d1c7c12dbc78c65aef35cf37` |

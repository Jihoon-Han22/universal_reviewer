# Dashboard R1 author correction log

Author: `/root/architecture_dashboard_fix`. This is an author response, **not independent acceptance**. Original application files remain unchanged. Reviewer IDs below are qualified by report because CORE clarity/accuracy reuse numeric identifiers.

| R1 finding | Correction / exact destination |
|---|---|
| CORE accuracy020, clarity020; UI accuracy038 | 05 D01 is14fields. D12 and complete case plans enumerate the same14. Core verification owner must align06 G11. |
| CORE accuracy021; clarity017/018; UI accuracy039 | 05 D05 now lists actual regex scope failures, baseline precedence and DB-H02 supplemental semantic gate. contracts/dashboard-customization-cases.json PREF-C04..07 gives complete input/observed/desired plans. No fabricated semantic success. |
| CORE clarity019 | 05 D05/D11 and prompts/dashboard-loop distinguish prompt-only success preservation from deterministic fallback. PREF-RETENTION includes a valid drifting model plan and both exact outcomes; DB-H03 is not implemented in baseline. Root owns DECISIONS alignment. |
| CORE clarity011; UI clarity033 | 05 D02/D10 explicitly describe pending normalization and dropped presence/missingVerified. ui/dashboard-interaction-cases PROJ-PENDING/MISSING-TEXT/MISSING-NULL states exact data loss and target-evidence eligibility. DB-H01 is separate improvement gate. Live data is never mixed into frozen result to hide the defect. |
| CORE clarity013 | 05 D07 details preview token+frame+origin/channel/type/item allowlist, lifecycle binding, no runId on wire. Root owns registry question correction. |
| CORE clarity014 (shared) | 05 D04 limits dashboard command wrapper to owning start/end and forwarding observer info. Shared framing/dedup remains backend spec owner; no duplicate invented command policy. |
| UI clarity028; accuracy036 | 05 D09a + interaction JSON exact default and4full preset payloads, replace-not-append, noauto-generation, latest preview baseDesign at generate. |
| UI clarity029 | 05 D09a state table job/busy/finishing/builder/logs/preview, exact applied tag order and priority; tags reflect successful preview only. |
| UI clarity030 | ready+missingHTML preserves previous preview, logs/error, job staysready, noDELETE/noautomaticretry, finishes busyfalse; exact error specified. |
| UI clarity031; accuracy037 | D09/D09a and8modalCases specify iframe mount counts and260ms gate, source tab unmount vs iframe retain, reopen cache resets browsing context, export behavior, app-only shell reduced motion. Root/UI owner scopes hidden chart assertion. |
| UI clarity032; accuracy040 |10preference cases including3complex fullplans;18complete browser matrix cases withviewport,actualcanvas type/count/cutout/colors,theme surfaces,legend geometry,size/filter/detail/export assertions; all browser resultsNOT_RUN, not historic partial checks. |
| UI clarity034; accuracy041/042/043 |05 D10a direct-file/source/evidence/filter/repeated-selection state table; actual same-file selection nuance;3fr:2fr/min280/compact/31%/mobile/shortheight/independent scroll;11step two-file same-label/criteria cross-citation data-* oracle. |
| User latest efficiency request |05 D12 records actual Map/Set/WeakMap/arrays, O(I×D)/O(F×I) baseline scans, caps/memory, async dependencies, non-overlapping polling, cancellation generations, same sandbox repair reuse, synchronous CPU limitations and measured-only future optimizations. |

Ledger fixes are delegated and recorded separately in [fixes-ledger.md](fixes-ledger.md). Ownership:05a only for that writer; no production edits.

## Author checks

- JSON parse succeeded for new customization and interaction contracts.
-10deterministic preference cases compared with BOTH packaged reference `applyDashboardPreferences` and actual `server/dashboard-plan.mjs`:10/10 equal.
-18browser definition plans contain14fields, normalize exactly to expected plan, and remainNOT_RUN/evidence:null.
-These are contract/source agreement checks. No model/API/browser execution or rebuilt-product acceptance is claimed.

## Remaining cross-file coordination

- Root/API author: types.ts actual sourceItems projection;01ledger payload-only fingerprint invalidation; CORE14C05 no wire runId.
- Root/UI author: detail-controlsD4.3 charcoal higher-specificity palette;04hidden-chart rule excludes intentionally retained already-viewed iframe; pending/missing source projection exception crossreference.
- Root verification author:06G11 has14fields; separate DB-H01/02/03 desired hardening from baseline execution evidence.
- Independent round2 must decide whether these document corrections satisfy their original questions. This response does not mark any issue independently resolved.

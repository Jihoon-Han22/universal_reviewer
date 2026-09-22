# CURRENT_REPRODUCTION adapter

The frozen scope is `case-registry.json`: all 39 supplied modules and 243 questions, every named golden/v3/public-transform input, all 34 reference captures, and execution-specific environment/live/browser cases. Original question text and module-level traceability links are preserved. Multiple execution surfaces receive separate cases. Missing evidence stays in the denominator and cannot pass. This adapter does not edit the supplied validators, package, data, or environment.

`freeze-scope.mjs` prepares scope only. Run it once before execution, inspect changes, and freeze the resulting file. Never regenerate it to make failed execution disappear. It writes no PASS result. `adapter.test.mjs` supplies positive/negative controls of this new evidence plumbing; its test count is not product acceptance.

## Root implementation freeze

After all writers stop, the root uses the supplied `snapshotImplementation` and saves `.cache/rebuild/freeze.json`:

```json
{
  "schemaVersion": "1.0",
  "acceptanceProfile": "CURRENT_REPRODUCTION",
  "loop": "LOOP-001",
  "frozenAt": "actual ISO timestamp",
  "codeDigest": "actual snapshotImplementation digest",
  "registrySha256": "actual scripts/acceptance/case-registry.json SHA256"
}
```

All code, adapter helpers, and registry files participate in the supplied implementation digest. A changed source requires a new freeze and current-code observations. The supplied runner also verifies the package before dispatch; it will refuse PKG001 until the root's authorized package resolution is complete.

## External execution interface

For a gate create `.cache/rebuild/evidence/LOOP-NNN/Gxx-plan.json` **before** its execution. It must contain `schemaVersion:'1.0'`, `acceptanceProfile:'CURRENT_REPRODUCTION'`, `gateId`, `codeDigest`, `registrySha256`, `preparedAt`, and `cases`. Each case plan contains:

- `caseId`: exact registry ID; unknown IDs and duplicates fail.
- `inputs`: actual `{path,sha256}` file references, including every input fixed by that registry case.
- `baselineReferences`: one or more current `{path,sha256}` references from the registry case.
- `initialState`: actual starting-state description or object.
- `actions`: ordered, nonempty user/action/event or invocation sequence.
- `assertions`: nonempty `{name,pointer,operator,expected}` entries. `pointer` is a JSON Pointer into the later actual artifact. `operator` is `deepEqual` (default), `finiteWithin` with `[minimum,maximum]`, or `setEqual` with duplicate-free primitive arrays. Expected values must come from the owning current source contract, never from the new output.

After execution write `Gxx-observations.json` with:

```text
schemaVersion, acceptanceProfile, gateId, codeDigest, registrySha256,
planRef:{path,sha256}, command:[actual command/runner steps],
startedAt, endedAt, exitCode, origin, oracleAccess:false,
cases:[{caseId,state,startedAt,endedAt,actualRef:{path,sha256},artifactRefs:[...]}]
```

`state` is `passed`, `failed`, or `not_run`; a caller's `passed` declaration alone never passes. The adapter reads actual JSON, resolves each pointer, checks the frozen expected value, and retains all mismatches. Execution timestamps must be inside the gate interval and after implementation freeze; plan preparation must precede execution. All paths are project-relative ordinary files with no `..`, environment files, symlinks, junctions, or special files. All actual hashes are checked.

G03/G09 add positive safe-integer `providerCalls:{gemini,e2b}`, `providerTraceRef`, and `models`, `templates`, `versions` with the observed model/template/SDK metadata. The trace must contain redacted real provider operation evidence. G10/G11/G13 add `browser:{name,version,userAgent}` and `browserTraceRef`; each G10 reference-state record also requires PNG and DOM JSON artifact references. A synthetic capture may compare a synthetic reference, but its origin does not become live. G14 adds `independentReviewer:true`, `reviewerId`, `openCriticalHigh:0`, `openReproductionIssues:0`, and `reviewTraceRef`; it must cover all 243 question cases with independent inspection and rerun evidence.

Command cases (G00 package/selftests/portability), the 20 golden rule invocations, and supported baseline algorithm fixture bindings are executed directly by `runGate`. Other cases consume the real external observations above. Missing bindings remain NOT_RUN. An offline unit command cannot replace live or browser gate evidence. Diagnostic ideal-output matches do not replace current reproduction comparisons.

After recording observations, invoke the unmodified supplied runner:

```powershell
node architecture/validation/run-gate.mjs G02 ./scripts/acceptance-adapter.mjs . .cache/rebuild/gates/CURRENT_REPRODUCTION 3600000 CURRENT_REPRODUCTION
```

Detailed results are saved under `.cache/rebuild/acceptance-runs/LOOP-NNN/<runId>/<gate>/cases.json`; the root-owned gate runner and evidence index remain the authoritative final bookkeeping. Any absent case, missing provider/browser/reviewer evidence, wrong code/profile/input hash, skipped case or unsupported binding makes the gate non-passing.

## Actual implementation contract flow

`runContract(request,context)` validates original input hashes before creating a runtime, calls `DocumentStore.add`, drives the actual criteria-first `ReviewEngine.start → confirm → attachDocuments`, awaits real jobs, and projects actual findings. Confirmation is an explicit evaluator action recorded in the engine audit; no oracle correction is applied. Cancellation cancels that owned run. Coverage only uses explicit reader/context/covered-cell instrumentation; preview success, source cell inventory and result counts do not prove coverage. Missing instrumentation remains false/empty. No PDF/image citation is invented for the spreadsheet-only harness schema. Highlight projection is empty unless actual highlight evidence is separately provided.

Use `context.runtime.analyzer`, `context.analyzer`, or `context.createRuntime` for explicit deterministic dependency injection into the actual engine. For an authorized live run, use `context.providerMode:'live'` or explicitly launch with `GSPEC_ACCEPTANCE_PROVIDER_MODE=live`; the adapter composes `scripts/provider-runtime.mjs` with the real document analyzer, so the root's persistent budget guard is mandatory. The harness's `live` label by itself does not authorize or perform provider calls. With no explicit runtime the contract returns `ACCEPTANCE_RUNTIME_NOT_CONFIGURED`, not invented output.

The harness passes its document directory as `projectRoot`; the adapter always uses its own implementation root unless a direct caller supplies `implementationRoot`. Input scope and implementation scope are distinct.

## Complete-input offline reader slice

Run the pinned Node v24.13.1 with `scripts/acceptance/dataset-slice.mjs LOOP-NNN`. It saves a pre-execution plan for 70 document paths: every C01–C20 XLSX, P01–P13 PDF/PNG, L01–L06 XLSX, eight v3 reports, eight v3 criteria documents, and two distinct v3 templates. It invokes the actual DocumentStore before the trusted Python reader. A rejected upload cannot enter the reader through this harness. It uses `.cache/rebuild/python/Scripts/python.exe`, with bytecode generation disabled. The Python helper imports the product reader and maps only guest `/home/user/document-image-N.png` output paths into local evidence storage; original documents and oracle files are not modified or supplied to a model. Physical PDF inventory is measured separately, including original reports exceeding the current 20 MiB upload limit.

The scope retains all 70 paths, per-input hashes, actual upload/private-public projection, reader profile/coverage/images/warnings, input stability, relevant source hashes before and after, and the eight-report 575-page inventory assertion. The historical 60-path reports remain unchanged. Unexpected admission failures and unreached reader calls remain failures or NOT_RUN; the intended 64 admitted reads and six size rejections are expectations, not evidence of execution. Every full gate case remains `not_run`, with pending context/model/HITL/source/verdict/writer phases stated. The 35-field and 105-writer diagnostic denominators remain present with zero evaluated while those phases have not run. This is implementation subphase evidence, never G03 live evidence or a complete G06/G07 pass.

If the orchestration process records a nested Python `EPERM` after persisting uploads, preserve that attempt. Run the unchanged `dataset-reader.py` directly with the saved plan through the pinned Python, then `node scripts/acceptance/finalize-dataset-slice.mjs <preserved-plan-path>`. This finalizer reads existing records and hashes only; it does not retry any uploads, parsers or providers.

## Original ledger mapper and copy slice

`ledger-source-inventory.py` independently reads original L01–L06 ZIP/XML using Python standard libraries. It records source cells, formulas, protections, entry bytes and hashes without reading golden JSON or importing the product mapper. `node scripts/acceptance/ledger-slice.mjs LOOP-NNN` validates that inventory, writes a frozen pre-execution plan, then imports and invokes the real `analyzeLedger` and `writeLedgerCopy` sequentially on all six originals. It records actual mapping, writer output or rejection, source buffer/file hashes, code hashes, and timestamps. For the existing inspected sources, key `2026-0891` should produce four writable mappings, a duplicate-key block for L03, and a protected-sheet block for L06. Literal formula-like text and dollar tokens are data in the requested note.

After that process finishes, run `.cache/rebuild/python/Scripts/python.exe -B scripts/acceptance/verify-ledger-slice.py <saved-ledger-directory>`. This independent verifier reads the preplan and actual output bytes, checks mapping and blocked status, and compares every ZIP entry and worksheet XML outside the two intended cells. It also checks exact text, absence of formulas in targets, styles, and original source preservation. A ready mapping followed by a writer error fails; it is not accepted as a safe block. Failed attempts remain immutable and subsequent fixes require a new directory and execution. No Excel rendering, provider assessment, HTTP confirmation/proposal, or browser download is inferred from these subphase checks; full gate cases remain NOT_RUN.

## Public 13-variant semantic replay preparation

`node scripts/acceptance/prepare-public-replay.mjs LOOP-NNN` creates all 13 public cases and 26 input documents. The supplied generator's oracle stays in an evaluator directory and is never read by the preparation program. Only request metadata and copied original document bytes enter the runtime input area. This is a routing boundary, not an operating-system sandbox. The public fixed seed is not a sealed holdout claim.

Run the pinned Python with `-B scripts/acceptance/author-public-replay.py <input-manifest.json>` to inspect every copied XLSX using standard-library ZIP/XML and every CSV using the CSV parser. This process does not import the generator or any product module. It authors source-quoted context, eligibility, workbook-candidate, workflow-overlay, and target-item drafts. Numeric verdicts are not copied from the oracle. Blank/ND/unreadable/unit/condition semantics remain unresolved until an independent reviewer freezes current-behavior assertions. Draft source facts and authoring metadata must be retained for inspection and must not be sent as model output.

`prepare-public-replay-plan.mjs <input-manifest.json>` writes an exclusive, unresolved execution-plan template. Do not edit that artifact. Build a new reviewed execution plan once actual trusted-reader and workbook-helper outputs have been captured with source/code hashes. Complete every case's physical evidence references, exact sandbox command/file transport sequence, source-checked response sequence, current baseline references/reviewer trace, assertions, and implementation digest. The 13-case denominator cannot be reduced.

`public-replay-harness.mjs <plan> --check` is the default preparation-only mode. Missing prerequisites cause a nonzero result and every unresolved case stays NOT_RUN. No product module is imported by the check. `--execute` is explicit and requires all 13 cases to be prepared under the current code digest. It then drives the real DocumentStore, document analyzer, context validators, workbook discovery/grounding, ReviewEngine approval, target normalization, and contract projection. Only Gemini responses and file/command transport are test doubles. Physical profiles/details must be actual separately executed trusted-reader/helper outputs; replayed command transport never counts as E2B or package-install execution.

Response dispatch uses an ordered schema request plus literal assertions about observed source content. Case IDs, variants, filenames and digests cannot select semantic responses. Digests verify artifact identity only. A prepared response may bind `{"$identity":"document","role":"criteria"}` (or `target`) to the actual current document ID, or `{"$identity":"criterion","label":"actual source label"}` to a unique criterion ID produced by real discovery. Uncompiled draft metadata, unexpected requests, unused response/transport operations, stale artifacts and changed code fail closed. Model-declared information is not promoted into invented reader coverage or browser highlighting.

LOOP-004 completed a development replay of all 13 cases with 1,118 assertions, independently audited in `.cache/rebuild/review-backend-algorithms/g08-actual-replay-audit.json`. That run used installed Node v24.21.0, and is not final G08 evidence. Preserve its original artifacts and runtime qualification. Final acceptance still requires a fresh plan and replay with pinned Node v24.13.1 after the implementation freeze, current observation binding, and the actual gate runner. No G08 gate PASS is implied by the development replay.

### Actual public-input physical prerequisites

`node scripts/acceptance/prepare-public-physical.mjs <input-manifest.json>` writes a fresh immutable pre-execution plan with all 26 input hashes, independently inspected source-cell expectations, exact criteria range requests, applicable limits, and hashes of both unchanged product Python helpers. Then invoke the pinned Python directly with `-B scripts/acceptance/public-physical.py <saved-plan.json>`. This runs one process with sequential calls to the actual product entrypoints: 26 trusted-reader calls, 13 workbook inventory calls and 13 workbook range reads. There is no child-process retry, Gemini, E2B, browser or model replay.

An exclusive execution marker prevents accidentally rerunning the same plan. Each operation saves its actual profile/details or failure, start/end timestamps, stdout/stderr, original source hash, and physical assertions. The final report checks the full 52-call scope and hashes reader/helper/verifier code again. These artifacts establish the physical input prerequisite and source fidelity only; all 13 semantic cases remain unresolved and full gate passes remain zero. Future semantic replay must bind the exact recorded request/output pairs and independently reviewed response sequences to its own frozen execution plan.

`compile-public-replay.mjs <input-manifest.json> <physical-report.json>` verifies the exact physical input/program hashes, then writes a new immutable LOOP-004 plan with nine schema-checked response fixtures per case and the exact command/file test transport. Its source guards include each observed coordinate and literal value, including blank cells, units and conditions; labels alone are not sufficient. Workbook planning is bound to the actual inventory JSON and extraction to the actual helper cell records. Draft-only metadata is removed. CSV context uses the trusted reader's `CSV` sheet while CSV item citations omit the XLSX-only sheet field. All semantic cases remain unresolved until a separate independent review supplies current-contract assertions.

If the product's canonical range spelling differs from a previously executed request, the compiler retains the original evidence and emits an explicit single-call `supplementary-physical-plan.json`. Only after coordinating a local execution slot, invoke the pinned Python with `-B scripts/acceptance/public-physical-supplement.py <that-plan>`. It executes the unchanged helper once, retains failures, checks exact returned ranges and source cells, and records program/input hashes. A different request can never reuse a relabeled old helper output.

The contract projection's `criteriaComplete` comes only from the matching actual `run.criteriaDiscovery` report's `coverage.extractedCriteriaComplete`, whose producer is workbook discovery. It is not a document-analysis field, a criterion count, or a model-declared coverage assertion. Missing or mismatched discovery reports remain unobserved/false.

# G12 actual browser record

This is a collection contract, not browser execution evidence. The six G12 cases remain five actual document cases plus `G12:CORE-14-C05`. A missing browser case cannot be replaced by document tests, JSDOM, a screenshot, or a success flag.

The owning current contract is `architecture/specs/05-dashboard-exports.md`, lines 165–169: `sandbox="allow-scripts"`, `referrerPolicy="no-referrer"`, opaque origin, exact frame/channel/type/token/item membership, trusted click/Enter/space, listener replacement/removal, and a standalone HTML download without source files, source viewer, or bridge token. The record may also supply G05's existing `browser.bridge` projection; those gates retain separate cases and plans.

## Preparation and execution

Run `prepare` only after the root final implementation freeze. The resulting `G12-plan.json` is the plan reference for this record. Both the document run and browser run must start after `preparedAt`. Execute the real app served from that frozen implementation. Seed the declared synthetic source and frozen dashboard snapshot using the real preview host; do not replace its bridge or message listener. Use item ID `g12-item-a`, a harmless review quote `Synthetic review quote`, and an original-only source sentinel `GSPEC_G12_ORIGINAL_ONLY_SENTINEL`. Record the exact source bytes and seed input in the event log/trace or hash-referenced artifacts before interaction. The sentinel must exist in the source document and be absent from the downloaded HTML.

Capture the server startup **implementation** digest and serving process identity. They must match the final freeze and remain unchanged. A disk hash alone does not prove that a long-lived development server is executing that source. A combined visual-assets digest may be retained in addition, but cannot replace `snapshotImplementation(...).digest` in the required fields.

For click, Enter, and Space, reset selection so accepting the event causes an observable change. Use actual browser input APIs. A script-created `click`/`keydown` has `isTrusted=false` and is not positive evidence. Record the captured event and real parent message, selected item, source tab transition, and focused target. Do not make the production listener accept synthetic trusted events.

Exercise every negative independently while the expected current frame, token, and known-item set are controlled: `wrongWindow`, `wrongOrigin`, `wrongChannel`, `wrongType`, `wrongToken`, `unknownItem`, `staleFrame`, `staleToken`. Record the message fields, which single condition changed, relevant frame identity, and before/after host selection. Replacement must create an actual new preview; stale-token and stale-frame checks are distinct. Then unmount the modal and establish that the old listener has no effect. Forged message events are appropriate negative tests; label them as such.

Download using the actual host UI and capture the actual file bytes, suggested filename, MIME, and blob/object-URL lifecycle. Open that downloaded artifact in an isolated offline browser context, exercise its real filters/detail controls, inspect source-button computed visibility, and record every attempted external request. Never substitute a reconstructed renderer output for the downloaded bytes. Root browser authorization remains localhost-only; use an in-memory/local route of the captured bytes for the offline test if needed, with no external navigation.

## Record JSON

Every `*Ref` is `{ "path": "workspace-relative/path", "sha256": "64 lowercase hex characters" }`. The collector resolves safe paths and checks the referenced bytes.

Required top-level fields:

- `schemaVersion: "1.0"`, `acceptanceProfile: "CURRENT_REPRODUCTION"`, `caseId: "G12:CORE-14-C05"`, `origin: "actual-browser"`, `oracleAccess: false`.
- `loop`, `codeDigest`, `registrySha256` matching the root freeze/current registry, and `planRef` equal to the G12 plan reference.
- ISO `startedAt`/`endedAt`, ordered and after plan preparation; no future completion time.
- `browser: { name, version, userAgent, viewport: {width, height}, deviceScaleFactor }` from the actual launched browser. Strings are nonempty and dimensions/DPR are measured positive numbers.
- `providerCalls: { gemini: 0, e2b: 0 }`.
- `browserTraceRef`, `pngRef` (real PNG), `domRef` (captured JSON), `downloadRef` (actual downloaded HTML), `eventLogRef`, `sourceProvenanceRef`.
- `collectorPlanRef` binds the browser collector's pre-execution fixture/source/response/renderer references and `g12Binding.ref` to this exact G12 plan. An unbound development record cannot become final evidence by changing its plan reference afterward.
- `actual` in the shape below. All values are observations. A false/incorrect outcome must remain false/incorrect; the collector compares it to the predeclared assertions.

```json
{
  "bridge": {
    "positive": {
      "click": {"isTrusted": true, "accepted": true, "selectedItemId": "g12-item-a"},
      "enter": {"isTrusted": true, "accepted": true, "selectedItemId": "g12-item-a"},
      "space": {"isTrusted": true, "accepted": true, "selectedItemId": "g12-item-a"}
    },
    "rejected": {
      "wrongWindow": {"unchanged": true}, "wrongOrigin": {"unchanged": true},
      "wrongChannel": {"unchanged": true}, "wrongType": {"unchanged": true},
      "wrongToken": {"unchanged": true}, "unknownItem": {"unchanged": true},
      "staleFrame": {"unchanged": true}, "staleToken": {"unchanged": true}
    },
    "unmount": {"unchanged": true},
    "iframe": {"sandbox": "allow-scripts", "referrerPolicy": "no-referrer", "messageOrigin": "null"}
  },
  "download": {
    "nonempty": true, "mime": "text/html;charset=utf-8", "scriptCount": 2,
    "containsBridgeToken": false, "containsBridgeScript": false,
    "containsSourceDocumentSentinel": false, "containsDocumentURL": false,
    "containsSourceViewer": false, "sourceButtonsHidden": true,
    "externalRequests": 0, "containsExpectedQuote": true,
    "urlRevoked": true, "offlineFilterWorks": true, "offlineDetailOpened": true
  }
}
```

The JSON above shows the contract's expected shape/values only. Copying it into a record is not measurement. The validator derives the canonical projection from captured event/state tuples, hash-verified downloaded bytes and offline DOM, then requires the claimed actual result to agree. It counts real DOM script elements through inert parsing. A React bundle string containing `<script>` is not another element; expected script count remains two. Finalization never replaces these results with a weaker regex scan.

The preview-token set is derived from positive before-frame records, replacement old/current frames, retained unmount frame and final captured host frame. Both declared token arrays must match this set; download scanning uses the measured tokens directly. These short-lived app tokens are not provider secrets. Source-viewer absence and computed source-button visibility use the downloaded document's actual offline DOM and measurements.

`eventLogRef` must point to:

```json
{
  "schemaVersion": "1.0",
  "kind": "g12-browser-event-log",
  "events": [{"id": "click", "at": "ISO timestamp", "action": "Actual browser action description", "observed": {}}]
}
```

Required unique IDs are `seed`, `replacement`, `click`, `enter`, `space`, all eight negative IDs above, `unmount`, `download`, and `offline`. Additional uniquely named detail events are allowed. Each timestamp must be inside the outer execution window. The small JSON example above abbreviates the `observed` object; an empty object is invalid.

Positive rows require `before`, `after`, `sourceEvent`, `newEvents`, `message`, `newMessages`, `isTrusted`, `accepted`, and `selectedItemId`. The top-level positive rows also record their actual `frame`. The selected event/message must belong to the captured new arrays. The source event type/key/item, trusted flags, opaque origin, current frame/window, exact channel/type/token/item tuple and host selection/tab/focus transition determine the canonical result. After a bounded unsuccessful wait, explicitly null event/message and empty corresponding arrays are allowed; the actual false/null outcome is retained and fails its expected assertion.

Negative rows require `changedCondition`, `before`, `injection`, `after`, `validCounterpart`, and `unchanged`. The injected tuple changes only its specified guard, starts from B, and is followed by a native valid counterpart that independently selects A. Replacement records bind stale frame/token values. Unmount requires `beforeUnmount.observation`, `beforeUnmount.retained`, `closedBefore`, `closedAfter`, `injected`, `initialListeners`, and `activeAfter`; the removed production listener and restored baseline listener set are checked against observed operations.

The `seed` row has `fixtureRef`, `sourceFileRef`, `responseRef`, `htmlRef`; these match `collectorPlanRef` and contain the actual declared source bytes. `replacement` has distinct actual old/current frame objects. Cached remount may reuse a token; successful fresh replacement must create a different token and frame.

Download records contain `downloadRef`, byte count, MIME, `urlLifecycle`, all `previewTokens` and a frozen `inspection` snapshot. Offline fields remain null in that earlier snapshot. `urlRevoked` is measured from matching blob create/revoke operations; missing revocation remains false. Offline rows contain `offlineDomRef`, PNG/trace references, `controls`, `sourceControlCount`, all `attemptedRequests` (including blocked requests), `downloadHash`, `filteredCount`, and `detailOpened`. Filters are compared with the declared fixture populations; detail opening comes from actual DOM text. Missing filter/detail outcomes remain false rather than disappearing from evidence.

The collector fully parses PNG chunks/CRCs and inflated scanlines and binds dimensions to measured viewport/DPR. It opens trace ZIPs with CRC checks, parses Playwright JSON records and requires context/snapshot/paired action records. Host/offline DOM JSON must contain meaningful captured HTML and typed observations. These checks reject signature-only files and empty DOM. Parsing and record consistency do not authenticate browser execution by themselves; independent trace inspection remains required.

`sourceProvenanceRef` must point to:

```json
{
  "schemaVersion": "1.0", "kind": "g12-browser-source-provenance",
  "loop": "LOOP-005", "registrySha256": "current registry hash",
  "codeDigestBefore": "frozen implementation hash",
  "codeDigestAfter": "same frozen implementation hash",
  "serverCodeDigest": "same frozen implementation hash",
  "serverIdentityBefore": "actual startup identity including process/start time",
  "serverIdentityAfter": "same startup identity"
}
```

The concrete loop comes from the final freeze; `LOOP-005` here is only an example. Preserve raw startup provenance, process identity, browser network/console errors and failures as extra fields or references. No CSS/state patch, event-handler replacement, clipping, or reference-image substitution may be used to make a failed browser case look successful.

## Commands

Use the pinned executable from the project root:

```powershell
& '.cache/runtime/node-v24.13.1-win-x64/node.exe' scripts/acceptance/g12-runtime.mjs prepare --loop LOOP-005 --fixtures .cache/rebuild/g12-development/fixtures-loop005-r2/fixtures.json
& '.cache/runtime/node-v24.13.1-win-x64/node.exe' scripts/acceptance/g12-runtime.mjs documents --plan .cache/rebuild/evidence/LOOP-005/G12-plan.json
& '.cache/runtime/node-v24.13.1-win-x64/node.exe' scripts/acceptance/g12-runtime.mjs finalize --plan .cache/rebuild/evidence/LOOP-005/G12-plan.json --browser '<actual browser record relative path>'
```

Choose the loop named by the final freeze. Collection exit 0 means collection completed; it does not convert failed assertions into passes. Document collection has a one-execution lock; interrupted/failed attempts are preserved and must not be silently overwritten. `G12-observations.json` keeps all six cases. The owning acceptance adapter and independent review remain required.

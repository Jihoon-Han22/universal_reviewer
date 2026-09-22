# Universal Reviewer

A React document-review application with criteria confirmation, source evidence, Gemini extraction, E2B document processing, review exports, and generated dashboards. It runs locally with Node.js or on Sites with a Cloudflare Worker, D1, and R2.

## Install and build

Use Node.js 22.13 or newer. The current workspace was verified with Node.js 24.13.1.

```sh
npm ci
npm --prefix integrations ci
npm run build
npm test
```

The build creates `dist/`, copies PDF.js runtime resources into `public/pdfjs/`, and bundles the dashboard chart runtime into `server/assets/`. These generated files and installed dependencies are not committed. Local font files and their redistribution licenses are included.

## Run locally

```sh
npm run dev
```

The development UI uses port 5180 and proxies API requests to port 8787. For a built application, run `npm start`. The local Node server serves both the built UI and API, and binds to `127.0.0.1` on `PORT` (8787 by default).

Configure `GEMINI_API_KEY` and `E2B_API_KEY` in the server environment. Optional settings are `MODEL_EXTRACT`, `MODEL_EXPLORE`, and `E2B_TEMPLATE`. Credentials are never part of this repository.

Gemini requests also require the application's persistent provider-budget ledger. A fresh checkout deliberately reports `BUDGET_LEDGER_MISSING` until an operator supplies or explicitly initializes a ledger using the verified prior project spend. Keep that accounting state on private persistent storage; repository setup does not reset the project's cumulative budget. E2B accounting is separate.

## Deploy to Sites

The Sites build includes the frontend and the API; a separate Node backend is not required. `worker/index.mjs` serves `/api/*` through `server/sites/` and other requests through the static-assets binding. The adapter stores document bytes and complete snapshots in R2, with session indexes, revisions, execution leases, and the project-wide Gemini budget in D1. Tables are created automatically when their storage adapter is initialized. Keep the same D1 database and R2 bucket across deployments.

The selected Sites project is recorded in `.openai/hosting.json`. Its `d1` and `r2` fields name the required bindings:

| Binding | Resource | Purpose |
| --- | --- | --- |
| `ASSETS` | Built static assets | React application, fonts, and PDF.js resources |
| `DB` | D1 database | Session indexes, state revisions, leases, and provider accounting |
| `BUCKET` | R2 bucket | Original documents, analysis data, and saved run/dashboard snapshots |

Configure these server-side secrets in the selected Sites project before enabling live reviews. Never put their values in Git, the generated client bundle, or `VITE_*` variables.

| Secret | Requirement |
| --- | --- |
| `SESSION_SECRET` | A random secret of at least 32 characters. Preserve it across redeployments so existing session cookies remain valid. |
| `GEMINI_API_KEY` | Gemini provider credential. |
| `E2B_API_KEY` | E2B provider credential for document processing and dashboard verification. |
| `PROVIDER_BUDGET_SEED` | The complete preserved local budget ledger, transferred privately after the cutover below. It initializes D1 accounting once. |

Optional Worker variables are `MODEL_EXTRACT`, `MODEL_EXPLORE`, and `E2B_TEMPLATE`. Model choices must also match the checked-in budget policy; changing a model variable does not authorize an unpriced model. `SITES_TRUST_IDENTITY_HEADERS` is disabled by default. Enable it only when the deployment proxy guarantees that its authenticated-identity headers replace any client-supplied values.

### Move existing Gemini accounting to Sites

Finish outstanding local provider calls before cutover. Replace `YOUR_SITES_PROJECT_ID` with the selected project's `project_id` from `.openai/hosting.json`, then run:

```sh
node scripts/migrate-sites-budget.mjs --project-id YOUR_SITES_PROJECT_ID
```

The migration locks and validates `.cache/rebuild/provider-budget/ledger.json`, refuses pending reservations, and writes `sites-migration.json` beside it. It preserves all prior spend. New local Gemini reservations then fail with `BUDGET_MIGRATED`, including from already-running processes using this budget implementation. Repeating the migration for the same project and unchanged accounting is safe; migrating the same ledger to another project is rejected. Use `--directory PATH` only when the existing ledger is stored elsewhere.

Transfer the validated ledger to the Sites secret `PROVIDER_BUDGET_SEED` through private deployment tooling. The module exports `migrateSitesBudget` and `readSitesMigrationSeed`, whose returned `seed` can be passed directly to the secret API. The CLI intentionally does not print that seed or any provider credentials. Keep the preserved local ledger and migration marker; deleting the marker or initializing a second ledger would break the single accounting authority.

The Worker imports the seed only when D1 has no ledger or import receipt. Existing D1 accounting always wins over a later seed. If an imported ledger disappears, the Worker refuses provider calls instead of resetting spend from the seed; restore the latest accounting state. Gemini failures and interrupted calls remain charged or reserved conservatively. E2B usage remains separately accounted.

### Build, package, and publish

```sh
npm run build:sites
npm run test:sites
```

`scripts/build-sites.mjs` builds the client, embeds server text/Python resources, bundles the Worker, and writes `.cache/sites-output/` with `client/`, `server/index.js`, `server/wrangler.json`, and `.openai/hosting.json`. The generated Worker configuration uses Node compatibility and routes API requests to the Worker before static assets. Hosting `dist/` alone does not include this API.

Commit the exact source intended for release, ensure the working tree is clean, and then package the already-built artifact:

```sh
npm run package:sites
```

`scripts/package-sites.mjs` refuses an uncommitted working tree. It writes `.cache/universal-reviewer-sites.tar.gz` and `.cache/sites-release.json`, recording the Sites project and current Git commit. Rebuild after any source change before packaging; packaging does not rebuild the artifact.

Publish the archive through the Sites deployment tools for that project and commit. `scripts/push-sites-source.mjs` pushes `HEAD` to the Sites source repository using the short-lived credential JSON supplied by those tools over standard input. It accepts the returned `auth_mode`, `remote_url`, `branch`, and `token`, passes authentication to Git without storing the token, and must not receive credentials on the command line. Pushing to the GitHub remote and publishing a Sites deployment are separate operations; neither packaging nor a GitHub push deploys the site by itself.

For local Worker development, build first, provide private development secrets in the ignored `.dev.vars` file, then run `npm run dev:sites`. `sites.wrangler.json` uses local D1/R2 resources and persists emulator state under `.cache/sites-local`; its placeholder database ID is not a production binding. Do not start a second spending authority from a copy of the production seed. Offline Sites adapter tests use fake providers and do not require live credentials.

### Sessions, execution, and limits

The default session is a signed `__Host-reviewer-session` cookie with a 30-day lifetime and `HttpOnly`, `Secure`, and `SameSite=Strict` attributes. Document and job access is scoped to that verified session. This provides browser-session isolation, not an application login; access to the site itself follows the hosting platform's access settings. Clearing or expiring the cookie creates a new session, and changing `SESSION_SECRET` invalidates existing cookies. Stored objects are not automatically deleted when a cookie expires, and the cookie does not provide cross-device recovery. Mutating API requests must supply the exact same-origin `Origin` header.

Reviews and dashboard generation execute while their SSE connection is active. The API first persists a queued job; opening its events stream acquires a D1 execution lease and records that execution has started before calling a provider. Other connections observe saved checkpoints instead of running the same job. Keep the active review page connected until processing finishes. Closing the execution stream or losing its request cancels active work; this is not an unattended background queue.

Stored documents, snapshots, and completed results survive Worker replacement. An interrupted job already marked `executing` is not automatically replayed because its previous provider request may have been billed. After its lease expires, recovery reports the interruption; restart the review or regenerate the dashboard as appropriate. A job still marked `queued` may execute on a subsequent events connection. Saved checkpoints therefore do not guarantee automatic continuation after a reload, disconnect, or deployment.

The UI uploads selected files sequentially. Each file is limited to 20 MiB; the Sites upload endpoint also limits the combined file payload of one request to 20 MiB. A session can retain up to 100 documents and 250 MiB of original files. The distinct documents loaded for one review/API operation, including its selected criteria and target sources, must total at most **45 MiB** of original file bytes. Split larger selections into separate reviews; the 250 MiB storage allowance does not increase this execution limit.

## Included and omitted fixtures

Four named, synthetic JSON contracts are included under `architecture/` because the offline unit tests read them. The supplied raw document collections, evaluation answers, captured model outputs, screenshots, reconstruction evidence, local logs, and credentials are not published.

The repository includes `golden/`, `ralph-golden-v3/`, `architecture/`, the acceptance harnesses, and `artifacts/`. Install Git LFS and run `git lfs pull` after cloning to retrieve full binary and evidence files. All `.webm` and `.mp4` files are excluded at the owner's request, along with credentials, installed dependencies and reproducible local caches.

The Sites build includes the four data/evidence directories. Golden and materials examples read the deployed originals. Browse `/ralph-golden-v3/` for the benchmark or `/_project/` for the complete searchable file index and SHA-256 inventory. Large files are stored in 20 MiB content-addressed pieces and served at their original URLs with HTTP byte-range support; downloads preserve the original bytes. The 20 MiB review-upload limit still applies to the interactive review engine, independently of downloading larger benchmark originals.

`.env` is never committed or included in deployment assets. Runtime credentials belong in Sites secret environment variables. GitHub Actions secrets are separate and are only needed if an Actions workflow itself uses those credentials. The Sites source mirror contains LFS pointers; GitHub holds the LFS originals and the supplied deployment archive contains their complete built assets. `npm test` and `npm run test:sites` remain the offline test entry points.

`scripts/live-document-check.mjs` is retained because a unit test imports its authorization validator. Its live runner requires separate local plans, permissions, documents, and accounting state that are not included in this repository. Building or running the offline tests does not authorize live provider calls.

# Universal Reviewer

A React and Node.js document-review application with criteria confirmation, source evidence, Gemini extraction, E2B document processing, review exports, and generated dashboards.

## Install and build

Use Node.js 22.13 or newer. The current workspace was verified with Node.js 24.13.1.

```sh
npm ci
npm --prefix integrations ci
npm run build
npm test
```

The build creates `dist/`, copies PDF.js runtime resources into `public/pdfjs/`, and bundles the dashboard chart runtime into `server/assets/`. These generated files and installed dependencies are not committed. Local font files and their redistribution licenses are included.

## Run

```sh
npm run dev
```

The development UI uses port 5180 and proxies API requests to port 8787. For a built application, run `npm start`. The Node server serves both the built UI and API, and binds to `127.0.0.1` on `PORT` (8787 by default). A deployment must provide the Node process and route external traffic to it; hosting `dist/` alone does not provide the API.

Configure `GEMINI_API_KEY` and `E2B_API_KEY` in the server environment. Optional settings are `MODEL_EXTRACT`, `MODEL_EXPLORE`, and `E2B_TEMPLATE`. Credentials are never part of this repository.

Gemini requests also require the application's persistent provider-budget ledger. A fresh checkout deliberately reports `BUDGET_LEDGER_MISSING` until an operator supplies or explicitly initializes a ledger using the verified prior project spend. Keep that accounting state on private persistent storage; repository setup does not reset the project's cumulative budget. E2B accounting is separate.

## Included and omitted fixtures

Four named, synthetic JSON contracts are included under `architecture/` because the offline unit tests read them. The supplied raw document collections, evaluation answers, captured model outputs, screenshots, reconstruction evidence, local logs, and credentials are not published.

The Golden document picker and the materials sample depend on the omitted local `golden/` collection. Their documents must be supplied privately by an authorized operator. The generated expenses sample and user-upload flow do not need that collection. Machine-specific acceptance harnesses and their private evidence are also omitted; `npm test` is the public offline unit-test entry point.

`scripts/live-document-check.mjs` is retained because a unit test imports its authorization validator. Its live runner requires separate local plans, permissions, documents, and accounting state that are not included in this repository. Building or running the offline tests does not authorize live provider calls.

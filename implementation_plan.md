# Clinic OS — implementation plan

This is the build plan for the product described in `idea.md`. It locks the repo layout, the runtime, and the open-source stack. Later work follows this document instead of re-deciding the shape.

The system is a modular monolith with a few worker processes. The clinic’s rules, the approval gate, and the audit trail live in one place. Browsers, voice, and model calls sit behind small seams because those runtimes are genuinely different. Microservices, Kubernetes, and a second observability stack are out of scope until the limits in the last section are actually hit.

## Decisions

| Concern | Choice | Why this one |
| --- | --- | --- |
| Repo | One pnpm + uv monorepo | The console, the extension, the workflows, and the Python workers share one contract. Splitting repos would fork that contract. |
| Product API | Hono on Node 22, two entrypoints (HTTP and Temporal worker) from `apps/api` | The HTTP layer stays a thin adapter. Domain code does not import Hono. |
| Domain | `packages/domain` (TypeScript) | Rules, the write gate, and tenancy are pure enough to test without a browser or a model. |
| Schema | Postgres 16, Drizzle, row-level security | One system of record. RLS makes a missing `clinic_id` a database failure. |
| Workflows | Temporal | A referral waits on a human, a fax-back, a second phone attempt the next day, and a 15-minute chart build. Temporal already models sleep, signals, and retries. A job queue would grow into a worse copy of it. |
| Agent runtime | Python 3.12 worker on its own Temporal task queue | Docling, Playwright, and the LiveKit agents SDK are Python. The workflow code stays in TypeScript. |
| Browser | One Chromium container per session, CDP screencast | Take control needs a real browser the staff can see. Sharing a browser across clinics is the wrong isolation story. |
| Voice | LiveKit, self-hosted | Rooms, SIP, and agent dispatch are the phone product. PSTN is a SIP trunk plugged into LiveKit later. |
| Models | A `Model` port. Anthropic is the first production adapter. Gemini is the second. | The idea’s compliance story names both. Call sites ask for a purpose and a schema, not a vendor. |
| Documents | Docling inside the extract module | Packet sectioning is the inbox. Callers see fields, confidence, and missing items. |
| Auth | Better Auth, clinic = organization | Roles and sessions in Postgres. Clinic SSO is a later OIDC adapter on the same user table. |
| Objects | MinIO locally, S3 in production, same API | Faxes, screenshots, and audio never go in Postgres. |
| Telemetry | OpenTelemetry Collector into OpenObserve | Logs, metrics, and traces in one system. Apps cannot reach OpenObserve except through the collector, so redaction is not optional. |
| Product metrics | Postgres rollups read by the console | Daily counts of calls, faxes, and auths are clinic data. They are not logs. |
| Local and first production | Docker Compose | Every stateful dependency in this plan runs in Compose. Kubernetes waits until browser hosts need a scheduler. |
| Dev EHR | `apps/sandbox-ehr` and `apps/sandbox-payer` | Computer-use is developed against fixtures we own. A real EHR is a production session with the clinic’s own login. |

Node 22 LTS. Python 3.12. pnpm 9. uv for Python. Turborepo only schedules the JS tasks. Package scope is `@clinic`.

Redis is in Compose because LiveKit requires it. The API does not use Redis in v1. One API process delivers server-sent events in memory.

## What is deliberately a deep module

A module here means a small interface with a lot of behaviour behind it. The seam is where callers are allowed to stand. An adapter is a concrete thing that fills a seam. A seam exists only when two adapters are real (usually production and a test double, or two production backends).

| Module | Interface callers actually use | What stays inside | Adapters |
| --- | --- | --- | --- |
| Rules | `evaluate(packet, rules) -> Disposition` | STAT / symptomatic / screening, fax-back gaps, payer-to-provider routing, confidence | None. Pure. In-process. |
| Write gate | `commit(intent) -> Applied \| AwaitingApproval` | Autonomy dial, approval token, audit insert, refusal when confidence is low | Postgres in production. PGlite in tests. |
| Extract | `extract(document) -> Packet` | OCR, section split, field confidence, missing-item list | Docling. Fixture packets in tests. |
| Browser session | `open`, `observe`, `act`, `handoff`, `close` | Chromium, profiles, screencast, input forwarding | Session container. Scripted pages in tests. |
| Model | `complete({ purpose, schema, input })` | Prompts, retries, token limits, vendor errors | Anthropic. Gemini. Recorded fixtures in tests. |
| Voice media | `place(callPlan) -> CallResult` via a Temporal signal | LiveKit room, agent, disclosure, transfer | LiveKit. A fake that returns a scripted result. |
| Speech | used only inside the voice worker | STT, TTS, locale | faster-whisper + Kokoro for English on a laptop. A hosted pair before the language list in `idea.md` is claimed. |
| Object store | `put`, `get`, `signedUrl` | Key layout, encryption, retention | MinIO. S3. |
| Fax send | `send(packet)` | Cover sheet, destination, delivery status | Dev adapter writes the PDF back to MinIO. An e-fax provider when a clinic needs real fax. |

If the write gate were deleted, every workflow would grow its own approval check and its own audit line. That is the test that it is earning its place. Routes, React pages, and Temporal activity wrappers stay shallow on purpose: they decode input, call one of the modules above, and encode the result.

Internal seams stay internal. The activity log on a session (the “step started / deciding next action” trace from the product) is written by the browser session module. Callers do not pass a logger through the interface.

## Runtime

```text
                        ┌──────────── console (Next.js) ────────────┐
                        │  inbox, hub, session, voice, scribe, ROI  │
                        └───────────────┬───────────────────────────┘
                                        │ HTTPS + SSE
                                        │ screencast WS (browser only)
┌──────────────┐                ┌───────▼────────┐         ┌────────────────┐
│ Chrome panel │  device token  │  apps/api      │ signals │ Temporal       │
│ (extension)  ├────────────────►  Hono + worker ├────────►│  (workflows)   │
└──────────────┘                └───────┬────────┘         └───────┬────────┘
                                        │                          │ task queues
                    ┌───────────────────┼──────────────────────────┤
                    │                   │                          │
             ┌──────▼─────┐     ┌───────▼────────┐         ┌───────▼────────┐
             │ Postgres   │     │ agent-worker   │         │ voice-worker   │
             │ clinic db  │     │ Python         │         │ Python         │
             └────────────┘     └───────┬────────┘         └───────┬────────┘
                                        │ one container            │
                                 ┌──────▼────────┐          ┌──────▼────────┐
                                 │ browser-runner│          │ LiveKit       │
                                 │ Chromium      │          │ + Redis       │
                                 └───────────────┘          └───────────────┘

  MinIO holds blobs. OpenTelemetry Collector is the only path into OpenObserve.
```

Two databases on one Postgres server in v1: `clinic` and `temporal`. OpenObserve has its own disk volume and does not share this server. A full disk of traces must not take the product database down.

Browser sessions are the capacity limit. Each Chromium is about 1 GB of RAM. A clinic setting `maxConcurrentSessions` defaults to 4 in dev and 10 in production, matching the “ten screens” story. Extra work waits in Temporal. Take control sets a lease with a 30-second heartbeat. While the lease is held the runner applies staff input and refuses model actions. When the lease drops, the session pauses. It resumes on its own only when that workflow’s autonomy says so. The default is pause.

A chart write from the browser runner requires an approval token minted by the write gate. The runner rejects the activity without it. A bug in a prompt cannot skip the gate.

## Referral path, end to end

This is the first workflow. Prior auth, outbound calls, and scribe notes join it at the write gate. They do not grow their own.

1. A PDF arrives by upload or by the folder watcher. Both call `accept(blob, source)` and store the bytes in MinIO at `clinics/{clinicId}/documents/{documentId}`. The same sha256 for the same clinic returns the existing document.
2. A Temporal workflow `ReferralFlow` starts. The first activity is `extract` on the Python queue.
3. `Rules.evaluate` runs in the TypeScript worker. Disposition is one of: ready, fax-back, ineligible, needs-human. Fax-back builds the missing-item packet and calls `FaxSend`. It does not enter the staff queue.
4. Ready packets land in the inbox as `awaiting_review` unless autonomy for `referral.write` allows `commit` to apply them. v1 ships with `approve_all`.
5. Staff open the hub. Looks good calls `commit`. Reject and flag do too. Every decision is an audit row.
6. `commit` that applies mints a token and starts the chart activity. The browser runner logs into the sandbox EHR (or the clinic’s EHR in production) with the agent profile, fills the patient, and returns field-level results. The activity log is stored on the session and streamed to the console over SSE.
7. The workflow then places the outreach call through LiveKit if the rules say to call. The voice worker runs the screener and signals `CallResult` back. Two attempts, 24 hours apart, are timers on the workflow.
8. Dashboard counts come from a rollup table updated in the same transaction as `commit`, not from scraping logs.

Prior auth is the same shape: extract what the draft needs, `Rules` list the missing codes, the model may draft the necessity note only as a field on the draft, submit happens in a browser session after `commit`. Denial stores the staged appeal documents and waits.

Scribe audio lands in MinIO. The Python worker drafts a note. The note sits in the same review queue. Upload to the EHR is another browser activity with another approval token.

## Repo

```text
.
├── apps/
│   ├── api/                  Hono server + Temporal worker (one image, two commands)
│   ├── console/              Next.js clinic OS (lavender skin)
│   ├── marketing/            Next.js paper site
│   ├── agent-worker/         Python Temporal worker: extract, browser orchestration
│   ├── voice-worker/         Python LiveKit agent
│   ├── browser-runner/       Playwright image, one session per container
│   ├── extension/            Chrome MV3 side panel
│   ├── sandbox-ehr/          Static schedule + patient form for dev and CI
│   └── sandbox-payer/        Static prior-auth form for dev and CI
├── packages/
│   ├── domain/               Rules, write gate, repositories, autonomy
│   ├── contracts/            JSON Schema, the only cross-language contract
│   ├── db/                   Drizzle schema, SQL migrations, RLS policies
│   └── ui/                   Themes `paper` and `console`, tokens from idea.md
├── infra/
│   ├── compose.yml
│   ├── compose.override.yml  dev ports and Mailpit, not used in production
│   ├── otel/collector.yaml
│   ├── openobserve/          dashboard JSON, alert definitions
│   ├── docker/               one Dockerfile per image
│   └── scripts/              bootstrap, seed, redaction check
├── fixtures/
│   ├── referrals/            synthetic PDFs only
│   └── packets/              expected extract output
├── docs/adr/                 short records if a decision here is overturned
├── Makefile
├── package.json              pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── pyproject.toml            uv workspace root for the Python apps
```

`packages/contracts` is JSON Schema plus a small codegen step: Zod types for TypeScript, Pydantic models for Python. Workflows, activities, and the extension import those types. Hand-written duplicates are a review failure.

`packages/db` owns migrations. The API container runs them on startup in dev. Production runs them as a one-shot Compose service before `api` starts. Python never migrates.

`packages/ui` holds the tokens from `idea.md` and nothing about referrals. Marketing imports theme `paper`. Console imports theme `console`.

### API layout

```text
apps/api/src/
  server.ts              HTTP entry
  worker.ts              Temporal entry
  http/                  routes, SSE, auth middleware. No business rules.
  workflows/             ReferralFlow, PriorAuthFlow, OutreachFlow, ScribeFlow
  activities/            TS activities: rules, commit, audit, notify
  temporal.ts            client, task queues, signal names
```

Task queues: `clinic-ts`, `agent-py`, `voice-py`.

### Domain layout

```text
packages/domain/src/
  rules/                 evaluate, clinic rule schema, specialty presets
  write-gate/            commit, tokens, autonomy
  referrals/
  prior-auth/
  calls/
  scribe/
  tenancy/               clinic context, required on every call
  audit/
```

A function in `domain` that opens a socket or calls a model is in the wrong package. It receives the result of those calls as data.

### Python workers

```text
apps/agent-worker/
  worker.py
  activities/extract.py
  activities/browser.py      talks to browser-runner over a private HTTP interface
  clinic_contracts/          generated pydantic
apps/browser-runner/
  server.py                  open / observe / act / handoff / close
  Dockerfile                 Playwright base image, pinned Chromium
apps/voice-worker/
  agent.py                   LiveKit entrypoint
  speech.py                  STT/TTS adapters
```

The browser runner’s HTTP interface is private to the Docker network. It is not on the public ingress. Session tokens are single-use and bound to `clinicId` and `sessionId`.

### Console routes

These match the screens in `idea.md`, in the console theme (cool gray, mint active nav, blue primary, red for record and hang-up, yellow missing-field banner).

| Route | Screen |
| --- | --- |
| `/` | Dashboard counts: completed, pending, flagged, today |
| `/inbox` | Referral table, filters, details drawer |
| `/hub` | Extracted cards, Looks good / reject / flag |
| `/sessions/[id]` | Embedded screencast, Take control, activity log |
| `/prior-auth/[id]` | Draft, missing fields, generate note, submit |
| `/voice` | Agent roster, Start call, listening modal |
| `/scribe` | Record, note format, ready notes |
| `/settings/rules` | Specialty preset, payer routing, autonomy per workflow |
| `/settings/agents` | Named agents, disclosure script, voice, EHR login ref |
| `/settings/clinic` | Users, roles |

Marketing routes follow the sitemap in `idea.md`. The ROI calculator posts to `apps/api` and uses the same volume inputs the quote will use later. v1 can compute it in the browser from a shared function in `packages/domain` so marketing does not need the API to render a number.

### Extension

MV3 side panel. A device token, minted in Settings, identifies the clinic. Every 5 seconds it asks for pending fills. Actions: autofill, copy fields, mark transferred. It never holds the EHR password. The agent’s login stays in the browser runner.

## Data

Every tenant table has `clinic_id`. The app role sets `app.clinic_id` on the connection and RLS policies require it. A repository method that queries without that setting fails closed. Cross-clinic reads are a separate admin role used only by support scripts, and those scripts write an audit row.

Core tables:

| Table | Holds |
| --- | --- |
| `clinics`, `users`, `memberships` | Tenant, people, role: owner, manager, staff, auditor |
| `agent_profiles` | Name, job, disclosure, locale, voice id, secret ref for the EHR login |
| `workflow_settings` | Per clinic, per kind: `approve_all`, `threshold`, `auto`, plus `maxConcurrentSessions` |
| `clinic_rules` | Versioned JSON matching the Rules schema. Presets: GI, ophthalmology, blank. |
| `documents` | Object key, sha256, source, page count |
| `referrals` | Status, triage, disposition, confidence, document id |
| `packet_sections` | Kind, page range, summary |
| `extracted_fields` | Name, value, confidence. Values are PHI. |
| `review_decisions` | Who, what, when, comment |
| `prior_auths` | Draft, missing fields, status, auth number, appeal object key |
| `calls` | Agent profile, attempt, outcome, room id. Audio key, not the audio. |
| `scribe_notes` | Format, status, object key |
| `agent_sessions` | Workflow id, runner id, lease holder, status |
| `activity_events` | Product trace for the session panel. Ordered. PHI allowed here because it is the product, access-controlled, and not exported to OpenObserve. |
| `audit_log` | Append-only. Actor, action, subject ids, token id. |
| `metric_daily` | Counts by clinic, day, kind. Source for the dashboard. |
| `approval_tokens` | Hash, workflow id, expiry, used-at |

`audit_log` grants `INSERT` to the app role and nothing else. Updates and deletes belong to a role the app does not have. `extracted_fields` and audio objects are encrypted with an envelope key. Dev key comes from `CLINIC_DATA_KEY`. Production key comes from the cloud KMS in the same US region as the disks. EHR passwords are stored as secret refs, never as columns the console can select.

Statuses the UI is allowed to show, and no others: `extracting`, `awaiting_review`, `fax_back`, `ineligible`, `running`, `paused`, `approved`, `rejected`, `flagged`, `submitted`, `denied`, `appeal_filed`, `completed`, `failed`.

## Clinic rules

`ClinicRules` is the configuration object. A GI preset ships in `packages/domain` and is what the sandbox demo loads.

```ts
type ClinicRules = {
  version: number
  triage: { stat: string[]; symptomatic: string[]; screening: string[] }
  requiredDocuments: { when: string; need: string[] }[]
  exclusions: { colonoscopyWithinDays?: number; outsideServiceArea?: boolean }
  payerRouting: { payer: string; provider: string; timeOfDay?: "morning" | "end_of_day" }[]
  outreach: { maxAttempts: number; hoursBetween: number; screener: string[] }
}
```

`when` and the screener questions are structured, not free-form prompts, so a rule change is reviewable. The model is used to pull fields and to draft prose (necessity notes, SMS). Classification uses the rules. An unclear procedure code becomes `flagged` with a null code. The model is not asked to guess one.

## Docker

One Compose file. Profiles keep a laptop from starting Chromium and LiveKit when someone only wants the inbox.

| Profile | Services |
| --- | --- |
| `core` (always) | postgres, minio, temporal, temporal-ui, otel-collector, openobserve, migrate |
| `app` | api, worker (same image), console, marketing |
| `agents` | agent-worker, browser-runner, sandbox-ehr, sandbox-payer |
| `voice` | redis, livekit, voice-worker |
| `dev` | mailpit, and published ports |

`make up` starts `core`, `app`, and `agents`. `make voice` adds the voice profile. `make observe` prints the OpenObserve URL. `make seed` loads the demo clinic, the GI preset, and the synthetic packet. `make down` removes containers and keeps volumes. `make reset` removes volumes too.

Images are pinned by digest in production Compose and by minor tag in dev. Dockerfiles use multi-stage builds. The API image contains no Python. The browser image contains no application source beyond the runner. Secrets arrive as environment variables from a file that is not in git (`.env`, gitignored). Compose interpolates them. Images do not copy `.env`.

Suggested local ports, bound to localhost only:

| Service | Port |
| --- | --- |
| Console | 3000 |
| Marketing | 3001 |
| API | 4000 |
| Sandbox EHR | 4010 |
| Sandbox payer | 4011 |
| Temporal UI | 8080 |
| MinIO console | 9001 |
| OpenObserve | 5080 |
| OTLP gRPC / HTTP | 4317 / 4318 |
| LiveKit | 7880 |
| Mailpit | 8025 |
| Postgres | 5432 |

Production is the same Compose file on a US VM, without `dev`, behind Caddy for TLS. Browser runners scale with `deploy.replicas` on that host until memory is the constraint, then a second VM runs only `browser-runner` and joins the network over a private link. That second VM is the moment to revisit orchestration. Not before.

Resource sketch for the first production host (control plane and a few browsers together): 8 vCPU, 32 GB RAM, 200 GB SSD. Budget 10 GB for Postgres and Temporal, 20 GB for OpenObserve’s volume with a retention cap, the rest for Chromium. Audio and PDFs live in S3, not on that disk.

## OpenObserve

OpenObserve is the metrics, logs, and traces system. Prometheus, Grafana, Loki, and Jaeger are not installed beside it.

Path:

```text
api / worker / agent-worker / voice-worker / browser-runner / console
        │  OTLP
        ▼
  otel-collector          redaction, batching, tail sampling
        │  OTLP/HTTP
        ▼
  OpenObserve             volume oo_data, its own disk
```

Applications set `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`. They have no OpenObserve credentials. The collector is the only client of OpenObserve, using a basic auth header from `ZO_ROOT_USER_EMAIL` and `ZO_ROOT_USER_PASSWORD`. Local auth is `admin@localhost` / a password in `.env`. The collector config lives in `infra/otel/collector.yaml` and is the allowlist.

Redaction in the collector, before export:

- Drop attributes and log bodies that match phone numbers, emails, SSNs, member ids, and any key in a denylist: `patient_name`, `dob`, `address`, `member_id`, `transcript`, `prompt`, `completion`, `pdf_text`, `audio`.
- Span names are static (`extract`, `browser.act`, `write_gate.commit`). Ids on spans are `clinic_id`, `workflow_id`, `session_id`, `document_id`. Those are opaque ids.
- A CI script sends a fixture span that contains a fake SSN and fails the build if OpenObserve’s query API can find it.

Product activity (`activity_events`) is queried from Postgres by the console. It is not duplicated into OpenObserve. Support can debug a session from the product log without putting PHI in the telemetry store.

### Telemetry each process emits

| Signal | Examples |
| --- | --- |
| Traces | One trace per Temporal workflow, span per activity. Browser `act` spans include the action type and the duration, not the screenshot. |
| Metrics | Below. |
| Logs | Structured JSON, level, message, ids. No document text. |

Metrics, all with `clinic_id` as a low-cardinality label (uuid) and no patient labels:

| Metric | Type | Use |
| --- | --- | --- |
| `referral_extracted_total` | counter | Throughput of the inbox |
| `referral_disposition_total{disposition}` | counter | Ready vs fax-back vs flagged |
| `write_gate_outcome_total{outcome}` | counter | Applied vs awaiting vs refused |
| `browser_sessions_active` | gauge | Capacity |
| `browser_act_duration_seconds` | histogram | Stuck sessions |
| `extract_duration_seconds` | histogram | Packet size problems |
| `model_duration_seconds{purpose}` | histogram | Cost and latency, purpose is `extract` or `necessity` or `note` |
| `voice_call_duration_seconds` | histogram | |
| `voice_call_total{outcome}` | counter | Completed, transferred, failed |
| `workflow_failed_total{type}` | counter | Page-worthy |
| `http_server_duration_seconds{route}` | histogram | API golden signal |
| `approval_wait_seconds` | histogram | How long staff take to clear the queue |

Dashboards checked into `infra/openobserve/`:

1. **API.** Request rate, error rate, latency, by route.
2. **Workflows.** Started, failed, approval wait, disposition mix.
3. **Browsers.** Active sessions, act latency, handoff count, failures.
4. **Voice.** Active rooms, call outcomes, setup time.
5. **Pipeline.** Extract latency and model latency.

Alerts, routed to a single webhook (Slack or email) in production:

- Workflow failure rate above 5% for 10 minutes.
- Any browser session active longer than 30 minutes.
- `browser_sessions_active` at the host cap for 5 minutes.
- API error rate above 2% for 5 minutes.
- Extract p95 above 2 minutes for 15 minutes.
- OpenObserve disk above 80%.

Retention: traces 7 days, logs 14 days, metrics 30 days. Local Compose uses the same numbers on a small volume so a forgotten `make up` cannot fill the disk. The OpenObserve image tag is pinned. Ingestion is OTLP/HTTP to `http://openobserve:5080/api/default`, which is the documented endpoint. The collector appends the signal path.

Console web vitals and session replay are not enabled. A browser SDK that records the hub would record PHI. If product analytics are needed later, they are first-party events in `metric_daily` with ids only.

## Security and tenancy

- TLS terminates at Caddy. Internal Compose traffic stays on the Docker network.
- Better Auth sessions are httpOnly cookies, `Secure` in production, clinic chosen per session. Auditor role is read-only and cannot call `commit`.
- Service principals for workers are per clinic, short-lived, minted by the workflow, and useless after the workflow closes.
- Uploads are size-capped (50 MB) and content-type checked. PDFs are stored, not served from the app origin. Downloads are short-lived signed URLs.
- Sandbox EHR and payer are not deployed in production Compose.
- Backups: nightly `pg_dump` of `clinic` to the object store, encrypted, 30-day retention. Temporal’s database is included. OpenObserve is not backed up as clinic data. A restore drill is part of the phase that first holds real clinic data.
- Subprocessors that can see PHI are listed in `docs/subprocessors.md` the moment they are turned on: the model vendor, the hosted speech vendor if used, the e-fax vendor if used, the cloud region. OSS components running in our VPC are not subprocessors.
- No training on clinic content. Model adapters send the minimum fields for that purpose and set the vendor’s no-train flag. Prompts are not logged.
- Clock is UTC. Clinic time zone is a column used only for display and for “end of day slot” rules.

## Testing

Tests sit on the module interface. A test that reaches into Docling or Playwright to assert a private call is testing past the seam and should be deleted when the interface test exists.

| Seam | How it is tested |
| --- | --- |
| Rules | Table tests in `packages/domain`. GI preset fixtures. No I/O. |
| Write gate | PGlite, including an RLS test that a second clinic id cannot read the first clinic’s referral. |
| Extract | Fixture packets. One nightly test runs Docling on a synthetic PDF. |
| Browser | Fake session in unit tests. One Compose test drives `sandbox-ehr` and asserts the patient form fields. |
| Workflows | Temporal’s time-skipping test environment. The 24-hour retry does not take 24 hours. |
| Voice | Fake `CallResult` signal. A manual LiveKit test is documented, not required in CI. |
| Contracts | A fixture JSON is parsed by both Zod and Pydantic in CI. |
| Redaction | Collector fixture described above. |
| Console | Playwright against the sandbox, happy path only: upload, review, Looks good, session reaches `completed`. |

CI on GitHub Actions: install, lint, typecheck, domain tests, contract tests, then a Compose job for the sandbox browser test. gitleaks on the diff. No real clinic credentials in CI.

## Build order

Each phase ends when its exit check is true on a laptop with `make up`. Phases are sequential. Marketing visual polish can proceed beside phase 1 and does not unblock anything else.

### Phase 0 — Repo and runtime

pnpm and uv workspaces. Compose `core` comes up healthy: Postgres, MinIO, Temporal, collector, OpenObserve. `make up` without `agents` serves a console shell and an API health check. A test span arrives in OpenObserve with `clinic_id` and without a planted fake SSN. Drizzle migration creates `clinics` and the audit table. Better Auth can sign in a seeded user.

Exit: a new clone follows the README from `make up` to a logged-in empty console and a trace in OpenObserve.

### Phase 1 — Inbox, extract, rules, review

Upload a synthetic GI packet. Extract activity returns sections and fields. Rules mark it STAT or fax-back. Hub shows the card. Looks good, reject, and flag write audit rows and change `metric_daily`. Autonomy is `approve_all`. No browser yet. The details drawer and the status chips match the inbox described in `idea.md`.

Exit: the Compose browser test is not required yet. The domain test plus an API test cover upload → awaiting review → approved, and fax-back never enters the hub.

### Phase 2 — One browser session

`sandbox-ehr` patient form. Browser runner opens it, screencast shows in `/sessions/[id]`, activity events stream over SSE, Take control lease pauses the model, approval token is required for the save action. Workflow finishes `completed` only after the sandbox page contains the extracted fields.

Exit: Playwright happy path from phase test plan, on CI.

### Phase 3 — Rules a clinic can edit

Settings screen writes a new `clinic_rules` version. GI preset is the default demo. Payer routing and required documents change a disposition without a code change. Specialty preset for ophthalmology is the second fixture, even if its browser flow is still the sandbox form.

Exit: editing a required document in Settings changes fax-back behaviour in the domain test and in the running demo.

### Phase 4 — Prior auth

Sandbox payer form. Draft screen with the yellow missing-field list. Generate necessity note through the Model port (fixture in CI, Anthropic when `ANTHROPIC_API_KEY` is set). Submit after `commit`. Denied path stores an appeal PDF in MinIO and shows `appeal_filed`.

Exit: a fixture auth goes submitted → approved in the sandbox, and a second fixture stops on a missing CPT and will not submit.

### Phase 5 — Voice, one agent

LiveKit profile. One named agent, disclosure played first, scripted screener from `ClinicRules.outreach`, transfer button, `CallResult` signaled into `ReferralFlow`. Second attempt is a Temporal timer. Console shows the listening modal against a real room.

Exit: a local call completes the screener and the workflow records two attempts when the first result is `no_answer`, using time-skipping in CI and a real room in the manual check.

### Phase 6 — Roster, dashboard, notifications

Multiple agent profiles. Dashboard reads `metric_daily`. A STAT disposition creates a row the console can show as a toast. This is an in-app toast in v1. An OS-level notification is a later console nicety, not a server feature.

Exit: seeded demo shows today’s counts, and a STAT upload surfaces without a refresh (SSE).

### Phase 7 — Scribe

Record in the console, store audio in MinIO, draft an H&P, review it, push it through the same browser session and the same write gate.

Exit: a short fixture audio produces a note in `awaiting_review`, and approving it runs the sandbox EHR activity.

### Phase 8 — Extension and a real EHR session

The side panel against `sandbox-ehr`, polling every 5 seconds. Production checklist for the first clinic: their agent login, VPN if they have one, `workflow_settings` left on `approve_all`, OpenObserve receiving only redacted telemetry, backup restore tried once on a copy.

Exit: the extension fills the sandbox form, and a written checklist exists for pointing a browser session at a clinic EHR. The checklist is a runbook, not an integration project.

Marketing pages that the demo needs (home, GI story, ROI, book-demo) are acceptable as soon as phase 1’s screens exist to record. They are not a phase of their own.

## Config

Environment names, all documented in `.env.example` with blanks:

`DATABASE_URL`, `CLINIC_DATA_KEY`, `TEMPORAL_ADDRESS`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ZO_ROOT_USER_EMAIL`, `ZO_ROOT_USER_PASSWORD`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY` (empty in CI), `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

Feature flags are columns on `workflow_settings`, not a flag service.

## Out of scope until something forces it

- Kubernetes, Helm, and a service mesh.
- A second telemetry system, or an error tracker beside OpenObserve.
- Redis-backed queues, Elasticsearch, and a separate analytics warehouse.
- Self-serve billing. Quotes stay manual. The calculator is a sales tool.
- More than two EHR targets. The sandbox is one. The first clinic’s real login is the second. A third EHR waits until those two sessions are stable.
- Claiming the full language list, hosted speech, and real e-fax before those adapters are configured for a specific clinic.
- Training, fine-tuning, or retaining prompts.

## First week, concretely

1. Create the workspace files, the Compose `core` profile, and the collector redaction test.
2. Land `packages/db` with clinics, users, audit, and RLS, plus Better Auth sign-in.
3. Land `Rules.evaluate` and the GI preset with table tests, before any UI beyond a blank shell.
4. Confirm a trace and the five dashboard skeletons exist in OpenObserve, even while the metrics are still zeros.

That week produces a bootable system and the module the rest of the product calls. It does not produce a demo of ten browsers.

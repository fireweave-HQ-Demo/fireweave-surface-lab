# Clinic OS

Referral inbox, human approval, and one browser session that fills a sandbox chart. The product shape is described in `idea.md` and `implementation_plan.md`.

## Run

Docker is required.

```bash
make up
make seed
make e2e
```

The console is at http://127.0.0.1:13000. Sign in as `staff@demo.clinic` / `password-demo-1`.

## Dev vs prod

| | Dev | Prod |
|---|---|---|
| Compose | `infra/compose.yml` (`make up`) | `infra/compose.prod.yml` |
| Bind | `127.0.0.1:13000` | host `:80` |
| Secrets | `.env` from `.env.example` | GitHub Actions secrets → `~/clinic-os/.env` |
| Extra | OpenObserve, Temporal UI, marketing, voice | slim stack only |

Push to `main` deploys to EC2 (`54.147.34.187`) via `.github/workflows/deploy.yml`. Production URL: http://54.147.34.187

`make test` runs the rules and write-gate tests on the host. `make down` stops the stack.

Traces leave the API only through the collector. The collector redacts identifiers, then writes locally and to the hosted OpenObserve `clinic` stream. Local UI is http://127.0.0.1:5080 (`admin@example.com` / `ChangeMe123!`). Hosted credentials stay in `.env`. `make e2e` checks that a referral span arrives and that a planted SSN does not.

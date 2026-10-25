# Clinic OS

Referral inbox, human approval, and one browser session that fills a sandbox chart. The product shape is described in `idea.md` and `implementation_plan.md`.

## Run

Docker is required.

```bash
make up
make seed
make stage && make stage-seed
make prod && make prod-seed
make e2e
```

Three laptop stacks share `infra/compose.yml` and stay isolated by `infra/env/dev.env`, `infra/env/stage.env`, and `infra/env/prod.env`.

| | Dev | Stage | Prod (laptop) |
|---|---|---|---|
| Start | `make up` | `make stage` | `make prod` |
| Console | http://127.0.0.1:13000 | http://127.0.0.1:23000 | http://127.0.0.1:33000 |
| Sign in | `staff@demo.clinic` | `staff@stage.clinic` | `staff@prod.clinic` |
| Clinic | Demo GI | Stage GI | Prod GI |
| OpenObserve | http://127.0.0.1:15080 | http://127.0.0.1:25080 | http://127.0.0.1:35080 |

Password for all three is `password-demo-1`. `make seed` also adds 100 accounts in that env's email groups: `desk` / `nursing` / `physicians` / `billing` at `dev.clinic`, `intake` / `clinical` / `providers` / `revenue` at `stage.clinic`, and `frontdesk` / `care` / `attendings` / `claims` at `prod.clinic`. Example: `desk.01@dev.clinic`. The physician, provider, and attending groups are doctors. `make down`, `make stage-down`, and `make prod-sim-down` stop one stack and keep its volumes.

## EC2

| | EC2 |
|---|---|
| Compose | `infra/compose.prod.yml` (`make prod-up` on the host) |
| Bind | host `:80` |
| Secrets | GitHub Actions secrets → `~/clinic-assistent/.env` |

Push to `main` on [clinic-assistent](https://github.com/fireweave-HQ-Demo/clinic-assistent) deploys to EC2 (`54.147.34.187`) via `.github/workflows/deploy.yml`. Production URL: http://54.147.34.187

`make test` runs the rules and write-gate tests on the host.

Traces leave the API only through the collector. The collector redacts identifiers, then writes to that stack's OpenObserve and to the hosted stream (`clinic`, `clinic-stage`, or `clinic-prod`). OpenObserve login is `admin@example.com` / `ChangeMe123!`. Hosted credentials stay in `.env`. `make e2e` checks that a referral span arrives and that a planted SSN does not.

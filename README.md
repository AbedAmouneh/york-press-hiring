# York Press Hiring

[![CI](https://github.com/AbedAmouneh/york-press-hiring/actions/workflows/ci.yml/badge.svg)](https://github.com/AbedAmouneh/york-press-hiring/actions/workflows/ci.yml)

Managers request positions → Khalil (CEO) approves → the platform sources ~50 candidates from **People Data Labs + SignalHire**, scores them with **Claude** on a weighted 100-point scorecard, flags the **Top 10**, reveals their contacts through SignalHire, and sends templated outreach (email automatically within a daily cap; LinkedIn notes only after approval, sent from Abed's account via Claude in Chrome).

Non-technical setup: see **[SETUP_GUIDE.md](SETUP_GUIDE.md)**. Click-through design prototype: `docs/prototype.html`.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript, Tailwind CSS 4, official shadcn/ui (Radix), react-hook-form, TanStack Query 5, React Router 7 |
| API | Hono on a single Vercel Function (`api/index.ts`, reached through a `/api/(.*)` rewrite), Node runtime; Hono RPC gives the browser the exact route types |
| Validation | Zod 4 rules in `shared/schemas.ts`, used by both the API and the forms |
| DB | Postgres (Neon) via Drizzle ORM; embedded PGlite locally. Migrations run in the Vercel build |
| Jobs | Resumable pipeline in Postgres, sliced and retried through Upstash QStash (background fallback); daily Vercel Cron |
| AI | `@anthropic-ai/sdk`: tool use for strict JSON, prompt caching, Message Batches for weekly refreshes, web search, PDF CVs |
| Candidates | SignalHire (search + contact reveal); People Data Labs optional |
| Files, email, errors | Vercel Blob (private CVs), Resend, Sentry |
| Tests | Vitest unit tests, Playwright browser tests, smoke test, scoring eval set |

## Layout

```
src/                       FRONTEND: pages/, components/ (ui/ = shadcn), lib/ (rpc client, forms, types)
api/index.ts        Vercel entry → server/app.ts
server/                    BACKEND
  app.ts                   Hono app, security middleware, error handling, exports AppType
  auth.ts                  passwords, DB sessions (httpOnly cookie), role guards, two-step lock
  security.ts              origin check (CSRF) and API security headers
  validate.ts              json/query/form validators for routes
  env.ts                   config, mock mode and preview rules
  db/                      schema.ts, client.ts, migrations/
  routes/                  public · requests · candidates · outreach · admin (+ access.ts permissions)
  services/                pipeline, claude, providers/, merge, outreach, queue, cv-store,
                           two-factor, rate-limit, retention, cron, email, notify, templates
shared/                    types.ts and schemas.ts, used by both sides
scripts/                   smoke test, demo seed, migrate, scoring eval, CV move to Blob
evals/scoring/             scoring test set
tests/unit, tests/e2e      Vitest and Playwright
```

## Develop

```bash
cp .env.example .env
npm install --include=dev
npm run dev          # API on :3001, web on :5173 (proxied)
npm test             # unit tests
npm run test:e2e     # browser tests on a seeded demo database
npm run smoke        # full request → approval → sourcing → outreach run against a temp DB
npm run check        # lint + typecheck + unit tests + smoke
npm run db:generate  # after editing server/db/schema.ts
```

## CI/CD (GitHub Actions + Vercel)

**CI:** every push to `main` and every pull request runs `.github/workflows/ci.yml` (see the Actions tab):

1. **Checks:** lint (zero warnings), typecheck, unit tests, migrations applied twice to a real Postgres, migration drift check, production build, smoke test
2. **Browser tests:** Playwright against a seeded demo copy of the app
3. **Dependency audit:** fails on high or critical advisories in production dependencies

`.github/workflows/eval.yml` runs the scoring test set weekly and on prompt changes (needs the `ANTHROPIC_API_KEY` secret). Dependabot opens weekly update PRs.

**CD:** Vercel deploys from GitHub: every push to `main` goes to production and every pull request gets its own preview with its own database branch. Migrations run in the build before a version goes live. To stop a red build from reaching production, require the CI checks on `main` (Settings → Branches) and merge through pull requests.

## Rules built into the code

- **Fairness:** Claude never receives names, photos, gender, dates of birth or graduation years; prompts forbid protected characteristics. Score = sum of per-criterion points clamped to the role's weights; a missing deal-breaker caps it at 40.
- **Prompt injection:** profile/CV text is wrapped in `<candidate_data>` / `<cv>` and treated as data; outputs must match a JSON schema.
- **Exclusions:** current York Press employees, the do-not-contact list, and people already screened for the role.
- **Outreach:** templates only (Claude writes one personal line); kill switch + daily cap; every email states where the contact details came from; LinkedIn is approval-gated.
- **Data:** contacts store their source and retrieval date; closing a role can delete collected emails/phones; opting out deletes them.

## Environment

See `.env.example`. With no candidate source key the app runs on sample data; once one is live, sources without a key are skipped. `CRON_SECRET` protects `/api/cron/daily` (Vercel sends it automatically).

# York Press Hiring

[![CI](https://github.com/AbedAmouneh/york-press-hiring/actions/workflows/ci.yml/badge.svg)](https://github.com/AbedAmouneh/york-press-hiring/actions/workflows/ci.yml)

Managers request positions → Khalil (CEO) approves → the platform sources ~50 candidates from **People Data Labs + SignalHire**, scores them with **Claude** on a weighted 100-point scorecard, flags the **Top 10**, reveals their contacts through SignalHire, and sends templated outreach (email automatically within a daily cap; LinkedIn notes only after approval, sent from Abed's account via Claude in Chrome).

Non-technical setup: see **[SETUP_GUIDE.md](SETUP_GUIDE.md)**. Click-through design prototype: `docs/prototype.html`.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript, Tailwind, shadcn-style components (Radix), TanStack Query, React Router |
| API | Hono on a single Vercel Function (`api/[[...route]].ts`), Node runtime |
| DB | Postgres (Neon) via Drizzle ORM; embedded PGlite locally when `DATABASE_URL` is empty |
| Jobs | Resumable pipeline in Postgres (`sourcing_runs.step`), run with `waitUntil`, self-continues past the 300 s limit; daily Vercel Cron |
| AI | `@anthropic-ai/sdk` — tool use for strict JSON, `web_search_20250305` server tool, PDF document blocks for CVs |
| Email | Resend (sending as the recruiter, Reply-To their Rackspace mailbox) |

## Layout

```
api/[[...route]].ts        Vercel entry → server/app.ts
server/
  app.ts                   Hono app, error handling, auth boundary
  auth.ts                  bcrypt passwords, DB sessions (httpOnly cookie), role guards
  env.ts                   config + mock-mode switches
  db/schema.ts             Drizzle schema   db/migrations/  generated SQL (applied on cold start)
  routes/                  public (setup, auth, apply, webhook, cron) · requests · candidates · outreach · admin
  services/
    pipeline.ts            brief → search → enrich → score → rank → reveal → outreach
    claude.ts              brief, scoring, personal line, web findings, CV scoring (+ mock heuristics)
    providers/             pdl.ts, signalhire.ts, mock.ts (fictional sample profiles)
    outreach.ts            queueing, kill switch, daily cap, follow-up dates
    cron.ts                daily: drain queue, 48 h reminders, resume runs; Mondays: weekly refresh + CEO summary
shared/types.ts            roles, statuses, scorecard criteria (used by both sides)
src/                       React app (pages/, components/, lib/)
scripts/smoke.ts           end-to-end test in mock mode
```

## Develop

```bash
cp .env.example .env
npm install
npm run dev          # API on :3001, web on :5173 (proxied)
npm run smoke        # full request → approval → sourcing → outreach run against a temp DB
npm run build        # typecheck both sides + vite build
npm run db:generate  # after editing server/db/schema.ts
npm run check        # lint + typecheck + smoke — the same gates CI runs
```

## CI (GitHub Actions)

Every push to `main` and every pull request runs `.github/workflows/ci.yml`:

1. **Lint** — ESLint (typescript-eslint + react-hooks), zero warnings allowed
2. **Typecheck** — strict TypeScript for the React app and the server
3. **Migrations match the schema** — fails if `server/db/schema.ts` changed without `npm run db:generate`
4. **Build** — production Vite build
5. **Smoke test** — the full request → approval → sourcing → outreach flow in mock mode
6. **Dependency audit** — fails on high/critical advisories in production dependencies

Dependabot opens weekly update PRs (`.github/dependabot.yml`). To block merges that fail CI, turn on branch protection for `main` (Settings → Branches → require the "Lint, typecheck, build, smoke test" check).

## Rules built into the code

- **Fairness:** Claude never receives names, photos, gender, dates of birth or graduation years; prompts forbid protected characteristics. Score = sum of per-criterion points clamped to the role's weights; a missing deal-breaker caps it at 40.
- **Prompt injection:** profile/CV text is wrapped in `<candidate_data>` / `<cv>` and treated as data; outputs must match a JSON schema.
- **Exclusions:** current York Press employees, the do-not-contact list, and people already screened for the role.
- **Outreach:** templates only (Claude writes one personal line); kill switch + daily cap; every email states where the contact details came from; LinkedIn is approval-gated.
- **Data:** contacts store their source and retrieval date; closing a role can delete collected emails/phones; opting out deletes them.

## Environment

See `.env.example`. Any missing provider key = mock mode for that provider. `CRON_SECRET` protects `/api/cron/daily` (Vercel sends it automatically).

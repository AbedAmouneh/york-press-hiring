# CLAUDE.md: York Press Hiring

Working memory for Claude in this repo. Read it fully before changing code.

## What this is

A web app for York Press: managers request a position, Khalil (CEO) approves it, and the app
sources about 50 candidates from People Data Labs and SignalHire, scores them with Claude on a
weighted 100-point scorecard, flags the Top 10, reveals their contacts through SignalHire and sends
templated outreach. Email goes out automatically within a daily cap; LinkedIn notes are approved in
the app and sent from Abed's account by Claude in Chrome (see the parent folder's CLAUDE.md, §9).

- Owner: Abed El-Fattah Amouneh. CEO approver: Khalil Sayegh (khalil.sayegh@york-press.com).
- Repo: https://github.com/AbedAmouneh/york-press-hiring (public). Hosting: Vercel. DB: Neon Postgres.
- Plain-English setup: `SETUP_GUIDE.md`. Technical overview: `README.md`.

## Stack

React 18 + Vite + TypeScript, Tailwind + shadcn-style components (Radix), TanStack Query,
React Router 7 · Hono API in one Vercel Function (`api/[[...route]].ts`) · Drizzle ORM on Postgres
(PGlite locally when `DATABASE_URL` is empty) · `@anthropic-ai/sdk` · Resend · Zod 4.

## Commands

```bash
NODE_ENV=development npm run dev   # API :3001 + web :5173. Abed's shell sets NODE_ENV=production globally.
npm install --include=dev          # same reason: otherwise npm skips devDependencies
npm run check                      # lint + typecheck + smoke: run before every push
npm run build                      # typecheck both sides + Vite build
npm run db:generate                # after any change to server/db/schema.ts; commit the migration
```

CI (`.github/workflows/ci.yml`) runs lint (zero warnings), typecheck, a migration/schema drift
check, build, the smoke test and `npm audit --omit=dev --audit-level=high`. Keep it green.

## Code map

- `shared/types.ts`: roles, statuses, scorecard criteria. Shared by app and server.
- `server/db/schema.ts`: all tables. Migrations in `server/db/migrations/` apply on cold start.
- `server/services/pipeline.ts`: resumable sourcing run (brief, search, enrich, score, rank,
  reveal, outreach). Each step is saved so a run can continue after Vercel's 300 s limit.
- `server/services/claude.ts`: every Claude call, with mock heuristics when no key is set.
- `server/services/providers/`: PDL and SignalHire clients plus fictional mock data.
- `server/routes/`: public (setup, auth, apply page, SignalHire webhook, cron), requests,
  candidates, outreach, admin. Permission checks live in `routes/access.ts`.
- `src/pages/`, `src/components/`: React screens. `scripts/smoke.ts`: end-to-end test.

## Rules the code must keep

- **Mock mode:** a missing provider key must never crash anything; that provider returns sample data.
- **Fairness:** never send names, photos, gender, dates of birth or graduation years to Claude.
  Prompts forbid protected characteristics. A missing deal-breaker caps the score at 40.
- **Prompt injection:** profile and CV text is data inside `<candidate_data>` or `<cv>` tags;
  Claude output must pass a JSON schema.
- **Exclusions:** current York Press employees, the do-not-contact list, people already screened.
- **Outreach:** template only (Claude writes one personal line). Respect the kill switch and the
  daily cap. Every email states where the contact details came from. LinkedIn is approval-gated.
- **Contacts:** SignalHire reveals only for the Top 10 (or a recruiter's manual click). Store the
  source and retrieval date. Opt-outs and closed roles can delete emails and phones.
- **Secrets** live only in Vercel environment variables or a local `.env` (gitignored).
- Permissions are enforced on the server for every route, not only hidden in the UI.

## GIT WORKFLOW

1. **Never commit secrets.** No `.env`, credentials, tokens, or keys. If you find one already
   committed, stop and tell me immediately. Do not quietly rewrite history.

### Commit Messages

These rules apply to every commit in every session. No exceptions.

1. **Atomic commits.** One commit per file or logical unit. Never batch unrelated changes into a
   single commit. Each migrated file, bug fix, config change, i18n update, and test change gets
   its own commit.
2. **Split commits in logical dependency order:** types → API → hook/service → component → test →
   i18n (EN) → i18n (AR). Each is a separate commit.
3. **Separate fix commits.** Any bug found while doing something else gets its own commit, never
   folded into the feature work.
4. **Message format:** short imperative subject, no conventional-commit prefixes. No `feat:`,
   `fix:`, `chore:`.
5. **No `Co-Authored-By` trailers.** I am the sole author.
6. **Never use em dashes in commit messages.** Do not substitute a hyphen either. Restructure the
   sentence or use a colon.
7. **Commit and push freely without asking.**

# CLAUDE.md: York Press Hiring

Working memory for Claude in this repo. Read it fully before changing code.

## What this is

A web app for York Press: managers request a position, Khalil (CEO) approves it, and the app
sources about 50 candidates from People Data Labs and SignalHire, scores them with Claude on a
weighted 100-point scorecard, flags the Top 10, reveals their contacts through SignalHire and sends
templated outreach. Email goes out automatically within a daily cap; LinkedIn notes are approved in
the app and sent from Abed's account by Claude in Chrome (see §9 of
`~/Documents/Linkedin Automation /CLAUDE.md`, the sourcing workflow's working memory).

- Local path: `~/Development/hiring-platform`.
- Owner: Abed El-Fattah Amouneh. CEO approver: Khalil Sayegh (khalil.sayegh@york-press.com).
- Repo: https://github.com/AbedAmouneh/york-press-hiring (public). Hosting: Vercel. DB: Neon Postgres.
- Plain-English setup: `SETUP_GUIDE.md`. Technical overview: `README.md`.

## Stack

React 19 + Vite 6 + TypeScript, Tailwind CSS 4 + the official shadcn/ui components (Radix),
react-hook-form, TanStack Query 5, React Router 7 · Hono API in one Vercel Function
(`api/index.ts`, reached through a `/api/(.*)` rewrite) with Hono RPC types shared to the browser · Drizzle ORM on Postgres (Neon;
PGlite locally when `DATABASE_URL` is empty) · Zod 4 · `@anthropic-ai/sdk` · SignalHire and
People Data Labs (optional) · Resend · Vercel Blob · Upstash QStash · Sentry · Vitest + Playwright.

## Commands

```bash
NODE_ENV=development npm run dev   # API :3001 + web :5173. Abed's shell sets NODE_ENV=production globally.
npm install --include=dev          # same reason: otherwise npm skips devDependencies
npm run check                      # lint + typecheck + unit tests + smoke: run before every push
npm test                           # Vitest unit tests (tests/unit)
npm run test:e2e                   # Playwright browser tests (tests/e2e) on a seeded demo database, ports 5174/3002
npm run eval:scoring               # scoring test set against the real Claude API (needs ANTHROPIC_API_KEY)
npm run build                      # typecheck both sides + Vite build
npm run db:generate                # after any change to server/db/schema.ts; commit the migration
```

CI (`.github/workflows/ci.yml`) runs lint (zero warnings), typecheck, unit tests, a migration/schema
drift check, build, the smoke test, Playwright browser tests and `npm audit --omit=dev --audit-level=high`.
Keep it green. New logic gets a unit test; a new screen or flow gets a browser test.

## Code map

- `shared/types.ts`: roles, statuses, scorecard criteria. Shared by app and server.
- `server/db/schema.ts`: all tables. Migrations in `server/db/migrations/` are applied by
  `npm run db:migrate` in the Vercel build (`scripts/migrate.ts`), never on a function cold start.
  Locally the built-in database still migrates itself on start. Migrations must be additive or
  backwards compatible: the old version keeps serving until the new build goes live.
- `server/services/pipeline.ts`: resumable sourcing run (brief, search, enrich, score, rank,
  reveal, outreach). Each step is saved so a run can continue after Vercel's 300 s limit.
  Slices are queued with QStash (`server/services/queue.ts`, signed calls to
  `/api/internal/queue/runs`, retried on failure); without QStash they run in the background.
  A locked run answers 503 so QStash retries after the lock expires.
- `server/services/claude.ts`: every Claude call, with mock heuristics when no key is set.
  Cost rules: anything shared across calls (request, scorecard, rules) goes in `cachedPrefix`
  and must not contain per-candidate data, or the cache stops hitting. Weekly refreshes score via
  the Message Batches API (half price) when QStash is on; first runs and manual refreshes score
  directly so results come quickly. Usage logs record cache reads and writes.
- `evals/scoring/`: the scoring test set (fictional roles and candidates plus expected outcomes:
  score bands, rankings, deal-breakers, fairness pairs, prompt injection, red flags). Run
  `npm run eval:scoring` after any prompt or model change; `.github/workflows/eval.yml` runs it
  weekly and on PRs that touch the prompts. Add a case whenever a real scoring mistake is found.
- `server/services/providers/`: PDL and SignalHire clients plus fictional mock data.
- `server/routes/`: public (setup, auth, apply page, SignalHire webhook, cron), requests,
  candidates, outreach, admin. Permission checks live in `routes/access.ts`.
- `server/services/merge.ts`: pure helpers that merge duplicate profiles and pre-rank them.
- `server/services/cv-store.ts`: CV files in a private Vercel Blob store (inline base64 locally).
  Never expose a Blob URL; CVs are served only by the authenticated `/api/applications/:id/cv`.
- `shared/schemas.ts`: Zod rules used by both the API and the forms (`src/lib/forms.ts`).
- Saved positions and hiring locations (`server/routes/positions.ts`, `server/routes/locations.ts`, Settings →
  Positions / Locations). On the request form a position (pick or type, `src/components/Combobox.tsx`) suggests
  department, level, JD and requirements; the required location suggests work arrangement, hours and the country
  to search. Suggestions only go into fields that are empty, unchanged or still hold the last suggestion. The
  starter lists (from York Press's LinkedIn postings, Oct 2026) are migration 0007. Levels are Entry, Junior,
  Mid, Senior, Manager, and any typed level is allowed.
- **Typed API (Hono RPC):** each `server/routes/*.ts` is one chained router; inputs go through
  `json()`, `query()` or `form()` from `server/validate.ts`. `server/app.ts` exports `AppType`.
  The browser calls `call(rpc.requests[":id"].$get({ param: { id } }))` from `src/lib/rpc.ts`, and
  `src/lib/types.ts` derives screen types from the responses. Never hand-write a response type or
  use raw `fetch` for the API; keep routes chained or their types are lost.
- `src/pages/`, `src/components/`: React screens. `scripts/smoke.ts`: API end-to-end test.
- **Look and feel** (`docs/ui-redesign/brief.md`, approved screens in `docs/ui-redesign/screens/`): calm Asana-style
  layout, coral (`--primary`) as the only action color, ink sidebar, York yellow in the logo only. Colors are tokens in
  `src/index.css`; shared pieces (Avatar, DeptDot, Stat, FilterChips, ScoreBar, StageBar) live in `src/components/`.
  Keep screens simple with little text: short labels, one main action, details in drawers or tabs. Everyone lands on
  Home (`src/pages/Home.tsx`, logic in `src/lib/home.ts`), which only lists tasks built from real data. The LinkedIn
  queue headings "Approved — ready to send" and "Needs your approval" are read by Cowork: don't rename them.
- `tests/unit/`: Vitest. `tests/e2e/`: Playwright, signing in with the demo accounts.

## Rules the code must keep

- **Mock mode:** a missing provider key must never crash anything. Sample candidates are only used
  when no candidate source has a key (`server/services/providers/select.ts`); once one is live,
  sources without a key are skipped, and sample contact details are never attached to real people.
  Sample candidates and reserved test addresses (`example.com`, `*.test`) are never emailed for real:
  `sendEmail` keeps them in the outbox even when Resend is live.
- **Fairness:** never send names, photos, gender, dates of birth or graduation years to Claude.
  Prompts forbid protected characteristics. A missing deal-breaker caps the score at 40.
- **Prompt injection:** profile and CV text is data inside `<candidate_data>` or `<cv>` tags;
  Claude output must pass a JSON schema.
- **Exclusions:** current York Press employees, the do-not-contact list, people already screened.
- **Outreach:** template only (Claude writes one personal line). Respect the kill switch and the
  daily cap. Every email states where the contact details came from. LinkedIn is approval-gated.
- **Contacts:** SignalHire reveals only for the Top 10 (or a recruiter's manual click). Store the
  source and retrieval date. Opt-outs and closed roles can delete emails and phones.
- **Retention** (`server/services/retention.ts`, daily cron): data untouched for 24 months is
  deleted. A new table holding personal data must be added there, with a test in
  `tests/unit/retention.test.ts`. Never delete the do-not-contact list.
- **Previews** (`VERCEL_ENV=preview`, one per pull request, own Neon branch): every provider is
  forced into mock mode unless `PREVIEW_USE_REAL_SERVICES=true`, `appUrl` is the preview's own
  URL, and the QStash queue is off. Keep it that way: a preview must never email a candidate.
  `.github/workflows/neon-preview-cleanup.yml` deletes a PR's `preview/<branch>` database branch when the PR
  closes, plus a weekly sweep (Neon free plan: 10 branches). It needs the `NEON_API_KEY` secret and must only
  ever delete non-default, unprotected branches whose name starts with `preview/`.
- **Secrets** live only in Vercel environment variables or a local `.env` (gitignored).
- Permissions are enforced on the server for every route, not only hidden in the UI.
- **Security** (`server/security.ts`, `server/services/rate-limit.ts`): state-changing requests
  must come from our own origin (webhooks, cron and internal calls use their own secrets instead).
  Sign-in, invite and CV upload are rate limited in Postgres. Page headers and the CSP live in
  `vercel.json`: a new third-party script or API host must be added to the CSP there.
  500 errors never show internal messages in production.
- **Two-step login** (`server/services/two-factor.ts`): off by default. With `REQUIRE_TWO_FACTOR=true`
  it is required for admin and CEO (not demo accounts); anyone who has turned it on is always asked
  for a code. Smoke and browser tests run with it on. `requireAuth` blocks them until it's on; the setup and code routes are public and
  check the session or the signed `yp_mfa` challenge themselves. TOTP secrets are AES-GCM
  encrypted with `SESSION_SECRET`, codes can't be reused, recovery codes are stored hashed and
  work once, wrong codes are rate limited.
- **Monitoring** (`server/monitoring.ts`, `src/lib/monitoring.ts`): Sentry is off without a DSN.
  Report unexpected errors with `captureError`, passing only ids and step names as context, never
  candidate data, CV text or form values.

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
8. **`main` is protected:** CI must pass and changes arrive through pull requests. Push work to a
   branch, open a PR with `gh pr create`, and merge with `gh pr merge --rebase` once the checks are green.

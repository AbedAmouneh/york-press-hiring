# CLAUDE.md: York Press Hiring

Working memory for Claude in this repo. Read it fully before changing code.

## What this is

A web app for York Press: managers request a position, Khalil (CEO) approves it, and the app
sources about 50 candidates from People Data Labs and SignalHire, scores them with Claude on a
weighted 100-point scorecard, flags the Top 10 and reveals their contacts through SignalHire. Nothing is
sent automatically: a recruiter or the role's hiring manager presses **Contact** on a candidate, picks email,
LinkedIn or WhatsApp, edits the drafted message and sends it. LinkedIn notes are then sent from Abed's account
by Claude in Chrome (see §9 of `~/Documents/Linkedin Automation /CLAUDE.md`, the sourcing workflow's working memory).

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
npm run eval:scoring               # scoring test set against the real Claude API (needs OPENCODE_API_KEY or ANTHROPIC_API_KEY)
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
  reveal, deep, outreach). Each step is saved so a run can continue after Vercel's 300 s limit.
  The first scoring sees search previews (no dates); the top 15 (`SHORTLIST`) then get SignalHire's full profile,
  web research and a second scoring (`deep`), and only then is the Top 10 contacted. Scoring gets facts computed in
  code (`server/services/signals.ts`: years from dates, level, stability, where must-haves appear, fit) and returns
  proven / claimed / missing evidence per must-have; both are stored on role_candidates.
  Must-haves are split by `shared/must-haves.ts` into core skills and basic requirements (office software, degrees,
  soft skills, plain language ability). Only core ones are checked and scored; basic ones are shown as "not scored"
  and never count as gaps, for every role. A role that lists only basic ones scores them all as core.
  "Score again" (`POST /requests/:id/rescore`, run kind `rescore`) re-scores everyone already on a role with the
  current rules and ranks them: brief, score and rank only. No searches, reveals, web search, contenders or outreach,
  so it never contacts anyone; it logs how many Top-10 people now qualify but haven't been contacted.
- `server/services/learning.ts`: the scorecard learns from decisions (hiring manager Yes = 1, No = 0; interview or
  hired = 1). Daily (cron) it tunes the criterion weights per department and across departments to rank past
  decisions better (pairwise accuracy), in whole points, at most ±5 per cycle and ±10 from the defaults, only with
  12+ decisions (3+ each way) and a 2-point accuracy gain. New roles freeze the learned weights into
  `role_requests.scorecard_weights` on their first run; recruiters get a notification and can undo in Settings.
  Inputs are only the criterion shares, never anything about the person.
  Slices are queued with QStash (`server/services/queue.ts`, signed calls to
  `/api/internal/queue/runs`, retried on failure); without QStash they run in the background.
  A locked run answers 503 so QStash retries after the lock expires.
- `server/services/claude.ts`: every Claude call, with mock heuristics when no key is set. With `OPENCODE_API_KEY`
  the same Messages API calls go through OpenCode Console (`https://opencode.ai/inference/anthropic`, Bearer token).
  OpenCode has no Message Batches or web search tool, so `aiFeatures` in `server/env.ts` turns those off (scoring
  runs directly, the web search step is skipped). With `GEMINI_API_KEY`, `structured()` and `scoreBatch()` can send
  the same prompts and JSON schemas to Gemini's generateContent (`server/services/gemini.ts`); same feature limits.
  Which one answers: `AI_PROVIDER` if its key is set, else Anthropic, then Gemini, then OpenCode (`env.aiProvider`).
  Live uses Anthropic for AI and Gemini only for the LinkedIn lookup. Web research runs for the shortlist (top 15) only.
  Cost rules: anything shared across calls (request, scorecard, rules) goes in `cachedPrefix`
  and must not contain per-candidate data, or the cache stops hitting. Weekly refreshes score via
  the Message Batches API (half price) when QStash is on; first runs and manual refreshes score
  directly so results come quickly. Usage logs record cache reads and writes.
- `evals/scoring/`: the scoring test set (fictional roles and candidates plus expected outcomes:
  score bands, rankings, deal-breakers, fairness pairs, prompt injection, red flags). Run
  `npm run eval:scoring` after any prompt or model change; `.github/workflows/eval.yml` runs it
  weekly and on PRs that touch the prompts. Add a case whenever a real scoring mistake is found.
- `server/services/providers/`: PDL and SignalHire clients plus fictional mock data. SignalHire's search returns a
  preview only (no LinkedIn link, dates or education); a reveal (1 credit) returns the full profile, which is saved.
- `server/services/linkedin-finder.ts`: finds the LinkedIn link of each new candidate who has none, in the enrich step
  and from the "Find LinkedIn profiles" button (`POST /requests/:id/linkedin`). Order: SignalHire's own link (people who
  have one are never searched, and a reveal replaces a found link; reveals ask by `signalhireUid` before a found link),
  then Brave Search (`BRAVE_SEARCH_API_KEY`, `mock.brave`: `site:linkedin.com/in "name" title company`, real result
  links, queued one a second for Brave's free plan, one retry on 429), then Gemini's Google Search grounding
  (`GEMINI_API_KEY`, `mock.gemini`) when Brave has no key, finds nothing or fails. Gemini's grounding rarely returns
  linkedin.com/in pages (issue #93), which is why Brave goes first. A link is kept only if its address (or, for Brave,
  the result title) carries the person's name. LinkedIn itself is never fetched. Settings → Connections shows which
  searches run.
- `server/routes/`: public (setup, auth, apply page, SignalHire webhook, cron), requests,
  candidates, outreach, admin. Permission checks live in `routes/access.ts`.
- `server/services/merge.ts`: pure helpers that merge duplicate profiles and pre-rank them.
- `server/services/cv-store.ts`: CV files in a private Vercel Blob store (inline base64 locally).
  Never expose a Blob URL; CVs are served only by the authenticated `/api/applications/:id/cv`.
- `shared/schemas.ts`: Zod rules used by both the API and the forms (`src/lib/forms.ts`).
- Saved positions and hiring locations (`server/routes/positions.ts`, `server/routes/locations.ts`, Settings →
  Positions / Locations). On the request form a position (pick or type, `src/components/Combobox.tsx`) suggests
  department, level, JD and requirements; the required location suggests work arrangement, hours, the country
  to search and its currency (`locations.currency`, migration 0026, e.g. GBP for London). Suggestions only go into fields that are empty, unchanged or still hold the last suggestion. The
  starter lists (from York Press's LinkedIn postings, Oct 2026) are migration 0007. Levels are Entry, Junior,
  Mid, Senior, Manager, and any typed level is allowed.
- **Employment type** (`shared/types.ts` EMPLOYMENT_TYPES / PAY_PERIODS / PAY_DEFAULT, migration 0024): every request
  is Full time, Part time, Contractor or Freelance (required, default Full time). The pay basis (hour, day, month, year,
  project) starts on the type's default and follows the type until someone picks one by hand. Part time adds hours per
  week; Contractor and Freelance add contract length, expected workload and a project description (`toRequestInput`
  drops details that don't belong to the type). A saved position can hold a usual type and pay basis, suggested like
  its other details; a position with no usual type suggests Full time. Pay is internal only: never in outreach, the
  apply page or anything a candidate sees. Pay amounts allow two decimals (hourly rates like 12.50; migration 0025 made
  the salary columns double precision). `describeRole` in outreach turns "a Editor" into "a part-time Editor (about
  20 hours a week)" or "a freelance Illustrator for 3 months"; a LinkedIn note that would pass 300 characters drops the
  length, then `fitNote` cuts at a word. About one in six sample candidates is self-employed, so mock runs show the
  contract nudge. For contract work, profiles showing freelance or contract work get a small bonus in the
  pre-rank (`prescore`) and a tie-breaking nudge in `rerank`: favoured, never filtered. `CONTRACT_WORK_PATTERN` is read
  by both JavaScript and Postgres, so it must not use `\b`.
- **Universities** (`universities` table seeded by migration 0023 from `docs/universities-sources.md`, routes in
  `server/routes/universities.ts`, picker `src/components/UniversityPicker.tsx`): optional. A location can hold a
  starting list (Settings → Locations); a new request at that location starts with it and can change it (country
  pre-selected from the location, other countries allowed, missing universities can be added by managers and
  recruiters). With universities chosen, the search step passes them (plus short names like AUB) as SignalHire's
  `education` filter and a PDL `education.school.name` must-clause, so only their graduates and current students are
  found, any graduation year (years are never used: age proxy). Fewer than the usual pool is logged as "Only N people
  found…". Request universities are applied per search, never saved in the brief.
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
- **Discussion on a request** (`request_messages`, routes in `server/routes/requests.ts`, `src/components/Discussion.tsx`,
  rules in `shared/messages.ts`): everyone who can open the request reads and posts; new messages notify the requester,
  hiring manager, assigned recruiter, the CEO and earlier posters (in the app and by email), filtered to people who can
  still open the request. Authors can delete a message for 15 minutes; 2,000 characters max; 20 messages per user per
  10 minutes. Messages on closed or rejected requests are removed by retention after 24 months.
- **Deleting requests** (`DELETE /requests/:id`): the requester, a recruiter or an admin deletes drafts; an admin (not
  a demo account) can also delete a request still waiting for a decision (submitted or changes requested), which
  notifies nobody, unlike withdrawing. Approved requests can't be deleted: close the role instead.
- **Users** (`server/routes/admin.ts`, `src/pages/Users.tsx`): an admin adds people by emailing an invite link or by
  setting a starting password (`createUserWithPassword`, `must_change_password`). Such an account is locked by
  `requireAuth` until its owner picks a new password at `POST /auth/password`, which also signs out other sessions.
  Unaccepted invites (no password, never signed in) can be cancelled; anyone else is switched off, never deleted.
- **Forgotten passwords** (`server/services/password-reset.ts`, `/auth/forgot` and `/auth/reset/:token` in
  `routes/public.ts`, pages `Forgot.tsx` and `Reset.tsx`): "Forgot your password?" emails a link valid for 1 hour that
  works once (only its SHA-256 is stored, the outbox shows `/reset/[hidden]`). The answer is always the same, so it
  never reveals who has an account. Demo and switched-off accounts get nothing; an unaccepted invite gets a fresh
  invite. Using the link signs out every session, emails a "password was changed" notice and signs straight in,
  still asking for the two-step code when that is on. Limited to 3 requests per email and 10 per network an hour.
- **Demo accounts** (`demo.*@york-press.test`, `isDemo`): `DEMO_MODE` alone decides whether they work. Off, they
  can't sign in and open demo sessions stop (`canSignIn` in `server/auth.ts`). On, `ensureDemoUsers` recreates and
  reactivates them once per server start, so test copies of the live database get working demo buttons.
  The built-in demo password is public (it's in this repo), so it only works and is only shown locally, in tests and on
  previews. A public deployment (Vercel production, e.g. the demo site, which holds real data) needs `DEMO_PASSWORD`;
  without it demo accounts can't sign in, and the demo buttons there only fill in the email.
  Demo Admin (`demo.admin@york-press.test`, roles admin) opens the admin screens, but `demoCanManage` in
  `routes/access.ts` limits any demo account to changing demo accounts and test addresses (example.com, `*.test`):
  no inviting, switching off, editing or resetting two-step login of real people, and it can't remove opted-out
  people from the do-not-contact list. Seeds and browser tests use `setup.admin@york-press.test` as the normal admin
  made by setup (two-step login applies to it).
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
- **Opt-outs** (`server/services/suppression.ts`): every outreach email ends with a signed unsubscribe link (and
  List-Unsubscribe headers). The link page only shows a confirm button; the POST, the do-not-contact list in Settings
  and late SignalHire results all go through `suppress()`/`isSuppressed()`: unsent messages to the person are
  cancelled on every role, an opt-out deletes their email and phone, the email queue re-checks right before sending,
  and only an admin can take an opted-out person off the list.
- **Outreach is manual** (`server/services/outreach.ts`, `src/components/ContactDialog.tsx`): runs never draft or
  send anything. Only recruiters, admins and the role's hiring manager (`canEditCandidates`) can press Contact; the
  CEO can't. The draft is the saved template plus Claude's one personal line (follow-ups use a fixed short text;
  WhatsApp starts from the LinkedIn note plus the apply link and where the number came from). Email is sent the
  moment someone presses Send: from "<sender> at York Press" on careers@, Reply-To careers@ and the sender, visible
  CC `OUTREACH_CC` (default abdulrahman.mansour@york-press.com), unsubscribe link appended, idempotency key per
  message. The pause switch in Settings blocks email; there is no daily cap on manual sends. LinkedIn: Send =
  approved, Cowork sends it, then it counts as contacted. WhatsApp: opens wa.me with the text and marks the person
  Contacted (undo on the candidate). After a first message: status Contacted, follow-up date in 5 working days
  (Home lists due follow-ups, "Contact again" offers the follow-up); after the follow-up no further reminder.
  Every email states where the contact details came from.
- **Contacts:** SignalHire reveals only for the Top 10 (or a recruiter's manual click). Store the
  source and retrieval date. Opt-outs and closed roles can delete emails and phones. Every reveal
  path checks `signalhireBudget()` (`server/services/credit-budget.ts`) so the monthly limit in
  Settings is never passed; pending reveals hold a credit for 24 hours. Sample data is never limited.
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

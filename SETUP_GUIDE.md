# York Press Hiring — Setup guide

This guide gets the app online on Vercel in about 30 minutes, without writing code. Everything runs in **mock mode** (sample candidates, emails kept in the app) until you add the paid API keys, so you can demo it to Khalil straight away.

You need: a **GitHub** account and a **Vercel** account.

---

## Step 1 — The code on GitHub (done)

The code lives at **https://github.com/AbedAmouneh/york-press-hiring**. The local copy is `~/Development/hiring-platform`. Every push to `main` runs CI and, once Vercel is connected, redeploys the site.

## Step 2 — Create the project on Vercel

1. Go to **vercel.com → Add New… → Project** and import `york-press-hiring` from GitHub.
2. Vercel detects **Vite**. Leave the build settings as they are.
3. Before clicking Deploy, open **Environment Variables** and add these (generate the secrets at https://generate-secret.vercel.app/32 or with `openssl rand -hex 32`):

   | Name | Value |
   |---|---|
   | `SESSION_SECRET` | a long random string |
   | `INTERNAL_SECRET` | another long random string |
   | `SIGNALHIRE_WEBHOOK_SECRET` | another long random string |
   | `CRON_SECRET` | another long random string |
   | `DEMO_MODE` | `true` (creates demo accounts for each role) |
   | `EMAIL_FROM` | `York Press Hiring <hiring@york-press.com>` |

4. Click **Deploy**. The first deploy will show an error page until the database exists — that's expected.

## Step 3 — Add the database (free)

1. In your Vercel project: **Storage → Create Database → Neon (Postgres)** → Continue → choose the free plan and a region close to you (e.g. Frankfurt).
2. Connect it to the project. Vercel adds `DATABASE_URL` automatically.
3. Go to **Settings → Environment Variables** and add `APP_URL` = your site address, e.g. `https://york-press-hiring.vercel.app` (no slash at the end).
4. **Deployments → … → Redeploy.** Each deployment sets up or updates the database tables before the new version goes live, so there's nothing to run by hand.

## Step 4 — First sign-in

1. Open your site. You'll see **First-time setup**.
2. Your name and email are pre-filled. Choose a password, check Khalil's email (`khalil.sayegh@york-press.com`), and optionally list department managers (one per line: `Name, email, Department`).
3. Click **Create account and send invites**. While email is in mock mode, the invite links are shown on screen — send them to Khalil and the managers yourself.
4. **Two-step login (optional, off):** to make admin and CEO accounts enter a code from a phone app as well as the password, add `REQUIRE_TWO_FACTOR=true` in Vercel and redeploy. Each of them then scans a QR code on their next sign-in and saves 8 recovery codes.

**Try the whole flow with the demo accounts** (password `demo-york-2026`, buttons on the sign-in page):
Manager → *New request* → *Submit* · CEO → *Approvals* → *Approve* · Recruiter → *Open roles* → watch ~50 sample candidates get scored → Top 10 contacted.

**Positions and locations:** Settings → **Positions** holds the jobs York Press hires for often, with a suggested job description and requirements; Settings → **Locations** holds the offices and countries York Press hires in, with their work arrangement and hours. Managers pick from both on every request and can change anything. Add, edit or hide entries as the company grows.

When you go live, turn demo accounts off: set `DEMO_MODE` to `false` and deactivate the demo users under **Users**.

## Step 5 — Logo

Save the York Press logo as `public/brand/logo.png` (see `public/brand/README.md`), commit and push in GitHub Desktop. Vercel redeploys automatically.

---

## Step 6 — Switch on the real services (when purchased)

Add each key under **Vercel → Settings → Environment Variables**, then **Redeploy**. The **Settings → Connections** page in the app shows which ones are live.

| Service | Variable | Where to get it | What changes |
|---|---|---|---|
| Claude | `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | Real search briefs, scoring, personal lines, web search, CV scoring |
| People Data Labs (optional) | `PDL_API_KEY` | dashboard.peopledatalabs.com → API keys | A second candidate source with fuller profiles (dates, education). Without it, SignalHire alone is searched |
| SignalHire | `SIGNALHIRE_API_KEY` | signalhire.com/apiIntegrations | Real search + contact reveal for the Top 10 |
| Resend (email) | `RESEND_API_KEY` | resend.com → API keys | Emails really send |

### Email: make outreach come from your york-press.com address

Your mailboxes stay on **Rackspace**; Resend only *sends*. Replies go to each recruiter's normal inbox.

1. In Resend: **Domains → Add domain → york-press.com**.
2. Resend shows a few DNS records (DKIM, plus SPF/MX on a `send.` sub-domain). Add exactly those records where york-press.com's DNS is managed (Rackspace Cloud DNS or your domain registrar). Your IT contact can do this in 5 minutes. They don't change the records your Rackspace mailboxes use.
3. Wait until Resend shows the domain as **Verified**, then add `RESEND_API_KEY` in Vercel and redeploy.

### CV storage (Vercel Blob)

CVs that candidates upload are kept in a **private** Vercel Blob store, not in the database. Only signed-in recruiters and the hiring manager can download them, through the app.

1. In Vercel: **Storage → Create → Blob**, choose **Private** access, and connect it to this project. Vercel adds `BLOB_READ_WRITE_TOKEN` for you.
2. Redeploy.
3. If CVs were uploaded before this, move them once: run `npm run cvs:to-blob` with `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` set (copy them from Vercel).

Without the token (on your Mac), CVs stay in the local database.

### A test copy of the site for every pull request

Every pull request on GitHub gets its own copy of the site with its own database, so a change can be clicked through before it reaches the real one. Vercel posts the link as a comment on the pull request.

1. **Keep previews private:** Vercel → Settings → Deployment Protection → leave **Vercel Authentication** on for previews. Only your Vercel team can open them.
2. **A database per preview:** Vercel → Storage → your Neon database → Settings → turn on **Preview** branching (the option to create a branch for each preview deployment). Each preview then gets its own copy of the database; the build applies any new migrations to that copy only, and the copy is deleted with the preview.
3. **Environment variables:** set `APP_URL` for **Production** only, and add `DEMO_MODE=true` for **Preview** so you can sign in with the demo buttons.
4. Optional: Settings → Deployment Protection → **Protection Bypass for Automation**, so long sourcing runs can continue themselves inside a preview.

Previews show a yellow "Test copy" banner, use sample candidates and keep every email in the mock outbox, even though your API keys are present. Nothing in a preview emails a candidate or spends credits. (To test with the real services, set `PREVIEW_USE_REAL_SERVICES=true` for Preview.) Because a preview database starts as a copy of the live one, keep step 1 on.

### Scoring quality check (optional, a few cents a week)

The repo has a test set of fictional candidates with the scores a good recruiter would expect. To have GitHub check Claude's scoring every Monday and whenever the scoring prompts change, add your Anthropic key as a secret: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**, name `ANTHROPIC_API_KEY`. Results appear under the **Actions** tab as "Scoring eval".

### Reliable sourcing runs (Upstash QStash, free plan is enough)

A sourcing run takes several minutes and is split into slices. QStash hands each slice to the app and retries automatically if one fails or times out, so a run never silently stops halfway.

1. In Vercel: **Storage → Create → Upstash → QStash** (or **Integrations → Upstash**), and connect it to this project. Vercel adds `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`.
2. Make sure `APP_URL` is your live https address, then redeploy.

Without it, runs still work the old way: each slice starts the next one directly, and the daily job restarts any run that got stuck.

With QStash on, the Monday refresh also scores candidates through Claude's batch service at **half price**. Results arrive within the hour instead of minutes, which is fine for a weekly refresh. First runs and "Refresh now" still score straight away.

### Error alerts (Sentry, free plan is enough)

1. Sign up at sentry.io and create a project of type **React** (it covers the browser; the server uses the same project).
2. Copy the **DSN** from Project Settings → Client Keys.
3. In Vercel add `SENTRY_DSN` and `VITE_SENTRY_DSN`, both set to that DSN, then redeploy.
4. Optional, for readable stack traces: create an auth token under Settings → Auth Tokens and add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`.

Sentry then emails you when a page crashes, an API call fails, or a sourcing run stops. It never receives candidate details, CVs, form contents or cookies.

### SignalHire contact results

SignalHire sends contact results back to the app automatically. This only works once `APP_URL` is your real `https://…vercel.app` address. Nothing else to configure.

---

## Daily and weekly automation

Vercel runs `/api/cron/daily` every day at 06:00 UTC (08:00–09:00 Beirut). It:

- sends queued outreach emails within the daily cap (unless the kill switch is off),
- reminds Khalil about requests waiting more than 48 hours,
- resumes any sourcing run that was interrupted,
- deletes personal data nobody has touched for 24 months (candidates not in an open role, CVs for closed roles, copies of sent emails, old notifications). The do-not-contact list is kept. **Settings** shows what the next run would delete,
- on **Mondays**: re-runs sourcing for every open role (new profiles only, "New contender" flags) and emails Khalil the weekly summary.

## LinkedIn messages (candidates without an email)

These are never sent automatically. Approve them in **LinkedIn queue**, then in Cowork say:

> Send the approved LinkedIn messages from the York Press Hiring queue.

Claude opens each profile in your Chrome, sends the note at a human pace, and clicks **Mark as sent** in the app.

## Running it on your Mac (optional)

Install Node.js 20+ from nodejs.org, then in Terminal:

```bash
cd ~/Development/hiring-platform
cp .env.example .env
npm install --include=dev
NODE_ENV=development npm run dev
```

Open http://localhost:5173. Data is stored in the `.data` folder.

## If something goes wrong

| You see | Do this |
|---|---|
| "DATABASE_URL is not set" | Step 3: add the Neon database and redeploy |
| A deployment fails with "Migration failed" | The database update didn't apply, so the previous version stays live and nothing is lost. Send me the build log |
| Candidates never appear | Role page → *Runs & cost* shows the error. Check the API key in Settings → Connections |
| Emails stay "queued" | Settings → the kill switch may be off, or today's cap is reached |
| Contacts stay "Waiting for SignalHire" | Check `APP_URL` is the live https address; SignalHire also emails you about failed deliveries |
| Someone forgot their password | Users → *Resend invite* |
| Admin or CEO lost their phone (two-step login on) | Sign in with one of the recovery codes in place of the 6-digit code. If those are gone too, another admin opens **Users → Reset 2-step**, and the person sets it up again with a new QR code |
| Everyone's two-step login stopped working after changing `SESSION_SECRET` | The authenticator secrets are encrypted with it. Put the old value back, or reset two-step login for each admin and CEO |

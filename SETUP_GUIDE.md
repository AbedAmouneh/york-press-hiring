# York Press Hiring — Setup guide

This guide gets the app online on Vercel in about 30 minutes, without writing code. Everything runs in **mock mode** (sample candidates, emails kept in the app) until you add the paid API keys, so you can demo it to Khalil straight away.

You need: a **GitHub** account, a **Vercel** account, and this folder.

---

## Step 1 — Put the code on GitHub

1. Go to **github.com → New repository**. Name it `york-press-hiring`, choose **Private**, and click **Create repository**. Don't add a README.
2. Install **GitHub Desktop** (desktop.github.com) if you don't have it, and sign in.
3. In GitHub Desktop: **File → Add local repository…** → choose the `hiring-platform` folder inside *Linkedin Automation*.
   - If it says "this directory does not appear to be a Git repository", click **create a repository** and keep the defaults.
4. Click **Publish repository** (or **Push origin**) and pick the private `york-press-hiring` repo you created.

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
4. **Deployments → … → Redeploy.**

## Step 4 — First sign-in

1. Open your site. You'll see **First-time setup**.
2. Your name and email are pre-filled. Choose a password, check Khalil's email (`khalil.sayegh@york-press.com`), and optionally list department managers (one per line: `Name, email, Department`).
3. Click **Create account and send invites**. While email is in mock mode, the invite links are shown on screen — send them to Khalil and the managers yourself.

**Try the whole flow with the demo accounts** (password `demo-york-2026`, buttons on the sign-in page):
Manager → *New request* → *Submit* · CEO → *Approvals* → *Approve* · Recruiter → *Open roles* → watch ~50 sample candidates get scored → Top 10 contacted.

When you go live, turn demo accounts off: set `DEMO_MODE` to `false` and deactivate the demo users under **Users**.

## Step 5 — Logo

Save the York Press logo as `public/brand/logo.png` (see `public/brand/README.md`), commit and push in GitHub Desktop. Vercel redeploys automatically.

---

## Step 6 — Switch on the real services (when purchased)

Add each key under **Vercel → Settings → Environment Variables**, then **Redeploy**. The **Settings → Connections** page in the app shows which ones are live.

| Service | Variable | Where to get it | What changes |
|---|---|---|---|
| Claude | `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | Real search briefs, scoring, personal lines, web search, CV scoring |
| People Data Labs | `PDL_API_KEY` | dashboard.peopledatalabs.com → API keys | Real candidate search |
| SignalHire | `SIGNALHIRE_API_KEY` | signalhire.com/apiIntegrations | Real search + contact reveal for the Top 10 |
| Resend (email) | `RESEND_API_KEY` | resend.com → API keys | Emails really send |

### Email: make outreach come from your york-press.com address

Your mailboxes stay on **Rackspace**; Resend only *sends*. Replies go to each recruiter's normal inbox.

1. In Resend: **Domains → Add domain → york-press.com**.
2. Resend shows a few DNS records (DKIM, plus SPF/MX on a `send.` sub-domain). Add exactly those records where york-press.com's DNS is managed (Rackspace Cloud DNS or your domain registrar). Your IT contact can do this in 5 minutes. They don't change the records your Rackspace mailboxes use.
3. Wait until Resend shows the domain as **Verified**, then add `RESEND_API_KEY` in Vercel and redeploy.

### SignalHire contact results

SignalHire sends contact results back to the app automatically. This only works once `APP_URL` is your real `https://…vercel.app` address. Nothing else to configure.

---

## Daily and weekly automation

Vercel runs `/api/cron/daily` every day at 06:00 UTC (08:00–09:00 Beirut). It:

- sends queued outreach emails within the daily cap (unless the kill switch is off),
- reminds Khalil about requests waiting more than 48 hours,
- resumes any sourcing run that was interrupted,
- on **Mondays**: re-runs sourcing for every open role (new profiles only, "New contender" flags) and emails Khalil the weekly summary.

## LinkedIn messages (candidates without an email)

These are never sent automatically. Approve them in **LinkedIn queue**, then in Cowork say:

> Send the approved LinkedIn messages from the York Press Hiring queue.

Claude opens each profile in your Chrome, sends the note at a human pace, and clicks **Mark as sent** in the app.

## Running it on your Mac (optional)

Install Node.js 20+ from nodejs.org, then in Terminal:

```bash
cd "~/Documents/Linkedin Automation /hiring-platform"
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. Data is stored in the `.data` folder.

## If something goes wrong

| You see | Do this |
|---|---|
| "DATABASE_URL is not set" | Step 3: add the Neon database and redeploy |
| Candidates never appear | Role page → *Runs & cost* shows the error. Check the API key in Settings → Connections |
| Emails stay "queued" | Settings → the kill switch may be off, or today's cap is reached |
| Contacts stay "Waiting for SignalHire" | Check `APP_URL` is the live https address; SignalHire also emails you about failed deliveries |
| Someone forgot their password | Users → *Resend invite* |

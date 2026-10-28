// End-to-end check in mock mode against a throwaway database: `npm run smoke`
/* eslint-disable @typescript-eslint/no-explicit-any -- test script reads untyped JSON responses */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-smoke-"));
process.env.DEMO_MODE = "true";
process.env.REQUIRE_TWO_FACTOR = "true"; // check the strictest setup
for (const k of ["DATABASE_URL", "ANTHROPIC_API_KEY", "PDL_API_KEY", "SIGNALHIRE_API_KEY", "RESEND_API_KEY"]) delete process.env[k];

const { default: app } = await import("../server/app.js");
const { currentCode } = await import("../server/services/two-factor.js");

/** A signed-in browser stand-in: keeps cookies between calls like a real browser. */
function client() {
  const jar = new Map<string, string>();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const raw = async (method: string, url: string, body?: unknown) => {
    const res = await app.fetch(new Request(`http://localhost/api${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...(jar.size ? { cookie: cookie() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const [name, value] = pair.split("=");
      const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || !value) jar.delete(name.trim()); else jar.set(name.trim(), value);
    }
    return res;
  };
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await raw(method, url, body);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
    return json as any;
  };
  return Object.assign(call, { raw, cookie });
}

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error(`FAILED: ${msg}`); console.log(`✓ ${msg}`); };

const admin = client();
ok((await admin("GET", "/setup")).needsSetup, "setup needed on empty database");
await admin("POST", "/setup", {
  adminName: "Abed El-Fattah Amouneh", adminEmail: "abed.amouneh@york-press.com", adminPassword: "a-long-password-123",
  ceoName: "Khalil Sayegh", ceoEmail: "khalil.sayegh@york-press.com", managers: [],
});
ok((await admin("GET", "/auth/me")).user?.roles.includes("admin"), "admin signed in after setup");
ok((await admin.raw("GET", "/requests")).status === 403, "admin must set up two-step login before using the app");
const enrol = await admin("POST", "/auth/2fa/setup");
ok(enrol.qrDataUrl.startsWith("data:image/png") && enrol.uri.startsWith("otpauth://totp/"), "two-step setup returns a QR code");
const { recoveryCodes } = await admin("POST", "/auth/2fa/enable", { code: currentCode(enrol.secret) });
ok(recoveryCodes.length === 8, "admin turned on two-step login and got 8 recovery codes");
ok((await admin("GET", "/auth/me")).user.twoFactorEnabled, "admin can use the app once two-step login is on");

const manager = client();
await manager("POST", "/auth/login", { email: "demo.manager@york-press.test", password: "demo-york-2026" });
const { id } = await manager("POST", "/requests?submit=true", {
  title: "Senior Product Designer", department: "Product & Technology", seniority: "Senior", headcount: 1,
  jdText: "Design York-E.", mustHaves: ["Figma", "Design systems", "User research"], niceToHaves: ["Edtech"], dealBreakers: [],
  minYears: 5, idealYears: 8, languages: ["English"], locationPolicy: "Remote, global", searchLocations: ["Lebanon"],
  salaryMin: 50000, salaryMax: 70000, currency: "USD", justification: "Needed for York-E.",
});
ok(id, "manager submitted a request");

const ceo = client();
await ceo("POST", "/auth/login", { email: "demo.ceo@york-press.test", password: "demo-york-2026" });
ok((await ceo("GET", "/requests?scope=approvals")).requests.length === 1, "CEO sees it in approvals");
const outsider = client();
await outsider("POST", "/auth/login", { email: "demo.hm@york-press.test", password: "demo-york-2026" });
ok((await outsider("GET", "/requests?scope=approvals")).requests.length === 0, "someone else's pending request stays out of other users' Approvals list");
ok((await outsider("GET", "/requests?scope=mine")).requests.length === 0, "and out of their own list");
await ceo("POST", `/requests/${id}/decision`, { action: "approve" });

let status = "";
for (let i = 0; i < 100 && status !== "open"; i++) {
  await new Promise((r) => setTimeout(r, 200));
  status = (await admin("GET", `/requests/${id}`)).request.status;
}
ok(status === "open", "sourcing finished and role is open");
const { candidates } = await admin("GET", `/requests/${id}/candidates`);
ok(candidates.length >= 40, `${candidates.length} candidates screened`);
ok(candidates.filter((c: any) => c.isTop10).length === 10, "Top 10 flagged");
const runs = (await admin("GET", `/requests/${id}/runs`)).runs;
console.log(runs[0].state.log.map((l: any) => `  · ${l.msg}`).join("\n"));
const outreach = await admin("GET", "/outreach");
ok(outreach.messages.length > 0, `${outreach.messages.length} outreach messages (email ${outreach.messages.filter((m: any) => m.channel === "email").length}, LinkedIn ${outreach.messages.filter((m: any) => m.channel === "linkedin").length})`);
const detail = await admin("GET", `/role-candidates/${candidates[0].id}`);
ok(detail.roleCandidate.scoreBreakdown, "candidate detail has a score breakdown");
const hm = client();
await hm("POST", "/auth/login", { email: "demo.manager@york-press.test", password: "demo-york-2026" });
await hm("PATCH", `/role-candidates/${candidates[0].id}`, { hmDecision: "yes", hmComment: "Interview" });
ok(true, "hiring manager recorded a decision");
const weekly = await admin("POST", `/requests/${id}/runs`);
ok(weekly.runId, "manual refresh started");
await new Promise((r) => setTimeout(r, 4000));
ok((await admin("GET", "/outbox")).emails.length > 0, "emails captured in the mock outbox");

// ---------------------------------------------------------------- CV upload and download
const { applyToken } = (await admin("GET", `/requests/${id}`)).request;
const cvText = "Rana Haddad\nSenior Product Designer, 9 years. Figma, design systems, user research.";
const form = new FormData();
form.set("name", "Rana Haddad");
form.set("email", "rana.haddad@example.test");
form.set("consent", "true");
form.set("cv", new File([cvText], "rana-cv.txt", { type: "text/plain" }));
const applied = await app.fetch(new Request(`http://localhost/api/public/apply/${applyToken}`, { method: "POST", body: form }));
ok(applied.ok, "a candidate uploaded a CV on the apply page");
const { applications } = await admin("GET", `/requests/${id}/applications`);
ok(applications.length === 1 && applications[0].score != null, "the CV is listed and scored");
const download = await admin.raw("GET", `/applications/${applications[0].id}/cv`);
ok(download.ok && (await download.text()) === cvText, "the recruiter downloads the same CV file");
ok((await app.fetch(new Request(`http://localhost/api/applications/${applications[0].id}/cv`))).status === 401, "CVs need a signed-in user");

// ---------------------------------------------------------------- daily job and data retention
const retention = await admin("GET", "/retention");
ok(retention.months === 24 && retention.nextRun.candidates === 0, "retention preview: nothing is old enough to delete yet");
const daily = await admin("GET", "/cron/daily");
ok(daily.retention && daily.retention.candidates === 0, "the daily job runs the retention step");

// ---------------------------------------------------------------- security
const raw = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost/api${url}`, {
    method,
    headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.9", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }));
const health = await raw("GET", "/health");
ok(health.headers.get("x-frame-options") === "DENY" && health.headers.get("cache-control") === "no-store", "API responses carry security headers");
ok((await raw("POST", "/auth/login", { email: "demo.ceo@york-press.test", password: "demo-york-2026" }, { origin: "https://evil.example" })).status === 403, "cross-site sign-in is blocked");
ok((await raw("POST", "/auth/login", { email: "demo.ceo@york-press.test", password: "x" }, { "sec-fetch-site": "cross-site" })).status === 403, "Sec-Fetch-Site cross-site is blocked");
for (let i = 0; i < 5; i++) await raw("POST", "/auth/login", { email: "demo.ceo@york-press.test", password: `wrong-${i}` });
const locked = await raw("POST", "/auth/login", { email: "demo.ceo@york-press.test", password: "demo-york-2026" });
ok(locked.status === 429, "sign-in locks after 5 failed attempts, even with the right password");
ok((await raw("POST", "/auth/login", { email: "demo.recruiter@york-press.test", password: "demo-york-2026" })).status === 200, "other accounts can still sign in");
ok((await raw("POST", "/internal/queue/runs", { runId: weekly.runId })).status === 401, "the job queue endpoint rejects unsigned calls");
ok((await raw("POST", "/setup", { adminName: "X Y", adminEmail: "x@y.test", adminPassword: "a-long-password", ceoName: "C D", ceoEmail: "c@d.test" })).status === 409, "setup can't run twice");

// ---------------------------------------------------------------- two-step sign-in
const abed = { email: "abed.amouneh@york-press.com", password: "a-long-password-123" };
const second = client();
const step1 = await second("POST", "/auth/login", abed);
ok(step1.mfaRequired && !step1.user, "a password alone doesn't sign the admin in");
ok((await second("GET", "/auth/me")).user === null, "no session before the second step");
ok((await second.raw("POST", "/auth/mfa", { code: "000000" })).status === 401, "a wrong code is refused");
const step2 = await second("POST", "/auth/mfa", { code: recoveryCodes[0] });
ok(step2.user.email === abed.email && step2.recoveryCodesLeft === 7, "a recovery code signs in once and is used up");
const third = client();
await third("POST", "/auth/login", abed);
ok((await third.raw("POST", "/auth/mfa", { code: recoveryCodes[0] })).status === 401, "the same recovery code can't be used twice");
ok((await client().raw("POST", "/auth/mfa", { code: currentCode(enrol.secret) })).status === 401, "the second step needs the password step first");

console.log("\nAll smoke checks passed.");
process.exit(0);

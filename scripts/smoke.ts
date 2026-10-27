// End-to-end check in mock mode against a throwaway database: `npm run smoke`
/* eslint-disable @typescript-eslint/no-explicit-any -- test script reads untyped JSON responses */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-smoke-"));
process.env.DEMO_MODE = "true";
for (const k of ["DATABASE_URL", "ANTHROPIC_API_KEY", "PDL_API_KEY", "SIGNALHIRE_API_KEY", "RESEND_API_KEY"]) delete process.env[k];

const { default: app } = await import("../server/app.js");

function client() {
  let cookie = "";
  return async (method: string, url: string, body?: unknown) => {
    const res = await app.fetch(new Request(`http://localhost/api${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
    return json as any;
  };
}

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error(`FAILED: ${msg}`); console.log(`✓ ${msg}`); };

const admin = client();
ok((await admin("GET", "/setup")).needsSetup, "setup needed on empty database");
await admin("POST", "/setup", {
  adminName: "Abed El-Fattah Amouneh", adminEmail: "abed.amouneh@york-press.com", adminPassword: "a-long-password-123",
  ceoName: "Khalil Sayegh", ceoEmail: "khalil.sayegh@york-press.com", managers: [],
});
ok((await admin("GET", "/auth/me")).user?.roles.includes("admin"), "admin signed in after setup");

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
ok((await raw("POST", "/setup", { adminName: "X Y", adminEmail: "x@y.test", adminPassword: "a-long-password", ceoName: "C D", ceoEmail: "c@d.test" })).status === 409, "setup can't run twice");
console.log("\nAll smoke checks passed.");
process.exit(0);

// End-to-end check in mock mode against a throwaway database: `npm run smoke`
/* eslint-disable @typescript-eslint/no-explicit-any -- test script reads untyped JSON responses */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-smoke-"));
process.env.DEMO_MODE = "true";
process.env.REQUIRE_TWO_FACTOR = "true"; // check the strictest setup
for (const k of ["DATABASE_URL", "ANTHROPIC_API_KEY", "OPENCODE_API_KEY", "PDL_API_KEY", "SIGNALHIRE_API_KEY", "RESEND_API_KEY"]) delete process.env[k];

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

// ---------------------------------------------------------------- saved positions
const starter = (await manager("GET", "/positions")).positions;
const accountant = starter.find((p: any) => p.title === "Accountant");
ok(starter.length === 29 && accountant?.seniority === "Entry" && accountant.jdText.includes("Accounting"), `managers see ${starter.length} saved positions with suggested details and a job description`);
ok((await manager.raw("POST", "/positions", { title: "Sneaky", department: "Editorial", seniority: "Mid" })).status === 403, "managers can't change the list");
const recruiter = client();
await recruiter("POST", "/auth/login", { email: "demo.recruiter@york-press.test", password: "demo-york-2026" });
const { position } = await recruiter("POST", "/positions", { title: "Audio Producer", department: "Product & Technology", seniority: "Mid", mustHaves: ["Audio editing"], minYears: 2, idealYears: 4 });
ok(position.languages.length === 0 && position.active, "a recruiter added a position");
ok((await recruiter.raw("POST", "/positions", { title: "audio producer", department: "Editorial", seniority: "Mid" })).status === 409, "the same title can't be added twice");
ok((await recruiter.raw("PATCH", `/positions/${position.id}`, { minYears: 6 })).status === 400, "ideal years can't drop below the minimum");
const renamed = (await recruiter("PATCH", `/positions/${position.id}`, { title: "Audio & Video Producer", active: false })).position;
ok(renamed.mustHaves[0] === "Audio editing", "renaming keeps the suggested details");
ok(!(await manager("GET", "/positions")).positions.some((p: any) => p.id === position.id), "hidden positions aren't offered to managers");
await recruiter("DELETE", `/positions/${position.id}`);
ok(!(await recruiter("GET", "/positions")).positions.some((p: any) => p.id === position.id), "a recruiter deleted it");

// ---------------------------------------------------------------- hiring locations
const places = (await manager("GET", "/locations")).locations;
const lebanon = places.find((l: any) => l.name === "Zouk Mosbeh, Lebanon");
ok(places.length === 11 && lebanon?.country === "Lebanon" && lebanon.workingHours.includes("Sat"), `managers see ${places.length} hiring locations`);
ok((await manager.raw("POST", "/locations", { name: "Somewhere", country: "Nowhere" })).status === 403, "managers can't change the locations");
const { location } = await recruiter("POST", "/locations", { name: "Riyadh, Saudi Arabia", country: "Saudi Arabia", city: "Riyadh", workArrangement: "Hybrid" });
ok(location.workingHours === "" && location.active, "a recruiter added a location");
ok((await recruiter.raw("POST", "/locations", { name: "riyadh, saudi arabia", country: "Saudi Arabia" })).status === 409, "the same location can't be added twice");
await recruiter("PATCH", `/locations/${location.id}`, { workingHours: "Sun–Thu 8:00–16:00" });
await recruiter("DELETE", `/locations/${location.id}`);
ok(!(await recruiter("GET", "/locations")).locations.some((l: any) => l.id === location.id), "a recruiter edited and deleted it");
const ghost = await manager.raw("POST", "/requests", { title: "Ghost role", department: "Finance", seniority: "Mid", locationId: location.id });
ok(ghost.status === 400 && (await ghost.json()).error.includes("location no longer exists"), "a request can't point at a deleted location");
const { id } = await manager("POST", "/requests?submit=true", {
  title: "Senior Product Designer", department: "Product & Technology", seniority: "Senior", headcount: 1,
  jdText: "Design York-E.", mustHaves: ["Figma", "Design systems", "User research"], niceToHaves: ["Edtech"], dealBreakers: [],
  minYears: 5, idealYears: 8, languages: ["English"], locationPolicy: "Remote, global", searchLocations: ["Lebanon"],
  salaryMin: 50000, salaryMax: 70000, currency: "USD", justification: "Needed for York-E.",
  locationId: lebanon.id, workingHours: lebanon.workingHours,
});
ok(id, "manager submitted a request");
ok((await manager("GET", `/requests/${id}`)).request.locationId === lebanon.id, "the request keeps its location");

const ceo = client();
await ceo("POST", "/auth/login", { email: "demo.ceo@york-press.test", password: "demo-york-2026" });
ok((await ceo("GET", "/requests?scope=approvals")).requests.length === 1, "CEO sees it in approvals");
const outsider = client();
await outsider("POST", "/auth/login", { email: "demo.hm@york-press.test", password: "demo-york-2026" });
ok((await outsider("GET", "/requests?scope=approvals")).requests.length === 0, "someone else's pending request stays out of other users' Approvals list");
ok((await outsider("GET", "/requests?scope=mine")).requests.length === 0, "and out of their own list");

// Comments on Khalil's decisions. The admin is the requester here because demo accounts get no email.
const { id: commentReq } = await admin("POST", "/requests?submit=true", {
  title: "Comment check", department: "Editorial", seniority: "Mid", locationId: lebanon.id, currency: "USD", justification: "Checking comments.",
});
const decide = (who: typeof ceo, action: string, comment?: string) => who.raw("POST", `/requests/${commentReq}/decision`, { action, comment });
ok((await decide(manager, "approve")).status === 403, "only the CEO can decide on a request");
ok((await decide(ceo, "request_changes", "   ")).status === 400, "sending a request back needs a real comment");
ok((await decide(ceo, "reject", "x".repeat(2001))).status === 400, "decision comments are capped at 2,000 characters");
const tricky = "Please add:\n- the start date\n<b>not bold</b>";
ok((await decide(ceo, "request_changes", tricky)).status === 200, "the CEO sent it back with a comment");
ok((await admin("GET", `/requests/${commentReq}`)).events.some((e: any) => e.action === "Requested changes" && e.comment === tricky), "the requester sees the comment exactly as written");
ok((await decide(ceo, "approve")).status === 400, "a request that isn't waiting can't be decided");
const decisionMail = (await admin("GET", "/outbox")).emails.find((e: any) => e.subject === "Changes requested: Comment check");
ok(decisionMail?.body.includes("comment:\nPlease add:\n- the start date"), "the requester's email carries the comment and its line breaks");
await admin("POST", `/requests/${commentReq}/submit`);
const together = await Promise.all([decide(ceo, "reject", "No budget."), decide(ceo, "request_changes", "Add the owner.")]);
const decided = (await admin("GET", `/requests/${commentReq}`)).events.filter((e: any) => ["Rejected", "Requested changes"].includes(e.action));
ok(together.filter((r) => r.status === 200).length === 1 && decided.length === 2, "two decisions sent at once only apply once");

// The discussion on a request.
const say = (who: typeof ceo, body: string, reqId = commentReq) => who.raw("POST", `/requests/${reqId}/messages`, { body });
ok((await say(outsider, "Hello?")).status === 403, "someone who can't open a request can't post on it");
ok((await outsider.raw("GET", `/requests/${commentReq}/messages`)).status === 403, "or read its discussion");
ok((await say(ceo, "   ")).status === 400, "an empty message is refused");
const posted = await say(ceo, "Is the budget owner Finance?\n<b>not bold</b>");
const { message: ceoMessage } = await posted.json();
ok(posted.status === 200 && ceoMessage.canDelete, "the CEO posted a message");
const thread = (await admin("GET", `/requests/${commentReq}/messages`)).messages;
ok(thread.length === 1 && thread[0].body === "Is the budget owner Finance?\n<b>not bold</b>" && !thread[0].canDelete, "the requester reads it exactly as written and can't delete it");
const messageMail = (await admin("GET", "/outbox")).emails.find((e: any) => e.subject === "Demo CEO wrote on Comment check");
ok(messageMail?.body.includes("Is the budget owner Finance?"), "the requester is emailed the message");
ok((await admin("GET", "/notifications")).notifications.some((n: any) => n.link === `/requests/${commentReq}#discussion`), "and notified in the app");
ok((await admin.raw("DELETE", `/requests/${commentReq}/messages/${ceoMessage.id}`)).status === 403, "only the author can delete a message");
ok((await ceo.raw("DELETE", `/requests/${commentReq}/messages/${ceoMessage.id}`)).status === 200, "the author can delete it straight after");
ok((await admin("GET", `/requests/${commentReq}/messages`)).messages.length === 0, "and it's gone for everyone");
// Someone who took part but has since lost access is not sent new messages.
const hmUser = (await outsider("GET", "/auth/me")).user;
const { id: talkReq } = await admin("POST", "/requests", { title: "Access check", department: "Editorial", seniority: "Mid", hiringManagerId: hmUser.id });
ok((await say(outsider, "Happy to interview for this.", talkReq)).status === 200, "the hiring manager joins the discussion");
await admin("PATCH", `/requests/${talkReq}`, { hiringManagerId: null });
ok((await say(outsider, "Still here?", talkReq)).status === 403, "once removed, they can't post");
await say(ceo, "Budget confirmed.", talkReq);
const leaked = (await outsider("GET", "/notifications")).notifications.some((n: any) => n.link === `/requests/${talkReq}#discussion` && n.title.startsWith("Demo CEO"));
ok(!leaked, "and they aren't sent later messages");
const burst = [];
for (let i = 0; i < 21; i++) burst.push((await say(admin, `Note ${i}`)).status);
ok(burst.slice(0, 20).every((s) => s === 200) && burst[20] === 429, "a burst of messages is capped at 20 in 10 minutes");

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

// ---------------------------------------------------------------- adding users by hand
const team = async () => (await second("GET", "/users")).users as any[];
const khalil = (await team()).find((u) => u.email === "khalil.sayegh@york-press.com");
ok(khalil?.invited, "Khalil starts as an unaccepted invite");
await second("DELETE", `/users/${khalil.id}`);
ok(!(await team()).some((u) => u.email === khalil.email), "an unaccepted invite can be cancelled");
const made = await second("POST", "/users", { name: "Khalil Sayegh", email: "khalil.sayegh@york-press.com", roles: ["ceo"], password: "starting-pass-123" });
ok(made.user.passwordChangeRequired && !made.user.invited && !made.inviteLink, "an admin can create an account with a starting password");
ok((await second.raw("POST", "/users", { name: "Khalil Again", email: "khalil.sayegh@york-press.com", roles: ["ceo"], password: "another-pass-456" })).status === 409, "a second account for the same email is refused");
ok((await second.raw("DELETE", `/users/${made.user.id}`)).status === 400, "an account with a password can't be cancelled, only switched off");
const khalilWeb = client();
const khalilOther = client();
await khalilOther("POST", "/auth/login", { email: "khalil.sayegh@york-press.com", password: "starting-pass-123" });
ok((await khalilWeb("POST", "/auth/login", { email: "khalil.sayegh@york-press.com", password: "starting-pass-123" })).user.passwordChangeRequired, "signing in with the starting password asks for a new one");
ok((await khalilWeb.raw("GET", "/requests")).status === 403, "the app stays locked until the new password is set");
ok((await khalilWeb.raw("POST", "/auth/password", { password: "starting-pass-123" })).status === 400, "the starting password can't be kept");
ok((await khalilWeb.raw("POST", "/auth/password", { password: "short" })).status === 400, "the new password needs 10 characters");
const changed = await khalilWeb("POST", "/auth/password", { password: "khalils-own-password" });
ok(!changed.user.passwordChangeRequired && (await khalilWeb("GET", "/auth/me")).user.passwordChangeRequired === false, "the new password unlocks the account");
ok((await khalilOther("GET", "/auth/me")).user === null, "other sessions opened with the starting password are signed out");
ok((await khalilWeb.raw("POST", "/auth/password", { password: "yet-another-password" })).status === 400, "the forced change only happens once");

// ---------------------------------------------------------------- DEMO_MODE switches demo accounts
const demoUser = client();
await demoUser("POST", "/auth/login", { email: "demo.recruiter@york-press.test", password: "demo-york-2026" });
process.env.DEMO_MODE = "false";
ok((await demoUser("GET", "/auth/me")).user === null, "with DEMO_MODE off, open demo sessions stop working");
ok((await client().raw("POST", "/auth/login", { email: "demo.recruiter@york-press.test", password: "demo-york-2026" })).status === 401, "with DEMO_MODE off, demo accounts can't sign in");
process.env.DEMO_MODE = "true";
const demoHm = (await team()).find((u) => u.email === "demo.hm@york-press.test");
await second("PATCH", `/users/${demoHm.id}`, { active: false });
const { seedDemoUsers } = await import("../server/services/setup.js");
await seedDemoUsers();
ok((await team()).find((u) => u.email === "demo.hm@york-press.test")?.active, "with DEMO_MODE on, switched-off demo accounts come back (test copies)");

console.log("\nAll smoke checks passed.");
process.exit(0);

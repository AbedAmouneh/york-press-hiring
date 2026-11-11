// End-to-end check in mock mode against a throwaway database: `npm run smoke`
/* eslint-disable @typescript-eslint/no-explicit-any -- test script reads untyped JSON responses */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-smoke-"));
process.env.DEMO_MODE = "true";
process.env.REQUIRE_TWO_FACTOR = "true"; // check the strictest setup
for (const k of ["DATABASE_URL", "ANTHROPIC_API_KEY", "OPENCODE_API_KEY", "GEMINI_API_KEY", "PDL_API_KEY", "SIGNALHIRE_API_KEY", "RESEND_API_KEY"]) delete process.env[k];

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
const inviteMail = (await recruiter("GET", "/outbox?limit=200")).emails.find((e: any) => e.subject === "You're invited to York Press Hiring");
ok(inviteMail && inviteMail.body.includes("/invite/[hidden]") && !/\/invite\/(?!\[hidden\])[A-Za-z0-9_-]+/.test(JSON.stringify(inviteMail)), "a recruiter can't read an invitation link from the outbox");
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
ok(location.currency === null, "a new location suggests no currency");
const patched = (await recruiter("PATCH", `/locations/${location.id}`, { workingHours: "Sun–Thu 8:00–16:00", currency: "SAR" })).location;
ok(patched.currency === "SAR" && patched.workingHours.startsWith("Sun"), "a location can suggest a currency");
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
const refused = await manager.raw("POST", "/requests?submit=true", { title: "Too thin", department: "Editorial", seniority: "Mid" });
ok(refused.status === 400 && (await refused.json()).error.includes("Choose a currency."), "the API refuses to submit a request without location, currency and reason");
const { id: thinDraft } = await manager("POST", "/requests", { title: "Thin draft", department: "Editorial", seniority: "Mid", salaryMin: 500, salaryMax: 900 });
ok(thinDraft, "a draft only needs a title");
ok((await manager.raw("POST", `/requests/${thinDraft}/submit`)).status === 400, "a draft missing required fields can't be submitted");
ok((await manager.raw("PATCH", `/requests/${thinDraft}`, { salaryMax: 100 })).status === 400, "an edit can't leave the salary band upside down");
ok((await manager.raw("PATCH", `/requests/${thinDraft}`, { minYears: 10, idealYears: 2 })).status === 400, "an edit can't leave ideal years below the minimum");
ok((await manager.raw("POST", "/requests", { title: "Ghost manager", department: "Editorial", seniority: "Mid", hiringManagerId: "00000000-0000-4000-8000-000000000000" })).status === 400, "an unknown hiring manager is a clear 400, not a crash");
ok((await manager.raw("POST", "/requests", { title: "x".repeat(121), department: "Editorial", seniority: "Mid" })).status === 400, "titles are capped at 120 characters");
ok((await manager.raw("POST", "/requests", { title: "Odd department", department: "Not a department", seniority: "Mid" })).status === 400, "departments come from the list");
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
const decisionMail = (await admin("GET", "/outbox?limit=200")).emails.find((e: any) => e.subject === "Changes requested: Comment check");
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
const messageMail = (await admin("GET", "/outbox?limit=200")).emails.find((e: any) => e.subject === "Demo CEO wrote on Comment check");
ok(messageMail?.body.includes("Is the budget owner Finance?"), "the requester is emailed the message");
ok((await admin("GET", "/notifications?limit=200")).notifications.some((n: any) => n.link === `/requests/${commentReq}#discussion`), "and notified in the app");
ok((await admin.raw("DELETE", `/requests/${commentReq}/messages/${ceoMessage.id}`)).status === 403, "only the author can delete a message");
ok((await ceo.raw("DELETE", `/requests/${commentReq}/messages/${ceoMessage.id}`)).status === 200, "the author can delete it straight after");
ok((await admin("GET", `/requests/${commentReq}/messages`)).messages.length === 0, "and it's gone for everyone");
// Someone who took part but has since lost access is not sent new messages.
const hmUser = (await outsider("GET", "/auth/me")).user;
const { id: talkReq } = await admin("POST", "/requests", { title: "Access check", department: "Editorial", seniority: "Mid", hiringManagerId: hmUser.id });
ok((await say(outsider, "Happy to interview for this.", talkReq)).status === 200, "the hiring manager joins the discussion");
await admin("PATCH", `/requests/${talkReq}`, { hiringManagerId: null });
const adminUser = (await admin("GET", "/auth/me")).user;
ok((await admin("GET", `/requests/${talkReq}`)).request.hiringManagerId === adminUser.id, "choosing 'Me' as hiring manager makes the requester the hiring manager");
const { id: meReq } = await admin("POST", "/requests", { title: "Me as hiring manager", department: "Editorial", seniority: "Mid" });
ok((await admin("GET", `/requests/${meReq}`)).request.hiringManagerId === adminUser.id, "a new request with 'Me' has the requester as hiring manager, whatever their role");
ok((await say(outsider, "Still here?", talkReq)).status === 403, "once removed, they can't post");
await say(ceo, "Budget confirmed.", talkReq);
const leaked = (await outsider("GET", "/notifications?limit=200")).notifications.some((n: any) => n.link === `/requests/${talkReq}#discussion` && n.title.startsWith("Demo CEO"));
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
ok(runs[0].state.log.some((l: any) => /Checked 15 shortlisted people in depth/.test(l.msg)), "the top 15 were checked in depth before outreach");
const topDetail = await admin("GET", `/role-candidates/${candidates.find((c: any) => c.isTop10).id}`);
ok(topDetail.roleCandidate.signals && typeof topDetail.roleCandidate.signals.level === "string", "a Top-10 candidate carries facts computed from their profile");
ok((await admin("GET", "/outreach?limit=200")).total === 0, "a run contacts nobody: no message is drafted or sent until someone presses Contact");
ok(runs[0].state.log.some((l: any) => /Nothing is sent until someone presses Contact/.test(l.msg)), "the run log says the Top 10 are ready to contact");
const detail = await admin("GET", `/role-candidates/${candidates[0].id}`);
ok(detail.roleCandidate.scoreBreakdown, "candidate detail has a score breakdown");
const hm = client();
await hm("POST", "/auth/login", { email: "demo.manager@york-press.test", password: "demo-york-2026" });

// ---------------------------------------------------------------- contacting people by hand
{
  const top = (await admin("GET", `/requests/${id}/candidates`)).candidates.filter((c: any) => c.isTop10);
  const byEmail = top.find((c: any) => c.email);
  const draft = await hm("POST", `/role-candidates/${byEmail.id}/contact/draft`, { channel: "email" });
  ok(draft.to === byEmail.email && draft.subject && draft.body.length > 50, "the hiring manager gets an email draft from the template");
  ok(draft.email.cc.includes("abdulrahman.mansour@york-press.com") && draft.email.replyTo.includes("careers@york-press.com") && draft.email.from.startsWith("Demo Manager at York Press"), "the draft shows the sender, reply-to and copy");
  ok((await outsider.raw("POST", `/role-candidates/${byEmail.id}/contact/draft`, { channel: "email" })).status === 403, "someone without access to the role can't draft");
  ok((await ceo.raw("POST", `/role-candidates/${byEmail.id}/contact`, { channel: "email", body: "Hello there, a role for you." })).status === 403, "the CEO can view but not contact");
  await admin("PATCH", "/settings", { autoSendEnabled: false });
  const paused = await hm.raw("POST", `/role-candidates/${byEmail.id}/contact`, { channel: "email", subject: draft.subject, body: draft.body });
  ok(paused.status === 400 && (await paused.json()).error.includes("paused"), "the pause switch in Settings stops a manual email");
  await admin("PATCH", "/settings", { autoSendEnabled: true });
  const mailCount = (await admin("GET", "/outbox?limit=200")).total;
  const sent = await hm("POST", `/role-candidates/${byEmail.id}/contact`, { channel: "email", subject: "A role at York Press", body: `${draft.body}\n\nEdited by the hiring manager.` });
  ok(sent.status === "sent", "pressing Send sends the email straight away");
  const mail = (await admin("GET", "/outbox?limit=1")).emails[0];
  ok((await admin("GET", "/outbox?limit=200")).total === mailCount + 1 && mail.subject === "A role at York Press" && mail.body.includes("Edited by the hiring manager."), "the edited email is the one sent");
  ok(mail.cc === "abdulrahman.mansour@york-press.com" && mail.replyTo.includes("careers@york-press.com") && mail.replyTo.includes("demo.manager@york-press.test") && mail.fromAddress.startsWith("Demo Manager at York Press"), "it comes from the sender's name, replies go to careers@ and them, Abdulrahman is copied");
  ok(mail.body.includes("/api/public/unsubscribe/"), "the sent email ends with the unsubscribe link");
  const after = (await admin("GET", `/role-candidates/${byEmail.id}`)).roleCandidate;
  ok(after.status === "contacted" && after.dateContacted && after.followUpDate > after.dateContacted, "the person is Contacted today with a follow-up date");
  const followDraft = await admin("POST", `/role-candidates/${byEmail.id}/contact/draft`, { channel: "email", kind: "follow_up" });
  ok(followDraft.subject.startsWith("Re: ") && followDraft.body.includes("follow up"), "a follow-up draft is offered");
  await admin("POST", `/role-candidates/${byEmail.id}/contact`, { channel: "email", kind: "follow_up", subject: followDraft.subject, body: followDraft.body });
  ok((await admin("GET", `/role-candidates/${byEmail.id}`)).roleCandidate.followUpDate === null, "after the follow-up there is no further reminder");

  const fresh = top.find((c: any) => c.id !== byEmail.id && c.status === "new" && c.email);
  ok((await admin.raw("POST", `/role-candidates/${fresh.id}/contact`, { channel: "email", kind: "follow_up", body: "Just following up on my note." })).status === 400, "a follow-up needs a first message");

  const byLinkedin = top.find((c: any) => c.linkedinUrl && c.status === "new" && c.id !== byEmail.id);
  if (byLinkedin) {
    ok((await admin.raw("POST", `/role-candidates/${byLinkedin.id}/contact`, { channel: "linkedin", body: "x".repeat(301) })).status === 400, "a LinkedIn note over 300 characters is refused");
    const li = await admin("POST", `/role-candidates/${byLinkedin.id}/contact`, { channel: "linkedin", body: "Hi, a short note about a role at York Press." });
    ok(li.status === "approved", "a LinkedIn note goes straight to Approved, ready for Cowork");
    ok((await admin("GET", `/role-candidates/${byLinkedin.id}`)).roleCandidate.status === "new", "it counts as contacted only once Cowork sends it");
  }

  const byPhone = top.find((c: any) => c.phone && c.status === "new" && c.id !== byLinkedin?.id && c.id !== byEmail.id);
  if (byPhone) {
    const wa = await admin("POST", `/role-candidates/${byPhone.id}/contact`, { channel: "whatsapp", body: "Hi, a role at York Press for you." });
    ok(wa.link.startsWith("https://wa.me/") && wa.link.includes(encodeURIComponent("a role at York Press")), "WhatsApp opens with the message filled in");
    ok((await admin("GET", `/role-candidates/${byPhone.id}`)).roleCandidate.status === "contacted", "WhatsApp marks the person Contacted");
    await admin("POST", `/outreach/${wa.messageId}/undo`);
    const undone = (await admin("GET", `/role-candidates/${byPhone.id}`)).roleCandidate;
    ok(undone.status === "new" && !undone.dateContacted && !undone.followUpDate, "undo puts them back to New when it wasn't sent");
  }
  ok((await admin.raw("POST", `/role-candidates/${byEmail.id}/contact`, { channel: "whatsapp", body: "Hello there" })).status === (byEmail.phone ? 200 : 400), "WhatsApp needs a phone number");
}
{
  const p1 = await admin("GET", "/outreach?limit=2");
  const p2 = await admin("GET", `/outreach?limit=2&before=${p1.next}`);
  const ids = [...p1.messages, ...p2.messages].map((m: any) => m.id);
  ok(p1.messages.length === 2 && p1.next && p2.messages.length > 0 && new Set(ids).size === ids.length, "outreach list pages past the first page without repeats");
  ok(new Date(p1.messages[1].queuedAt) >= new Date(p2.messages[0].queuedAt) && p1.total === p2.total, "pages keep newest-first order and the same total");
  ok((await admin.raw("GET", "/outreach?limit=500")).status === 400, "a page is at most 200 rows");
}
await hm("PATCH", `/role-candidates/${candidates[0].id}`, { hmDecision: "yes", hmComment: "Interview" });
ok(true, "hiring manager recorded a decision");
{
  // The same person is also on a role the manager can't open: its title, status and score stay hidden from them.
  const { getDb: db0, schema: s0 } = await import("../server/db/client.js");
  const shared = await admin("GET", `/role-candidates/${candidates[0].id}`);
  await (await db0()).insert(s0.roleCandidates).values({ requestId: commentReq, candidateId: shared.candidate.id, score: 77 });
  ok((await admin("GET", `/role-candidates/${candidates[0].id}`)).otherRoles.some((o: any) => o.id === commentReq), "staff see every role a candidate is on");
  ok(!(await hm("GET", `/role-candidates/${candidates[0].id}`)).otherRoles.some((o: any) => o.id === commentReq), "a hiring manager doesn't see other roles they can't open");
}
ok((await hm.raw("PATCH", `/role-candidates/${candidates[0].id}`, { status: "hired" })).status === 403, "a hiring manager can't set a candidate's status");
ok((await hm.raw("PATCH", `/role-candidates/${candidates[0].id}`, {})).status === 400, "an empty change is refused");
const weekly = await admin("POST", `/requests/${id}/runs`);
ok(weekly.runId, "manual refresh started");
await new Promise((r) => setTimeout(r, 4000));
ok((await admin("GET", "/outbox?limit=200")).total > 0, "emails captured in the mock outbox");

// ---------------------------------------------------------------- score again
const runsOf = async () => (await admin("GET", `/requests/${id}/runs`)).runs as any[];
const settle = async () => {
  for (let i = 0; i < 150 && (await runsOf()).some((r) => ["queued", "running", "waiting"].includes(r.status)); i++) await new Promise((r) => setTimeout(r, 200));
};
await settle();
const peopleBefore = (await admin("GET", `/requests/${id}/candidates`)).candidates.length;
const mailBefore = (await admin("GET", "/outbox?limit=200")).total;
ok((await hm.raw("POST", `/requests/${id}/rescore`)).status === 403, "a hiring manager can't start Score again");
const again = await admin("POST", `/requests/${id}/rescore`);
await settle();
const againRun = (await runsOf()).find((r) => r.id === again.runId);
ok(againRun.kind === "rescore" && againRun.status === "done", "Score again finished");
ok(againRun.state.log.some((l: any) => /Scoring \d+ people again/.test(l.msg)), "Score again scored everyone already on the role");
ok(againRun.signalhireSearches === 0 && againRun.signalhireCredits === 0 && againRun.pdlRecords === 0, "Score again ran no searches and spent no credits");
const afterAgain = (await admin("GET", `/requests/${id}/candidates`)).candidates;
ok(afterAgain.length === peopleBefore && afterAgain.filter((c: any) => c.isTop10).length === 10, "Score again added nobody and kept a Top 10");
ok((await admin("GET", "/outbox?limit=200")).total === mailBefore, "Score again contacted nobody");
{
  const [one, two] = await Promise.all([admin("POST", `/requests/${id}/rescore`), admin("POST", `/requests/${id}/rescore`)]);
  ok(one.runId === two.runId, "two runs started at the same moment become one");
  await settle();
}

// ---------------------------------------------------------------- cancelling a message
{
  const all = (await admin("GET", "/outreach?limit=200")).messages;
  const sentOne = all.find((m: any) => m.status === "sent");
  const cancelSent = await admin.raw("POST", `/outreach/${sentOne.id}/cancel`);
  ok(cancelSent.status === 400 && (await cancelSent.json()).error === "This message was already sent.", "a sent message can't be cancelled");
  const twoPending = all.filter((m: any) => ["queued", "awaiting_approval", "approved"].includes(m.status));
  if (twoPending.length > 1) {
    const target = twoPending[1];
    ok((await admin.raw("POST", `/outreach/${target.id}/cancel`)).status === 200 && (await admin.raw("POST", `/outreach/${target.id}/cancel`)).status === 200, "cancelling the same message twice is fine");
  }
}

// ---------------------------------------------------------------- opting out
const raw0 = (method: string, url: string) => app.fetch(new Request(`http://localhost/api${url}`, { method }));
const outreachMail = (await admin("GET", "/outbox?limit=200")).emails.find((e: any) => e.kind === "outreach");
ok(outreachMail?.body.includes("/api/public/unsubscribe/"), "every outreach email has an unsubscribe link");
// Sample data varies per run (sometimes every Top-10 email is already sent), so queue one message here.
const optOutTarget = (await admin("GET", `/requests/${id}/candidates`)).candidates.find((c: any) => c.email);
{
  const { getDb: dbFn, schema: s } = await import("../server/db/client.js");
  await (await dbFn()).insert(s.outreachMessages).values({ roleCandidateId: optOutTarget.id, channel: "email", toAddress: optOutTarget.email, subject: "Role", body: "Hello", status: "queued" });
}
const pending = (await admin("GET", "/outreach?limit=200")).messages.find((m: any) => m.roleCandidateId === optOutTarget.id && m.status === "queued");
ok(pending, "a message is waiting to be sent");
const pendingDetail = await admin("GET", `/role-candidates/${pending.roleCandidateId}`);
const { unsubscribeToken } = await import("../server/services/suppression.js");
const optOutToken = unsubscribeToken(pendingDetail.candidate.id);
const confirmPage = await raw0("GET", `/public/unsubscribe/${optOutToken}`);
ok(confirmPage.status === 200 && (await confirmPage.text()).includes("Yes, stop and delete"), "opening the unsubscribe link only asks to confirm");
ok((await raw0("GET", `/public/unsubscribe/${pendingDetail.candidate.id}.forged`)).status === 404, "a made-up unsubscribe link does nothing");
ok((await raw0("POST", `/public/unsubscribe/${optOutToken}`)).status === 200, "the candidate confirms the opt-out");
const afterOptOut = await admin("GET", `/role-candidates/${pending.roleCandidateId}`);
ok(afterOptOut.messages.every((m: any) => !["queued", "awaiting_approval", "approved"].includes(m.status)), "opting out cancels every unsent message to them");
ok(!afterOptOut.candidate.hasEmail && !afterOptOut.candidate.phone, "opting out deletes their email and phone");
const optOutEntry = (await admin("GET", "/suppression")).entries.find((e: any) => e.candidateId === pendingDetail.candidate.id);
ok(optOutEntry?.reason === "opted_out", "they're on the do-not-contact list");
ok((await recruiter.raw("DELETE", `/suppression/${optOutEntry.id}`)).status === 403, "a recruiter can't take an opted-out person off the list");

// ---------------------------------------------------------------- CV upload and download
const { applyToken } = (await admin("GET", `/requests/${id}`)).request;
const applyPage = await (await app.fetch(new Request(`http://localhost/api/public/apply/${applyToken}`))).json() as Record<string, unknown>;
ok(applyPage.employment === "Full time" && !JSON.stringify(applyPage).match(/salary|currency/i), "the apply page shows the type of work but never the pay");
const cvText = "Rana Haddad\nSenior Product Designer, 9 years. Figma, design systems, user research.";
const form = new FormData();
form.set("name", "Rana Haddad");
form.set("email", "rana.haddad@example.test");
form.set("consent", "true");
form.set("cv", new File([cvText], "rana-cv.txt", { type: "text/plain" }));
const applied = await app.fetch(new Request(`http://localhost/api/public/apply/${applyToken}`, { method: "POST", body: form }));
ok(applied.ok, "a candidate uploaded a CV on the apply page");
{
  const fake = new FormData();
  fake.set("name", "Fake Pdf");
  fake.set("email", "fake.pdf@example.test");
  fake.set("consent", "true");
  fake.set("cv", new File(["not really a pdf"], "cv.pdf", { type: "application/pdf" }));
  const res = await app.fetch(new Request(`http://localhost/api/public/apply/${applyToken}`, { method: "POST", body: fake }));
  ok(res.status === 400 && (await res.json()).error.includes("isn't a real PDF"), "a file pretending to be a PDF is refused");
}
const { applications } = await admin("GET", `/requests/${id}/applications`);
ok(applications.length === 1 && applications[0].score != null, "the CV is listed and scored");
const download = await admin.raw("GET", `/applications/${applications[0].id}/cv`);
ok(download.ok && (await download.text()) === cvText, "the recruiter downloads the same CV file");
ok((await app.fetch(new Request(`http://localhost/api/applications/${applications[0].id}/cv`))).status === 401, "CVs need a signed-in user");
{
  // Someone applies with a sourced candidate's email: nothing about that candidate changes; the recruiter sees a possible match.
  const sourced = (await admin("GET", `/requests/${id}/candidates`)).candidates.find((c: any) => c.email && c.status === "new");
  const impostor = new FormData();
  impostor.set("name", "Not Them");
  impostor.set("email", sourced.email);
  impostor.set("consent", "true");
  impostor.set("cv", new File(["Someone else"], "other.txt", { type: "text/plain" }));
  ok((await app.fetch(new Request(`http://localhost/api/public/apply/${applyToken}`, { method: "POST", body: impostor }))).ok, "an application with a sourced candidate's email is accepted");
  const after = (await admin("GET", `/requests/${id}/candidates`)).candidates.find((c: any) => c.id === sourced.id);
  ok(after.status === "new", "it doesn't change the sourced candidate's status");
  const listed = (await admin("GET", `/requests/${id}/applications`)).applications.find((a: any) => a.name === "Not Them");
  ok(listed.candidateId === null && listed.sourcedMatch?.roleCandidateId === sourced.id, "it isn't attached to them; the recruiter sees a possible match");
}
{
  // Applicants get the same tracking as sourced candidates.
  const rana = (await admin("GET", `/requests/${id}/applications`)).applications.find((a: any) => a.name === "Rana Haddad");
  ok(rana.status === "new" && rana.hmDecision === null, "a new applicant starts as New with no decision");
  await hm("PATCH", `/applications/${rana.id}`, { hmDecision: "yes", hmComment: "Strong portfolio" });
  ok((await hm.raw("PATCH", `/applications/${rana.id}`, { status: "hired" })).status === 403, "the hiring manager can't change an applicant's status");
  ok((await outsider.raw("PATCH", `/applications/${rana.id}`, { hmDecision: "no" })).status === 403, "someone without access to the role can't decide");
  await recruiter("PATCH", `/applications/${rana.id}`, { status: "rejected" });
  let mine = (await admin("GET", `/requests/${id}/applications`)).applications.find((a: any) => a.name === "Rana Haddad");
  ok(mine.hmDecision === "yes" && mine.hmComment === "Strong portfolio" && mine.status === "rejected", "the hiring manager says Yes and the recruiter sets the status");
  // Applying again from the same email: one row, the newest CV, the decision kept.
  const again = new FormData();
  again.set("name", "Rana Haddad");
  again.set("email", "Rana.Haddad@example.test");
  again.set("consent", "true");
  again.set("cv", new File([cvText + "\nUpdated."], "rana-cv-2.txt", { type: "text/plain" }));
  ok((await app.fetch(new Request(`http://localhost/api/public/apply/${applyToken}`, { method: "POST", body: again }))).ok, "the same person applies again");
  const rows = (await admin("GET", `/requests/${id}/applications`)).applications.filter((a: any) => a.name === "Rana Haddad");
  mine = rows[0];
  ok(rows.length === 1 && mine.cvFileName === "rana-cv-2.txt" && mine.earlier.length === 1, "repeat applications from one email show as one row with the earlier CV under it");
  ok(mine.hmDecision === "yes" && mine.status === "rejected", "the decision carries over to the new CV");
}

// ---------------------------------------------------------------- universities
{
  const countries = (await manager("GET", "/universities/countries")).countries;
  ok(countries.length === 10 && countries.find((c: any) => c.country === "Lebanon")?.count >= 30, `universities are listed for ${countries.length} countries`);
  const lebanese = (await manager("GET", "/universities?country=Lebanon")).universities;
  const aub = lebanese.find((u: any) => u.name === "American University of Beirut");
  ok(aub && aub.aka.includes("AUB"), "a country's universities come with their short names");
  ok((await outsider.raw("POST", "/universities", { country: "Lebanon", name: "Smoke Test University" })).status === 403, "a hiring manager can't add a university");
  const added = await manager("POST", "/universities", { country: "Lebanon", name: "Smoke Test University", city: "Beirut" });
  ok(added.university.name === "Smoke Test University", "a manager adds a missing university");
  ok((await manager.raw("POST", "/universities", { country: "Lebanon", name: "smoke test university" })).status === 409, "the same university can't be added twice");

  // A location's universities are the starting point; patching something else keeps them.
  await recruiter("PATCH", `/locations/${lebanon.id}`, { universities: ["American University of Beirut"] });
  await recruiter("PATCH", `/locations/${lebanon.id}`, { workingHours: lebanon.workingHours });
  ok((await manager("GET", "/locations")).locations.find((l: any) => l.id === lebanon.id).universities.join() === "American University of Beirut", "a location keeps its universities when other details change");
  await recruiter("PATCH", `/locations/${lebanon.id}`, { universities: [] });

  const uniRole = await manager("POST", "/requests?submit=true", {
    title: "Junior Accountant", department: "Finance", seniority: "Junior", mustHaves: ["IFRS"], locationId: lebanon.id,
    currency: "USD", justification: "Graduate hire.", universities: ["American University of Beirut", "Lebanese American University"],
  });
  ok((await manager("GET", `/requests/${uniRole.id}`)).request.universities.length === 2, "a request keeps its chosen universities");
  await ceo("POST", `/requests/${uniRole.id}/decision`, { action: "approve" });
  for (let i = 0; i < 100 && (await admin("GET", `/requests/${uniRole.id}`)).request.status !== "open"; i++) await new Promise((r) => setTimeout(r, 200));
  const uniRun = (await admin("GET", `/requests/${uniRole.id}/runs`)).runs[0];
  ok(uniRun.state.log.some((l: any) => /Only \d+ people found from the 2 chosen universities/.test(l.msg)), "a run with few graduates says so");
  const people = (await admin("GET", `/requests/${uniRole.id}/candidates`)).candidates;
  const schools = await Promise.all(people.slice(0, 5).map(async (p: any) => (await admin("GET", `/role-candidates/${p.id}`)).candidate.education.map((e: any) => e.school)));
  ok(people.length > 0 && schools.every((s: string[]) => s.some((x) => ["American University of Beirut", "Lebanese American University", "AUB", "LAU"].includes(x))), "everyone found studied at a chosen university");
  await admin("POST", `/requests/${uniRole.id}/close`, { deleteContacts: false });
}

// ---------------------------------------------------------------- daily job and data retention
const retention = await admin("GET", "/retention");
ok(retention.months === 24 && retention.nextRun.candidates === 0, "retention preview: nothing is old enough to delete yet");
const daily = await admin("GET", "/cron/daily");
ok(daily.retention && daily.retention.candidates === 0, "the daily job runs the retention step");

// ---------------------------------------------------------------- learning from decisions
ok(Array.isArray(daily.learning), "the daily job runs the learning step");
const learning = await admin("GET", "/learning");
ok(Array.isArray(learning.learned) && learning.minLabels === 12, "the learning status is readable");
const roleWeightsNow = (await admin("GET", `/requests/${id}`)).request.scorecardWeights;
ok(roleWeightsNow && Object.values(roleWeightsNow).reduce((a: number, b: any) => a + b, 0) === 100, "a sourced role keeps the scorecard it was scored with");
const scoresOf = async () => Object.fromEntries((await admin("GET", `/requests/${id}/candidates`)).candidates.map((c: any) => [c.id, c.score]));
const scoresBefore = await scoresOf();
await admin("PATCH", `/requests/${id}/weights`, { must: 60, exp: 10, industry: 10, seniority: 5, trajectory: 5, remote: 5, signals: 5 });
await admin("PATCH", `/requests/${id}/weights`, roleWeightsNow);
const scoresAfter = await scoresOf();
ok(Object.keys(scoresBefore).every((k) => scoresBefore[k] === scoresAfter[k]), "changing the weights and changing them back keeps every score");

// ---------------------------------------------------------------- connection checks
const testMail = await admin("POST", "/settings/test-email");
ok(testMail.ok && testMail.mock, "the admin's test email lands in the outbox while email is in test mode");
const credits = await admin("POST", "/settings/signalhire-credits");
ok(credits.creditsLeft === null && credits.error === null, "refreshing SignalHire credits is a no-op without a key");

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
{
  // Two sign-ins racing with the same recovery code: only one gets in.
  const [a, b] = [client(), client()];
  await a("POST", "/auth/login", abed);
  await b("POST", "/auth/login", abed);
  const both = await Promise.all([a.raw("POST", "/auth/mfa", { code: recoveryCodes[1] }), b.raw("POST", "/auth/mfa", { code: recoveryCodes[1] })]);
  ok(both.filter((r) => r.status === 200).length === 1, "a recovery code used twice at the same moment works once");
}
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

// ---------------------------------------------------------------- forgotten password
const stranger = client();
const forgot = (email: string) => stranger.raw("POST", "/auth/forgot", { email });
const answers = await Promise.all(["khalil.sayegh@york-press.com", "nobody@york-press.com", "demo.ceo@york-press.test"].map(async (e) => (await forgot(e)).text()));
ok(answers.every((a) => a === answers[0]), "\"Forgot password?\" answers the same whether or not the account exists");
const resetMail = (await second("GET", "/outbox?limit=200")).emails.find((e: any) => e.subject === "Reset your York Press Hiring password");
ok(resetMail?.toAddress === "khalil.sayegh@york-press.com" && resetMail.body.includes("/reset/[hidden]") && !/\/reset\/(?!\[hidden\])[A-Za-z0-9_-]+/.test(JSON.stringify(resetMail)), "the reset email goes out and nobody can read its link in the outbox");
const { requestPasswordReset } = await import("../server/services/password-reset.js");
const resetToken = (await requestPasswordReset("khalil.sayegh@york-press.com")).link!.split("/reset/")[1];
ok((await stranger("GET", `/auth/reset/${resetToken}`)).email === "khalil.sayegh@york-press.com", "the reset link opens for its owner");
ok((await stranger.raw("POST", `/auth/reset/${resetToken}`, { password: "short" })).status === 400, "the new password needs 10 characters");
ok((await stranger("POST", `/auth/reset/${resetToken}`, { password: "khalil-reset-password" })).mfaRequired === false && (await stranger("GET", "/auth/me")).user?.email === "khalil.sayegh@york-press.com", "a reset signs straight in");
ok((await khalilWeb("GET", "/auth/me")).user === null, "and signs out every other device");
ok((await stranger.raw("POST", `/auth/reset/${resetToken}`, { password: "third-password-123" })).status === 404, "a reset link works once");
ok((await client().raw("POST", "/auth/login", { email: "khalil.sayegh@york-press.com", password: "khalils-own-password" })).status === 401, "the old password stops working");
ok((await second("GET", "/outbox?limit=200")).emails.some((e: any) => e.subject === "Your York Press Hiring password was changed"), "the owner gets a confirmation email");

// ---------------------------------------------------------------- demo admin: demo and test accounts only
const demoAdmin = client();
await demoAdmin("POST", "/auth/login", { email: "demo.admin@york-press.test", password: "demo-york-2026" });
const owner = (await demoAdmin("GET", "/users")).users.find((u: any) => u.email === "abed.amouneh@york-press.com");
ok(!!owner, "the demo admin can see the users list");
ok((await demoAdmin.raw("PATCH", `/users/${owner.id}`, { active: false })).status === 403, "the demo admin can't switch off a real account");
ok((await demoAdmin.raw("POST", `/users/${owner.id}/two-factor/reset`)).status === 403, "or reset a real person's two-step login");
ok((await demoAdmin.raw("POST", "/users", { name: "Real Person", email: "real.person@york-press.com", roles: ["manager"] })).status === 403, "or invite a real address");
const trial = await demoAdmin("POST", "/users", { name: "Trial Person", email: "trial.person@example.com", roles: ["manager"] });
ok(trial.user.email === "trial.person@example.com", "a test address can be invited");
ok((await demoAdmin.raw("PATCH", `/users/${trial.user.id}`, { email: "trial.person@york-press.com" })).status === 403, "and can't be moved to a real address");
ok((await demoAdmin.raw("DELETE", `/users/${trial.user.id}`)).ok, "and its invite can be cancelled");

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

// ---------------------------------------------------------------- no CEO approver
for (const u of (await team()).filter((x) => x.active && x.roles.includes("ceo"))) await second("PATCH", `/users/${u.id}`, { active: false });
await second("POST", "/requests?submit=true", { title: "Nobody to approve", department: "Editorial", seniority: "Mid", locationId: lebanon.id, currency: "USD", justification: "Checking the approver warning." });
ok((await second("GET", "/notifications?limit=200")).notifications.some((n: any) => n.title === "Nobody can approve Nobody to approve: add a CEO approver"), "with no CEO approver, admins are told nobody can approve the request");

// ---------------------------------------------------------------- closing a role
const waiting = await second("POST", "/requests?submit=true", { title: "Still with the CEO", department: "Editorial", seniority: "Mid", locationId: lebanon.id, currency: "USD", justification: "Checking close rules." });
ok((await second.raw("POST", `/requests/${waiting.id}/close`, { deleteContacts: false })).status === 400, "a request still waiting for the CEO can't be closed as a role");
const { getDb, schema: tables } = await import("../server/db/client.js");
const { eq: eqOp } = await import("drizzle-orm");
const { runPipeline } = await import("../server/services/pipeline.js");
const smokeDb = await getDb();
// A run that already reached outreach when the role is closed (it would contact the Top 10 next).
const [lateRun] = await smokeDb.insert(tables.sourcingRuns).values({ requestId: id, kind: "manual", status: "queued", step: "outreach", state: { log: [] } }).returning();
const messagesBefore = (await second("GET", "/outreach?limit=200")).total;
await second("POST", `/requests/${id}/close`, { deleteContacts: false });
await runPipeline(lateRun.id);
const lateRunAfter = (await second("GET", `/requests/${id}/runs`)).runs.find((r: any) => r.id === lateRun.id);
ok(lateRunAfter.status === "cancelled", "closing a role stops its run for good");
ok((await second("GET", `/requests/${id}`)).request.status === "closed", "the role stays closed");
ok((await second("GET", "/outreach?limit=200")).total === messagesBefore, "a closed role's run contacts nobody");
ok((await second("POST", `/requests/${id}/close`, { deleteContacts: false })).ok && (await second("GET", `/requests/${id}`)).events.filter((e: any) => e.action === "Closed the role").length === 1, "closing twice changes nothing");
ok((await second("POST", `/requests/${id}/reopen`)).ok && (await second("GET", `/requests/${id}`)).request.status === "open", "a closed role can be reopened");
ok((await second.raw("POST", `/requests/${id}/reopen`)).status === 400, "only a closed role can be reopened");
// The request still waiting for the CEO: its requester takes it back, then deletes the draft.
ok((await second("POST", `/requests/${waiting.id}/withdraw`)).ok && (await second("GET", `/requests/${waiting.id}`)).request.status === "draft", "a waiting request can be withdrawn and becomes a draft");
ok((await manager.raw("DELETE", `/requests/${waiting.id}`)).status === 403, "someone else can't delete it");
ok((await second("DELETE", `/requests/${waiting.id}`)).ok && (await second.raw("GET", `/requests/${waiting.id}`)).status === 404, "the requester deletes the draft");
ok((await second.raw("DELETE", `/requests/${id}`)).status === 400, "an approved role can't be deleted");
{
  // An admin removes a request still waiting for the CEO, without anyone being notified.
  const { id: stray } = await manager("POST", "/requests?submit=true", { title: "Stray request", department: "Editorial", seniority: "Mid", locationId: lebanon.id, currency: "USD", justification: "Clean-up check." });
  const strayNotices = async () => (await smokeDb.select().from(tables.notifications)).filter((n: any) => n.title.includes("Stray request")).length;
  const noticesBefore = await strayNotices();
  ok((await manager.raw("DELETE", `/requests/${stray}`)).status === 400, "the requester can't delete a request that's waiting (withdraw first)");
  ok((await second("DELETE", `/requests/${stray}`)).ok && (await second.raw("GET", `/requests/${stray}`)).status === 404, "an admin deletes a request waiting for a decision");
  ok((await strayNotices()) === noticesBefore, "and nobody is notified about it");
  const { id: kept } = await manager("POST", "/requests?submit=true", { title: "Kept request", department: "Editorial", seniority: "Mid", locationId: lebanon.id, currency: "USD", justification: "Demo admin check." });
  const demoAdminAgain = client();
  await demoAdminAgain("POST", "/auth/login", { email: "demo.admin@york-press.test", password: "demo-york-2026" });
  ok((await demoAdminAgain.raw("DELETE", `/requests/${kept}`)).status === 400, "the demo admin can't delete a waiting request");
}
{
  // One person on two open roles: closing the first with "delete contacts" keeps their details for the second.
  const me = (await second("GET", "/auth/me")).user;
  const openRole = async (title: string) => (await smokeDb.insert(tables.roleRequests).values({ title, department: "Editorial", seniority: "Mid", requesterId: me.id, status: "open", applyToken: `smoke-${title}` }).returning())[0];
  const [roleA, roleB] = [await openRole("Shared A"), await openRole("Shared B")];
  const [person] = await smokeDb.insert(tables.candidates).values({ fullName: "Shared Person", email: "shared.person@example.com", phone: "+961 1 000 000" }).returning();
  for (const role of [roleA, roleB]) await smokeDb.insert(tables.roleCandidates).values({ requestId: role.id, candidateId: person.id });
  const contactOf = async () => (await smokeDb.select().from(tables.candidates).where(eqOp(tables.candidates.id, person.id)))[0];
  const firstClose = await second("POST", `/requests/${roleA.id}/close`, { deleteContacts: true });
  ok(firstClose.keptContacts === 1 && (await contactOf()).email === "shared.person@example.com", "closing one role keeps contacts a second open role still needs");
  await second("POST", `/requests/${roleB.id}/close`, { deleteContacts: true });
  ok((await contactOf()).email === null, "closing the last role deletes them");
}

// ---------------------------------------------------------------- invitations and two-step login
const adminNow = (await second("GET", "/auth/me")).user;
const reissued = await second("POST", `/users/${adminNow.id}/invite`);
const inviteToken = reissued.inviteLink.split("/invite/")[1];
const redeemer = client();
const redeemed = await redeemer("POST", `/auth/invite/${inviteToken}`, { password: "a-brand-new-password" });
ok(redeemed.mfaRequired && (await redeemer("GET", "/auth/me")).user === null, "accepting a new invite to an account with two-step login still asks for the code");
ok((await second("GET", "/auth/me")).user === null, "accepting an invite signs out the account's other sessions");
ok((await client().raw("POST", `/auth/invite/${inviteToken}`, { password: "another-new-password" })).status === 404, "an invite link works once");

console.log("\nAll smoke checks passed.");
process.exit(0);

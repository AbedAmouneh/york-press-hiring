import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { drainEmailQueue } from "./outreach.js";
import { resumeStaleRuns, resumeWaitingRuns, startRun } from "./pipeline.js";
import { notifyRoles } from "./notify.js";
import { getSettings, updateSettings } from "./settings.js";
import { localWeekday } from "./dates.js";
import { signalhireCredits } from "./providers/signalhire.js";
import { pruneRateLimits } from "./rate-limit.js";

/** 48h reminder for requests waiting on Khalil. */
export async function sendApprovalReminders() {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 48 * 3600e3);
  const due = await db
    .select()
    .from(schema.roleRequests)
    .where(and(
      eq(schema.roleRequests.status, "submitted"),
      lt(schema.roleRequests.submittedAt, cutoff),
      or(isNull(schema.roleRequests.reminderSentAt), lt(schema.roleRequests.reminderSentAt, cutoff)),
    ));
  for (const r of due) {
    await notifyRoles(["ceo"], {
      type: "approval_reminder",
      title: `Reminder: ${r.title} is waiting for your decision`,
      link: `/requests/${r.id}`,
      emailBody: `The request for ${r.title} (${r.department}) has been waiting for your approval for more than 48 hours.`,
    });
    await db.update(schema.roleRequests).set({ reminderSentAt: new Date() }).where(eq(schema.roleRequests.id, r.id));
  }
  return due.length;
}

/** Monday: re-run sourcing for every open role (only new profiles are added). */
export async function weeklyRefresh() {
  const db = await getDb();
  const open = await db.select({ id: schema.roleRequests.id }).from(schema.roleRequests).where(eq(schema.roleRequests.status, "open"));
  for (const r of open) await startRun(r.id, "weekly");
  return open.length;
}

/** Monday email to Khalil: open roles, pipeline counts and spend for the past week. */
export async function weeklySummary() {
  const settings = await getSettings();
  if (!settings.weeklySummaryEnabled) return false;
  const db = await getDb();
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const requests = await db.select().from(schema.roleRequests).where(inArray(schema.roleRequests.status, ["submitted", "sourcing", "open"]));
  const lines: string[] = [];
  for (const r of requests) {
    const [counts] = await db
      .select({
        screened: sql<number>`count(*)::int`,
        contacted: sql<number>`count(*) filter (where ${schema.roleCandidates.status} <> 'new')::int`,
        interview: sql<number>`count(*) filter (where ${schema.roleCandidates.status} = 'interview')::int`,
        hmYes: sql<number>`count(*) filter (where ${schema.roleCandidates.hmDecision} = 'yes')::int`,
      })
      .from(schema.roleCandidates)
      .where(eq(schema.roleCandidates.requestId, r.id));
    lines.push(r.status === "submitted"
      ? `• ${r.title} (${r.department}) — waiting for your approval`
      : `• ${r.title} (${r.department}) — ${counts.screened} screened, ${counts.contacted} contacted, ${counts.hmYes} HM yes, ${counts.interview} in interview`);
  }
  const usage = await db
    .select({ provider: schema.usageLog.provider, units: sql<number>`coalesce(sum(${schema.usageLog.units}),0)::int`, tin: sql<number>`coalesce(sum(${schema.usageLog.inputTokens}),0)::int`, tout: sql<number>`coalesce(sum(${schema.usageLog.outputTokens}),0)::int` })
    .from(schema.usageLog)
    .where(and(gte(schema.usageLog.createdAt, weekAgo), eq(schema.usageLog.mock, false)))
    .groupBy(schema.usageLog.provider);
  const u = Object.fromEntries(usage.map((x) => [x.provider, x]));
  const spend = `Usage this week: ${u.pdl?.units ?? 0} PDL records, ${u.signalhire?.units ?? 0} SignalHire units, ${(u.claude?.tin ?? 0).toLocaleString()} / ${(u.claude?.tout ?? 0).toLocaleString()} Claude tokens in/out, ${u.resend?.units ?? 0} emails.`;
  await notifyRoles(["ceo"], {
    type: "weekly_summary",
    title: "Weekly hiring summary",
    link: "/roles",
    emailBody: `${lines.length ? lines.join("\n") : "No open roles this week."}\n\n${spend}`,
  });
  return true;
}

export async function runDaily(now = new Date()) {
  const out: Record<string, unknown> = {};
  out.staleRunsResumed = await resumeStaleRuns();
  await resumeWaitingRuns(true);
  out.reminders = await sendApprovalReminders();
  out.emails = await drainEmailQueue();
  try {
    const credits = await signalhireCredits();
    if (credits != null) await updateSettings({ signalhireCreditsLeft: credits });
  } catch { /* ignore */ }
  await pruneRateLimits(now);
  if (localWeekday(now) === 1) {
    out.weeklyRefresh = await weeklyRefresh();
    out.weeklySummary = await weeklySummary();
  }
  return out;
}

export { desc };

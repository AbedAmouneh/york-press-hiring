// Pure helpers behind the Home page: role stages and the "Needs you" list. Kept free of React so they can be unit tested.
import type { RequestStatus, Role } from "../../shared/types";

export type HomeRequest = {
  id: string;
  code: string;
  title: string;
  status: RequestStatus;
  requesterId: string;
  hiringManagerId: string | null;
  stats: { screened: number; contacted: number; hmYes: number; hmPending: number };
};

export type HomeMessage = { channel: string; status: string };

export const STAGES = ["Approved", "Sourcing", "Top 10 ready", "Outreach"] as const;

/** How far a role has got, 1 to 4 (index into STAGES plus one). 0 for requests that aren't roles yet. */
export function stageOf(r: Pick<HomeRequest, "status" | "stats">) {
  if (r.status === "sourcing") return 2;
  if (r.status === "open" || r.status === "closed") return r.stats.contacted > 0 ? 4 : 3;
  return 0;
}

export type Task = { key: string; text: string; to: string };

/** The few things this person should act on now, most urgent first. Only built from real data. */
export function tasksFor(user: { id: string; roles: readonly Role[] }, requests: HomeRequest[], messages: HomeMessage[] = []): Task[] {
  const has = (...r: Role[]) => r.some((x) => user.roles.includes(x));
  const tasks: Task[] = [];
  if (has("ceo")) {
    for (const r of requests.filter((x) => x.status === "submitted")) tasks.push({ key: `approve-${r.id}`, text: `Review ${r.code} ${r.title}`, to: `/requests/${r.id}` });
  }
  const mine = requests.filter((r) => r.requesterId === user.id);
  for (const r of mine.filter((x) => x.status === "changes_requested")) tasks.push({ key: `fix-${r.id}`, text: `Update ${r.code} ${r.title}`, to: `/requests/${r.id}` });
  for (const r of mine.filter((x) => x.status === "draft")) tasks.push({ key: `draft-${r.id}`, text: `Finish draft ${r.code} ${r.title}`, to: `/requests/${r.id}/edit` });
  for (const r of requests.filter((x) => x.hiringManagerId === user.id && x.status === "open" && x.stats.hmPending > 0)) {
    const n = r.stats.hmPending;
    tasks.push({ key: `decide-${r.id}`, text: `Decide on ${n} candidate${n === 1 ? "" : "s"} for ${r.code}`, to: `/roles/${r.id}` });
  }
  if (has("recruiter", "admin")) {
    const count = (channel: string, status: string) => messages.filter((m) => m.channel === channel && m.status === status).length;
    const notes = count("linkedin", "awaiting_approval");
    const ready = count("linkedin", "approved");
    const failed = count("email", "failed");
    if (notes) tasks.push({ key: "li-approve", text: `Approve ${notes} LinkedIn note${notes === 1 ? "" : "s"}`, to: "/linkedin" });
    if (ready) tasks.push({ key: "li-send", text: `Send ${ready} approved LinkedIn note${ready === 1 ? "" : "s"}`, to: "/linkedin" });
    if (failed) tasks.push({ key: "email-failed", text: `Check ${failed} failed email${failed === 1 ? "" : "s"}`, to: "/outreach" });
  }
  return tasks;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

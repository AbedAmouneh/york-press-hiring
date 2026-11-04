// A run's "SignalHire credits" counter must include contacts that arrived later through the webhook.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema } from "../../server/db/client.js";
import { applyRevealResults, creditsSpentOnRun } from "../../server/services/pipeline.js";

beforeAll(async () => {
  process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-credits-"));
  await getDb();
});

describe("creditsSpentOnRun", () => {
  it("counts reveals answered by the webhook after the step finished", async () => {
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: "r@york-press.test", name: "Recruiter", roles: ["recruiter"] }).returning();
    const [role] = await db.insert(schema.roleRequests).values({ title: "Editor", department: "Editorial", seniority: "Senior", requesterId: u.id, status: "open", applyToken: "t-credits" }).returning();
    const [run] = await db.insert(schema.sourcingRuns).values({ requestId: role.id, kind: "initial" }).returning();
    for (const n of [1, 2, 3]) {
      const [person] = await db.insert(schema.candidates).values({ fullName: `Person ${n}` }).returning();
      const [rc] = await db.insert(schema.roleCandidates).values({ requestId: role.id, candidateId: person.id }).returning();
      await db.insert(schema.contactReveals).values({ roleCandidateId: rc.id, candidateId: person.id, runId: run.id, item: `https://www.linkedin.com/in/person-${n}` });
    }
    expect(await creditsSpentOnRun(run.id)).toBe(0);
    // The webhook: two found, one not found (not charged).
    await applyRevealResults([
      { item: "https://www.linkedin.com/in/person-1", status: "success", email: "p1@mail.com", phone: null },
      { item: "https://www.linkedin.com/in/person-2", status: "success", email: "p2@mail.com", phone: null },
      { item: "https://www.linkedin.com/in/person-3", status: "failed", email: null, phone: null },
    ] as never);
    expect(await creditsSpentOnRun(run.id)).toBe(2);
  });
});

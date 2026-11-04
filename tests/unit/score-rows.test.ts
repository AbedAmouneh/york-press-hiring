// A scoring answer that is cut off or leaves people out is retried in smaller groups instead of failing the run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const scoreBatch = vi.hoisted(() => vi.fn());
vi.mock("../../server/services/claude.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/services/claude.js")>()),
  scoreBatch,
}));

const { getDb, schema } = await import("../../server/db/client.js");
const { scoreRows } = await import("../../server/services/pipeline.js");
const { DEFAULT_WEIGHTS } = await import("../../shared/types.js");

const result = (key: string) => ({ key, breakdown: { must: 30 }, dealBreakerMissing: false, why: "w", gaps: "g", redFlags: "", relevantYears: 3, evidence: [] });

beforeAll(async () => {
  process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "yp-score-rows-"));
  await getDb();
});

describe("scoreRows", () => {
  it("splits a cut-off answer and re-asks for people it left out", async () => {
    const db = await getDb();
    const [u] = await db.insert(schema.users).values({ email: "r2@york-press.test", name: "Recruiter", roles: ["recruiter"] }).returning();
    const [request] = await db.insert(schema.roleRequests).values({ title: "Designer", department: "Design & Multimedia", seniority: "Mid", requesterId: u.id, status: "open", applyToken: "t-rows" }).returning();
    const rows = [];
    for (let n = 0; n < 4; n++) {
      const [c] = await db.insert(schema.candidates).values({ fullName: `P${n}` }).returning();
      const [rc] = await db.insert(schema.roleCandidates).values({ requestId: request.id, candidateId: c.id }).returning();
      rows.push({ rc, c });
    }
    const ids = rows.map(({ rc }) => rc.id);
    scoreBatch
      .mockRejectedValueOnce(new Error("Claude's submit_scores answer was cut off (too long)")) // all 4
      .mockResolvedValueOnce([result(ids[0])]) // first half: forgot ids[1]
      .mockResolvedValueOnce([result(ids[1])]) // retry ids[1] alone
      .mockResolvedValueOnce([result(ids[2]), result(ids[3])]); // second half
    await scoreRows(rows, request, DEFAULT_WEIGHTS, null);
    expect(scoreBatch).toHaveBeenCalledTimes(4);
    for (const id of ids) {
      const [rc] = await db.select().from(schema.roleCandidates).where(eq(schema.roleCandidates.id, id));
      expect(rc.score).not.toBeNull();
      expect(rc.signals).not.toBeNull();
    }
  });
});

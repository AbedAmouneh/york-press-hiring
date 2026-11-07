// Scoring a CV from the apply page, right after upload or again from the CVs tab.
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client.js";
import { scoreCv } from "./claude.js";
import { readCv } from "./cv-store.js";
import { docxText } from "./cv-text.js";
import { toReq } from "./mappers.js";
import { getSettings, weightsFor } from "./settings.js";
import { captureError } from "../monitoring.js";

type Application = typeof schema.applications.$inferSelect;
type Request = typeof schema.roleRequests.$inferSelect;

export const SCORE_FAILED = "Couldn't score this CV automatically. Open it and judge it yourself, or try scoring it again.";

/** Scores the CV and saves the result; a failure is saved as a visible message instead of a silent blank. */
export async function scoreApplication(app: Application, request: Request, bytes?: Uint8Array | null): Promise<boolean> {
  const db = await getDb();
  try {
    const file = bytes ?? (await readCv(app));
    if (!file) throw new Error("CV file not stored");
    const text = app.cvMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? docxText(file) : undefined;
    if (text === null) throw new Error("Word file unreadable");
    const res = await scoreCv(toReq(request), weightsFor(request, await getSettings()), {
      base64: Buffer.from(file).toString("base64"), mime: app.cvMime, fileName: app.cvFileName, text,
    });
    await db.update(schema.applications).set({ score: res.score, analysis: { why: res.why, gaps: res.gaps, breakdown: res.breakdown } }).where(eq(schema.applications.id, app.id));
    return true;
  } catch (e) {
    captureError(e, { tags: { area: "cv_score" }, extra: { applicationId: app.id } });
    await db.update(schema.applications).set({ score: null, analysis: { error: SCORE_FAILED } }).where(eq(schema.applications.id, app.id));
    return false;
  }
}

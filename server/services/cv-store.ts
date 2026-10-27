// CV file storage. With BLOB_READ_WRITE_TOKEN set, files go to a *private* Vercel Blob store and are
// only ever served through our own authenticated download route. Without it (local dev, tests),
// they are kept inline in the database as before.
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { env } from "../env.js";

export type StoredCv = { cvBlobPath: string | null; cvBase64: string | null };

const safeName = (name: string) => name.replace(/[^\w.-]+/g, "_").slice(-100) || "cv";

export async function saveCv(file: { name: string; type: string; bytes: Uint8Array }): Promise<StoredCv> {
  if (!env.blobToken) return { cvBlobPath: null, cvBase64: Buffer.from(file.bytes).toString("base64") };
  // A random folder per file, so pathnames can't be guessed or collide.
  const blob = await put(`cvs/${randomUUID()}/${safeName(file.name)}`, Buffer.from(file.bytes), {
    access: "private",
    contentType: file.type,
    addRandomSuffix: false,
    token: env.blobToken,
  });
  return { cvBlobPath: blob.pathname, cvBase64: null };
}

export async function readCv(cv: StoredCv): Promise<Uint8Array<ArrayBuffer> | null> {
  if (cv.cvBlobPath) {
    const res = await get(cv.cvBlobPath, { access: "private", token: env.blobToken });
    if (!res?.stream) return null;
    return new Uint8Array(await new Response(res.stream).arrayBuffer());
  }
  return cv.cvBase64 ? new Uint8Array(Buffer.from(cv.cvBase64, "base64")) : null;
}

/** Remove the stored file. Rows keep their metadata until the caller deletes them. */
export async function deleteCv(cv: StoredCv) {
  if (cv.cvBlobPath && env.blobToken) await del(cv.cvBlobPath, { token: env.blobToken });
}

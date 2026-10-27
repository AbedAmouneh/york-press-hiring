import { afterEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  put: vi.fn(async (pathname: string) => ({ pathname, url: `https://store.private.blob.vercel-storage.com/${pathname}` })),
  get: vi.fn(async () => ({ stream: new Response("stored bytes").body })),
  del: vi.fn(async () => undefined),
}));
vi.mock("@vercel/blob", () => blob);

import { deleteCv, readCv, saveCv } from "../../server/services/cv-store.js";

const file = { name: "Rana Haddad CV (final).pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.7 hello") };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("CV storage without a Blob token", () => {
  it("keeps the file inline in the database", async () => {
    const stored = await saveCv(file);
    expect(stored.cvBlobPath).toBeNull();
    expect(Buffer.from(stored.cvBase64!, "base64").toString()).toBe("%PDF-1.7 hello");
    expect(new TextDecoder().decode((await readCv(stored))!)).toBe("%PDF-1.7 hello");
    expect(blob.put).not.toHaveBeenCalled();
  });
});

describe("CV storage in Vercel Blob", () => {
  it("uploads privately under a random folder with a safe file name", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    const stored = await saveCv(file);
    expect(stored.cvBase64).toBeNull();
    expect(stored.cvBlobPath).toMatch(/^cvs\/[0-9a-f-]{36}\/Rana_Haddad_CV_final_.pdf$/);
    expect(blob.put).toHaveBeenCalledWith(stored.cvBlobPath, expect.any(Buffer), expect.objectContaining({ access: "private", contentType: "application/pdf" }));
  });

  it("reads the file back through the authenticated API", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    const bytes = await readCv({ cvBlobPath: "cvs/x/cv.pdf", cvBase64: null });
    expect(new TextDecoder().decode(bytes!)).toBe("stored bytes");
    expect(blob.get).toHaveBeenCalledWith("cvs/x/cv.pdf", expect.objectContaining({ access: "private" }));
  });

  it("returns null when the file is gone", async () => {
    blob.get.mockResolvedValueOnce(null as never);
    expect(await readCv({ cvBlobPath: "cvs/x/cv.pdf", cvBase64: null })).toBeNull();
  });

  it("deletes the stored file", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    await deleteCv({ cvBlobPath: "cvs/x/cv.pdf", cvBase64: null });
    expect(blob.del).toHaveBeenCalledWith("cvs/x/cv.pdf", expect.objectContaining({ token: "vercel_blob_rw_test" }));
  });
});

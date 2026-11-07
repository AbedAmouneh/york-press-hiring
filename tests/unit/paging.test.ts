import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, pageOf } from "../../server/paging";

const id = "6f1c2c1e-2f3a-4d6b-9a51-0d1b2c3d4e5f";

describe("paging", () => {
  it("round-trips a cursor", () => {
    const at = new Date("2026-11-07T10:20:30.123Z");
    expect(decodeCursor(encodeCursor(at, id))).toEqual({ at: at.toISOString(), id });
  });

  it("ignores a missing or tampered cursor", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from("2026-11-07T10:20:30Z|'; drop table x").toString("base64url"))).toBeNull();
  });

  it("only offers a next page when there is one more row", () => {
    const rows = [1, 2, 3].map((n) => ({ at: new Date(2026, 0, n), id }));
    expect(pageOf(rows, 3, (r) => r).next).toBeNull();
    const page = pageOf(rows, 2, (r) => r);
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.next ?? undefined)?.at).toBe(rows[1].at.toISOString());
  });
});

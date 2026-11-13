// A tab left open across a deploy reloads once to get the new build, without looping.
import { describe, expect, it } from "vitest";
import { isStaleBuildError, shouldReload } from "../../src/lib/stale-build";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("isStaleBuildError", () => {
  it("recognises missing page code in every browser", () => {
    for (const msg of [
      "Failed to fetch dynamically imported module: https://york-press-hiring.vercel.app/assets/RoleDetail-abc.js", // Chrome
      "Importing a module script failed.", // Safari
      "error loading dynamically imported module: https://x/assets/Home-1.js", // Firefox
      "Unable to preload CSS for /assets/index-2.css", // Vite
    ]) expect(isStaleBuildError(new TypeError(msg))).toBe(true);
  });

  it("leaves real errors alone", () => {
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
  });
});

describe("shouldReload", () => {
  it("reloads once, then not again within a minute, then again later", () => {
    const store = memory();
    expect(shouldReload(store, 1_000)).toBe(true);
    expect(shouldReload(store, 30_000)).toBe(false);
    expect(shouldReload(store, 62_000)).toBe(true);
  });

  it("still reloads when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(shouldReload(blocked)).toBe(true);
    expect(shouldReload(null)).toBe(true);
  });
});

// After a deploy, a tab opened earlier still runs the old build. Each page is a separate file named after its
// content, and the new deploy no longer has the old files, so opening another page fails to load its code.
// Reloading picks up the new build. This reloads once by itself; a second failure within a minute shows the
// error screen instead, so a page that is really broken can't reload forever.

const KEY = "yp-stale-build-reload";
const WINDOW_MS = 60_000;

/** True for the errors browsers throw when a page's code file can't be loaded. */
export function isStaleBuildError(error: unknown) {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk \S+ failed/i.test(msg);
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Whether to reload now: not when the last automatic reload was under a minute ago. Remembers this one. */
export function shouldReload(store: Store | null, now = Date.now()) {
  try {
    const last = Number(store?.getItem(KEY) ?? 0);
    if (last && now - last < WINDOW_MS) return false;
    store?.setItem(KEY, String(now));
    return true;
  } catch {
    return true; // storage blocked: reload anyway, the browser keeps the page from looping fast
  }
}

function session(): Store | null {
  try { return window.sessionStorage; } catch { return null; }
}

/** Reloads the page to pick up the new build. Returns false when it already tried a moment ago. */
export function reloadForNewBuild() {
  if (!shouldReload(session())) return false;
  window.location.reload();
  return true;
}

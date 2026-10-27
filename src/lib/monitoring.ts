// Browser error monitoring with Sentry. Loaded only when VITE_SENTRY_DSN is set, so it adds nothing
// to the bundle otherwise. No page text, form values or candidate data is sent: only the error.
type SentryModule = typeof import("@sentry/react");

const dsn = import.meta.env.VITE_SENTRY_DSN;
let sentry: Promise<SentryModule | null> | null = null;

export function initMonitoring() {
  if (!dsn || sentry) return;
  sentry = import("@sentry/react")
    .then((S) => {
      S.init({
        dsn,
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_RELEASE,
        dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
        beforeBreadcrumb: (b) => (b.category === "ui.input" || b.category === "console" ? null : b),
      });
      return S;
    })
    .catch(() => null);
}

export function captureError(err: unknown, extra?: Record<string, string>) {
  void sentry?.then((S) => S?.captureException(err, extra ? { extra } : undefined));
}

export function setMonitoringUser(id: string | null) {
  void sentry?.then((S) => S?.setUser(id ? { id } : null));
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN for browser errors. Unset = monitoring off. */
  readonly VITE_SENTRY_DSN?: string;
  /** Release name shown in Sentry; set from the Git commit at build time. */
  readonly VITE_RELEASE?: string;
}

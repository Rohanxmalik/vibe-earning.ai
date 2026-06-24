import * as Sentry from "@sentry/node";

let enabled = false;

/** Initialise Sentry only when SENTRY_DSN is set. No-ops in dev/test/CI otherwise. */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  enabled = true;
}

/** Report an exception if Sentry is enabled; otherwise a no-op. */
export function captureException(err: unknown): void {
  if (enabled) Sentry.captureException(err);
}

/** Flush buffered events on shutdown so we don't lose the last errors. No-op if disabled. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.flush(timeoutMs);
}

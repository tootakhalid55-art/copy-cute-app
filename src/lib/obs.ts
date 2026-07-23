// Lightweight structured logging + slow-query timing.
// Works in the browser and in TanStack server functions.
// Never logs PII — pass IDs, not full records.

type Level = "debug" | "info" | "warn" | "error";

const isServer = typeof window === "undefined";
const APP = "haseem";

function base(level: Level, event: string, fields: Record<string, unknown>) {
  return {
    ts: new Date().toISOString(),
    level,
    app: APP,
    event,
    where: isServer ? "server" : "client",
    ...fields,
  };
}

export const log = {
  debug: (event: string, fields: Record<string, unknown> = {}) =>
    console.debug(JSON.stringify(base("debug", event, fields))),
  info: (event: string, fields: Record<string, unknown> = {}) =>
    console.info(JSON.stringify(base("info", event, fields))),
  warn: (event: string, fields: Record<string, unknown> = {}) =>
    console.warn(JSON.stringify(base("warn", event, fields))),
  error: (event: string, fields: Record<string, unknown> = {}) =>
    console.error(JSON.stringify(base("error", event, fields))),
};

/**
 * Times an async operation, logs slow ones (default > 500ms), and re-throws.
 */
export async function timed<T>(
  event: string,
  fn: () => Promise<T>,
  opts: { slowMs?: number; fields?: Record<string, unknown> } = {},
): Promise<T> {
  const slowMs = opts.slowMs ?? 500;
  const started = performance.now();
  try {
    const out = await fn();
    const dur = Math.round(performance.now() - started);
    if (dur >= slowMs) log.warn("slow_op", { event, dur_ms: dur, ...opts.fields });
    else log.debug("op", { event, dur_ms: dur, ...opts.fields });
    return out;
  } catch (e) {
    const dur = Math.round(performance.now() - started);
    log.error("op_failed", {
      event,
      dur_ms: dur,
      error: e instanceof Error ? e.message : String(e),
      ...opts.fields,
    });
    throw e;
  }
}

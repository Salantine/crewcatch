/**
 * Structured JSON logging.
 *
 * Replaces ad-hoc `console.*` on the request path. Two reasons:
 *
 *  1. A dropped dispatch must be diagnosable after the fact. A free-text
 *     warning in a server log is effectively invisible six months later; a
 *     JSON line with a lead id and a channel is greppable.
 *  2. Caller phone numbers and transcript content must NOT appear in logs.
 *     Logs ship to third-party aggregators and are retained. `redact` makes
 *     the safe path the default rather than a rule people have to remember.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function threshold(): number {
  const raw = process.env.LOG_LEVEL ?? "info";
  return LEVELS[raw as LogLevel] ?? LEVELS.info;
}

/**
 * Keys whose values are replaced with a redaction marker. Covers the
 * personally identifiable fields this system handles by design.
 */
const SENSITIVE_KEYS = new Set([
  "phone",
  "callerNumber",
  "dialledNumber",
  "to",
  "from",
  "address",
  "name",
  "transcript",
  "body",
  "email",
  "number",
  "secret",
  "token",
  "password",
  "apiKey",
  "authorization",
]);

export const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      // Keep length so a truncated capture is visible without the content.
      const len =
        typeof val === "string" ? val.length : Array.isArray(val) ? val.length : 0;
      out[key] = len > 0 ? `${REDACTED}:${len}` : REDACTED;
    } else {
      out[key] = redact(val, depth + 1);
    }
  }
  return out;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < threshold()) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });

  // Errors go to stderr so a container runtime can split streams; everything
  // else to stdout.
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

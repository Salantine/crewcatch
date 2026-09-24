"use client";

/**
 * Last-resort boundary: catches failures in the ROOT layout, where the
 * regular error boundary cannot render because its own layout is broken.
 *
 * This component must render its own <html> and <body> — it replaces the
 * document, so it cannot rely on the root layout (or globals.css) having run.
 * That is why the colours are inlined rather than using Tailwind utilities or
 * CSS variables. The values are the same measured tokens as globals.css:
 *   surface-0 #0A1628 · fg #FFFFFF · fg-muted #8A94A6 (5.93:1)
 *   urgency-critical #FF3B30 · accent #FF6B00 with navy #0A1628 text (6.35:1)
 * The design guard flags raw hex outside globals.css by design; this file is
 * the one legitimate exception and is listed as such.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-0, #0A1628)",
          color: "var(--fg, #FFFFFF)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "32rem" }}>
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--urgency-critical, #FF3B30)",
            }}
          >
            Service unavailable
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              color: "var(--fg-muted, #8A94A6)",
              lineHeight: 1.6,
            }}
          >
            We could not load the application. This is on us, not on your setup.
            Try again in a moment.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "var(--fg-muted, #8A94A6)",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "2.75rem",
              padding: "0 1.25rem",
              border: 0,
              background: "var(--accent, #FF6B00)",
              // Navy on orange: 6.35:1. White here would be 2.86:1 and fail AA.
              color: "var(--accent-fg, #0A1628)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

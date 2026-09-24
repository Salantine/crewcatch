/**
 * Validates a post-login redirect target.
 *
 * Only same-origin RELATIVE paths are allowed. `next` arrives from a query
 * string a stranger can craft, so `//evil.com` (protocol-relative) and
 * `https://evil.com` must both be rejected — otherwise a valid CrewCatch
 * magic-link URL becomes an open redirect that hands a freshly authenticated
 * user to a phishing page.
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next) return "/dashboard";
  // Must start with a single "/" and not "//" (protocol-relative URL) and not
  // contain a scheme.
  if (!next.startsWith("/")) return "/dashboard";
  if (next.startsWith("//")) return "/dashboard";
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(next)) return "/dashboard";
  // Reject control characters that could break out of the header value.
  if (/[\r\n\t]/.test(next)) return "/dashboard";
  return next;
}

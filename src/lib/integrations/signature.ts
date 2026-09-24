import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Generic webhook signature verification.
 *
 * The ALGORITHM is stable and verifiable even though the per-vendor HEADER NAME
 * is not (see vendor-schemas.ts). Every vendor in this stack signs the raw
 * request body with an HMAC; what differs is which header carries it and
 * whether it is prefixed with the digest name.
 *
 * Two rules that are security-critical and easy to get wrong:
 *
 *  1. Verify against the RAW body, BEFORE `JSON.parse()`. Re-serialising parsed
 *     JSON changes key order and whitespace, producing a different digest and a
 *     legitimate request that fails verification.
 *  2. Compare with `timingSafeEqual`. A `===` on digests leaks the correct value
 *     byte by byte through response timing.
 */

export interface VerifyOptions {
  /** The raw, unparsed request body. */
  rawBody: string;
  /** The value of the signature header, or null/undefined if absent. */
  signature: string | null | undefined;
  /** Shared secret from the vendor dashboard. */
  secret: string;
  /** HMAC variant. Defaults to sha256; Twilio's request validator uses sha1. */
  algorithm?: "sha256" | "sha1";
  /** Strip a leading "sha256=" style prefix if the vendor uses one. */
  stripPrefix?: boolean;
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: "missing_signature" | "malformed_signature" | "mismatch" };

function safeEqual(a: string, b: string): boolean {
  // timingSafeEqual throws on length mismatch, which would itself leak length
  // and turn into a 500. Compare lengths first, then the contents.
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyWebhookSignature(
  options: VerifyOptions,
): VerifyResult {
  const {
    rawBody,
    signature,
    secret,
    algorithm = "sha256",
    stripPrefix = true,
  } = options;

  if (!signature || signature.trim() === "") {
    return { valid: false, reason: "missing_signature" };
  }
  if (!secret) {
    // A missing secret must never silently pass. Fail closed.
    return { valid: false, reason: "mismatch" };
  }

  let provided = signature.trim();
  if (stripPrefix) {
    const idx = provided.indexOf("=");
    if (idx > 0) provided = provided.slice(idx + 1);
  }

  if (!/^[a-f0-9]+$/i.test(provided)) {
    return { valid: false, reason: "malformed_signature" };
  }

  const expected = createHmac(algorithm, secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(provided, expected)
    ? { valid: true }
    : { valid: false, reason: "mismatch" };
}

/** Convenience: read the signature header by name from a Headers object. */
export function signatureFrom(
  headers: Headers,
  headerName: string,
): string | null {
  return headers.get(headerName);
}

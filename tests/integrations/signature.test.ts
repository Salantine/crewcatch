import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@/lib/integrations/signature";

const SECRET = "test-shared-secret";
const BODY = JSON.stringify({ event: "call_ended", call_id: "abc123" });

const sign = (body: string, secret = SECRET, algo = "sha256") =>
  createHmac(algo, secret).update(body, "utf8").digest("hex");

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed raw body", () => {
    expect(
      verifyWebhookSignature({
        rawBody: BODY,
        signature: sign(BODY),
        secret: SECRET,
      }),
    ).toEqual({ valid: true });
  });

  it("rejects a tampered body", () => {
    const tampered = BODY.replace("abc123", "abc999");
    const r = verifyWebhookSignature({
      rawBody: tampered,
      signature: sign(BODY),
      secret: SECRET,
    });
    expect(r).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a signature made with the wrong secret", () => {
    const r = verifyWebhookSignature({
      rawBody: BODY,
      signature: sign(BODY, "wrong-secret"),
      secret: SECRET,
    });
    expect(r).toEqual({ valid: false, reason: "mismatch" });
  });

  it("fails closed when the secret is missing", () => {
    const r = verifyWebhookSignature({
      rawBody: BODY,
      signature: sign(BODY),
      secret: "",
    });
    expect(r).toEqual({ valid: false, reason: "mismatch" });
  });

  it("reports a missing signature distinctly from a bad one", () => {
    expect(
      verifyWebhookSignature({ rawBody: BODY, signature: null, secret: SECRET }),
    ).toEqual({ valid: false, reason: "missing_signature" });
  });

  it("strips a sha256= style prefix", () => {
    const r = verifyWebhookSignature({
      rawBody: BODY,
      signature: `sha256=${sign(BODY)}`,
      secret: SECRET,
    });
    expect(r).toEqual({ valid: true });
  });

  it("rejects a non-hex signature as malformed rather than mismatched", () => {
    const r = verifyWebhookSignature({
      rawBody: BODY,
      signature: "not-a-digest!!",
      secret: SECRET,
    });
    expect(r).toEqual({ valid: false, reason: "malformed_signature" });
  });

  it("does not throw on a length mismatch", () => {
    // timingSafeEqual throws on differing lengths; that must surface as a
    // false result, not a 500 from the webhook.
    const r = verifyWebhookSignature({
      rawBody: BODY,
      signature: "abcd",
      secret: SECRET,
    });
    expect(r.valid).toBe(false);
  });

  it("supports sha1 for vendors that sign with it", () => {
    const r = verifyWebhookSignature({
      rawBody: BODY,
      signature: sign(BODY, SECRET, "sha1"),
      secret: SECRET,
      algorithm: "sha1",
    });
    expect(r).toEqual({ valid: true });
  });

  it("depends on the exact raw bytes, not the parsed value", () => {
    // Re-serialising JSON changes key order; the digest must still match the
    // bytes actually received, which is why the caller must pass the raw body.
    const whitespaceVariant = JSON.stringify(
      { event: "call_ended", call_id: "abc123" },
      null,
      2,
    );
    const r = verifyWebhookSignature({
      rawBody: whitespaceVariant,
      signature: sign(whitespaceVariant),
      secret: SECRET,
    });
    expect(r).toEqual({ valid: true });
  });
});

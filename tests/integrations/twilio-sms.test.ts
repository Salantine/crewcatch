import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The Twilio channel's contract with `dispatchLead` is subtle and load-bearing:
 * a THROWN error means "retry me", a RETURNED `{ accepted: false }` means
 * "stop". Getting that backwards either retries a hopeless send three times
 * or abandons a recoverable one, so both directions are tested here.
 */

const { TwilioSmsChannel, segmentCount, createTwilioSmsChannel } = await import(
  "@/lib/integrations/twilio-sms"
);

const notification = {
  leadId: "33333333-3333-4333-8333-333333333333",
  channel: "sms" as const,
  recipient: "5558675309",
  body: "[CRITICAL] EMERGENCY\nName: Ana Ruiz\nCallback: 5558675309",
};

function clientWith(create: () => Promise<{ sid: string }>) {
  return { messages: { create: vi.fn(create) } };
}

const opts = {
  accountSid: "AC_test",
  authToken: "token",
  fromNumber: "+15550000000",
};

describe("TwilioSmsChannel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends and returns the message sid", async () => {
    const client = clientWith(async () => ({ sid: "SM123" }));
    const ch = new TwilioSmsChannel({ ...opts, client: client as never });

    const receipt = await ch.send(notification);
    expect(receipt).toEqual({
      channel: "sms",
      accepted: true,
      providerMessageId: "SM123",
    });
  });

  it("normalises a 10-digit number to E.164", async () => {
    const create = vi.fn(async () => ({ sid: "SM1" }));
    const ch = new TwilioSmsChannel({
      ...opts,
      client: clientWith(create) as never,
    });

    await ch.send({ ...notification, recipient: "555-867-5309" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15558675309" }),
    );
  });

  it("preserves a number that is already in E.164", async () => {
    const create = vi.fn(async () => ({ sid: "SM1" }));
    const ch = new TwilioSmsChannel({
      ...opts,
      client: clientWith(create) as never,
    });
    await ch.send({ ...notification, recipient: "+15558675309" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15558675309" }),
    );
  });

  // ---- the load-bearing distinction -------------------------------------

  it("does NOT throw on a permanent rejection (stops retrying)", async () => {
    // 21211 = invalid 'To' number. Retrying this three times helps nobody and
    // delays the other channels.
    const client = clientWith(async () => {
      const e = Object.assign(new Error("The To number is not a valid phone number"), {
        code: 21211,
        status: 400,
      });
      throw e;
    });
    const ch = new TwilioSmsChannel({ ...opts, client: client as never });

    const receipt = await ch.send(notification);
    expect(receipt.accepted).toBe(false);
    expect(receipt.detail).toContain("21211");
  });

  it("THROWS on a rate limit so the retry loop engages", async () => {
    // 20429 = rate limited. This one genuinely can succeed on a second try.
    const client = clientWith(async () => {
      const e = Object.assign(new Error("Too many requests"), {
        code: 20429,
        status: 429,
      });
      throw e;
    });
    const ch = new TwilioSmsChannel({ ...opts, client: client as never });

    await expect(ch.send(notification)).rejects.toThrow("Too many requests");
  });

  it("THROWS on a network error with no HTTP status", async () => {
    const client = clientWith(async () => {
      throw new Error("socket hang up");
    });
    const ch = new TwilioSmsChannel({ ...opts, client: client as never });
    await expect(ch.send(notification)).rejects.toThrow("socket hang up");
  });

  it("does not throw on a blocked-sender rejection", async () => {
    const client = clientWith(async () => {
      const e = Object.assign(new Error("not authorized to send"), {
        code: 21610,
        status: 403,
      });
      throw e;
    });
    const ch = new TwilioSmsChannel({ ...opts, client: client as never });
    expect((await ch.send(notification)).accepted).toBe(false);
  });

  it("rejects an unusable recipient before calling the provider", async () => {
    const create = vi.fn(async () => ({ sid: "SM1" }));
    const ch = new TwilioSmsChannel({
      ...opts,
      client: clientWith(create) as never,
    });

    const receipt = await ch.send({ ...notification, recipient: "123" });
    expect(receipt.accepted).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to construct without a from-number", () => {
    // Validated at construction so a missing from-number fails loudly once,
    // rather than identically for every lead all night.
    expect(
      () =>
        new TwilioSmsChannel({
          accountSid: "AC",
          authToken: "t",
          fromNumber: "",
        }),
    ).toThrow(/TWILIO_FROM_NUMBER/);
  });
});

describe("segmentCount", () => {
  it("counts one segment for a short GSM-7 body", () => {
    expect(segmentCount("No heat, call back.")).toBe(1);
  });

  it("splits a long body into multiple segments", () => {
    expect(segmentCount("x".repeat(400))).toBe(3);
  });

  it("uses the lower UCS-2 limit for non-GSM-7 characters", () => {
    // 200 ASCII chars = 2 segments at 160. The same 200 emoji need 2 as well
    // but at a 153 limit — so compare at the boundary where they differ:
    // 155 chars is 1 segment in GSM-7, 2 in UCS-2.
    expect(segmentCount("x".repeat(155))).toBe(1);
    expect(segmentCount("🚨".repeat(155))).toBe(2);
  });

  it("treats accented latin as GSM-7 (it fits the 160 limit)", () => {
    // é is in the GSM-7 extended set; treating it as UCS-2 would over-charge
    // every contractor whose name has an accent.
    expect(segmentCount("José".repeat(40))).toBe(1);
  });
});

describe("createTwilioSmsChannel", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("throws when credentials are missing rather than silently no-op", () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    expect(() => createTwilioSmsChannel()).toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it("constructs when all three are present", () => {
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15550000000";
    expect(createTwilioSmsChannel().channel).toBe("sms");
  });
});

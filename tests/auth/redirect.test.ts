import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/redirect";

describe("safeRedirectPath", () => {
  it("allows a normal relative path", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/leads?filter=critical")).toBe("/leads?filter=critical");
  });

  it("defaults to the dashboard when absent", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    // "//evil.com" is treated as an absolute URL by the browser, so a naive
    // `startsWith("/")` check would pass it straight through.
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("///evil.com")).toBe("/dashboard");
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("http://evil.com")).toBe("/dashboard");
  });

  it("rejects relative paths that do not start with a slash", () => {
    expect(safeRedirectPath("evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("dashboard")).toBe("/dashboard");
  });

  it("rejects control characters that could split a header", () => {
    expect(safeRedirectPath("/dash\r\nSet-Cookie: x=1")).toBe("/dashboard");
    expect(safeRedirectPath("/dash\nLocation: //evil.com")).toBe("/dashboard");
  });

  it("rejects a scheme smuggled after leading slashes", () => {
    expect(safeRedirectPath("/javascript:alert(1)")).toBe("/dashboard");
  });
});

import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/lib/sanitize";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;&#x2F;script&gt;"
    );
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('a "quoted" string')).toBe("a &quot;quoted&quot; string");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("escapes forward slashes", () => {
    expect(escapeHtml("path/to/file")).toBe("path&#x2F;to&#x2F;file");
  });

  it("returns empty string for null", () => {
    expect(escapeHtml(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeHtml(undefined)).toBe("");
  });

  it("converts numbers to string", () => {
    expect(escapeHtml(42)).toBe("42");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("passes through safe text unchanged", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });

  it("handles multiple special characters together", () => {
    expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe(
      '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;'
    );
  });
});

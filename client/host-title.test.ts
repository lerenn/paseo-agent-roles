import { describe, expect, it } from "vitest";
import { hostTitle } from "./host-title";

describe("hostTitle", () => {
  it("adds the host label only when several hosts are known", () => {
    expect(hostTitle("Agent roles", "lab", 2)).toBe("Agent roles · lab");
    expect(hostTitle("Agent roles", "lab", 1)).toBe("Agent roles");
    expect(hostTitle("Agent roles", "lab", 0)).toBe("Agent roles");
  });

  it("never shows an empty label", () => {
    expect(hostTitle("Agent roles", "", 3)).toBe("Agent roles");
  });
});

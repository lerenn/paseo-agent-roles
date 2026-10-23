import { describe, expect, it } from "vitest";
import { hostTitle } from "./host-title";

describe("hostTitle", () => {
  it("adds the host label only when several hosts are known", () => {
    expect(hostTitle("Agent Roles", "lab", 2)).toBe("Agent Roles · lab");
    expect(hostTitle("Agent Roles", "lab", 1)).toBe("Agent Roles");
    expect(hostTitle("Agent Roles", "lab", 0)).toBe("Agent Roles");
  });

  it("never shows an empty label", () => {
    expect(hostTitle("Agent Roles", "", 3)).toBe("Agent Roles");
  });
});

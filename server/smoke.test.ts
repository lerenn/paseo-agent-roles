import { describe, expect, it } from "vitest";
import contribute from "../index.server";

describe("plugin entry", () => {
  it("returns a cleanup function", () => {
    const cleanup = contribute({} as never);
    expect(typeof cleanup).toBe("function");
  });
});

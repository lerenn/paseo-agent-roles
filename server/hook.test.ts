import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import contribute from "../index.server";
import { agentCreateHook } from "./hook";

const request = (env?: Record<string, string>) => ({ request: { config: { provider: "claude", cwd: "/x" }, env } });

describe("agent.create hook", () => {
  it("leaves agents without a role untouched", async () => {
    expect(await agentCreateHook(async () => [])(request())).toBeUndefined();
  });

  it("applies a role found in a git source folder, earlier folders first", async () => {
    const a = await mkdtemp(path.join(tmpdir(), "hook-a-"));
    const b = await mkdtemp(path.join(tmpdir(), "hook-b-"));
    await writeFile(path.join(a, "r.yaml"), "name: r\nmodel: from-a\nenv:\n  PASEO_KUBE_TEMPLATE: t\n");
    await writeFile(path.join(b, "r.yaml"), "name: r\nmodel: from-b\n");
    const out = await agentCreateHook(async () => [a, b])(request({ PASEO_AGENT_ROLE: "r" }));
    expect(out?.config.model).toBe("from-a");
    expect(out?.env).toMatchObject({ PASEO_AGENT_ROLE: "r", PASEO_KUBE_TEMPLATE: "t" });
  });

  it("fails creation for an unknown role, saying where it looked", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "hook-"));
    await expect(agentCreateHook(async () => [dir])(request({ PASEO_AGENT_ROLE: "reviewer" }))).rejects.toThrow(
      /no such role in the git sources/,
    );
  });

  it("explains when no git source is configured", async () => {
    await expect(agentCreateHook(async () => [])(request({ PASEO_AGENT_ROLE: "reviewer" }))).rejects.toThrow(
      /no git source is configured/,
    );
  });
});

describe("plugin entry", () => {
  it("registers the hook and cleans up", () => {
    const names: string[] = [];
    const cleanup = contribute({
      handle() {},
      registerSettings: () => ({ read: async () => ({ status: "ready", values: { sources: [] } }), subscribe: () => () => {} }),
      before(name: string) {
        names.push(name);
        return () => {};
      },
    } as never);
    expect(names).toEqual(["agent.create"]);
    cleanup();
  });
});

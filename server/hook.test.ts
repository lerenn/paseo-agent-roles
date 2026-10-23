import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import contribute from "../index.server";

type Handler = (input: { request: any }, ctx: any) => Promise<any>;

function register() {
  let handler: Handler | undefined;
  const cleanup = contribute({
    handle() {},
    registerSettings: () => ({ read: async () => ({ status: "ready", values: { sources: [] } }), subscribe: () => () => {} }),
    before(name: string, h: Handler) {
      expect(name).toBe("agent.create");
      handler = h;
      return () => {};
    },
  } as never);
  expect(typeof cleanup).toBe("function");
  return handler!;
}

describe("agent.create hook", () => {
  it("leaves agents without a role untouched", async () => {
    const out = await register()({ request: { config: { provider: "claude", cwd: "/x" } } }, {});
    expect(out).toBeUndefined();
  });

  it("applies a project role selected through PASEO_AGENT_ROLE", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "proj-"));
    await mkdir(path.join(cwd, ".paseo", "roles"), { recursive: true });
    await writeFile(
      path.join(cwd, ".paseo", "roles", "custom.yaml"),
      "name: custom\nmodel: m\nsystemPrompt: hi\nenv:\n  PASEO_KUBE_TEMPLATE: t\n",
    );
    const out = await register()(
      { request: { config: { provider: "claude", cwd }, env: { PASEO_AGENT_ROLE: "custom" } } },
      {},
    );
    expect(out.config).toMatchObject({ model: "m", systemPrompt: "hi", cwd });
    expect(out.env).toMatchObject({ PASEO_KUBE_TEMPLATE: "t", PASEO_AGENT_ROLE: "custom" });
  });

  it("has no built-in roles: a name without a file is an unknown role", async () => {
    await expect(
      register()({ request: { config: { provider: "claude", cwd: "/x" }, env: { PASEO_AGENT_ROLE: "reviewer" } } }, {}),
    ).rejects.toThrow(/no such role/);
  });

  it("fails creation for an unknown role", async () => {
    await expect(
      register()({ request: { config: { provider: "claude", cwd: "/x" }, env: { PASEO_AGENT_ROLE: "zzz" } } }, {}),
    ).rejects.toThrow(/no such role/);
  });
});

import { describe, expect, it } from "vitest";
import { roleSchema } from "../shared/role";
import { applyRole } from "./apply";

const base = { config: { provider: "claude", cwd: "/work" }, env: { PASEO_AGENT_ROLE: "r" } };
const role = (extra: object) => roleSchema.parse({ name: "r", ...extra });

describe("applyRole", () => {
  it("sets model, mode and provider only when the role defines them", () => {
    const out = applyRole(base, role({ model: "m", modeId: "plan", provider: "codex" }));
    expect(out.config).toMatchObject({ provider: "codex", model: "m", modeId: "plan", cwd: "/work" });
    expect(applyRole(base, role({})).config).toEqual(base.config);
  });

  it("prepends the role prompt to an existing one", () => {
    const req = { ...base, config: { ...base.config, systemPrompt: "mine" } };
    expect(applyRole(req, role({ systemPrompt: "role" })).config.systemPrompt).toBe("role\n\nmine");
    expect(applyRole(base, role({ systemPrompt: "role" })).config.systemPrompt).toBe("role");
  });

  it("merges MCP servers, role winning on name clashes", () => {
    const req = {
      ...base,
      config: {
        ...base.config,
        mcpServers: { a: { type: "http" as const, url: "old" }, b: { type: "http" as const, url: "b" } },
      },
    };
    const out = applyRole(req, role({ mcpServers: { a: { type: "http", url: "new" } } }));
    expect(out.config.mcpServers).toEqual({
      a: { type: "http", url: "new" },
      b: { type: "http", url: "b" },
    });
  });

  it("appends preapproved tools", () => {
    const out = applyRole(base, role({ preapprovedTools: [{ server: "s", tool: "t" }] }));
    expect(out.config.toolPolicy?.preapproved).toEqual([{ kind: "mcp", server: "s", tool: "t" }]);
  });

  it("merges provider options", () => {
    const req = { ...base, config: { ...base.config, providerOptions: { a: 1, b: 1 } } };
    const out = applyRole(req, role({ providerOptions: { b: 2 } }));
    expect(out.config.providerOptions).toEqual({ a: 1, b: 2 });
  });

  it("lets creation-time env beat role env, and records the role name", () => {
    const req = { ...base, env: { PASEO_AGENT_ROLE: "r", PASEO_KUBE_TEMPLATE: "explicit" } };
    const out = applyRole(req, role({ env: { PASEO_KUBE_TEMPLATE: "from-role", OTHER: "1" } }));
    expect(out.env).toEqual({ PASEO_AGENT_ROLE: "r", PASEO_KUBE_TEMPLATE: "explicit", OTHER: "1" });
  });

  it("does not mutate the request", () => {
    const snapshot = structuredClone(base);
    applyRole(base, role({ model: "m", env: { X: "1" } }));
    expect(base).toEqual(snapshot);
  });
});

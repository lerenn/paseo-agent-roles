import type { PluginBeforeRequests } from "@getpaseo/plugin/server";
import { ROLE_ENV, type Role } from "../shared/role";

type CreateRequest = PluginBeforeRequests["agent.create"];

/** Rewrite an agent.create request so the agent starts as `role`. */
export function applyRole(request: CreateRequest, role: Role): CreateRequest {
  const config = { ...request.config };
  if (role.provider) config.provider = role.provider;
  if (role.model) config.model = role.model;
  if (role.modeId) config.modeId = role.modeId;
  if (role.thinkingOptionId) config.thinkingOptionId = role.thinkingOptionId;
  if (role.systemPrompt) {
    config.systemPrompt = [role.systemPrompt, request.config.systemPrompt]
      .filter(Boolean)
      .join("\n\n");
  }
  if (role.mcpServers) {
    config.mcpServers = { ...request.config.mcpServers, ...role.mcpServers };
  }
  if (role.preapprovedTools?.length) {
    config.toolPolicy = {
      preapproved: [
        ...(request.config.toolPolicy?.preapproved ?? []),
        ...role.preapprovedTools.map((t) => ({ kind: "mcp" as const, ...t })),
      ],
    };
  }
  if (role.providerOptions) {
    config.providerOptions = { ...request.config.providerOptions, ...role.providerOptions };
  }
  return { config, env: { ...role.env, ...request.env, [ROLE_ENV]: role.name } };
}

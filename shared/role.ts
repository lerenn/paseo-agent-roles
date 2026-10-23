import { z } from "zod";

export const ROLE_ENV = "PASEO_AGENT_ROLE";

const mcpServer = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal("http"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal("sse"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
]);

export const roleNameSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "role names are lowercase letters, digits, '-' and '_'");

/** A role definition file (roles/<name>.yaml, .yml or .json). */
export const roleSchema = z.strictObject({
  $schema: z.string().optional(),
  /** Schema version of the role file. */
  version: z.literal(1).default(1),
  name: roleNameSchema,
  description: z.string().optional(),
  /** Replaces the agent provider, e.g. "claude". Omit to keep the requested one. */
  provider: z.string().optional(),
  model: z.string().optional(),
  modeId: z.string().optional(),
  thinkingOptionId: z.string().optional(),
  /** Prepended to any system prompt the agent was created with. */
  systemPrompt: z.string().optional(),
  /** MCP servers added to the agent. A role server replaces a same-named one. */
  mcpServers: z.record(z.string(), mcpServer).optional(),
  /** MCP tools the agent may call without asking. */
  preapprovedTools: z.array(z.strictObject({ server: z.string(), tool: z.string() })).optional(),
  /** Environment for the agent process. Values given at creation take precedence. */
  env: z.record(z.string(), z.string()).optional(),
  /**
   * Provider-specific options, merged over the requested ones. Use this for limits
   * such as a turn cap, whose names depend on the provider.
   */
  providerOptions: z.record(z.string(), z.unknown()).optional(),
});

export type Role = z.output<typeof roleSchema>;

import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { roleSchema } from "./role";

export const roleSourceSchema = z.enum(["project", "user", "git", "bundled"]);
export type RoleSource = z.infer<typeof roleSourceSchema>;

export const roleEntrySchema = z.object({
  name: z.string(),
  source: roleSourceSchema,
  /** Human label of the source, e.g. "git: https://host/repo.git@main". */
  origin: z.string(),
  /** Absolute file path; absent for bundled roles. */
  file: z.string().optional(),
  /** File contents (YAML for bundled roles), for display and editing. */
  text: z.string(),
  /** Parsed role, or why the file is invalid. */
  role: roleSchema.optional(),
  error: z.string().optional(),
  /** For git roles: the source that holds it, as in GitStatus.id. */
  sourceId: z.string().optional(),
  /** Lower-priority sources hidden by this entry. */
  overrides: z.array(z.string()),
});
export type RoleEntry = z.infer<typeof roleEntrySchema>;

export const gitStatusSchema = z.object({
  /** Stable id of the source, used by write and token calls. */
  id: z.string(),
  label: z.string(),
  writeMode: z.enum(["pull-request", "push"]),
  /** Detected forge for pull requests ("github"), or null when none is supported. */
  forge: z.string().nullable(),
  /** Whether a forge token is stored for this source. The token itself is never returned. */
  hasToken: z.boolean(),
  url: z.string(),
  ref: z.string().optional(),
  path: z.string().optional(),
  /** ISO time of the last successful sync, null until one succeeds. */
  lastSync: z.string().nullable(),
  /** Why the latest sync failed; the last good copy keeps being used. */
  error: z.string().nullable(),
  syncing: z.boolean(),
});
export type GitStatus = z.infer<typeof gitStatusSchema>;

export const listRolesRpc = defineRpc({
  name: "roles.list",
  input: z.object({ cwd: z.string().optional() }),
  output: z.object({
    roles: z.array(roleEntrySchema),
    userDir: z.string(),
    git: z.array(gitStatusSchema),
  }),
});

export const syncSourcesRpc = defineRpc({
  name: "roles.sync",
  input: z.object({}),
  output: z.object({ git: z.array(gitStatusSchema) }),
});

export const saveRoleRpc = defineRpc({
  name: "roles.save",
  input: z.object({ text: z.string() }),
  output: z.object({ name: z.string(), file: z.string() }),
});

export const deleteRoleRpc = defineRpc({
  name: "roles.delete",
  input: z.object({ name: z.string() }),
  output: z.object({}),
});

export const pullRequestSchema = z.object({
  number: z.number(),
  url: z.string(),
  state: z.enum(["open", "closed", "merged"]),
});

/** A change written to a git source: committed to its branch, or pushed to a branch for review. */
export const proposalSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  sourceId: z.string(),
  sourceLabel: z.string(),
  role: z.string(),
  action: z.enum(["create", "update", "delete"]),
  outcome: z.enum(["pushed", "branch"]),
  commit: z.string(),
  branch: z.string().optional(),
  base: z.string(),
  title: z.string(),
  body: z.string(),
  files: z.array(z.string()),
  /** Prefilled "new pull request" page; works without a token. */
  compareUrl: z.string().optional(),
  /** Why push mode fell back to a branch. */
  fellBack: z.string().optional(),
  pr: pullRequestSchema.optional(),
  prError: z.string().optional(),
  /** Set when a user role was promoted to git: the local copy goes away once the git copy matches. */
  promotedFrom: z.string().optional(),
  localCopyRemoved: z.boolean().optional(),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const saveGitRoleRpc = defineRpc({
  name: "roles.git.save",
  input: z.object({ sourceId: z.string(), text: z.string(), promoteFrom: z.string().optional() }),
  output: z.object({ proposal: proposalSchema }),
});

export const deleteGitRoleRpc = defineRpc({
  name: "roles.git.delete",
  input: z.object({ sourceId: z.string(), name: z.string() }),
  output: z.object({ proposal: proposalSchema }),
});

export const listProposalsRpc = defineRpc({
  name: "roles.proposals.list",
  input: z.object({}),
  output: z.object({ proposals: z.array(proposalSchema) }),
});

export const createPullRequestRpc = defineRpc({
  name: "roles.proposals.create-pr",
  input: z.object({ id: z.string() }),
  output: z.object({ proposal: proposalSchema }),
});

export const setTokenRpc = defineRpc({
  name: "roles.token.set",
  input: z.object({ sourceId: z.string(), token: z.string().min(1).max(8192) }),
  output: z.object({}),
});

export const clearTokenRpc = defineRpc({
  name: "roles.token.clear",
  input: z.object({ sourceId: z.string() }),
  output: z.object({}),
});

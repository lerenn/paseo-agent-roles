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
  /** Lower-priority sources hidden by this entry. */
  overrides: z.array(z.string()),
});
export type RoleEntry = z.infer<typeof roleEntrySchema>;

export const gitStatusSchema = z.object({
  label: z.string(),
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

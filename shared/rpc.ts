import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { roleSchema } from "./role";

export const roleSourceSchema = z.enum(["project", "user", "bundled"]);
export type RoleSource = z.infer<typeof roleSourceSchema>;

export const roleEntrySchema = z.object({
  name: z.string(),
  source: roleSourceSchema,
  /** Absolute file path; absent for bundled roles. */
  file: z.string().optional(),
  /** File contents (YAML for bundled roles), for display and editing. */
  text: z.string(),
  /** Parsed role, or why the file is invalid. */
  role: roleSchema.optional(),
  error: z.string().optional(),
  /** Lower-priority sources hidden by this entry. */
  overrides: z.array(roleSourceSchema),
});
export type RoleEntry = z.infer<typeof roleEntrySchema>;

export const listRolesRpc = defineRpc({
  name: "roles.list",
  input: z.object({ cwd: z.string().optional() }),
  output: z.object({ roles: z.array(roleEntrySchema), userDir: z.string() }),
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

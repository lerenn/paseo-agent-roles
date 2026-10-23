import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { bundledRoles } from "./bundled";
import { roleNameSchema, roleSchema, type Role } from "../shared/role";

const EXTENSIONS = [".yaml", ".yml", ".json"];

/** Per-user roles directory. */
export const userRolesDir = path.join(homedir(), ".paseo", "roles");

/** Where project-owned roles live, relative to the agent's working directory. */
export const projectRolesPath = path.join(".paseo", "roles");

export function parseRole(source: string, file: string): Role {
  const raw = file.endsWith(".json") ? JSON.parse(source) : parse(source);
  const role = roleSchema.parse(raw);
  const expected = path.basename(file, path.extname(file));
  if (role.name !== expected) {
    throw new Error(`${file}: role name "${role.name}" must match the file name "${expected}"`);
  }
  return role;
}

/** Find a role by name; earlier directories win, then the bundled examples. Null when none has it. */
export async function loadRole(name: string, dirs: string[]): Promise<Role | null> {
  const safe = roleNameSchema.parse(name);
  for (const dir of dirs) {
    for (const ext of EXTENSIONS) {
      const file = path.join(dir, safe + ext);
      let source: string;
      try {
        source = await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      try {
        return parseRole(source, file);
      } catch (error) {
        throw new Error(`Invalid role file ${file}: ${(error as Error).message}`);
      }
    }
  }
  return bundledRoles[safe] ?? null;
}

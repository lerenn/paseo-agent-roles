import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { roleNameSchema } from "../shared/role";
import type { RoleEntry, RoleSource } from "../shared/rpc";
import { bundledRoles } from "./bundled";
import { describeError, EXTENSIONS, parseRole, parseRoleText, projectRolesPath, userRolesDir } from "./loader";

export interface CatalogDirs {
  user: string;
}

async function readDir(dir: string, source: RoleSource): Promise<Omit<RoleEntry, "overrides">[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const entries: Omit<RoleEntry, "overrides">[] = [];
  for (const base of files.sort()) {
    const ext = path.extname(base);
    if (!EXTENSIONS.includes(ext)) continue;
    const name = path.basename(base, ext);
    if (!roleNameSchema.safeParse(name).success) continue;
    // loadRole tries .yaml, .yml, .json in that order; a later duplicate is unreachable.
    if (entries.some((entry) => entry.name === name)) continue;
    const file = path.join(dir, base);
    const text = await readFile(file, "utf8");
    try {
      entries.push({ name, source, file, text, role: parseRole(text, file) });
    } catch (error) {
      entries.push({ name, source, file, text, error: describeError(error) });
    }
  }
  return entries;
}

/** All roles visible from `cwd`, one entry per name, highest-priority source first. */
export async function listRoles(
  cwd: string | undefined,
  dirs: CatalogDirs = { user: userRolesDir },
): Promise<RoleEntry[]> {
  const layers: Omit<RoleEntry, "overrides">[][] = [
    cwd ? await readDir(path.join(cwd, projectRolesPath), "project") : [],
    await readDir(dirs.user, "user"),
    Object.values(bundledRoles).map((role) => ({
      name: role.name,
      source: "bundled" as const,
      text: stringify(role),
      role,
    })),
  ];
  const byName = new Map<string, RoleEntry>();
  for (const layer of layers) {
    for (const entry of layer) {
      const winner = byName.get(entry.name);
      if (winner) winner.overrides.push(entry.source);
      else byName.set(entry.name, { ...entry, overrides: [] });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Validate role text and write it to the user roles directory as <name>.yaml. */
export async function saveUserRole(
  text: string,
  dirs: CatalogDirs = { user: userRolesDir },
): Promise<{ name: string; file: string }> {
  let role;
  try {
    role = parseRoleText(text);
  } catch (error) {
    throw new Error(describeError(error));
  }
  const file = path.join(dirs.user, `${role.name}.yaml`);
  await mkdir(dirs.user, { recursive: true });
  await writeFile(file, text.endsWith("\n") ? text : `${text}\n`);
  await removeUserFiles(role.name, dirs, file);
  return { name: role.name, file };
}

export async function deleteUserRole(name: string, dirs: CatalogDirs = { user: userRolesDir }) {
  await removeUserFiles(roleNameSchema.parse(name), dirs);
}

async function removeUserFiles(name: string, dirs: CatalogDirs, keep?: string) {
  for (const ext of EXTENSIONS) {
    const file = path.join(dirs.user, name + ext);
    if (file !== keep) await rm(file, { force: true });
  }
}

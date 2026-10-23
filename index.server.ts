import path from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { applyRole } from "./server/apply";
import { deleteUserRole, listRoles, saveUserRole } from "./server/catalog";
import { GitSources, sourceLabel } from "./server/git-sync";
import { loadRole, projectRolesPath, userRolesDir } from "./server/loader";
import { ROLE_ENV } from "./shared/role";
import { deleteRoleRpc, listRolesRpc, saveRoleRpc, syncSourcesRpc } from "./shared/rpc";
import { rolesSettings, type GitSource } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(rolesSettings);
  const gitSources = new GitSources();

  async function configured(): Promise<GitSource[]> {
    const state = await settings.read();
    return state.status === "ready" ? state.values.sources : [];
  }
  const statuses = (sources: GitSource[]) =>
    sources.map((s) => ({
      label: sourceLabel(s),
      url: s.url,
      ref: s.ref,
      path: s.path,
      ...gitSources.status(s),
    }));

  void configured().then((sources) => gitSources.configure(sources));
  const unsubscribe = settings.subscribe((state) => {
    gitSources.configure(state.status === "ready" ? state.values.sources : []);
  });

  const removeHook = server.before("agent.create", async ({ request }) => {
    const name = request.env?.[ROLE_ENV];
    if (!name) return;
    const sources = await configured();
    const dirs = [
      path.join(request.config.cwd, projectRolesPath),
      userRolesDir,
      ...sources.map((s) => gitSources.rolesDir(s)),
    ];
    const role = await loadRole(name, dirs);
    if (!role) {
      throw new Error(`${ROLE_ENV}=${name}: no such role (looked in ${dirs.join(", ")} and the bundled roles)`);
    }
    return applyRole(request, role);
  });

  server.handle(listRolesRpc, async ({ cwd }) => {
    const sources = await configured();
    return {
      roles: await listRoles(cwd, {
        user: userRolesDir,
        git: sources.map((s) => ({ label: sourceLabel(s), dir: gitSources.rolesDir(s) })),
      }),
      userDir: userRolesDir,
      git: statuses(sources),
    };
  });
  server.handle(syncSourcesRpc, async () => {
    const sources = await configured();
    await gitSources.syncAll(sources);
    return { git: statuses(sources) };
  });
  server.handle(saveRoleRpc, ({ text }) => saveUserRole(text));
  server.handle(deleteRoleRpc, async ({ name }) => {
    await deleteUserRole(name);
    return {};
  });

  return () => {
    removeHook();
    unsubscribe();
    gitSources.stop();
  };
}

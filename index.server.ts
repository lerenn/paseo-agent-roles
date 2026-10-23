import path from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { applyRole } from "./server/apply";
import { deleteUserRole, saveUserRole } from "./server/catalog";
import { GitSources, sourceLabel } from "./server/git-sync";
import { loadRole, projectRolesPath, userRolesDir } from "./server/loader";
import { ProposalStore } from "./server/proposals";
import { RolesService } from "./server/service";
import { TokenStore } from "./server/tokens";
import { ROLE_ENV } from "./shared/role";
import {
  clearTokenRpc,
  createPullRequestRpc,
  deleteGitRoleRpc,
  deleteRoleRpc,
  listProposalsRpc,
  listRolesRpc,
  saveGitRoleRpc,
  saveRoleRpc,
  setTokenRpc,
  syncSourcesRpc,
} from "./shared/rpc";
import { rolesSettings, type GitSource } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(rolesSettings);
  const gitSources = new GitSources();
  const tokens = new TokenStore();

  async function configured(): Promise<GitSource[]> {
    const state = await settings.read();
    return state.status === "ready" ? state.values.sources : [];
  }
  const service = new RolesService({
    sources: gitSources,
    tokens,
    proposals: new ProposalStore(),
    configured,
    userDir: userRolesDir,
  });

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
      roles: await service.list(cwd, {
        user: userRolesDir,
        git: sources.map((s) => ({ label: sourceLabel(s), dir: gitSources.rolesDir(s) })),
      }),
      userDir: userRolesDir,
      git: service.statuses(sources),
    };
  });
  server.handle(syncSourcesRpc, async () => {
    const sources = await configured();
    await gitSources.syncAll(sources);
    return { git: service.statuses(sources) };
  });
  server.handle(saveRoleRpc, ({ text }) => saveUserRole(text));
  server.handle(deleteRoleRpc, async ({ name }) => {
    await deleteUserRole(name);
    return {};
  });
  server.handle(saveGitRoleRpc, async ({ sourceId, text, promoteFrom }) => ({
    proposal: await service.save(sourceId, text, promoteFrom),
  }));
  server.handle(deleteGitRoleRpc, async ({ sourceId, name }) => ({
    proposal: await service.remove(sourceId, name),
  }));
  server.handle(listProposalsRpc, async () => ({ proposals: await service.proposals() }));
  server.handle(createPullRequestRpc, async ({ id }) => ({ proposal: await service.createPullRequest(id) }));
  server.handle(setTokenRpc, async ({ sourceId, token }) => {
    await service.find(sourceId);
    tokens.set(sourceId, token);
    return {};
  });
  server.handle(clearTokenRpc, ({ sourceId }) => {
    tokens.clear(sourceId);
    return {};
  });

  return () => {
    removeHook();
    unsubscribe();
    gitSources.stop();
  };
}

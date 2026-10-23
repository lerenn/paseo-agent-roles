import path from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { applyRole } from "./server/apply";
import { deleteUserRole, listRoles, saveUserRole } from "./server/catalog";
import { loadRole, projectRolesPath, userRolesDir } from "./server/loader";
import { ROLE_ENV } from "./shared/role";
import { deleteRoleRpc, listRolesRpc, saveRoleRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  const removeHook = server.before("agent.create", async ({ request }) => {
    const name = request.env?.[ROLE_ENV];
    if (!name) return;
    const dirs = [path.join(request.config.cwd, projectRolesPath), userRolesDir];
    const role = await loadRole(name, dirs);
    if (!role) {
      throw new Error(`${ROLE_ENV}=${name}: no such role (looked in ${dirs.join(", ")} and the bundled roles)`);
    }
    return applyRole(request, role);
  });

  server.handle(listRolesRpc, async ({ cwd }) => ({
    roles: await listRoles(cwd),
    userDir: userRolesDir,
  }));
  server.handle(saveRoleRpc, ({ text }) => saveUserRole(text));
  server.handle(deleteRoleRpc, async ({ name }) => {
    await deleteUserRole(name);
    return {};
  });

  return removeHook;
}

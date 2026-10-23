import path from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { applyRole } from "./server/apply";
import { loadRole, projectRolesPath, userRolesDir } from "./server/loader";
import { ROLE_ENV } from "./shared/role";

export default function contribute(server: PluginServerContext) {
  const remove = server.before("agent.create", async ({ request }) => {
    const name = request.env?.[ROLE_ENV];
    if (!name) return;
    const dirs = [path.join(request.config.cwd, projectRolesPath), userRolesDir];
    const role = await loadRole(name, dirs);
    if (!role) {
      throw new Error(`${ROLE_ENV}=${name}: no such role (looked in ${dirs.join(", ")} and the bundled roles)`);
    }
    return applyRole(request, role);
  });
  return remove;
}

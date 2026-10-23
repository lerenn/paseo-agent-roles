import type { PluginBeforeRequests } from "@getpaseo/plugin/server";
import { ROLE_ENV } from "../shared/role";
import { applyRole } from "./apply";
import { loadRole } from "./loader";

type CreateRequest = PluginBeforeRequests["agent.create"];

/**
 * The agent.create hook: if the request names a role in PASEO_AGENT_ROLE, look it up in the
 * git sources' role folders (`dirs`, in precedence order) and apply it.
 */
export function agentCreateHook(dirs: () => Promise<string[]>) {
  return async ({ request }: { request: CreateRequest }): Promise<CreateRequest | undefined> => {
    const name = request.env?.[ROLE_ENV];
    if (!name) return;
    const folders = await dirs();
    const role = await loadRole(name, folders);
    if (!role) {
      throw new Error(
        folders.length
          ? `${ROLE_ENV}=${name}: no such role in the git sources (looked in ${folders.join(", ")})`
          : `${ROLE_ENV}=${name}: no git source is configured, so there are no roles`,
      );
    }
    return applyRole(request, role);
  };
}

import type { PluginBeforeRequests, PluginHookContext } from "@getpaseo/plugin/server";
import { ROLE_ENV } from "../shared/role";
import { applyRole } from "./apply";
import type { AgentActivity, RoleLimits } from "./limits";
import { loadRole } from "./loader";

type CreateRequest = PluginBeforeRequests["agent.create"];
type SessionOpen = PluginBeforeRequests["agent.session_open"];

/** Activity of an agent as the daemon sees it: working, idle or finished, or no longer there. */
export async function agentActivity(context: PluginHookContext, agentId: string): Promise<AgentActivity> {
  try {
    const found = await context.paseo.agents.ref(agentId).refresh();
    if (!found || found.agent.archivedAt) return "gone";
    return found.agent.status === "running" || found.agent.status === "initializing" ? "active" : "inactive";
  } catch {
    return "inactive";
  }
}

/**
 * The agent.create hook: if the request names a role in PASEO_AGENT_ROLE, look it up in the
 * git sources' role folders (`dirs`, in precedence order), enforce its concurrency limit and apply it.
 */
export function agentCreateHook(dirs: () => Promise<string[]>, limits?: RoleLimits) {
  return async (
    { request }: { request: CreateRequest },
    context?: PluginHookContext,
  ): Promise<CreateRequest | undefined> => {
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
    const applied = applyRole(request, role);
    if (role.maxConcurrent && limits && context) {
      await limits.reserve(role.name, role.maxConcurrent, (id) => agentActivity(context, id));
    }
    return applied;
  };
}

/** The agent.session_open hook: learn which agent runs which role, for the concurrency limit. */
export function sessionOpenHook(limits: RoleLimits) {
  return async ({ request }: { request: SessionOpen }): Promise<undefined> => {
    const role = request.env[ROLE_ENV];
    if (role && request.purpose === "interactive") limits.register(request.agentId, role, request.reason === "create");
    return undefined;
  };
}

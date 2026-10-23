import { roleSchema, type Role } from "../shared/role";
import babysitter from "./roles/babysitter.json";
import implementer from "./roles/implementer.json";
import investigator from "./roles/investigator.json";
import qa from "./roles/qa.json";
import reviewer from "./roles/reviewer.json";

/** Example roles shipped with the plugin. Project and user roles override them by name. */
export const bundledRoles: Record<string, Role> = Object.fromEntries(
  [babysitter, implementer, investigator, qa, reviewer].map((raw) => {
    const role = roleSchema.parse(raw);
    return [role.name, role];
  }),
);

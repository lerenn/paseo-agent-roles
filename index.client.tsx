import { useHosts, type PluginClientContext, type PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { hostTitle } from "./client/host-title";
import { RolesScreen } from "./client/screen";

function RolesItem({ currentScreen, openScreen, host }: PluginSidebarItemProps) {
  const hosts = useHosts();
  return (
    <SidebarRow
      label={hostTitle("Agent Roles", host.label, hosts.length)}
      icon="UserCog"
      active={currentScreen?.screenId === "roles"}
      onPress={() => openScreen({ screenId: "roles" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "roles", title: "Agent Roles", Component: RolesScreen });
  client.addSidebarHeaderItem({ id: "roles", title: "Agent Roles", Component: RolesItem });
  return () => {};
}

import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { RolesScreen } from "./client/screen";

function RolesItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="UserCog"
      active={currentScreen?.screenId === "roles"}
      onPress={() => openScreen({ screenId: "roles" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "roles", title: "Agent roles", Component: RolesScreen });
  client.addSidebarHeaderItem({ id: "roles", title: "Agent roles", Component: RolesItem });
  return () => {};
}

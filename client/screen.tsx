import { usePaseo, useRpc, useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import { SettingsInput, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ROLE_ENV } from "../shared/role";
import { deleteRoleRpc, listRolesRpc, saveRoleRpc, syncSourcesRpc, type GitStatus, type RoleEntry } from "../shared/rpc";
import { DEFAULT_SYNC_MINUTES, gitSourceSchema, rolesSettings, type GitSource } from "../shared/settings";

const TEMPLATE = `name: my-role
description: What this role is for.
systemPrompt: |
  You are ...
# model: claude-sonnet-5-5
# mcpServers:
#   docs: { type: http, url: https://example.com/mcp }
# env:
#   KEY: value
`;

type Editing = { text: string; original: string | null };

export function RolesScreen({ theme, layout, navigation }: PluginScreenProps) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const listRoles = useRpc(listRolesRpc);
  const saveRole = useRpc(saveRoleRpc);
  const deleteRole = useRpc(deleteRoleRpc);
  const syncSources = useRpc(syncSourcesRpc);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);

  const workspaces = useQuery({
    queryKey: ["agent-roles", "workspaces"],
    queryFn: async () => (await paseo.workspaces.list()).entries,
  });
  const workspace = workspaces.data?.find((w) => w.id === workspaceId) ?? workspaces.data?.[0];
  const cwd = workspace?.workspaceDirectory ?? workspace?.projectRootPath;

  const roles = useQuery({
    queryKey: ["agent-roles", "roles", cwd ?? null],
    queryFn: () => listRoles({ cwd }),
  });
  const entry = roles.data?.roles.find((r) => r.name === selected) ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["agent-roles", "roles"] });
  const save = useMutation({
    mutationFn: (text: string) => saveRole({ text }),
    onSuccess: async ({ name }) => {
      setEditing(null);
      setSelected(name);
      await refresh();
    },
  });
  const sync = useMutation({
    mutationFn: () => syncSources({}),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (name: string) => deleteRole({ name }),
    onSuccess: async () => {
      setSelected(null);
      await refresh();
    },
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Text style={styles.title}>Agent roles</Text>
        <Button styles={styles} label="New role" onPress={() => setEditing({ text: TEMPLATE, original: null })} />
      </View>
      <Text style={styles.muted}>
        A role sets an agent's prompt, model, tools and environment when it starts. Select one with {ROLE_ENV}.
      </Text>

      {workspaces.data && workspaces.data.length > 0 ? (
        <SettingsSelect
          label="Workspace"
          hint="Project roles are read from this workspace's .paseo/roles, and new agents start here."
          value={workspace?.id ?? ""}
          options={workspaces.data.map((w) => ({ label: `${w.projectDisplayName} / ${w.name}`, value: w.id }))}
          onValueChange={setWorkspaceId}
        />
      ) : null}

      {roles.error ? <Text style={styles.error}>{String(roles.error)}</Text> : null}
      {roles.data ? <Text style={styles.muted}>Your roles are saved in {roles.data.userDir}</Text> : null}

      {roles.data?.roles.map((r) => (
        <Pressable
          key={r.name}
          accessibilityRole="button"
          accessibilityLabel={`Role ${r.name}`}
          onPress={() => {
            setSelected(r.name);
            setEditing(null);
          }}
          style={[styles.card, selected === r.name && styles.cardActive]}
        >
          <View style={styles.row}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.badge}>{r.origin}</Text>
          </View>
          <Text style={r.error ? styles.error : styles.muted} numberOfLines={2}>
            {r.error ?? r.role?.description ?? ""}
          </Text>
        </Pressable>
      ))}

      {editing ? (
        <View style={styles.panel}>
          <Text style={styles.heading}>{editing.original ? `Edit ${editing.original}` : "New role"}</Text>
          <TextInput
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            value={editing.text}
            onChangeText={(text) => setEditing({ ...editing, text })}
            style={styles.editor}
            accessibilityLabel="Role definition"
          />
          {save.error ? <Text style={styles.error}>{(save.error as Error).message}</Text> : null}
          <View style={styles.row}>
            <Button styles={styles} label="Save to user roles" primary onPress={() => save.mutate(editing.text)} />
            <Button styles={styles} label="Cancel" onPress={() => setEditing(null)} />
          </View>
        </View>
      ) : entry ? (
        <Detail
          entry={entry}
          styles={styles}
          onEdit={() => setEditing({ text: entry.text, original: entry.source === "user" ? entry.name : null })}
          onDelete={() => remove.mutate(entry.name)}
          deleteError={remove.error ? (remove.error as Error).message : null}
          workspaceId={workspace?.id}
          navigation={navigation}
          gitStatus={roles.data?.git.find((g) => g.label === entry.origin)}
        />
      ) : null}

      <GitSourcesPanel
        styles={styles}
        statuses={roles.data?.git ?? []}
        syncing={sync.isPending}
        onSync={() => sync.mutate()}
        onSaved={refresh}
      />
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Detail(props: {
  entry: RoleEntry;
  styles: Styles;
  onEdit(): void;
  onDelete(): void;
  deleteError: string | null;
  workspaceId?: string;
  navigation: PluginScreenProps["navigation"];
  gitStatus?: GitStatus;
}) {
  const { entry, styles } = props;
  const role = entry.role;
  const tools = [
    ...Object.entries(role?.mcpServers ?? {}).map(([name, s]) => `${name} (${s.type})`),
    ...(role?.preapprovedTools ?? []).map((t) => `${t.server}.${t.tool} (pre-approved)`),
  ];
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Text style={styles.heading}>{entry.name}</Text>
        <Text style={styles.badge}>{entry.origin}</Text>
      </View>
      {entry.file ? <Text style={styles.muted}>{entry.file}</Text> : null}
      {entry.source === "git" ? (
        <Text style={props.gitStatus?.error ? styles.error : styles.muted}>
          {gitStatusText(props.gitStatus)} Read-only: copy it to your user roles to change it.
        </Text>
      ) : null}
      {entry.overrides.length > 0 ? (
        <Text style={styles.muted}>Overrides the {entry.overrides.join(" and ")} role of the same name.</Text>
      ) : null}
      {entry.error ? <Text style={styles.error}>{entry.error}</Text> : null}
      {role ? (
        <>
          <Field styles={styles} label="Provider / model" value={[role.provider, role.model].filter(Boolean).join(" / ") || "unchanged"} />
          <Field styles={styles} label="Tools" value={tools.join("\n") || "none added"} />
          <Field styles={styles} label="Environment" value={Object.keys(role.env ?? {}).join(", ") || "none"} />
          <Field styles={styles} label="Provider options" value={role.providerOptions ? JSON.stringify(role.providerOptions) : "none"} />
          <Field styles={styles} label="Prompt" value={role.systemPrompt ?? "none"} />
        </>
      ) : null}
      <View style={styles.row}>
        <Button
          styles={styles}
          label={entry.source === "user" ? "Edit" : "Copy to user roles"}
          onPress={props.onEdit}
        />
        {entry.source === "user" ? <Button styles={styles} label="Delete" onPress={props.onDelete} /> : null}
      </View>
      {props.deleteError ? <Text style={styles.error}>{props.deleteError}</Text> : null}
      {role && props.workspaceId ? (
        <StartAgent entry={entry} workspaceId={props.workspaceId} styles={styles} navigation={props.navigation} />
      ) : null}
    </View>
  );
}

function gitStatusText(status?: GitStatus): string {
  if (!status) return "";
  const synced = status.lastSync ? `Last synced ${new Date(status.lastSync).toLocaleString()}.` : "Not synced yet.";
  const failure = status.error ? ` Last sync failed, using the previous copy: ${status.error}.` : "";
  return `${status.syncing ? "Syncing… " : ""}${synced}${failure}`;
}

type Draft = { id: number; url: string; ref: string; path: string; interval: string };

function GitSourcesPanel(props: {
  styles: Styles;
  statuses: GitStatus[];
  syncing: boolean;
  onSync(): void;
  onSaved(): void;
}) {
  const { styles } = props;
  const settings = useSettings(rolesSettings);
  const nextId = useRef(0);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toDrafts = (sources: GitSource[]): Draft[] =>
    sources.map((s) => ({
      id: nextId.current++,
      url: s.url,
      ref: s.ref ?? "",
      path: s.path ?? "",
      interval: String(s.intervalMinutes),
    }));
  useEffect(() => {
    if (drafts === null && settings.status === "ready") setDrafts(toDrafts(settings.values.sources));
  }, [drafts, settings]);

  const edit = (id: number, patch: Partial<Draft>) =>
    setDrafts((list) => (list ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)));

  async function save() {
    if (settings.status !== "ready" || !drafts) return;
    const parsed: GitSource[] = [];
    for (const d of drafts) {
      const result = gitSourceSchema.safeParse({
        url: d.url,
        ref: d.ref.trim() || undefined,
        path: d.path.trim() || undefined,
        intervalMinutes: d.interval.trim() ? Number(d.interval) : DEFAULT_SYNC_MINUTES,
      });
      if (!result.success) {
        setError(`${d.url || "New source"}: ${result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
        return;
      }
      parsed.push(result.data);
    }
    setError(null);
    if (await settings.save({ ...settings.values, sources: parsed }, settings.revision)) {
      setDrafts(null);
      props.onSaved();
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Text style={styles.heading}>Git sources</Text>
        <Button styles={styles} label={props.syncing ? "Syncing…" : "Sync now"} onPress={props.onSync} />
      </View>
      <Text style={styles.muted}>
        Roles are loaded from a folder of each repository, read-only, after your project and user roles. Repositories
        are cloned with the daemon's own git credentials (for example its SSH key).
      </Text>
      {settings.status === "invalid" || settings.status === "error" ? (
        <Text style={styles.error}>{settings.error}</Text>
      ) : null}
      {(drafts ?? []).map((d) => {
        const status = props.statuses.find((g) => g.url === d.url && (g.ref ?? "") === d.ref.trim());
        return (
          <View key={d.id} style={styles.startBox}>
            <SettingsInput label="Repository URL" initialValue={d.url} onChangeText={(url) => edit(d.id, { url })} placeholder="git@github.com:owner/repo.git" />
            <SettingsInput label="Branch or tag (optional)" initialValue={d.ref} onChangeText={(ref) => edit(d.id, { ref })} placeholder="default branch" />
            <SettingsInput label="Folder (optional)" initialValue={d.path} onChangeText={(path) => edit(d.id, { path })} placeholder="roles" />
            <SettingsInput
              label="Sync interval (minutes)"
              initialValue={d.interval}
              onChangeText={(interval) => edit(d.id, { interval })}
              placeholder={String(DEFAULT_SYNC_MINUTES)}
            />
            {status ? <Text style={status.error ? styles.error : styles.muted}>{gitStatusText(status)}</Text> : null}
            <Button styles={styles} label="Remove source" onPress={() => setDrafts((list) => (list ?? []).filter((x) => x.id !== d.id))} />
          </View>
        );
      })}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {settings.status === "ready" && settings.saveError ? <Text style={styles.error}>{settings.saveError}</Text> : null}
      <View style={styles.row}>
        <Button
          styles={styles}
          label="Add source"
          onPress={() =>
            setDrafts((list) => [...(list ?? []), { id: nextId.current++, url: "", ref: "", path: "", interval: String(DEFAULT_SYNC_MINUTES) }])
          }
        />
        <Button styles={styles} primary label={settings.status === "ready" && settings.saving ? "Saving…" : "Save sources"} onPress={save} />
      </View>
    </View>
  );
}

function Field({ styles, label, value }: { styles: Styles; label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function StartAgent(props: {
  entry: RoleEntry;
  workspaceId: string;
  styles: Styles;
  navigation: PluginScreenProps["navigation"];
}) {
  const { entry, styles } = props;
  const paseo = usePaseo();
  const [provider, setProvider] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const providers = useQuery({
    queryKey: ["agent-roles", "providers"],
    queryFn: async () => (await paseo.providers.listAvailable()).providers.filter((p) => p.available).map((p) => p.provider),
  });
  const chosen = provider || entry.role?.provider || providers.data?.[0] || "";
  const start = useMutation({
    mutationFn: async () => {
      const agent = await paseo.workspaces.ref(props.workspaceId).agents.create({
        config: { provider: chosen },
        prompt: prompt.trim() || undefined,
        env: { [ROLE_ENV]: entry.name },
        labels: { role: entry.name },
      });
      return agent.id;
    },
    onSuccess: (agentId) => props.navigation?.openAgent({ agentId }),
  });
  return (
    <View style={styles.startBox}>
      <Text style={styles.heading}>New agent with this role</Text>
      <SettingsSelect
        label="Provider"
        hint={entry.role?.provider ? "The role sets the provider." : undefined}
        value={chosen}
        options={(providers.data ?? []).map((p) => ({ label: p, value: p }))}
        onValueChange={setProvider}
        disabled={Boolean(entry.role?.provider)}
      />
      <SettingsInput label="First prompt (optional)" initialValue="" onChangeText={setPrompt} />
      {start.error ? <Text style={styles.error}>{(start.error as Error).message}</Text> : null}
      <Button
        styles={styles}
        primary
        label={start.isPending ? "Starting…" : "Start agent"}
        onPress={() => chosen && start.mutate()}
      />
    </View>
  );
}

function Button({ styles, label, onPress, primary }: { styles: Styles; label: string; onPress(): void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.button, primary && styles.buttonPrimary]}
    >
      <Text style={primary ? styles.buttonPrimaryText : styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(theme: PluginScreenProps["theme"], compact: boolean) {
  const pad = compact ? 16 : 24;
  return {
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    content: { padding: pad, gap: 12 },
    row: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 8 },
    title: { color: theme.colors.foreground, fontSize: compact ? 20 : 24 },
    heading: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
    name: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const },
    muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
    error: { color: theme.colors.foregroundMuted, fontSize: 13, fontStyle: "italic" as const },
    badge: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    card: {
      gap: 4,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    cardActive: { borderColor: theme.colors.accent },
    panel: {
      gap: 10,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    field: { gap: 2 },
    label: { color: theme.colors.foregroundMuted, fontSize: 12 },
    value: { color: theme.colors.foreground, fontSize: 14 },
    editor: {
      minHeight: 260,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      fontFamily: "monospace",
      fontSize: 13,
      textAlignVertical: "top" as const,
    },
    startBox: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
    button: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignSelf: "flex-start" as const,
    },
    buttonPrimary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    buttonText: { color: theme.colors.foreground, fontSize: 14 },
    buttonPrimaryText: { color: theme.colors.accentForeground, fontSize: 14 },
  };
}

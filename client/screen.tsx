import { usePaseo, useRpc, useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import { ExternalLink, SettingsInput, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ROLE_ENV } from "../shared/role";
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
  type GitStatus,
  type Proposal,
  type RoleEntry,
} from "../shared/rpc";
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

/** `gitSourceId` set: the edit is proposed to that git source instead of saved to the user roles. */
type Editing = { text: string; original: string | null; gitSourceId?: string };

export function RolesScreen({ theme, layout, navigation }: PluginScreenProps) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const listRoles = useRpc(listRolesRpc);
  const saveRole = useRpc(saveRoleRpc);
  const deleteRole = useRpc(deleteRoleRpc);
  const syncSources = useRpc(syncSourcesRpc);
  const saveGitRole = useRpc(saveGitRoleRpc);
  const deleteGitRole = useRpc(deleteGitRoleRpc);
  const listProposals = useRpc(listProposalsRpc);
  const createPr = useRpc(createPullRequestRpc);
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
  const proposals = useQuery({
    queryKey: ["agent-roles", "proposals"],
    queryFn: async () => (await listProposals({})).proposals,
    refetchInterval: 30_000,
  });
  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["agent-roles"] });
  };
  const saveGit = useMutation({
    mutationFn: (v: { sourceId: string; text: string; promoteFrom?: string }) => saveGitRole(v),
    onSuccess: async () => {
      setEditing(null);
      await refreshAll();
    },
  });
  const deleteGit = useMutation({
    mutationFn: (v: { sourceId: string; name: string }) => deleteGitRole(v),
    onSuccess: async () => {
      setSelected(null);
      await refreshAll();
    },
  });
  const openPr = useMutation({
    mutationFn: (id: string) => createPr({ id }),
    onSettled: refreshAll,
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

      {roles.data && roles.data.roles.length === 0 ? (
        <View style={styles.panel}>
          <Text style={styles.heading}>No roles yet</Text>
          <Text style={styles.muted}>Create one, or add a git source below.</Text>
          <Button styles={styles} primary label="New role" onPress={() => setEditing({ text: TEMPLATE, original: null })} />
        </View>
      ) : null}

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
          {editing.gitSourceId ? (
            <Text style={styles.muted}>
              Saving commits this change to the git source: as a pull request branch by default, or straight to the branch
              in push mode.
            </Text>
          ) : null}
          {save.error ? <Text style={styles.error}>{(save.error as Error).message}</Text> : null}
          {saveGit.error ? <Text style={styles.error}>{(saveGit.error as Error).message}</Text> : null}
          <View style={styles.row}>
            <Button
              styles={styles}
              label={editing.gitSourceId ? (saveGit.isPending ? "Saving…" : "Save to git") : "Save to user roles"}
              primary
              onPress={() =>
                editing.gitSourceId
                  ? saveGit.mutate({ sourceId: editing.gitSourceId, text: editing.text })
                  : save.mutate(editing.text)
              }
            />
            <Button styles={styles} label="Cancel" onPress={() => setEditing(null)} />
          </View>
        </View>
      ) : entry ? (
        <Detail
          entry={entry}
          styles={styles}
          sources={roles.data?.git ?? []}
          onEdit={() => setEditing({ text: entry.text, original: entry.source === "user" ? entry.name : null })}
          onEditGit={() => setEditing({ text: entry.text, original: entry.name, gitSourceId: entry.sourceId })}
          onDelete={() => remove.mutate(entry.name)}
          onDeleteGit={() => entry.sourceId && deleteGit.mutate({ sourceId: entry.sourceId, name: entry.name })}
          onPromote={(sourceId) => saveGit.mutate({ sourceId, text: entry.text, promoteFrom: entry.name })}
          gitBusy={saveGit.isPending || deleteGit.isPending}
          deleteError={
            remove.error
              ? (remove.error as Error).message
              : deleteGit.error
                ? (deleteGit.error as Error).message
                : saveGit.error
                  ? (saveGit.error as Error).message
                  : null
          }
          workspaceId={workspace?.id}
          navigation={navigation}
          gitStatus={roles.data?.git.find((g) => g.label === entry.origin)}
        />
      ) : null}

      <ProposalsPanel
        styles={styles}
        proposals={proposals.data ?? []}
        busyId={openPr.isPending ? openPr.variables : undefined}
        error={openPr.error ? (openPr.error as Error).message : null}
        onCreatePr={(id) => openPr.mutate(id)}
        hasToken={(sourceId) => roles.data?.git.find((g) => g.id === sourceId)?.hasToken ?? false}
      />

      <GitSourcesPanel
        styles={styles}
        statuses={roles.data?.git ?? []}
        syncing={sync.isPending}
        onSync={() => sync.mutate()}
        onSaved={refreshAll}
      />
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Detail(props: {
  entry: RoleEntry;
  styles: Styles;
  sources: GitStatus[];
  onEdit(): void;
  onEditGit(): void;
  onDelete(): void;
  onDeleteGit(): void;
  onPromote(sourceId: string): void;
  gitBusy: boolean;
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
          {gitStatusText(props.gitStatus)} Edits are proposed to the repository ({props.gitStatus?.writeMode ?? "pull-request"} mode).
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
        {entry.source === "git" ? (
          <>
            <Button styles={styles} label="Edit in git" onPress={props.onEditGit} />
            <Button styles={styles} label="Copy to user roles" onPress={props.onEdit} />
            <Button styles={styles} label="Delete from git" onPress={props.onDeleteGit} />
          </>
        ) : (
          <>
            <Button
              styles={styles}
              label={entry.source === "user" ? "Edit" : "Copy to user roles"}
              onPress={props.onEdit}
            />
            {entry.source === "user" ? <Button styles={styles} label="Delete" onPress={props.onDelete} /> : null}
          </>
        )}
      </View>
      {entry.source === "user" && props.sources.length > 0 ? (
        <PromoteToGit sources={props.sources} busy={props.gitBusy} styles={styles} onPromote={props.onPromote} />
      ) : null}
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

type Draft = { id: number; url: string; ref: string; path: string; interval: string; writeMode: GitSource["writeMode"] };

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
      writeMode: s.writeMode,
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
        writeMode: d.writeMode,
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
        Roles are loaded from a folder of each repository, after your project and user roles. Repositories are cloned
        and pushed with the daemon's own git credentials (for example its SSH key). Edits you save here become a
        pull request or a push, depending on each source's mode.
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
            <SettingsSelect
              label="When you save a role change"
              hint="Pull request pushes a branch for review. Push commits straight to the branch and falls back to a pull request if the push is rejected."
              value={d.writeMode}
              options={[
                { label: "Propose a pull request", value: "pull-request" },
                { label: "Push to the branch", value: "push" },
              ]}
              onValueChange={(writeMode) => edit(d.id, { writeMode })}
            />
            {status ? <TokenControls status={status} styles={styles} onChanged={props.onSaved} /> : (
              <Text style={styles.muted}>Save sources to set a forge token.</Text>
            )}
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
            setDrafts((list) => [...(list ?? []), { id: nextId.current++, url: "", ref: "", path: "", interval: String(DEFAULT_SYNC_MINUTES), writeMode: "pull-request" }])
          }
        />
        <Button styles={styles} primary label={settings.status === "ready" && settings.saving ? "Saving…" : "Save sources"} onPress={save} />
      </View>
    </View>
  );
}

function PromoteToGit(props: { sources: GitStatus[]; busy: boolean; styles: Styles; onPromote(sourceId: string): void }) {
  const [sourceId, setSourceId] = useState("");
  const chosen = props.sources.find((s) => s.id === sourceId) ?? props.sources[0];
  return (
    <View style={props.styles.startBox}>
      <Text style={props.styles.heading}>Save to git</Text>
      <Text style={props.styles.muted}>
        Adds this role to a git source so others get it. The local copy is removed once the change is merged and synced.
      </Text>
      <SettingsSelect
        label="Git source"
        value={chosen.id}
        options={props.sources.map((s) => ({ label: `${s.label} (${s.writeMode})`, value: s.id }))}
        onValueChange={setSourceId}
      />
      <Button
        styles={props.styles}
        primary
        label={props.busy ? "Saving…" : chosen.writeMode === "push" ? "Push to git" : "Propose via pull request"}
        onPress={() => props.onPromote(chosen.id)}
      />
    </View>
  );
}

function ProposalsPanel(props: {
  styles: Styles;
  proposals: Proposal[];
  busyId?: string;
  error: string | null;
  onCreatePr(id: string): void;
  hasToken(sourceId: string): boolean;
}) {
  const { styles } = props;
  if (props.proposals.length === 0) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Changes sent to git</Text>
      {props.error ? <Text style={styles.error}>{props.error}</Text> : null}
      {props.proposals.slice(0, 8).map((p) => (
        <View key={p.id} style={styles.field}>
          <Text style={styles.name}>{p.title}</Text>
          <Text style={styles.muted}>
            {p.sourceLabel} · {new Date(p.createdAt).toLocaleString()} · commit {p.commit.slice(0, 8)}
            {p.branch ? ` on ${p.branch}` : ` pushed to ${p.base}`}
          </Text>
          {p.fellBack ? <Text style={styles.muted}>Push was rejected ({p.fellBack}); proposed as a branch instead.</Text> : null}
          {p.promotedFrom ? (
            <Text style={styles.muted}>
              {p.localCopyRemoved ? "Local copy removed after merge." : "Local copy is kept until this is merged and synced."}
            </Text>
          ) : null}
          {p.pr ? (
            <ExternalLink href={p.pr.url}>{`PR #${p.pr.number} (${p.pr.state}) - open`}</ExternalLink>
          ) : p.outcome === "branch" ? (
            <View style={styles.row}>
              {props.hasToken(p.sourceId) ? (
                <Button
                  styles={styles}
                  primary
                  label={props.busyId === p.id ? "Creating…" : "Create PR"}
                  onPress={() => props.onCreatePr(p.id)}
                />
              ) : null}
              {p.compareUrl ? (
                <ExternalLink href={p.compareUrl}>
                  {props.hasToken(p.sourceId) ? "Review on the forge" : "Open prefilled PR page (no forge token set)"}
                </ExternalLink>
              ) : null}
            </View>
          ) : null}
          {p.prError ? <Text style={styles.error}>{p.prError}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Write-only forge token: the field is never filled from storage, only "set" or "not set" is shown. */
function TokenControls({ status, styles, onChanged }: { status: GitStatus; styles: Styles; onChanged(): void }) {
  const setToken = useRpc(setTokenRpc);
  const clearToken = useRpc(clearTokenRpc);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      setValue("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!status.forge) {
    return <Text style={styles.muted}>No pull request API for this host: a prefilled compare link is offered instead.</Text>;
  }
  return (
    <View style={styles.field}>
      <SettingsInput
        label={`${status.forge} token: ${status.hasToken ? "set" : "not set"}`}
        hint="Optional. A fine-grained token with pull request write access to this repository lets you create the PR in one click; without it you get a prefilled link. Stored on the daemon, never shown again."
        initialValue=""
        secureTextEntry
        onChangeText={setValue}
        placeholder={status.hasToken ? "Enter a new token to replace it" : "Paste token"}
      />
      <View style={styles.row}>
        <Button styles={styles} label="Save token" onPress={() => value && run(() => setToken({ sourceId: status.id, token: value }))} />
        {status.hasToken ? <Button styles={styles} label="Clear token" onPress={() => run(() => clearToken({ sourceId: status.id }))} /> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
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

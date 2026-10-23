# paseo-agent-roles

A [Paseo](https://paseo.sh) plugin that starts agents from versioned role definitions: a system prompt, a model, MCP servers, pre-approved tools and provider options, kept as files in your repository.

Requires Paseo >= 0.11.2.

## Install

```bash
paseo plugin add git:lerenn/paseo-agent-roles
```

(or install `lerenn/agent-roles` from the plugin registry once listed). The plugin runs `npm ci` on install.

## Choosing a role

Paseo's `agent.create` hook receives only the agent config and its environment, so a role is selected through the environment variable `PASEO_AGENT_ROLE`:

```bash
paseo run --env PASEO_AGENT_ROLE=reviewer "Review the current diff"
```

Agents created without the variable are not touched. An unknown role name, or no git source at all, makes agent creation fail with an explanation. The variable stays set in the agent's environment so the agent can tell which role it runs as.

## The Agent Roles screen

The plugin adds an **Agent Roles** item to the sidebar (reorder or hide it in Settings > Sidebar). When the app knows several hosts, the item and the screen heading read "Agent Roles · <host label>" so you can tell which daemon they act on. Roles come only from [git sources](#git-sources); with none configured the screen says "Add a git source to load roles". Otherwise it lists every role with its source, shows its prompt, model, tools and environment, and lets you:

- create, edit or delete a role (dropdowns for provider, model, thinking level and permission mode, filled from the daemon's providers, sit above the YAML; the role list shows what each role forces): the change is written to a git source (you pick one when there are several) through the [write flow](#writing-roles-to-git), a pull request by default;
- start a new agent with a role: pick a workspace and provider, optionally type a first prompt, and the agent is created with `PASEO_AGENT_ROLE` set.

## Where roles are found

Only in the folders of the configured git sources. The screen labels a source `owner/repo@ref` (`host/owner/repo@ref` outside GitHub). If two sources hold a role of the same name, the one listed first wins. There are no project-local, per-user or built-in roles. To keep roles next to a project, point a git source at that project's repository and folder.

Five generic starting points (`implementer`, `reviewer`, `qa`, `investigator`, `babysitter`) live in [`docs/examples/roles`](docs/examples/roles). They are never loaded: copy the ones you want into your own roles repository, or point a git source at that folder.

## Git sources

Keep a team's roles in a repository and let every daemon pick them up. Nothing is cloned or loaded until you add a source. On the Agent Roles screen, under **Git sources** (a collapsed section; click it to expand), add one or more sources:

| Field | Meaning |
|---|---|
| Repository URL | Anything `git clone` accepts, e.g. `git@github.com:acme/agent-roles.git` or `https://github.com/lerenn/paseo-agent-roles.git` |
| Branch or tag | Optional; the remote's default branch if empty. Writing needs a branch. |
| Folder | Optional folder inside the repository that holds the role files, e.g. `roles` |
| Sync interval | Minutes between fetches, default 5 |
| When you save a role change | `pull-request` (default) or `push`, see below |
| Forge token | Optional, write-only; see below |

The plugin shallow-clones each source into `~/.paseo/agent-roles/git/` and fetches it on its interval (and when you press **Sync now**). It runs the daemon's `git`, so access uses whatever credentials the daemon already has (SSH key, credential helper); never put a token in the URL, as saved settings are not secret. The screen shows each source's last sync time or error; if a sync fails, the last good copy keeps being used.

This repository's [`docs/examples/roles`](docs/examples/roles) folder works as an example source: URL `https://github.com/lerenn/paseo-agent-roles.git`, folder `docs/examples/roles`.

### Writing roles to git

You create, edit and delete roles on the screen. Each save fetches the latest remote tip, applies the change on top of it, commits as `agent-roles: create|update|delete <role>` (using the daemon's git identity), and then, depending on the source's mode:

- **`pull-request`** (default): pushes a branch `agent-roles/<role>-<timestamp>` and shows the commit, the branch and a prefilled compare link (title `agent-roles: update <role>`, body listing the changed files). The role itself is unchanged until the PR is merged and synced.
- **`push`**: commits and pushes to the configured branch. If the push is rejected (for example by branch protection), the change is pushed to a branch instead and offered as a pull request, with the reason shown.

If the fetch or push fails, nothing is saved: the edit stays in the editor with the error and a suggestion to use pull-request mode. A role created in pull-request mode appears in the list once its PR is merged and the source synced.

**Creating the PR.** Without a token the screen links to the forge's prefilled "new pull request" page, so no token is needed. With a forge token set for the source, **Create PR** opens it through the forge API and the screen then shows the PR link and its state (open, closed, merged). GitHub is implemented (fine-grained token with *Pull requests: write* on the repository); the forge interface in `server/forge.ts` is the extension point for others. The token is stored on the daemon (`~/.paseo/agent-roles/forge-tokens.json`, mode 0600), is write-only (the screen only shows set or not set) and is never put in settings or sent back to the app.

## Role file format

The file name must match `name`. Unknown fields are rejected. A JSON Schema is in [`role.schema.json`](role.schema.json) for editor validation (YAML: `# yaml-language-server: $schema=...`).

```yaml
version: 1                  # schema version, optional
name: reviewer              # lowercase letters, digits, '-' and '_'
description: Reviews a diff without editing code.
provider: claude            # optional, replaces the requested provider
model: claude-opus-5-5      # optional
modeId: plan                # optional
thinkingOptionId: high      # optional
systemPrompt: |             # prepended to any prompt the agent was created with
  You are a code reviewer. ...
mcpServers: [linear, sentry] # MCP servers by name; ["*"] = all (see below)
preapprovedTools:           # MCP tools usable without asking
  - { server: linear, tool: get_issue }
env:                        # agent process env; values passed at creation win
  LOG_LEVEL: debug
  GITHUB_TOKEN: ${GH_TOKEN} # secrets: reference the daemon's env, never write them here
maxConcurrent: 3            # at most 3 agents of this role working at once
plugins:                    # defaults for other plugins (each optional, see below)
  kubeTemplate: default
  warder: { mode: on, interval: 15m }   # or just `warder: on`
  ticket: ANY-1234
providerOptions:            # provider-specific, merged over the requested ones; use for limits
  maxTurns: 40
```

Application rules: scalar fields from the role (`provider`, `model`, `thinkingOptionId`, `modeId`) override what the agent was created with (checked on Paseo 0.13.0-beta.1: a role replaces the requested provider, model, thinking level and mode); `systemPrompt` is prepended; `preapprovedTools` and `providerOptions` are merged. Environment is layered, lowest first: plugin defaults, MCP names, the role's `env`, then whatever the creator passed with `--env`. The working directory is never changed.

**MCP servers** are names only, so no URL or credential ever sits in a role file. They are passed to an MCP proxy plugin as `PASEO_MCP_SERVERS=linear,sentry` (`*` for all); that plugin injects the servers and their credentials, and an unknown name does not fail creation. Without such a plugin the variable is simply unused.

**Env and secrets.** A value may reference the daemon's environment as `${NAME}`, resolved when the agent starts; a missing variable fails creation saying which one. Role files are refused if they contain a secret: a well-known token shape, or a literal value under a key named like `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `*_API_KEY` or `*_CREDENTIAL`. Reference those instead.

**Concurrency.** `maxConcurrent: N` caps the agents of the role that are initializing or running (idle and archived agents do not count). Creating one more fails with `Role "x" is at its limit of N concurrent agents`; nothing is queued. The plugin learns which agents run which role when their session opens, and keeps that in `~/.paseo/agent-roles/role-agents.json` so a daemon restart does not forget them.

**Defaults for other plugins** are plain environment those plugins already read, with no dependency on them: `plugins.kubeTemplate` sets `PASEO_KUBE_TEMPLATE` (Kube Agents), `plugins.warder` sets `PASEO_WARDER=on|off` (Agents Warder), and `plugins.warder: { mode: on, interval: 15m }` also sets its default check interval as `PASEO_WARDER_INTERVAL` (`15m`, `1h30m` or seconds), `plugins.ticket` sets `PASEO_AGENT_TICKET` (Agents Tickets Sync). Anything else another plugin reads can go in `env`.

Paseo has no provider-independent limit setting, so limits go in `providerOptions` using the names your provider expects.

## Development

```bash
npm ci
npm run typecheck && npm test && npm run build
npm run schema   # regenerate role.schema.json after editing shared/role.ts
```

CI runs the same steps through a [Dagger](https://dagger.io) module (`.dagger/`), called from `.github/workflows/ci.yml`. Locally: `dagger call all`.

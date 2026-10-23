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

Agents created without the variable are not touched. An unknown role name makes agent creation fail with the list of places searched. The variable stays set in the agent's environment so the agent can tell which role it runs as.

## The Agent roles screen

The plugin adds an **Agent roles** item to the sidebar (reorder or hide it in Settings > Sidebar). The screen lists every role with its source, shows its prompt, model, tools and environment, and lets you:

- create a role, edit your own roles, or copy a project or git role into your user roles (saved to `~/.paseo/roles/<name>.yaml`) and delete user roles;
- start a new agent with a role: pick a workspace and provider, optionally type a first prompt, and the agent is created with `PASEO_AGENT_ROLE` set.

Project roles show up for the workspace chosen at the top of the screen. Project role files are not edited from the screen; copy one to your user roles to change it.

## Where roles are found

First match wins, highest priority first:

1. **project**: `<agent cwd>/.paseo/roles/<name>.{yaml,yml,json}` (commit these with the project)
2. **user**: `~/.paseo/roles/<name>.{yaml,yml,json}`
3. **git source(s)**: a folder of each configured git repository, in the order they are listed

The plugin ships no roles of its own: until you create one or add a source, the screen is empty and `PASEO_AGENT_ROLE` names nothing. Five generic starting points (`implementer`, `reviewer`, `qa`, `investigator`, `babysitter`) live in [`docs/examples/roles`](docs/examples/roles). They are never loaded; copy the ones you want into `~/.paseo/roles/` or your project's `.paseo/roles/`, or point a git source at that folder.

The screen shows the source of each role (`project`, `user` or `git: <repo>@<ref>`) and which lower-priority roles it hides.

## Git sources

Keep a team's roles in a repository and let every daemon pick them up. Git is optional and off by default: nothing is cloned until you add a source. On the Agent roles screen, under **Git sources**, add one or more sources:

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

You can edit and delete git roles on the screen, and promote one of your user roles with **Save to git**. Each save fetches the latest remote tip, applies the change on top of it, commits as `agent-roles: create|update|delete <role>` (using the daemon's git identity), and then, depending on the source's mode:

- **`pull-request`** (default): pushes a branch `agent-roles/<role>-<timestamp>` and shows the commit, the branch and a prefilled compare link (title `agent-roles: update <role>`, body listing the changed files). The role itself is unchanged until the PR is merged and synced.
- **`push`**: commits and pushes to the configured branch. If the push is rejected (for example by branch protection), the change is pushed to a branch instead and offered as a pull request, with the reason shown.

If the fetch or push fails, nothing is saved: the edit stays in the editor with the error and a suggestion to use pull-request mode.

**Creating the PR.** Without a token the screen links to the forge's prefilled "new pull request" page, so no token is needed. With a forge token set for the source, **Create PR** opens it through the forge API and the screen then shows the PR link and its state (open, closed, merged). GitHub is implemented (fine-grained token with *Pull requests: write* on the repository); the forge interface in `server/forge.ts` is the extension point for others. The token is stored on the daemon (`~/.paseo/agent-roles/forge-tokens.json`, mode 0600), is write-only (the screen only shows set or not set) and is never put in settings or sent back to the app.

**Promotion.** *Save to git* on a user role writes it to the chosen source through the same flow. Once the change is merged and the source synced, the local copy in `~/.paseo/roles` is removed automatically, only if it still matches the git copy.

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
mcpServers:                 # added to the agent; a role server replaces a same-named one
  docs:
    type: http              # stdio (command, args, env) | http | sse (url, headers)
    url: https://example.com/mcp
preapprovedTools:           # MCP tools usable without asking
  - { server: docs, tool: search }
env:                        # agent process env; values passed at creation win
  PASEO_KUBE_TEMPLATE: my-template
providerOptions:            # provider-specific, merged over the requested ones; use for limits
  maxTurns: 40
```

Application rules: scalar fields from the role override the request; `systemPrompt` is prepended; `mcpServers`, `preapprovedTools` and `providerOptions` are merged. The working directory is never changed.

`PASEO_KUBE_TEMPLATE` is the only convention shared with other plugins (kube-agents reads it if installed); this plugin does not depend on or know about them.

Paseo has no provider-independent limit setting, so limits go in `providerOptions` using the names your provider expects.

## Development

```bash
npm ci
npm run typecheck && npm test && npm run build
npm run schema   # regenerate role.schema.json after editing shared/role.ts
```

CI runs the same steps through a [Dagger](https://dagger.io) module (`.dagger/`), called from `.github/workflows/ci.yml`. Locally: `dagger call all`.

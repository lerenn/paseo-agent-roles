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

- create a role, edit your own roles, or copy a bundled or project role into your user roles (saved to `~/.paseo/roles/<name>.yaml`) and delete user roles;
- start a new agent with a role: pick a workspace and provider, optionally type a first prompt, and the agent is created with `PASEO_AGENT_ROLE` set.

Project roles show up for the workspace chosen at the top of the screen. Project role files are not edited from the screen; copy one to your user roles to change it.

## Where roles are found

First match wins, highest priority first:

1. **project**: `<agent cwd>/.paseo/roles/<name>.{yaml,yml,json}` (commit these with the project)
2. **user**: `~/.paseo/roles/<name>.{yaml,yml,json}`
3. **git source(s)**: a folder of each configured git repository, in the order they are listed
4. **bundled** examples: `implementer`, `reviewer`, `qa`, `investigator`, `babysitter`

The screen shows the source of each role (`git: <repo>@<ref>` for git sources) and which lower-priority roles it hides.

## Git sources

Keep a team's roles in a repository and let every daemon pick them up. On the Agent roles screen, under **Git sources**, add one or more sources:

| Field | Meaning |
|---|---|
| Repository URL | Anything `git clone` accepts, e.g. `git@github.com:acme/agent-roles.git` or `https://github.com/lerenn/paseo-agent-roles.git` |
| Branch or tag | Optional; the remote's default branch if empty |
| Folder | Optional folder inside the repository that holds the role files, e.g. `roles` |
| Sync interval | Minutes between fetches, default 5 |

The plugin shallow-clones each source into `~/.paseo/agent-roles/git/` and fetches it on its interval (and when you press **Sync now**). It runs the daemon's `git`, so access uses whatever credentials the daemon already has (SSH key, credential helper); never put a token in the URL, as saved settings are not secret. Git roles are read-only in the UI (copy one to your user roles to change it) and show their last sync time. If a sync fails the error is shown and the last good copy keeps being used. Sources are stored in the plugin's host settings.

This repository's [`examples/roles`](examples/roles) folder is a working example source: URL `https://github.com/lerenn/paseo-agent-roles.git`, folder `examples/roles`.

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

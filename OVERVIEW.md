Agent roles starts agents from named role definitions. A role bundles a system prompt, a model, MCP servers, pre-approved tools and provider options, and lives as a YAML or JSON file in your repository instead of being retyped for every agent.

Pass `PASEO_AGENT_ROLE=<name>` in the environment when creating an agent, for example `paseo run --env PASEO_AGENT_ROLE=reviewer`. The plugin rewrites the agent's configuration before it starts. Agents created without the variable are left untouched, and an unknown role name makes creation fail.

The Agent roles sidebar item opens a screen that lists roles and their sources, shows each role's prompt, model and tools, edits your own roles in `~/.paseo/roles/`, and starts a new agent with a chosen role.

Roles are read from `.paseo/roles/` in the agent's working directory, then from `~/.paseo/roles/`, then from any git repositories you configure on the screen (shallow-cloned and re-fetched every few minutes with the daemon's own git credentials, read-only), then from the bundled examples: implementer, reviewer, qa, investigator and babysitter. It reads only those files and talks to the network only to fetch the git sources you configure. Paseo has no provider-independent limit setting, so limits are passed through as provider options.

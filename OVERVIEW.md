Agent Roles starts agents from named role definitions. A role bundles a system prompt, a model, MCP servers, pre-approved tools and provider options, and lives as a YAML or JSON file in your repository instead of being retyped for every agent.

Pass `PASEO_AGENT_ROLE=<name>` in the environment when creating an agent, for example `paseo run --env PASEO_AGENT_ROLE=reviewer`. The plugin rewrites the agent's configuration before it starts. Agents created without the variable are left untouched, and an unknown role name makes creation fail.

The Agent Roles sidebar item opens a screen that lists roles and their sources, shows each role's prompt, model and tools, writes role changes to git, and starts a new agent with a chosen role.

Roles come only from git repositories you configure on the screen: each is shallow-cloned and re-fetched every few minutes with the daemon's own git credentials, and a folder of it holds the role files. With no source configured there are no roles. The plugin ships none; generic examples live in the repository's docs folder for you to copy.

Creating, editing or deleting a role on the screen commits the change and pushes it, as a pull request branch (default) or straight to the branch, with the same git credentials. An optional write-only GitHub token lets the screen open the pull request in one click; without it you get a prefilled link. The plugin talks to the network only for the git sources you configure and, with a token, the GitHub API. Paseo has no provider-independent limit setting, so limits are passed through as provider options.

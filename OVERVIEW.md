Agent roles starts agents from named role definitions. A role bundles a system prompt, a model, MCP servers, pre-approved tools and limits, and lives as a versioned file in a repository instead of being retyped for every agent.

Pick a role when creating an agent by passing `PASEO_AGENT_ROLE=<name>` in the agent's environment. Agents created without it are left untouched.

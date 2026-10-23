# paseo-agent-roles

A [Paseo](https://paseo.sh) plugin that starts agents from versioned role definitions (prompt, model, MCP servers, tool policy, limits).

Requires Paseo >= 0.11.2. Work in progress: this skeleton only registers the plugin.

## Install

```bash
paseo plugin add git:lerenn/paseo-agent-roles
```

## Development

```bash
npm ci
npm run typecheck && npm test && npm run build
```

CI runs the same steps through a [Dagger](https://dagger.io) module (`.dagger/`), called from `.github/workflows/ci.yml`. To run it locally: `dagger call all --source=.`.

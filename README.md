# Shipi18n

[![CI](https://github.com/Shipi18n/shipi18n/actions/workflows/ci.yml/badge.svg)](https://github.com/Shipi18n/shipi18n/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@shipi18n/core?label=%40shipi18n%2Fcore)](https://www.npmjs.com/package/@shipi18n/core)
[![MCP](https://img.shields.io/npm/v/@shipi18n/mcp?label=%40shipi18n%2Fmcp)](https://www.npmjs.com/package/@shipi18n/mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Open-source, bring-your-own-LLM i18n translation tooling.** Translate your locale files with your
own OpenAI or Anthropic key — no account, no hosted API, no per-word fees.

```bash
export ANTHROPIC_API_KEY=sk-ant-...            # or OPENAI_API_KEY
npx @shipi18n/cli translate locales/en.json -t es,fr,de
```

That's it. Your keys, your model, your files. Nothing leaves your machine except the call to your own
LLM provider.

## Packages

| Package | Description |
| --- | --- |
| [`@shipi18n/core`](packages/core) | The translation engine. Provider-agnostic adapters, structure-preserving JSON translation, placeholder validation, incremental mode. |
| [`@shipi18n/cli`](packages/cli) | Command-line translator: `shipi18n translate <file> -t es,fr`. |
| [`@shipi18n/mcp`](packages/mcp) | MCP server — translate from Claude Desktop, Cursor, or any MCP client. Works with **no API key at all** via MCP sampling. |
| [`vite-plugin-shipi18n`](packages/vite-plugin) | Vite plugin that translates locale files at build time, with caching. |
| [`shipi18n-github-action`](packages/github-action) | GitHub Action that keeps translations in sync on push/PR. |

## Why

Most i18n translation tools are SaaS: you pay per word, your strings go through someone else's
servers, and you need yet another API key. Shipi18n is the opposite — a thin, well-tested layer over
the LLM you already pay for.

- **Placeholder-safe.** `{{name}}`, `{count}`, `%s`, `%d`, `%1$s`, `$t(...)`, `%{name}` and HTML tags
  are preserved and validated after every translation.
- **Structure-preserving.** Nested JSON in, identical shape out; non-string values pass through.
- **Incremental.** Only new or changed keys are sent to the model.
- **Provider-agnostic.** Anthropic and OpenAI ship in the box; any object with a
  `complete(prompt)` method is a valid adapter.

## Zero-key usage via MCP

`@shipi18n/mcp` can run without any API key: with MCP *sampling*, the translation is performed by the
model already running in your MCP client.

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "shipi18n": { "command": "npx", "args": ["-y", "@shipi18n/mcp"] }
  }
}
```

## Library usage

```js
import { translateJSON } from '@shipi18n/core'

const { result, stats } = await translateJSON({
  content: { greeting: 'Hello {{name}}' },
  from: 'en',
  to: 'es',
  provider: 'anthropic',        // 'anthropic' | 'openai' | custom { complete } adapter
})
// result → { greeting: 'Hola {{name}}' }
```

## Development

This is a pnpm + turbo monorepo.

```bash
pnpm install
pnpm test          # all packages
pnpm --filter @shipi18n/core test
```

Changesets manage versioning: `pnpm changeset` to add one.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm install && pnpm test`
runs 105 tests against a mock adapter, so you need no API key to work on this.

## License

[Apache-2.0](LICENSE) © Shipi18n. See [NOTICE](NOTICE).

# Shipi18n

[![CI](https://github.com/Shipi18n/shipi18n/actions/workflows/ci.yml/badge.svg)](https://github.com/Shipi18n/shipi18n/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@shipi18n/core?label=%40shipi18n%2Fcore)](https://www.npmjs.com/package/@shipi18n/core)
[![MCP](https://img.shields.io/npm/v/@shipi18n/mcp?label=%40shipi18n%2Fmcp)](https://www.npmjs.com/package/@shipi18n/mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Catch broken translations before you ship them.** An open-source QA gate for your locale files —
and, when you want it, an i18n translation engine that runs on your own LLM key.

Your `es.json` says `Hola` where the English says `Hello {{name}}`. The placeholder is gone, the
build is green, and the bug ships. Shipi18n finds that, and it finds the harder kind too: the string
that has every placeholder and still says the wrong thing.

![shipi18n check finding a dropped placeholder, then an LLM catching a translation that says "will save" where the English says "delete"](docs/check-demo.gif)

*A real run, not a mockup — [`docs/check-demo.tape`](docs/check-demo.tape) reproduces it.*

```bash
npx @shipi18n/cli check ./locales -s en
```

No API key, no account, no config. Missing keys, dropped placeholders, collapsed plurals, empty
values and untranslated copy — as human output, JSON, SARIF (GitHub PR annotations) or JUnit.

Then, when you want the **meaning** checked, bring your own key. The judge needs a provider SDK
alongside the CLI:

```bash
npm i -D @shipi18n/cli @anthropic-ai/sdk       # or `openai`
export ANTHROPIC_API_KEY=sk-ant-...            # or OPENAI_API_KEY
npx shipi18n check ./locales -s en --semantic
```

An LLM reads each pair and reports mistranslations, omissions and additions:

```
⚠ es  coverage 100.0%  0 error(s), 1 warning(s)
    warning  delete  semantic-mistranslation — Translation says 'will save' (guardará)
                     instead of 'will delete' (eliminará/borrará)
```

Every placeholder is intact and every key is present, so structural checks pass this file. Only
reading it catches the bug. Advisory by default — it warns, it does not fail your build.

> **Measured, not asserted.** On a 228-pair corpus committed *before* the judge was written
> ([`60d699b`](https://github.com/Shipi18n/shipi18n/commit/60d699b)) and with thresholds fixed first:
> **54/54 planted errors caught (100%)** and **12/168 false positives on clean pairs (7.1%)**, with
> 6/6 glossary violations found. Reproduced on two independent runs (2026-08-16 and 2026-08-17) using
> `claude-haiku-4-5`, 3 passes, ~59k tokens in 156s. Label accuracy moved between runs (100% →
> 98.1%) — it is a model, so read these as a range, not a constant.
> The harness is [`evals/semantic/`](evals/semantic). Run it against your own model.

Nothing goes through our servers, because there are none. The only network call is from your machine
to the provider you chose.

## Packages

| Package | Description |
| --- | --- |
| [`@shipi18n/core`](packages/core) | The engine: translation checks, the semantic judge, placeholder validation — plus provider-agnostic, structure-preserving translation with incremental mode. |
| [`@shipi18n/cli`](packages/cli) | `shipi18n check ./locales` for CI, `--semantic` for meaning, `lock` to protect hand-edits, `translate` when you need it. |
| [`@shipi18n/mcp`](packages/mcp) | MCP server — check, diff and review locale files from Claude Desktop, Cursor, or any MCP client. Validation needs **no API key**. |
| [`vite-plugin-shipi18n`](packages/vite-plugin) | Vite plugin that translates locale files at build time, with caching. |
| [`shipi18n-github-action`](packages/github-action) | GitHub Action that keeps translations in sync on push/PR. |

## Why

Generating translations is a solved problem. Half a dozen good tools will fill your locale files, and
an agent will do it for free. **Nothing checks the result.** Your CI lints your JavaScript, typechecks
your types and runs your tests — and then ships a `de.json` that nobody has read, produced by a model
nobody audited.

The checks that do exist are structural: they diff key sets and stop there. That catches the missing
key. It does not catch the translation that has every key and every placeholder and still tells your
German users the opposite of what you meant.

Shipi18n is that missing gate, in two layers:

- **Deterministic, offline, no key.** Missing and orphaned keys, dropped or malformed placeholders
  (`{{name}}`, `{count}`, `%s`, `%d`, `%1$s`, `$t(...)`, `%{name}`, HTML), collapsed plural forms,
  empty values, untranslated copy, coverage per language.
- **Semantic, with your own key.** An LLM-as-judge pass over changed keys only, with multi-pass
  majority voting because single-pass judge scores are unstable. Reports mistranslation, omission and
  addition. Advisory by default — a QA tool that fails your build gets uninstalled.

Plus the parts that make it usable day to day:

- **Formats beyond JSON.** Flutter `.arb` and Apple `.xcstrings`, including `%@`/`%lld` specifiers.
- **CI-native.** Correct exit codes, `--fail-on`, `--min-coverage`, SARIF for PR annotations, JUnit.
- **Hand-edits are protected.** `shipi18n lock` records the translations a human blessed and warns
  when anything overwrites them, or when the source moves underneath them.
- **Keyless from your editor.** The MCP server's validators call no model at all.
- **It also translates.** Provider-agnostic, structure-preserving, incremental — Anthropic and OpenAI
  in the box, and any object with a `complete(prompt)` method is a valid adapter.

## Check from your editor — no API key

`@shipi18n/mcp` brings the checks to any MCP client. The validation tools call no model, so they need
no key at all:

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "shipi18n": { "command": "npx", "args": ["-y", "@shipi18n/mcp"] }
  }
}
```

> *"Check ./locales against English and tell me what's broken in Spanish."*

`review_locales` goes further without needing a key either: it hands your agent the translation pairs
and the review criteria, and your agent reasons about meaning with the model it already runs.

## Check in CI — no key needed

The checks work on translations from **any** source — a TMS, another tool, an agent, a human. Run it
on every push:

```bash
npx @shipi18n/cli check ./locales -s en
```

Missing keys, dropped placeholders, collapsed plurals, empty values and untranslated copy — reported
as human output, JSON, SARIF (GitHub PR annotations) or JUnit. Works on plain JSON trees, Flutter
`.arb` bundles and Apple `.xcstrings` catalogs. Deterministic and offline: no LLM, no API key.

### Protect hand-edited translations

Fix a string by hand, lock it, and `check` warns you if anything ever overwrites it — or if the
English moves underneath it:

```bash
npx @shipi18n/cli lock ./locales --keys 'legal.*'
```

`.shipi18n/locks.json` stores hashes only, is safe to commit, and these findings are **warnings** —
protecting human work must never block a pipeline. Details in the
[CLI README](packages/cli/README.md).

## It also translates

Checking works on translations from anywhere, but if you want Shipi18n to produce them too, it does —
with your key, your model, and nothing in between.

```bash
npm i -D @shipi18n/cli @anthropic-ai/sdk       # or `openai`
export ANTHROPIC_API_KEY=sk-ant-...            # or OPENAI_API_KEY
npx shipi18n translate locales/en.json -t es,fr,de
```

```
✔ es → locales/es.json (2 translated, 0 reused)
```

Or from Node (same SDK requirement):

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

Structure-preserving, placeholder-safe and incremental — only new or changed keys are sent to the
model. Then check the result with the same tool.

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

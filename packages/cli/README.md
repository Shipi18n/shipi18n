# @shipi18n/cli

Open-source, **bring-your-own-LLM** i18n translation CLI. Translate your locale files with your own
OpenAI or Anthropic key — no Shipi18n account, no hosted API.

```bash
npm i -g @shipi18n/cli @anthropic-ai/sdk   # or add `openai` for the OpenAI provider
```

## Quickstart

```bash
export ANTHROPIC_API_KEY=sk-ant-...
shipi18n translate en.json --target es,fr,de
```

Writes `es.json`, `fr.json`, `de.json` into the output directory (default `./locales`), preserving
structure and placeholders.

## Usage

```bash
shipi18n translate <input> --target <langs> [options]

Options:
  -t, --target <langs>     Comma-separated target language codes (default: es,fr)
  -s, --source <language>  Source language code (default: en)
  -o, --output <dir>       Output directory (default: ./locales)
  -p, --provider <name>    LLM provider: anthropic (default) or openai
      --api-key <key>      LLM API key (else ANTHROPIC_API_KEY / OPENAI_API_KEY env)
      --model <model>      Override the provider's default model
  -i, --incremental        Reuse existing output files; only translate new/missing keys
```

## Examples

```bash
# Anthropic (default), multiple languages
shipi18n translate locales/en.json -t es,fr,ja

# OpenAI provider
shipi18n translate en.json -p openai -t de --api-key $OPENAI_API_KEY

# Incremental — only translate keys not already in the target file
shipi18n translate en.json -t es --incremental
```

## Check — validate translations in CI (no LLM, no key)

`shipi18n check` is a deterministic QA gate for translated locale files. It works on output from
**any** translator — this CLI, another tool, an agent, or a human — and needs no API key, so it can
run on every push.

```bash
npx @shipi18n/cli check ./locales --source en
```

It detects both common layouts (`locales/en.json` and `locales/en/<ns>.json`), plus Flutter ARB
directories and Apple String Catalogs (`shipi18n check Localizable.xcstrings`).

**What it catches:** missing and orphaned keys · dropped or invented placeholders (`{{name}}`,
`{count}`, `%s`, `%1$s`, `%@`, `%lld`, `$t(...)`, `%{name}`, HTML tags) · collapsed vue-i18n pipe
plurals · empty values · untranslated copy · stale `.xcstrings` states.

| Flag | Default | Meaning |
| --- | --- | --- |
| `-s, --source <lang>` | `en` | Source language |
| `-r, --reporter <name>` | `human` | `human` \| `json` \| `sarif` \| `junit` |
| `-o, --output <file>` | stdout | Write the report to a file |
| `--ignore-keys <globs>` | — | Silence keys: `'*.copyright,home:mcp.badge'` |
| `--fail-on <level>` | `error` | `error` \| `warning` \| `none` |
| `--min-coverage <pct>` | — | Fail any language below this coverage |

Exit codes: `0` pass, `1` findings at the fail level, `2` usage error. Errors may fail CI; warnings
never do by default — a warning that blocks PRs gets the tool uninstalled.

### GitHub Actions with PR annotations

```yaml
- name: Check translations
  run: npx @shipi18n/cli check ./locales -s en --reporter sarif --output i18n.sarif

- name: Upload findings
  if: always()
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: i18n.sarif
```

## Bring your own LLM

Set `ANTHROPIC_API_KEY` (default provider) or use `-p openai` with `OPENAI_API_KEY`. Your keys, your
models — nothing is sent to a Shipi18n server. Built on [`@shipi18n/core`](https://www.npmjs.com/package/@shipi18n/core).

## License

Apache-2.0

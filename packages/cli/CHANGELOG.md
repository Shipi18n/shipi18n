# @shipi18n/cli

## 2.1.0

- New command: `shipi18n check [path]` — validate translated locale files against the source
  language in CI. No LLM, no API key, no network.
  - Auto-detects flat (`locales/en.json`) and nested (`locales/en/<ns>.json`) JSON trees, Flutter
    ARB directories and Apple `.xcstrings` catalogs.
  - Reporters: `human`, `json`, `sarif` (GitHub code-scanning / PR annotations) and `junit`.
  - `--fail-on error|warning|none`, `--min-coverage <pct>`, `--ignore-keys <globs>`,
    `--output <file>`. Exit codes: 0 pass, 1 findings, 2 usage error.
  - Errors can fail CI; warnings never do by default.

## 2.0.0

**Breaking — bring-your-own-LLM.** Rebuilt on `@shipi18n/core`; no Shipi18n account or hosted API.

- `shipi18n translate <input> -t es,fr -p anthropic|openai [--incremental] [--api-key] [--model]`.
- LLM key read from `--api-key` or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.
- Removed the hosted-API `keys` and `config` commands.

# @shipi18n/cli

## 2.3.0

- New: `shipi18n lock [path]` — record hand-edited translations in a readable, commit-friendly
  `.shipi18n/locks.json`. `--keys` globs, `--lang`, `--relock`.
- New: `check` reports `manual-translation-clobbered` and `manual-translation-stale` (warnings only —
  locks protect human work and must never fail a pipeline). `--no-locks` disables.
- Fix: `--no-locks` did nothing. Commander pairs it with `--locks <file>`, so the negation arrives as
  `locks: false`; the code only checked `noLocks`.

## 2.2.0

- New: `shipi18n check --semantic` — BYO-key LLM-judge pass on top of the structural check.
  - Advisory by default: semantic findings are warnings and never fail CI unless you opt in with
    `--semantic-fail`.
  - Structural-first: keys that already have structural errors are not sent to the judge.
  - Incremental: verdicts are cached (`--semantic-cache`, default `.shipi18n/semantic-cache.json`);
    unchanged strings cost zero model calls on re-runs.
  - `--glossary <file>` enforces do-not-translate and locked terms deterministically (no LLM) and
    feeds the glossary to the judge as context.
  - New flags: `-p/--provider`, `--api-key`, `--semantic-model`, `--semantic-passes`.
  - Semantic findings flow through all reporters; SARIF remains schema-valid.

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

# @shipi18n/cli

## 2.16.0

- Bundles `@shipi18n/core@2.16.0`: new `duplicate-key` rule, a key written twice in one JSON object (error when the
  values differ, warning when identical). `--severity 'duplicate-key=warning'` keeps it from failing a build.

## 2.15.1

- Bundles `@shipi18n/core@2.15.1`: a `one` form is checked against the source's `other` in languages whose `one`
  also covers 21, 31… (uk, ru, …), and spelling the count in a plural form is no longer an unexpected variable.

## 2.15.0

- Bundles `@shipi18n/core@2.15.0`: key-based plurals (i18next `_one`/`_few`, Rails, Android, .xcstrings) are
  checked against each language's CLDR categories instead of key by key. See the core changelog.

## 2.14.2

- No changes; released alongside `@shipi18n/mcp@2.3.1` (format list in tool descriptions).

## 2.14.1

- Picks up `@shipi18n/core@2.14.1`: XLIFF `<x/>` / `<ph/>` inline placeholders (Angular interpolations) are checked.

## 2.14.0

- **`shipi18n init --agents`** writes a four-line instruction for AI coding agents into `AGENTS.md` (and into
  `CLAUDE.md`, `.github/copilot-instructions.md` and a Cursor rule when the repo already has them, or with
  `--all`): the detected locale folder, `check … --changed-only --json`, what each exit code means, and to keep
  placeholders as they are. Idempotent (marker-delimited), `--dry-run` to preview. Also in the single-file build.

## 2.13.1

- **Single-file build:** every GitHub release now carries `shipi18n.mjs`, the whole CLI in one file: no `npm
  install`, no `node_modules`, nothing from the npm registry at install time. Published with a SHA-256 checksum
  and a GitHub build-provenance attestation, and verified against the agent-contract suite before upload.
  Covers `check`, `lock` and `wp-sync`; `--semantic`/`translate` still need the npm package.

## 2.13.0

- Picks up `@shipi18n/core@2.13.0`: a plural collapsed to a single form that keeps its variables is now a
  warning; merged or miscounted forms stay errors.

## 2.12.2

- Picks up `@shipi18n/core@2.12.2`: fewer false positives on apps with custom plural rules, translator-note
  keys and ICU `=1` selectors.

## 2.12.1

- npm page: check documentation first, translation last; keywords describe the check (placeholder,
  interpolation, plural, gettext, xliff, xcstrings, arb, android-strings…); `engines` (Node >= 18). No behavior change.

## 2.12.0

- **Built for AI coding agents:** after writing locale files an agent runs
  `check ./locales --changed-only --json`, reads each finding's `fix`, and re-runs until exit `0`.
- **`--changed-only [ref]`**: report only locale files changed vs a git ref (default `HEAD`), including
  uncommitted and untracked files. If the source file changed, every locale is checked.
- **`fix:` hints** in human output, a `fix` field in JSON, and `Fix:` in SARIF messages.
- **Usage errors exit `2`, never `1`.** Commander's default for a bad flag was `1`, which a script reads as
  "findings". Help and `--version` still exit `0`.

## 2.11.7

- No checker changes. Release plumbing only: the Docker image workflow now waits for npm the way the publish
  workflow does (the v2.11.4 and v2.11.5 images were never built), and the pre-commit hook, `Dockerfile.cli`
  and README now pin this version; a test fails the build when they drift from `package.json`.

## 2.11.6

- Picks up `@shipi18n/core@2.11.6`: `plural-forms` accepts a single form in languages with one plural category,
  unless both forms were merged into it.

## 2.11.5

- Picks up `@shipi18n/core@2.11.5`: `check` now reads underscore-named locale files (`pt_br.yml`, `zh_Hans.yml`,
  `en_US.json`) instead of silently skipping them.

## 2.11.4

- Picks up `@shipi18n/core@2.11.4`: empty numbered sentence fragments with translated siblings drop from error to
  info, and the pipe-plural rule no longer fires on Rails, gettext, Android or Apple formats.

## 2.11.3

- Pulls core 2.11.3: format-aware placeholder grammars, Rails YAML root-key unwrap, eleven false-positive
  classes fixed, warning tier for plural simplifications.
- New `--format <name>` flag to override the auto-detected placeholder grammar (`icu | i18next | vue | brace |
  rails | gettext | android | apple | generic`).

## 2.9.0

- New: `check` now supports **Android `strings.xml`, gettext `.po`/`.pot`, and XLIFF 1.2/2.0** on top
  of JSON, YAML, Flutter `.arb` and Apple `.xcstrings` — auto-detected from the input path (via core
  2.9.0). The structural pass still needs no API key.

## 2.8.1

- Security (hardening): pulls core 2.8.1 (translator prompt-injection guardrail + recursion depth
  bound). The `--semantic-cache` help now notes the verdict cache is a per-machine cost cache that
  should be gitignored — a committed cache is untrusted and could suppress real findings.

## 2.8.0

- New: ICU MessageFormat checks via core 2.8.0 — `plural-category` (missing CLDR plural categories,
  warning) and `icu-invalid` (malformed ICU, error). ICU select sub-messages are no longer
  mis-flagged as placeholders.

## 2.7.0

- New: `shipi18n check` now validates **YAML locale files** (`.yaml`/`.yml`), flat or nested,
  the same as JSON (via core 2.7.0).

## 2.6.0

- Refactor: reporters and `verdict` now live in `@shipi18n/core` (2.6.0) and are re-exported here
  unchanged. No behavior change; import sites keep working.

## 2.5.1

- New: every check finding now links to its rule page. The human reporter prints
  `<rule> → https://shipi18n.com/docs/rules/<rule>` for each finding type seen, and the SARIF
  reporter sets a per-rule `helpUri` — so GitHub's inline PR annotations link to the page that
  explains the rule, what triggers it, how to fix it, and how to silence it.

## 2.5.0

- New: `--base-url <url>` on `translate` and `check` — run against any OpenAI-compatible endpoint
  with `-p openai`: Ollama (`http://localhost:11434/v1`, no API key at all), Gemini's compatibility
  endpoint, Groq, LM Studio, vLLM. Makes the API key optional; the judge's published accuracy was
  measured on `claude-haiku-4-5`, so run `evals/semantic/run.mjs` before trusting a different judge.
- Guard: `--base-url` without `-p openai` is an explicit error rather than a silent provider switch.

## 2.4.0

- Fix: `check --semantic` explains a `judged 0`. When every translated key has a structural error
  there is nothing for the judge to look at — correct, but it looked broken. The CLI now says how
  many keys it skipped and to fix those first.
- Fix (via core 2.4.0): the missing-SDK error names the install that works for the `npx` path.
- Note: the npm description on this page was stale until this release — npm only refreshes it on
  publish, so the registry still led with translation after the project repositioned around QA.

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

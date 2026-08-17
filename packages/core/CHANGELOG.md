# @shipi18n/core

## 2.3.0

- New: manual-translation locks (`lockId`, `lockEntry`, `lockFinding`, `normalizeLocks`) — record
  which translations a human has blessed so `check` can report `manual-translation-clobbered` when
  one is overwritten and `manual-translation-stale` when its source moves underneath. Both are
  warnings by design.
- New: `runCheck` / `runSemantic` / `discoverLayout` now live in core (`src/tree.js`). They were in
  the CLI; sharing them means the CLI and the MCP validator tools cannot drift apart.
- Fix: locale files must be named like locales (BCP-47 shape). A `glossary.json` sitting beside your
  locale files was being treated as a language, producing a 0%-coverage "glossary" locale — and the
  docs tell you to put it exactly there.

## 2.2.0

- New: `reviewTranslations(...)` — LLM-as-judge semantic QA. Flags translations that are
  structurally fine but semantically wrong (mistranslation / omission / addition). Majority vote
  across N passes (default 3) controls judge noise; unparseable passes are discarded, never counted
  as flags; locale content is embedded as inert JSON data, never as instructions. Includes an
  incremental cache interface: unchanged pairs cost zero model calls.
- New: deterministic glossary enforcement in `checkTranslations` — `glossary` option with
  do-not-translate terms and locked per-language translations; violations are `glossary-violation`
  errors and need no model call.

## 2.1.0

- New: `checkTranslations({ source, target })` — deterministic structural QA for translated locale
  objects. Reports missing/orphaned keys, dropped or invented placeholders, collapsed vue-i18n pipe
  plurals, empty values, untranslated copy and type mismatches, with per-language stats and coverage.
- New: format adapters `parseArbBundle` (Flutter ARB) and `parseXcstrings` (Apple String Catalogs,
  including plural variations and translation states).
- Placeholder engine now recognises Apple/C format specifiers: `%@`, `%lld`, `%llu`, `%ld`, `%lu`,
  positional `%1$@` / `%2$lld`, and precision floats (`%.2f`).

## 2.0.0

Initial open-source release of the **bring-your-own-LLM** translation engine.

- Provider-agnostic adapters: `anthropic` (default, `claude-opus-4-8`), `openai`, or a custom
  `{ complete }` adapter. Optional peer deps loaded lazily.
- `translateJSON({ content, from, to, provider, apiKey?, model?, existing? })` — structure-preserving
  flatten/unflatten, batching, placeholder preserve + validate, and incremental (only-changed) mode.
- No hosted API and no Shipi18n account — your key calls your LLM directly.

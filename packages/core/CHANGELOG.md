# @shipi18n/core

## 2.11.4

- Two false-positive classes found by running the checker over real repositories while preparing upstream fixes.
- **Empty numbered sentence fragments.** A key like `…step_2.part_1` is reported as `info` rather than `error`
  when it is empty but its sibling fragments are translated — Japanese and Korean legitimately leave one slot
  empty and move the verb into `part_3` (found on Hoppscotch). An empty fragment whose siblings are all empty is
  still a real gap and still an error.
- **Pipe plurals are vue-i18n only.** The `plural-forms` rule no longer runs on Rails YAML, gettext, Android or
  Apple formats, none of which use `|` as a separator. ifme's `'if-me.org | Your meeting "%{meeting_name}" …'`
  was read as a collapsed plural against translations that had simply dropped the brand prefix.

## 2.11.3

- Placeholder checking is now **format-aware**: one grammar per format (ICU/ARB, i18next, vue-i18n, Rails YAML,
  gettext, Android, Apple) instead of one regex bag, with the interpolation style of JSON trees sniffed from the
  source strings. Brace formats are read through the ICU parser, so arguments nested in plural/select options count.
- Fixes eleven false-positive classes found scanning real repos: repeated placeholders in pipe-plurals, `%@ %@` vs
  `%1$@ %2$@`, `{{ x }}` whitespace, `%{x}` inside ARB strings, vue-i18n `{'{'}` literals, null values/roots,
  strftime keys, nested ICU args, and more. Every case is a fixture in `evals/placeholders/corpus.jsonl`.
- **Rails YAML**: the root locale key (`en:` / `pt-BR:`) is unwrapped, so Rails trees compare key-for-key.
- Warning tier (not error) for plural forms collapsed to one, English suffix variables (`{plural}`), and singular
  forms that omit the count; a literal `{}` stays an error.

## 2.9.0

- New: **three more locale formats.** The engine now reads **Android `strings.xml`** trees
  (`res/values-*/`, with `<plurals>` and `<string-array>`), **gettext `.po`/`.pot`** (single file or
  `LC_MESSAGES/` layout; msgctxt keys, plural forms, `fuzzy` → stale), and **XLIFF 1.2 + 2.0**
  (`.xlf`/`.xliff`, nested `<group>`, `<ph>` placeholders, target/segment `state` → stale). New
  exports `parseAndroidStrings`, `parsePo`, `parseXliff`; adds one dependency (`fast-xml-parser`) for
  the XML formats. PO is dependency-free.
- Security (the XML formats ingest untrusted files): external entities (XXE) are refused,
  entity-expansion limits are pinned explicitly, files are size-capped before parsing, and
  accumulators are null-prototype. A malformed/malicious file becomes an `invalid-file` finding for
  that locale — never a crash — and the other locales still check.

## 2.8.1

- Security (hardening): the batch-translate prompt now states that the strings are inert data and
  instructs the model to ignore any instructions inside them — matching the semantic judge's
  existing guardrail against prompt injection from translated content.
- Security (hardening): `flatten()` and `countLeaves()` now bound recursion depth, so a
  maliciously (or accidentally) deep-nested locale throws a clean "locale nesting too deep" error
  instead of overflowing the stack.

## 2.8.0

- New: **ICU MessageFormat validation** (P6). When a source string is an ICU plural/select message,
  it's now checked ICU-aware:
  - `plural-category` (warning): the translation's ICU plural is missing a plural category the
    target language needs for everyday counts under CLDR — e.g. a Russian plural with only
    one/other, missing few/many. Categories come from the runtime's `Intl.PluralRules` (no data
    dep); Spanish/French "many" (compact-notation only) is deliberately not flagged.
  - `icu-invalid` (error): the source is valid ICU but the translation no longer parses.
  - Fixes a real false positive: ICU select sub-messages (`{he}`/`{she}`) are no longer mistaken
    for placeholders. Adds `@formatjs/icu-messageformat-parser`.

## 2.7.0

- New: **YAML locale files** (`.yaml` / `.yml`) are checked alongside JSON — flat and nested trees,
  every existing check (placeholders, plurals, missing/orphan keys, glossary). The check logic was
  already format-agnostic; this adds parsing + file discovery. Adds one dependency (`yaml`).

## 2.6.1

- Fix: the OpenAI adapter sent `max_tokens`, which current OpenAI models (gpt-5.x) reject with a
  400 — `check --semantic -p openai` and `translate -p openai` failed against api.openai.com. The
  adapter now sends `max_completion_tokens` to api.openai.com and keeps `max_tokens` for
  OpenAI-compatible endpoints (Ollama, Gemini compat, LM Studio, vLLM), with a one-shot fallback
  on the telltale 400 in either direction. Found by running the UIStringBench leaderboard against
  live GPT judges.

## 2.6.0

- New: reporters (`humanReport`, `jsonReport`, `sarifReport`, `junitReport`, `REPORTERS`,
  `RULE_META`) and `verdict` lifted from the CLI into core, so any surface — the GitHub Action
  first — can run a full `check` with exit-code semantics and SARIF output without depending on
  the CLI. The CLI re-exports every name; nothing breaks.

## 2.5.0

- New: the `openai` adapter accepts `baseURL`, pointing it at any OpenAI-compatible endpoint —
  Ollama (no key needed, fully offline), Gemini's compatibility endpoint, Groq, Mistral, LM Studio,
  vLLM, corporate gateways. `translateJSON`, `reviewTranslations` and `runSemantic` all take and
  thread it through. When a `baseURL` is set and no key is given, a placeholder key is sent instead
  of failing, since servers like Ollama accept anything.

## 2.4.0

- Fix: `runSemantic` now returns `excluded` — the number of pairs it skipped because the key already
  carried a structural error. Without it a fully-broken tree reported `judged 0` and was
  indistinguishable from a clean one, which reads as a dead feature rather than correct behaviour.
- Fix: the missing-SDK error names a fix that actually works. `npm i @anthropic-ai/sdk` does nothing
  for the `npx @shipi18n/cli` path — that copy of the CLI resolves imports against npm's cache, not
  your project — so the message now says to install the SDK next to the CLI and run `npx shipi18n`.
- Note: the npm description on this page was stale until this release. npm only refreshes it on
  publish, so the registry still described a translation engine after the project had repositioned
  around translation QA.

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

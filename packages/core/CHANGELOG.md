# @shipi18n/core

## 2.14.2

- No changes; released alongside `@shipi18n/mcp@2.3.1` (format list in tool descriptions).

## 2.14.1

- **XLIFF: empty inline placeholders are checked.** Angular writes every interpolation as
  `<x id="INTERPOLATION"/>` and XLIFF 2.0 uses `<ph id="0" equiv="…"/>`; having no text, they were invisible, so a
  target could drop `{{ name }}` and pass. They are now tracked as `{x_INTERPOLATION}` / `{ph_0}`, and the fix hint
  names the markup (`restore <x id="INTERPOLATION"/>`). Found while verifying the docs' format table.

## 2.14.0

- No changes; released alongside `@shipi18n/cli@2.14.0` (`init --agents`).

## 2.13.1

- No changes; released alongside `@shipi18n/cli@2.13.1` (single-file build).

## 2.13.0

- **A plural collapsed to one form is a warning, not an error,** when that one form keeps the source's variables
  ("{count} dependencias más" for every count): grammatically off for some counts, nothing breaks. It is still
  an **error** when the single form holds both sentences — the separator lost, as in nocodb's 182 strings with
  `<unk>` / `●` / `＋` — and when the number of forms is wrong in any other way. The message says which:
  "uses one form for every count" vs "has N". To keep failing CI on simplifications:
  `--severity 'plural-forms=error'`.

## 2.12.2

Three false-positive classes found by refill scan #2 (npmx.dev, unifideck, nametag):

- **FP#16 — more pipe forms than the source.** Apps can define their own vue-i18n `pluralRules` (npmx.dev:
  Arabic 6 forms, Polish 5, Czech 3). `plural-forms` now accepts a translation with more forms than the source
  while the count fits the language's CLDR categories, plus one zero form for count-based plurals
  (`{count}`/`{n}`). A garbled string with a moved separator in a 2-category language is still an error.
- **FP#17 — translator notes.** Keys like `_comment`, `_note`, `_description`, `_context` are skipped.
- **FP#18 — `=1` covers `one`.** An ICU plural with `=1 {…}` no longer warns about a missing `one` category in
  languages where `one` only ever means 1 (German, Spanish…). Russian `=1` still warns: 21, 31… are `one` too.

## 2.12.1

- The missing-SDK error now says `npx @shipi18n/cli <command>` (it runs the local copy once installed), so
  no instruction points at the unscoped `shipi18n` name, which is now an empty placeholder. Adds `engines` (Node >= 18).

## 2.12.0

- **Fix hints.** Every finding in the human, JSON and SARIF reports carries a one-line `fix` (`withFixHints`,
  `fixHints`). A dropped placeholder and an invented one at the same key are paired into a rename —
  `rename {cuenta} to {count}` — without parsing any placeholder grammar.
- **`filterChanged(result, files)`** keeps only the target files that changed and recomputes stats; a changed
  source-side locale file keeps everything, since a source edit can break any translation.

## 2.11.7

- No changes; released alongside `@shipi18n/cli@2.11.7` (release plumbing).

## 2.11.6

- **One plural form is correct for one-category languages.** Chinese, Japanese, Korean, Thai, Vietnamese,
  Indonesian and other languages whose CLDR rules have only `other` translate a `singular | plural` message as a
  single form, and `plural-forms` no longer reports that (Hoppscotch `cn`, Chatwoot `zh_CN`/`zh_TW`). It still
  reports a single form that is really both sentences with the separator lost, detected as more placeholders
  than any one source form carries (nocodb `ja`, and `zh-Hant` written with a full-width `｜`). `cn` and `tw`
  file names are read as Chinese.

## 2.11.5

- **Underscore-named locale files are read.** Flat trees with Rails/POSIX names — `pt_br.yml`, `zh_Hans.yml`,
  `en_US.json` — had those locales silently dropped from the language list: no findings, no warning. On
  24pullrequests that hid 3 of 20 locales and 4 real interpolation drops. Underscore subtags must look like a
  region, numeric region or script, so `app_config.json` and `de_formal.json` are still not languages.
- ICU plural-category checks now normalize `_` to `-` before `Intl.PluralRules`, which had been rejecting tags
  like `ru_RU` and silently skipping the check.

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

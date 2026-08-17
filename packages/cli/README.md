# @shipi18n/cli

**Catch broken translations before you ship them** — and translate with your own LLM key when you
want to. Open-source, no account, no hosted API.

## Quickstart — check, no API key

```bash
npx @shipi18n/cli check ./locales -s en
```

Reports missing and orphaned keys, dropped placeholders, collapsed plurals, empty values,
untranslated copy and per-language coverage. Deterministic and offline — no LLM, no key, nothing
leaves your machine. Exit code `1` when there are errors, so it works as a CI gate as-is.

Then, for the errors structure cannot see, bring a key. The judge needs a provider SDK next to the
CLI, so install both:

```bash
npm i -D @shipi18n/cli @anthropic-ai/sdk   # or `openai`
export ANTHROPIC_API_KEY=sk-ant-...
npx shipi18n check ./locales -s en --semantic
```

An LLM reads each source/translation pair and reports mistranslations, omissions and additions —
advisory by default, so it never fails your build unless you ask it to.

> **Note.** `--semantic` only judges keys that pass the structural checks, so if a tree is full of
> missing keys and dropped placeholders you will see `judged 0` and no model calls. That is by
> design — fix the structural errors first, then re-run for meaning.

**Measured** on a 228-pair corpus committed before the judge was written: **100% of planted errors
caught, 7.1% false positives.** Full harness in the repo under `evals/semantic/` — run it against
your own model.

## Translating

```bash
npm i -g @shipi18n/cli @anthropic-ai/sdk   # or add `openai` for the OpenAI provider
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

## Semantic QA — `--semantic` (the judge)

The structural check cannot see a translation that is *fluent but wrong*. `--semantic` adds an
LLM-as-judge pass with your own key:

```bash
npx @shipi18n/cli check ./locales -s en --semantic          # advisory: warnings only
npx @shipi18n/cli check ./locales -s en --semantic --glossary glossary.json
```

**Honest limitations, up front:** the judge is probabilistic. Every key is judged across 3 passes
and flagged only on a majority vote, unparseable passes are discarded, and semantic findings are
**warnings by default** — they never fail CI unless you opt in with `--semantic-fail`. It augments
review; it does not replace it. You pay your provider for the tokens; the verdict cache
(`.shipi18n/semantic-cache.json`, safe to commit) makes unchanged re-runs free, and keys that
already failed the structural check are never sent to the judge.

What it flags: `semantic-mistranslation` (says something different), `semantic-omission` (meaning
dropped), `semantic-addition` (meaning invented).

**Measured** (committed 228-pair corpus, thresholds fixed before the judge was built, default judge
`claude-haiku-4-5`, 3 passes). Two independent runs, 2026-08-16 and 2026-08-17:

| | 2026-08-16 | 2026-08-17 |
| --- | --- | --- |
| planted errors caught | 54/54 (100%) | 54/54 (100%) |
| per-category recall | 100% | 100% |
| label accuracy | 100% | 53/54 (98.1%) |
| false positives on clean pairs | 12/168 (7.1%) | 12/168 (7.1%) |
| glossary violations | 6/6, 0 false | 6/6, 0 false |
| cost | ~62k tokens / 141s | ~59k tokens / 156s, 48 calls |

The judge is a model, so treat these as a range, not a constant — label accuracy moved between runs
while catch and false-positive rates held. On a real 478-pair production tree it flagged 3.6% of keys;
the warm-cache rerun made **zero** model calls. Full harness: `evals/semantic/` in the repo — run it
against your own model and publish what you get.

### Glossary (deterministic — no LLM)

```json
{
  "Shipi18n": { "dnt": true },
  "dashboard": { "es": "panel", "de": "Dashboard", "ja": "ダッシュボード" }
}
```

`"dnt"` terms must survive verbatim; language entries are required translations. Violations are
`glossary-violation` **errors**, caught by string matching at zero cost, and the glossary is also
given to the judge as context.

## Protect hand-edited translations — `shipi18n lock`

The oldest complaint about machine translation: you fix a string by hand, the tool runs again, and
your fix is gone. Lock the translations a human has blessed, and `check` tells you when that happens.

```bash
# bless everything currently in the tree
npx @shipi18n/cli lock ./locales

# or just the strings you actually hand-edited
npx @shipi18n/cli lock ./locales --keys 'legal.*,checkout.cta'
npx @shipi18n/cli lock ./locales --lang de,ja      # narrow to some languages
```

This writes `.shipi18n/locks.json` — **commit it**, it is the record of which translations a person
reviewed. It stores only hashes, never your strings.

Afterwards `check` reports two new findings:

| Finding | Meaning |
| --- | --- |
| `manual-translation-clobbered` | the locked translation's text changed — someone re-translated over a human edit |
| `manual-translation-stale` | the **source** changed underneath a locked translation, so the human edit may no longer be right |

Both are **warnings, never errors**: this feature exists to protect people's work, not to block their
pipeline. A lock that failed CI would just get deleted. Use `--fail-on warning` if you disagree, or
`--no-locks` to ignore the lock file entirely.

```bash
# accept the current state as the new blessed baseline
npx @shipi18n/cli lock ./locales --relock
```

A missing or corrupt lock file is a cold start, not a crash.

## Bring your own LLM

Set `ANTHROPIC_API_KEY` (default provider) or use `-p openai` with `OPENAI_API_KEY`. Your keys, your
models — nothing is sent to a Shipi18n server. Built on [`@shipi18n/core`](https://www.npmjs.com/package/@shipi18n/core).

## License

Apache-2.0

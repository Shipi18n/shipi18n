# Shipi18n GitHub Action

Automatically translate your i18n locale files in CI — **bring your own LLM**. Uses your own OpenAI or
Anthropic key via [`@shipi18n/core`](https://www.npmjs.com/package/@shipi18n/core). Open-source, no
Shipi18n account, no hosted API.

On each change to your source locale, the action translates new/changed keys into every target
language, verifies placeholders and key consistency, and commits the result (or opens a PR).

## Quickstart

```yaml
# .github/workflows/translate.yml
name: Auto Translate
on:
  push:
    branches: [main]
    paths: ['locales/en.json']

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2   # needed for incremental mode (diff vs previous commit)
      - uses: Shipi18n/shipi18n-github-action@v2
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        with:
          provider: anthropic
          source-file: locales/en.json
          target-languages: es,fr,de,ja
```

Store your LLM key as a repository secret (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) and reference it via
`env:`. The key is used to call **your** LLM directly — nothing is sent to a Shipi18n server.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `provider` | `anthropic` | LLM provider: `anthropic` or `openai` |
| `api-key` | env var | LLM key; falls back to `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| `model` | provider default | Override the model |
| `source-file` | — | Source locale file (use this **or** `source-dir`) |
| `source-dir` | — | Source locale directory — translates every `.json` file |
| `target-languages` | — | **Required.** Comma-separated codes, e.g. `es,fr,de` |
| `output-dir` | source dir | Where translated files are written |
| `source-language` | `en` | Source language code |
| `create-pr` | `false` | Open a PR instead of committing directly |
| `incremental` | `true` | Only translate changed keys (diff vs previous commit) |
| `commit-message` | `chore: update translations [skip ci]` | Commit message |
| `branch-name` | `shipi18n-translations` | Branch prefix for PRs |
| `github-token` | `GITHUB_TOKEN` | Token for creating PRs |
| `skip-keys` | — | Exact dot-paths to leave untranslated (e.g. `brandName,company.name`) |
| `skip-paths` | — | Glob patterns to skip (e.g. `states.*,config.*.secret`) |

## Outputs

`files-changed`, `files-list`, `languages`, `verification-errors`, `verification-warnings`,
`skipped-keys-count`.

## Modes

- **Incremental** (default): diffs the source against the previous commit and only translates
  added/modified keys, merging into existing target files and removing deleted keys. Requires
  `fetch-depth: 2` on checkout.
- **Skip keys/paths**: brand names, codes, or internal values matched by `skip-keys` (exact) or
  `skip-paths` (glob) keep their source value and are never sent to the LLM.
- **Verification**: every run checks placeholder preservation, key consistency, and length sanity, and
  surfaces issues in the PR body and action outputs.

More examples in [`examples/`](./examples).

> **v2 note:** JSON locale files are supported. The v1 hosted-API features (LLM-based semantic
> verification, self-correction, dashboard sync, YAML input) are not part of the open-source BYO-LLM
> action.

## License

Apache-2.0

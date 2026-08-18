# Security Policy

Shipi18n runs inside other people's CI pipelines, reads their source files, and is handed their LLM
provider keys. We take reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/Shipi18n/shipi18n/security/advisories/new). It is
private between you and the maintainers, and lets us fix the issue before it is public.

Please include:

- which package and version (`@shipi18n/core`, `@shipi18n/cli`, `@shipi18n/mcp`,
  `vite-plugin-shipi18n`, `shipi18n-github-action`),
- what an attacker gains,
- and the smallest reproduction you can manage — ideally a locale tree plus the command you ran.

We aim to acknowledge within 3 working days. This is a small open-source project, not a company with
a rota, so please allow reasonable time before disclosing publicly. We will credit you in the
advisory unless you would rather we did not.

## Supported versions

| Version | Supported |
| --- | --- |
| 2.x | ✅ |
| 1.x | ❌ — the hosted API it depended on is shut down; `@shipi18n/api` is deprecated |

## What we consider a vulnerability

Because of what this tool touches, these are the categories that matter most:

- **Key exposure.** A provider API key written to a log, a report, an error message, a cache file or
  a network destination other than the provider you configured.
- **Content exfiltration.** Source strings or translations reaching anywhere other than your chosen
  LLM provider. There is no Shipi18n server, so any such destination is a bug by definition.
- **Prompt injection with consequences.** Locale content is untrusted input. The judge is instructed
  to treat strings as inert data and never follow instructions inside them. A payload that escapes
  that and changes tool behaviour, suppresses findings, or influences what gets written to disk is a
  vulnerability — please report it with the exact string.
- **Arbitrary file write or read** outside the output directory you specified, including via crafted
  keys, paths or archive contents.
- **Arbitrary code execution** from parsing a locale file, a glossary, a lock file or a config.
- **Supply chain.** Anything about our published tarballs, provenance attestations or release
  workflow that would let someone ship code as us.

## What is not a vulnerability

- **The judge missing an error, or flagging a good translation.** The semantic pass is advisory and
  measured at roughly a 7% false-positive rate; accuracy is a quality issue, not a security one.
  Open a normal issue — we want those.
- **Your own API key being readable in your own environment** (env vars, your `.env`, your CI logs
  where you echoed it). Shipi18n does not print keys; if you find that it does, that *is* a report.
- **Cost.** A large tree costs a lot of tokens. Use `--incremental` and the cache.

## How Shipi18n handles your data

- There is **no Shipi18n server**. There is no account, no telemetry, and no database.
- The only outbound network call is from your machine or your runner to the LLM provider **you**
  configured, using **your** key.
- The structural checks (`check` without `--semantic`) and all four MCP validator tools make **no
  model calls at all** and need no key.
- The semantic cache and lock file live in `.shipi18n/` in your repo and contain hashes and findings,
  not credentials.

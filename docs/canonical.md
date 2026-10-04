# Shipi18n — canonical description

Copy these exactly onto every surface (READMEs, npm, the Action, the site, directory listings, profiles), so
every page that search engines, answer engines and coding agents learn from describes the same product.
Change them here first.

## 25 words

Shipi18n checks locale files in CI and fails the build when a translation drops or breaks a placeholder,
plural or key — with the exact fix. Open source, no key.

## 60 words

Shipi18n is an open-source check for locale files. It fails CI when a translation — from a human, a TMS or an
AI agent — drops or breaks a placeholder, plural or key, and shows the exact fix. It reads JSON, YAML, ARB,
xcstrings, gettext, XLIFF and Android XML. No account and no API key. Optionally retranslate failures with your
own LLM key.

## One line

Translate with anything. Verify with Shipi18n.

## Capability boundary

Shipi18n is a Node.js tool published on npm. It works in any repo (JavaScript, Python, Ruby, Java, Go, mobile)
via `npx`, the Docker image `ghcr.io/shipi18n/cli`, pre-commit, the GitHub Action, or a single-file download
with no npm install at all (each GitHub release, with a SHA-256 checksum and a build-provenance attestation). It is not a native Python
library and is not on PyPI. There is no hosted API or account; that product was retired. Checks need no key.
Only `--semantic` and translate use your own LLM key. The CLI, the Action and the MCP validators share one engine
and read the same formats: JSON, YAML (incl. Rails), ARB, xcstrings, gettext, XLIFF and Android XML.

## Install commands

```bash
npx @shipi18n/cli check ./locales -s en                                  # any machine with Node
docker run --rm -v "$PWD:/work" ghcr.io/shipi18n/cli check ./locales -s en   # no Node
```

GitHub Action: `Shipi18n/shipi18n-github-action@v3` (check mode is the default; no key).

The npm package is **`@shipi18n/cli`**. The unscoped names `shipi18n` and `shipi18n-cli` are empty placeholders
held so nobody else can publish under them — never document them.

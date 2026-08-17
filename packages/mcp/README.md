# @shipi18n/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for **i18n quality assurance** —
check, diff and review your locale files straight from any MCP client (Claude Desktop, Cursor, …).

**The validation tools need no API key** and make no model call. Translation is also available, with
your own provider key.

## Install

Add it to your MCP client config. For **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "shipi18n": {
      "command": "npx",
      "args": ["-y", "@shipi18n/mcp"]
    }
  }
}
```

That is the whole setup for validation — no `env` block, no key. Then ask:

> *"Check `./locales` against English and tell me what's broken in Spanish."*

To **translate** as well, add your provider key:

```json
"env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
```

You will also need the matching SDK available (`@anthropic-ai/sdk` or `openai`) for translation.

## How meaning-level review works without a key

`review_locales` does not call a model. It runs the structural checks, then returns the surviving
source/translation pairs plus the review criteria — and **your agent** judges them with the model it
is already running. Nothing is sent to us, and nothing extra is billed.

> **A note on MCP sampling.** Earlier versions of this README advertised a "zero-key" translation
> mode built on `sampling/createMessage`. Sampling was **deprecated in MCP spec 2026-07-28**
> ([SEP-2577](https://modelcontextprotocol.io/specification/draft/client/sampling): *"New
> implementations SHOULD NOT adopt it"*) and **Claude Desktop never supported it**, so that claim was
> wrong for the client most people use. The sampling path still exists as a silent fallback for
> clients that do implement it, but it is not the documented way to translate — a provider key is.

## Tools

**No API key required:**

| Tool | Description |
| --- | --- |
| `check_locales` | Structural QA over a locale tree: missing/orphan keys, dropped placeholders, collapsed plurals, empty values, untranslated copy. |
| `check_glossary` | Enforce do-not-translate terms and locked per-language translations. |
| `diff_locales` | What still needs translating, per language. |
| `review_locales` | Returns translation pairs + criteria so **your agent** judges meaning with its own model. |
| `check_placeholders` | Compare two strings for placeholder drift. |
| `list_languages` | Known language codes. |

**Requires your own provider key:**

| Tool | Description |
| --- | --- |
| `translate_json` | Translate a locale JSON string to one or more languages (returns the translated JSON). |
| `translate_file` | Read a `.json` locale file, translate it, and write `<lang>.json` files. Supports `incremental`. |
| `list_languages` | List the language codes/names with friendly names (any BCP-47 code works). |
| `check_placeholders` | Verify a translation preserves a source string's placeholders (no LLM call). |

All translation tools accept optional `provider` (`anthropic`/`openai`) and `model` arguments to override
auto-detection.

## Why

Built on [`@shipi18n/core`](https://www.npmjs.com/package/@shipi18n/core): structure-preserving JSON
translation with placeholder preservation/validation, batching, and incremental (only-changed) mode.
Open-source, no Shipi18n account, no hosted API.

## License

Apache-2.0

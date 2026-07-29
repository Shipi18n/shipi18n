# @shipi18n/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for **i18n translation** — translate
your locale files straight from any MCP client (Claude Desktop, Cursor, …). **Bring your own LLM**, or
use no key at all and let the client's own model do the work.

## Two ways to run it

- **BYO key** — set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the server env; translation calls your model.
- **Zero-key (sampling)** — set no key, and the server asks the MCP *client* to run the completion via
  `sampling/createMessage`. No API key needed; uses whatever model your client runs. (Requires a client
  that supports MCP sampling.)

## Install

Add it to your MCP client config. For **Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "shipi18n": {
      "command": "npx",
      "args": ["-y", "@shipi18n/mcp"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

Omit the `env` block to use the zero-key sampling mode. For the OpenAI provider, set `OPENAI_API_KEY`
instead. You'll also need the matching SDK available (`@anthropic-ai/sdk` or `openai`) when using BYO key.

Then just ask: *"Translate `locales/en.json` into French, German, and Japanese."*

## Tools

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

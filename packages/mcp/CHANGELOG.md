# @shipi18n/mcp

## 2.0.0

Initial release — Model Context Protocol server for i18n translation.

- Tools: `translate_json`, `translate_file`, `list_languages`, `check_placeholders`.
- **Bring your own LLM**: set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, or run with **no key** and it
  uses the MCP client's own model via sampling (`sampling/createMessage`).
- Built on `@shipi18n/core`: structure-preserving, placeholder-safe, incremental translation.

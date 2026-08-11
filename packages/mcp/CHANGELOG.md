# @shipi18n/mcp

## 2.0.1

**Fixes a bug that made 2.0.0 unusable from every MCP client — upgrade from 2.0.0.**

- Fix: the server exited silently instead of serving when started through its `bin`. npm installs
  `bin` as a symlink, so `npx @shipi18n/mcp` gave `process.argv[1]` as the symlink while
  `import.meta.url` was the real file; the entrypoint guard compared them unresolved and never
  matched. Both sides are now realpath'd. Added regression tests that spawn the binary through a
  symlink, the way a client does.

## 2.0.0

Initial release — Model Context Protocol server for i18n translation.

- Tools: `translate_json`, `translate_file`, `list_languages`, `check_placeholders`.
- **Bring your own LLM**: set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, or run with **no key** and it
  uses the MCP client's own model via sampling (`sampling/createMessage`).
- Built on `@shipi18n/core`: structure-preserving, placeholder-safe, incremental translation.

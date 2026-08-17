# @shipi18n/mcp

## 2.1.0

- New: four keyless validator tools — `check_locales`, `check_glossary`, `diff_locales` and
  `review_locales`. They call no model and need no API key.
- `review_locales` returns source/translation pairs plus review criteria so **your agent** judges
  meaning with the model it already runs. The server performs no inference.
- **Corrected claim.** Previous versions advertised zero-key translation via MCP sampling. Sampling
  was deprecated in MCP spec 2026-07-28 (SEP-2577) and Claude Desktop never supported it, so that
  claim was false for the most common client. Sampling remains only as a silent fallback for clients
  that implement it; the documented way to translate is your own provider key. The genuinely
  key-free capability is validation.
- Tool registration now leads with the validators; translation tools follow.
- Fix: the stdio startup banner carried a hand-written tool list and so never mentioned the
  validators. It is now derived from what was actually registered, and a test pins it.
- Fix: the `provider` argument description read "Omit to auto-detect / use sampling", advertising a
  deprecated path in text agents read. Sampling is no longer named in any tool argument.

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

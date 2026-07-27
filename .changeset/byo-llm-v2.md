---
"@shipi18n/core": major
"@shipi18n/cli": major
"vite-plugin-shipi18n": major
---

**v2 — bring-your-own-LLM.** Shipi18n is now pure open-source with no hosted API. Packages call your
own OpenAI or Anthropic key directly via the new `@shipi18n/core` engine.

Breaking changes:

- **No more Shipi18n API key or account.** Provide your own LLM key via `ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY` (or a `provider` + `apiKey` option). No hosted endpoint is contacted.
- **`@shipi18n/core`** (new): provider-agnostic translation engine — `translateJSON`, placeholder
  preservation/validation, batching, incremental mode, and OpenAI/Anthropic/custom adapters.
- **`@shipi18n/cli`**: `shipi18n translate <input> -t es,fr -p anthropic|openai [--incremental]`.
  Removed the hosted-API `keys`/`config` commands.
- **`vite-plugin-shipi18n`**: replaced the `apiKey`/`apiUrl` (Shipi18n) options with `provider` +
  `apiKey` (your LLM key) + `model`. Translation now runs through `@shipi18n/core` at build time.

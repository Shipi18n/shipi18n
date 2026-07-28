# vite-plugin-shipi18n

## 2.0.0

**Breaking — bring-your-own-LLM.** Build-time translation now runs through `@shipi18n/core` using your
own LLM key; no Shipi18n account or hosted API.

- Replaced the `apiKey` / `apiUrl` (Shipi18n) options with `provider` (`anthropic` | `openai` | custom
  adapter), `apiKey` (your LLM key, or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`), and `model`.
- Unchanged: caching, regional fallback, source fallback, per-file output layout.

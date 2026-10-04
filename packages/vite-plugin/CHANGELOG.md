# vite-plugin-shipi18n

## 2.0.3

- **Installs on Vite 6, 7 and 8.** The `vite` peer range was `^4.0.0 || ^5.0.0`, so `npm i -D vite-plugin-shipi18n`
  failed with ERESOLVE on any current Vite project. It is now `^4 || ^5 || ^6 || ^7 || ^8`, tested by installing and
  running `vite build` on Vite 6.4, 7.3 and 8.3. The plugin uses only `configResolved` and `buildStart`; no code change.

## 2.0.1

- Security (hardening): pulls core 2.8.1 (translator prompt-injection guardrail + recursion depth
  bound).

## 2.0.0

**Breaking — bring-your-own-LLM.** Build-time translation now runs through `@shipi18n/core` using your
own LLM key; no Shipi18n account or hosted API.

- Replaced the `apiKey` / `apiUrl` (Shipi18n) options with `provider` (`anthropic` | `openai` | custom
  adapter), `apiKey` (your LLM key, or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`), and `model`.
- Unchanged: caching, regional fallback, source fallback, per-file output layout.

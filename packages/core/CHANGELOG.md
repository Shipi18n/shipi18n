# @shipi18n/core

## 2.0.0

Initial open-source release of the **bring-your-own-LLM** translation engine.

- Provider-agnostic adapters: `anthropic` (default, `claude-opus-4-8`), `openai`, or a custom
  `{ complete }` adapter. Optional peer deps loaded lazily.
- `translateJSON({ content, from, to, provider, apiKey?, model?, existing? })` — structure-preserving
  flatten/unflatten, batching, placeholder preserve + validate, and incremental (only-changed) mode.
- No hosted API and no Shipi18n account — your key calls your LLM directly.

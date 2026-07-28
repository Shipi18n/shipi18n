# @shipi18n/cli

## 2.0.0

**Breaking — bring-your-own-LLM.** Rebuilt on `@shipi18n/core`; no Shipi18n account or hosted API.

- `shipi18n translate <input> -t es,fr -p anthropic|openai [--incremental] [--api-key] [--model]`.
- LLM key read from `--api-key` or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.
- Removed the hosted-API `keys` and `config` commands.

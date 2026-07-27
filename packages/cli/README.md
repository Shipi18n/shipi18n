# @shipi18n/cli

Open-source, **bring-your-own-LLM** i18n translation CLI. Translate your locale files with your own
OpenAI or Anthropic key — no Shipi18n account, no hosted API.

```bash
npm i -g @shipi18n/cli @anthropic-ai/sdk   # or add `openai` for the OpenAI provider
```

## Quickstart

```bash
export ANTHROPIC_API_KEY=sk-ant-...
shipi18n translate en.json --target es,fr,de
```

Writes `es.json`, `fr.json`, `de.json` into the output directory (default `./locales`), preserving
structure and placeholders.

## Usage

```bash
shipi18n translate <input> --target <langs> [options]

Options:
  -t, --target <langs>     Comma-separated target language codes (default: es,fr)
  -s, --source <language>  Source language code (default: en)
  -o, --output <dir>       Output directory (default: ./locales)
  -p, --provider <name>    LLM provider: anthropic (default) or openai
      --api-key <key>      LLM API key (else ANTHROPIC_API_KEY / OPENAI_API_KEY env)
      --model <model>      Override the provider's default model
  -i, --incremental        Reuse existing output files; only translate new/missing keys
```

## Examples

```bash
# Anthropic (default), multiple languages
shipi18n translate locales/en.json -t es,fr,ja

# OpenAI provider
shipi18n translate en.json -p openai -t de --api-key $OPENAI_API_KEY

# Incremental — only translate keys not already in the target file
shipi18n translate en.json -t es --incremental
```

## Bring your own LLM

Set `ANTHROPIC_API_KEY` (default provider) or use `-p openai` with `OPENAI_API_KEY`. Your keys, your
models — nothing is sent to a Shipi18n server. Built on [`@shipi18n/core`](https://www.npmjs.com/package/@shipi18n/core).

## License

Apache-2.0

# @shipi18n/core

Open-source, **bring-your-own-LLM** i18n translation engine. Translate locale JSON with your own
OpenAI or Anthropic key — no Shipi18n account, no hosted API, no per-word fees. Provider-agnostic and
extensible.

```bash
npm i @shipi18n/core @anthropic-ai/sdk   # or: npm i @shipi18n/core openai
```

## Quickstart

```js
import { translateJSON } from '@shipi18n/core'

const { result, stats } = await translateJSON({
  content: { greeting: 'Hello {{name}}', items: 'You have {{count}} items' },
  from: 'en',
  to: 'es',
  provider: 'anthropic',            // 'anthropic' | 'openai' | a custom { complete } adapter
  apiKey: process.env.ANTHROPIC_API_KEY, // optional — falls back to the provider's env var
})

console.log(result)  // { greeting: 'Hola {{name}}', items: 'Tienes {{count}} elementos' }
console.log(stats)   // { translated, reused, placeholderWarnings }
```

The API key is resolved from `apiKey` or, if omitted, the provider's env var
(`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`). Your key is used to call **your** LLM directly.

## What it does

- **Structure-preserving** — flattens/unflattens nested JSON; non-string leaves pass through untouched.
- **Placeholder-safe** — preserves and validates `{{name}}`, `{count}`, `%s`, `%d`, `%1$s`, `$t(...)`, `%{name}`, and HTML tags.
- **Batched** — groups strings per request to minimize round-trips.
- **Incremental** — pass `existing` to reuse prior translations and only translate new/changed keys.

## Incremental translation

```js
const { result } = await translateJSON({
  content: source, from: 'en', to: 'fr',
  provider: 'anthropic',
  existing: previousFrench,   // only new/empty keys are sent to the LLM
})
```

## Custom provider

Any object with a `complete(prompt, opts) => Promise<string>` method works — bring any model:

```js
const myAdapter = {
  name: 'my-llm',
  async complete(prompt) { /* call your model, return its text */ },
}
await translateJSON({ content, from: 'en', to: 'de', provider: myAdapter })
```

## API

- `translateJSON({ content, from, to, provider, apiKey?, model?, existing? })` → `{ result, stats }`
- `translateStrings(texts, { adapter, from, to, batchSize? })` → `string[]`
- `flatten(obj)` / `unflatten(flat)`
- `extractPlaceholders(str)` / `validatePlaceholders(source, translation)`
- `getLanguageName(code)`
- `anthropicAdapter(config)` / `openaiAdapter(config)` / `resolveAdapter(provider, config)`

## License

Apache-2.0

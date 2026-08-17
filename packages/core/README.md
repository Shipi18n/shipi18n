# @shipi18n/core

**The engine behind Shipi18n's translation QA** — placeholder and plural validation, key parity,
coverage and an LLM-as-judge semantic review — plus a structure-preserving translation engine. Open
source, **bring your own LLM**, no account and no hosted API.

```bash
npm i @shipi18n/core                     # checking needs nothing else
npm i @shipi18n/core @anthropic-ai/sdk   # add a provider SDK to translate or judge
```

```js
import { runCheck } from '@shipi18n/core'

// deterministic, no model, no key
const { languages, totals } = runCheck({ input: './locales', source: 'en' })
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

## Checking translations

`checkTranslations` is the QA half of the engine — deterministic, no model call:

```js
import { checkTranslations } from '@shipi18n/core'

const { findings, stats } = checkTranslations({
  source: { greeting: 'Hello {{name}}' },
  target: { greeting: 'Hola amigo' },   // dropped {{name}}
  targetLang: 'es',
})
// findings[0] → { type: 'placeholder-missing', severity: 'error', path: 'greeting', missing: ['{{name}}'], ... }
// stats → { sourceKeys, targetKeys, missing, errors, warnings, coverage }
```

Finding types: `missing-key`, `orphan-key`, `placeholder-missing`, `placeholder-added`,
`plural-forms` (vue-i18n pipe plurals), `empty-value`, `untranslated`, `type-mismatch`.

`reviewTranslations({ source, target, from, to, provider, passes, glossary, cache })` is the
semantic layer: an LLM-as-judge pass (BYO key) with majority voting across passes, strict output
validation, and an incremental cache — unchanged pairs cost zero calls. Judge findings carry
`{ path, category, note, votes, passes }`.

Format adapters for mobile catalogs are exported too: `parseArbBundle` (Flutter ARB) and
`parseXcstrings` (Apple String Catalogs) normalize those files into plain locale objects that
`checkTranslations` understands — including `%@` / `%lld` specifiers and plural variations.

## API

- `translateJSON({ content, from, to, provider, apiKey?, model?, existing? })` → `{ result, stats }`
- `translateStrings(texts, { adapter, from, to, batchSize? })` → `string[]`
- `flatten(obj)` / `unflatten(flat)`
- `extractPlaceholders(str)` / `validatePlaceholders(source, translation)`
- `getLanguageName(code)`
- `anthropicAdapter(config)` / `openaiAdapter(config)` / `resolveAdapter(provider, config)`

## License

Apache-2.0

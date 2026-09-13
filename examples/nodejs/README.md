# Shipi18n Node.js Example

Translate i18n locale files from Node.js with [`@shipi18n/core`](https://www.npmjs.com/package/@shipi18n/core) — open source, using **your own** OpenAI or Anthropic key.

There is no Shipi18n account, no hosted API and no per-word pricing. The request goes from your process straight to your provider and back.

## Features

- Translate nested locale JSON while preserving its exact structure
- Placeholder-safe: `{{name}}`, `{count}`, `%d`, `%s`, `$t(...)` and inline HTML survive
- i18next-ready: namespaces and `_one` / `_other` plural suffixes pass through untouched
- Incremental mode — only new or changed keys are sent to the model
- Provider-agnostic: Anthropic, OpenAI, or any model behind a ten-line adapter

## Prerequisites

- Node.js 18 or newer
- An API key from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Shipi18n/shipi18n-nodejs-example.git
cd shipi18n-nodejs-example
npm install
```

### 2. Set your key

```bash
cp .env.example .env
# then edit .env and set ANTHROPIC_API_KEY
```

You pay your provider directly for the tokens you use. Translating this example's 20 keys into three languages costs a fraction of a cent.

### 3. Run

```bash
npm start                      # translate locales/en.json → es, fr, de

npm run translate:json         # translate an object in memory
npm run translate:text         # translate loose strings
npm run translate:file         # read a file, write one output per language
npm run translate:i18next      # namespaces, plurals and interpolation
npm run translate:incremental  # only translate what changed
```

## Project Structure

```
├── locales/
│   └── en.json                  # source locale file
├── output/                      # generated translations (created on run)
├── src/
│   ├── index.js                 # main example
│   ├── translate-json.js        # object in, object out
│   ├── translate-text.js        # loose strings via translateStrings
│   ├── translate-file.js        # file in, files out
│   ├── translate-i18next.js     # i18next shapes
│   └── translate-incremental.js # reuse existing translations
└── __tests__/                   # runs the real engine against a mock adapter
```

## The API

```js
import { translateJSON } from '@shipi18n/core'

const { result, stats } = await translateJSON({
  content: { greeting: 'Hello {{name}}' },
  from: 'en',
  to: 'es',
  provider: 'anthropic',                  // or 'openai', or a custom adapter
  apiKey: process.env.ANTHROPIC_API_KEY,  // optional — falls back to the env var
})

console.log(result) // { greeting: 'Hola {{name}}' }
console.log(stats)  // { translated, reused, placeholderWarnings }
```

`translateJSON` handles one target language per call — loop for several, as `src/index.js` does.

## Incremental translation

Pass the previous translation as `existing` and only new or empty keys reach the model:

```js
const { result, stats } = await translateJSON({
  content: source,
  from: 'en',
  to: 'es',
  provider: 'anthropic',
  existing: JSON.parse(await readFile('output/es.json', 'utf-8')),
})

console.log(`translated ${stats.translated}, reused ${stats.reused}`)
```

This is what makes re-running on every build cheap, and it keeps untouched strings byte-identical between runs.

## Placeholder preservation

Placeholders are extracted before the request and verified after it. Anything the model drops shows up in `stats.placeholderWarnings`:

```js
if (stats.placeholderWarnings.length) {
  // Each entry is { path, source, translation, ok, missing, added }
  for (const w of stats.placeholderWarnings) {
    console.warn(`${w.path}: missing ${w.missing.join(', ')}`)
  }
  process.exit(1)   // fail the build rather than ship a broken string
}
```

| Syntax | Example | Used by |
| --- | --- | --- |
| Double brace | `{{name}}` | i18next, Handlebars |
| Single brace | `{count}` | ICU, vue-i18n, react-intl |
| printf | `%s`, `%d`, `%1$s` | gettext, sprintf |
| Nested reference | `$t(common.greeting)` | i18next |
| Inline HTML | `<b>…</b>` | Trans components |

## Bring any model

A provider is any object with a `complete(prompt)` method:

```js
const myAdapter = {
  name: 'my-llm',
  async complete(prompt) {
    return await callMyModel(prompt)   // return the model's text
  },
}

await translateJSON({ content, from: 'en', to: 'de', provider: myAdapter })
```

## Tests

```bash
npm test
```

The tests run the **real** engine against a mock adapter, so they exercise the actual flatten/unflatten, placeholder and incremental logic without needing a key or network access.

## Migrating from v1

Earlier versions of this example used `@shipi18n/api` with a `SHIPI18N_API_KEY` against a hosted service. That service has been shut down and the package is deprecated. In v2:

| v1 | v2 |
| --- | --- |
| `new Shipi18n({ apiKey })` | `translateJSON({ ..., provider, apiKey })` |
| `SHIPI18N_API_KEY` | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| `targetLanguages: ['es','fr']` | one `to` per call — loop for several |
| returns `{ es: {...}, fr: {...} }` | returns `{ result, stats }` |

## License

Apache-2.0 — see [LICENSE](LICENSE).

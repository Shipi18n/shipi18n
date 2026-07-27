# vite-plugin-shipi18n

Automatically translate your i18n locale files at **build time** — **bring your own LLM**. Uses your
own OpenAI or Anthropic key via [`@shipi18n/core`](https://www.npmjs.com/package/@shipi18n/core). No
Shipi18n account, no hosted API, no per-word fees.

```bash
npm i -D vite-plugin-shipi18n @shipi18n/core @anthropic-ai/sdk
# or, for OpenAI:  npm i -D vite-plugin-shipi18n @shipi18n/core openai
```

## Usage

```js
// vite.config.js
import { defineConfig } from 'vite'
import shipi18n from 'vite-plugin-shipi18n'

export default defineConfig({
  plugins: [
    shipi18n({
      provider: 'anthropic',            // 'anthropic' (default) | 'openai' | custom adapter
      // apiKey: process.env.ANTHROPIC_API_KEY,  // optional — falls back to the provider env var
      targetLanguages: ['es', 'fr', 'de', 'ja'],
      sourceDir: 'public/locales/en',
      outputDir: 'public/locales',
    }),
  ],
})
```

```bash
export ANTHROPIC_API_KEY=sk-ant-...
vite build
```

On `buildStart`, every JSON file in `sourceDir` is translated into each target language and written to
`outputDir/<lang>/<file>`, preserving structure and placeholders.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `provider` | `'anthropic'` | `'anthropic'`, `'openai'`, or a custom `{ complete }` adapter |
| `apiKey` | env var | LLM key; falls back to `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| `model` | provider default | Override the model |
| `targetLanguages` | — | **Required.** Array of language codes (`['es','fr']`) |
| `sourceDir` | `'public/locales/en'` | Directory of source locale JSON files |
| `outputDir` | `'public/locales'` | Where translated `<lang>/<file>` are written |
| `sourceLanguage` | `'en'` | Source language code |
| `cache` | `true` | Cache translations by content hash |
| `cacheDir` | `node_modules/.cache/vite-plugin-shipi18n` | Cache location |
| `fallback.fallbackToSource` | `true` | Use source text when a translation is missing |
| `fallback.regionalFallback` | `true` | `pt-BR` → `pt` base-language fallback |

## Caching

Translations are cached by an MD5 of the source content + target languages. Change the source (or the
target list) and only the affected files are re-translated on the next build.

## Bring your own LLM

Your key is used to call **your** LLM directly — nothing is sent to a Shipi18n server. Set
`ANTHROPIC_API_KEY` (default) or use `provider: 'openai'` with `OPENAI_API_KEY`.

## License

Apache-2.0

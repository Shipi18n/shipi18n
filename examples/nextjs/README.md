# Shipi18n Next.js Example

A Next.js **App Router** app whose message files are translated **at build time** by [`@shipi18n/cli`](https://www.npmjs.com/package/@shipi18n/cli), using your own OpenAI or Anthropic key.

Every locale is statically pre-rendered. There is no translation call at request time, no runtime dependency on Shipi18n, and no API key anywhere near the client.

## Why it is built this way

```
npm run i18n     →  messages/en.json  →  es.json, fr.json, de.json
npm run build    →  runs i18n, then next build
```

Next.js inlines any `NEXT_PUBLIC_`-prefixed variable into the client bundle. An LLM key there is a key published to every visitor — so the key is only ever read by the build step.

> An earlier version of this example used `NEXT_PUBLIC_SHIPI18N_API_KEY` against the hosted Shipi18n API. That service is gone and the pattern was unsafe, so the app was restructured.

## Quick Start

```bash
git clone https://github.com/Shipi18n/shipi18n-nextjs-example.git
cd shipi18n-nextjs-example
npm install

cp .env.example .env.local     # then set ANTHROPIC_API_KEY
npm run i18n                   # generate es/fr/de from en.json
npm run dev
```

Generated messages are committed, so `npm run dev` works without a key. You need one only when `messages/en.json` changes.

## Structure

```
messages/
├── en.json              # the only file you edit
├── es.json              # generated — commit these
├── fr.json
└── de.json
src/
├── middleware.js        # redirects / → /en (or the visitor's language)
├── lib/i18n.js          # dictionary loader + translate()
├── components/
│   └── LanguageSwitcher.jsx   # client component, swaps the locale segment
└── app/
    └── [locale]/
        ├── layout.js    # generateStaticParams + metadata per locale
        └── page.js      # server component, no client JS for the copy
```

### Static rendering

`generateStaticParams` returns every locale, so `next build` emits `/en`, `/es`, `/fr` and `/de` as static HTML:

```
● /[locale]
  ├ /en
  ├ /es
  ├ /fr
  └ /de
```

### Metadata per locale

`generateMetadata` reads the same dictionary, so `<title>` and `<meta description>` are translated too — which is the part that actually affects search results.

## The translate helper

`src/lib/i18n.js` is deliberately tiny — about 40 lines, no dependency:

```js
const dict = await getDictionary(locale)

translate(dict, 'home.greeting', { name: 'Ada' })   // "Welcome back, Ada!"
translate(dict, 'home.tasks', { count: 1 })         // "You have 1 open task"
translate(dict, 'home.tasks', { count: 4 })         // "You have 4 open tasks"
```

Plurals use the i18next convention (`key_one` / `key_other`), so these message files drop straight into `next-intl` or `i18next` if you later want a full library.

Missing keys render as the key itself rather than an empty string, so a gap is obvious in review instead of invisible in production.

## Adding a language

Add it to the `i18n` script and to `LOCALES` in `src/lib/i18n.js`, then:

```bash
npm run i18n
```

`--incremental` means existing languages are not re-translated and their files stay byte-identical.

## Tests

```bash
npm test
```

17 tests, no key or network required: message files match `en` key for key, placeholders survive translation, both plural forms exist in every language, and `translate()` handles interpolation, plural selection, missing keys and missing variables.

## Deploying

Set `ANTHROPIC_API_KEY` as a **build-time** environment variable (on Vercel: Project Settings → Environment Variables). Because generated messages are committed, a deploy will still succeed if the key is absent — it just will not pick up new strings.

## License

Apache-2.0 — see [LICENSE](LICENSE).

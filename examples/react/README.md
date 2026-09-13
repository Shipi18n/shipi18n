# Shipi18n React Example

A React + [react-i18next](https://react.i18next.com/) app whose locale files are translated **at build time** by [`@shipi18n/cli`](https://www.npmjs.com/package/@shipi18n/cli), using your own OpenAI or Anthropic key.

Switch language in the running app and every string changes — including interpolation, plurals, printf tokens and a link embedded inside a translated sentence.

## The important part: no key in the browser

Translation happens in an npm script **before** the bundler runs. At runtime this app has no Shipi18n dependency, makes no translation request, and contains no API key.

```
npm run i18n          →  reads src/locales/en.json, writes es/fr/de.json
npm run build         →  runs i18n, then vite build
```

That ordering is the whole design. An LLM key shipped to a browser is a leaked key: anyone can open devtools and spend your credits. **Never** put one in a `VITE_`-prefixed variable — Vite inlines those into the bundle by design.

> Earlier versions of this example did exactly that, with `VITE_SHIPI18N_API_KEY`. It was wrong then and it is dangerous now, so the app was restructured.

## Quick Start

```bash
git clone https://github.com/Shipi18n/shipi18n-react-example.git
cd shipi18n-react-example
npm install

cp .env.example .env      # then set ANTHROPIC_API_KEY
npm run i18n              # generate es/fr/de from en.json
npm run dev
```

The generated files are committed, so `npm run dev` works without a key. You only need one when you change `en.json`.

## How it fits together

```
src/
├── locales/
│   ├── en.json           # the only file you edit
│   ├── es.json           # generated — commit these
│   ├── fr.json
│   └── de.json
├── i18n.js               # react-i18next setup, imports the JSON
├── components/
│   ├── LanguageSwitcher.jsx
│   └── Dashboard.jsx     # exercises every tricky locale feature
└── App.jsx
```

### Adding a language

```bash
# add it to the script in package.json, then
npm run i18n
```

Import it in `src/i18n.js` and add it to `LANGUAGES`. Because `--incremental` is on, existing languages are not re-translated and their files stay byte-identical.

### Adding a string

Add it to `en.json` and run `npm run i18n`. Only the new key is sent to the model.

## What the Dashboard demonstrates

| Feature | Source | Why it matters |
| --- | --- | --- |
| Interpolation | `"Welcome back, {{name}}!"` | `{{name}}` must survive translation or the greeting breaks |
| Pluralisation | `items_one` / `items_other` | i18next picks the form; each language keeps both keys |
| printf tokens | `"Loaded %d of %s projects"` | passed through as literal text |
| Markup in a string | `"I agree to the <1>Terms</1>"` | `<Trans>` maps `<1>` to a real `<a>` |

All four are checked in the test suite.

## Tests

```bash
npm test
```

Two suites, no key and no network needed:

- **`locales.test.js`** — every language has exactly the same keys as `en`, every placeholder survives, both plural forms exist, and the file is not just a copy of English. These are the checks worth running in CI for any generated translations.
- **`App.test.jsx`** — the app renders translated copy, interpolates values, picks the right plural, and keeps the embedded link working after a language switch.

## Using OpenAI instead

```jsonc
// package.json
"i18n": "shipi18n translate src/locales/en.json -t es,fr,de -o src/locales -p openai --incremental"
```

and set `OPENAI_API_KEY`. Any model works — `@shipi18n/core` accepts a custom adapter.

## License

Apache-2.0 — see [LICENSE](LICENSE).

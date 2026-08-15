# Contributing to Shipi18n

Thanks for taking a look. This is a small, focused project and contributions are welcome.

## Getting set up

```bash
git clone https://github.com/Shipi18n/shipi18n.git
cd shipi18n
corepack enable            # the repo pins pnpm 9.15.9
pnpm install
pnpm test                  # 105 tests, no API key required
```

Every test runs against a **mock adapter**, so the suite needs no API key, makes no network calls and costs nothing. If a change you make requires a real model to verify, say so in the PR and describe what you ran.

## Repository layout

```
packages/
├── core           # the translation engine — everything else builds on it
├── cli            # shipi18n translate …
├── mcp            # Model Context Protocol server
├── vite-plugin    # build-time translation for Vite
└── github-action  # ships from its own repo; source of truth lives here
```

`core` has no runtime dependencies, and that is deliberate. Provider SDKs are optional peer dependencies so a user installs only the one they use. Please keep it that way.

## Making a change

1. Branch off `master`.
2. Add or update tests. A behaviour change without a test will usually be asked for one.
3. Run `pnpm test` — CI runs the same thing on Node 18, 20 and 22.
4. Add a changeset if the change is user-visible: `pnpm changeset`.

### Things worth knowing

- **Placeholder handling is the heart of the project.** If you touch `packages/core/src/placeholders.js`, add cases to the test suite for the syntax you are affecting. A dropped placeholder is a production crash for someone.
- **Providers are one method.** An adapter is any object with `complete(prompt)`. Adding a provider should not require changing the engine.
- **Prompts live in `packages/core/src/translate.js`.** They are tuned for locale files rather than prose. Changing them can shift output quality in ways tests will not catch — mention it explicitly in the PR.
- The engine is ESM. Keep it that way.

## Reporting a bug

Please include the package and version, the source string or file that misbehaved, the target language, and what you expected instead. A minimal locale file that reproduces it is worth more than a description.

For anything security-sensitive, email team@shipi18n.com rather than opening a public issue.

## Releasing

Maintainers only. Versions are managed with changesets; packages publish in dependency order (`core` first) with `pnpm publish`, which resolves `workspace:*` ranges. CI checks that no unresolved `workspace:` range escapes into a tarball.

## License

By contributing you agree that your contributions are licensed under the [Apache-2.0](LICENSE) license.

#!/usr/bin/env node
/**
 * Build the CLI as ONE file with no npm install at all: `node shipi18n.mjs check ./locales`.
 *
 * For maintainers who won't take anything from npm into their CI (24pullrequests,
 * 2026-09-30): core and the CLI's dependencies are bundled in, and releases publish
 * this file as a GitHub release asset with a SHA-256 checksum and a build-provenance
 * attestation. Covers `check`, `lock` and `wp-sync`; `--semantic` and `translate`
 * need an LLM SDK, which is deliberately not bundled — use the npm package for those.
 *
 *   node packages/cli/scripts/build-single.mjs [outfile]   (default dist-single/shipi18n.mjs)
 */
import { build } from 'esbuild'
import { readFileSync, chmodSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8'))
const outfile = resolve(process.argv[2] || join(cliDir, 'dist-single', 'shipi18n.mjs'))

await build({
  entryPoints: [join(cliDir, 'bin', 'shipi18n.js')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // LLM SDKs stay out: the check path never loads them, and bundling them would
  // pull the very dependency tree this build exists to avoid.
  external: ['@anthropic-ai/sdk', 'openai'],
  define: { __SHIPI18N_VERSION__: JSON.stringify(version) },
  // bin/shipi18n.js's own shebang stays on line 1. CJS dependencies inside an ESM
  // bundle still call require() for Node builtins, hence the createRequire shim.
  banner: {
    js: [
      `// shipi18n ${version} — single-file build of @shipi18n/cli (check, lock, wp-sync). Apache-2.0.`,
      `import { createRequire as __shipi18nRequire } from 'node:module';`,
      `const require = __shipi18nRequire(import.meta.url);`,
    ].join('\n'),
  },
  legalComments: 'inline',
  logLevel: 'warning',
})
chmodSync(outfile, 0o755)
console.log(`built ${outfile} (shipi18n ${version})`)

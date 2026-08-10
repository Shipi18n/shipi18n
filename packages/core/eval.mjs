/**
 * Live quality-parity eval for @shipi18n/core.
 * Translates a representative en.json to es + fr with a real Anthropic key and
 * reports structure + placeholder fidelity.
 *
 * Run: ANTHROPIC_API_KEY=sk-ant-... node eval.mjs
 * (a `.env` in the repo root, or at $SHIPI18N_ENV_FILE, is read as a fallback)
 */
import fs from 'node:fs'
import { translateJSON, flatten, validatePlaceholders } from './src/index.js'

// --- resolve the key: env var first, then an optional local .env ---
const readEnvFile = (p) => {
  if (!p || !fs.existsSync(p)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
      })
  )
}
const fileEnv = readEnvFile(process.env.SHIPI18N_ENV_FILE || new URL('../../../.env', import.meta.url).pathname)
const apiKey = process.env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('No Anthropic key — set ANTHROPIC_API_KEY (or SHIPI18N_ENV_FILE)')

// --- representative source locale: placeholders, plurals, nesting, HTML, printf ---
const en = {
  common: {
    greeting: 'Hello, {{name}}!',
    itemCount: 'You have {{count}} items in your cart',
    save: 'Save',
    cancel: 'Cancel',
  },
  checkout: {
    total: 'Total: {{amount}}',
    payWith: 'Pay {{amount}} with {{method}}',
    terms: 'I agree to the <b>Terms of Service</b>',
    printf: 'Loaded %d of %s files',
    nested: 'See $t(common.greeting) above',
  },
  errors: {
    required: 'This field is required',
    tooLong: 'Must be at most {{max}} characters',
  },
}

const run = async (to) => {
  const t0 = Date.now()
  const { result, stats } = await translateJSON({
    content: en,
    from: 'en',
    to,
    provider: 'anthropic',
    apiKey,
  })
  const ms = Date.now() - t0

  // structure parity
  const srcKeys = Object.keys(flatten(en)).sort()
  const outKeys = Object.keys(flatten(result)).sort()
  const structureOk = JSON.stringify(srcKeys) === JSON.stringify(outKeys)

  // placeholder parity across every string
  const srcFlat = flatten(en)
  const outFlat = flatten(result)
  let phFails = 0
  for (const k of srcKeys) {
    if (typeof srcFlat[k] === 'string') {
      if (!validatePlaceholders(srcFlat[k], outFlat[k]).ok) phFails++
    }
  }

  console.log(`\n===== ${to.toUpperCase()} (${ms} ms) =====`)
  console.log(`structure preserved: ${structureOk ? 'YES' : 'NO'} (${outKeys.length} keys)`)
  console.log(`placeholder parity:  ${phFails === 0 ? 'PASS' : phFails + ' FAILURES'}`)
  console.log(`engine warnings:     ${stats.placeholderWarnings.length}`)
  console.log('sample output:')
  console.log(`  greeting : ${result.common.greeting}`)
  console.log(`  itemCount: ${result.common.itemCount}`)
  console.log(`  payWith  : ${result.checkout.payWith}`)
  console.log(`  terms    : ${result.checkout.terms}`)
  console.log(`  printf   : ${result.checkout.printf}`)
  console.log(`  nested   : ${result.checkout.nested}`)
  return { to, structureOk, phFails, warnings: stats.placeholderWarnings.length }
}

const results = []
for (const lang of ['es', 'fr']) results.push(await run(lang))
const allOk = results.every((r) => r.structureOk && r.phFails === 0)
console.log(`\n===== VERDICT: ${allOk ? 'PARITY PASS ✅' : 'REVIEW NEEDED ⚠️'} =====`)

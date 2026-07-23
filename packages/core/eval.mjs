/**
 * Live quality-parity eval for @shipi18n/core.
 * Reads the Anthropic key from the project .env (handles the ANTRHOPIC typo),
 * translates a representative en.json to es + fr, and reports structure +
 * placeholder fidelity.  Run: node eval.mjs
 */
import fs from 'node:fs'
import { translateJSON, flatten, validatePlaceholders } from './src/index.js'

// --- load key from the project .env (typo-tolerant) ---
const envPath = '/Users/ogg/MICROSERVICES2/microservices/i18n-translator/.env'
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
    })
)
const apiKey = env.ANTHROPIC_API_KEY || env.ANTRHOPIC_API_KEY
if (!apiKey) throw new Error('No Anthropic key found in .env')

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

/**
 * Incremental translation — only pay for what changed.
 *
 * Pass the previous translation as `existing` and the engine reuses every key
 * that is already there, sending only new or empty ones to the model. This is
 * what makes re-running on every build cheap, and it also keeps untouched
 * strings byte-identical between runs.
 *
 * Run with: npm run translate:incremental
 */

import 'dotenv/config'
import { translateJSON } from '@shipi18n/core'

const content = {
  common: { welcome: 'Welcome', save: 'Save' },
  checkout: { total: 'Total: {{amount}}' }, // ← the new key
}

// Pretend this came from locales/es.json on disk, from a previous run.
const existing = {
  common: { welcome: 'Bienvenido', save: 'Guardar' },
}

const { result, stats } = await translateJSON({
  content,
  from: 'en',
  to: 'es',
  provider: 'anthropic',
  existing,
})

console.log(JSON.stringify(result, null, 2))
console.log(`\ntranslated: ${stats.translated}  reused: ${stats.reused}`)
console.log('Only the new key hit the model; the rest came from `existing` untouched.')

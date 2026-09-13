/**
 * Translate a handful of loose strings rather than a locale file.
 *
 * translateStrings takes an array and returns an array in the same order, which
 * is handy for UI copy that does not live in a JSON file yet. Note that it works
 * at a lower level than translateJSON: it wants an *adapter*, not a provider
 * name, so build one with resolveAdapter first.
 *
 * Run with: npm run translate:text
 */

import 'dotenv/config'
import { translateStrings, resolveAdapter } from '@shipi18n/core'

const phrases = [
  'Save changes',
  'Are you sure you want to delete this item?',
  'You have {{count}} unread messages',
]

// resolveAdapter also accepts any object with a complete(prompt) method, so a
// local model or an internal gateway drops in here unchanged.
const adapter = resolveAdapter('anthropic', { apiKey: process.env.ANTHROPIC_API_KEY })

for (const to of ['es', 'fr']) {
  const translated = await translateStrings(phrases, { adapter, from: 'en', to })
  console.log(`\n${to}:`)
  phrases.forEach((p, i) => console.log(`  ${p}\n    → ${translated[i]}`))
}

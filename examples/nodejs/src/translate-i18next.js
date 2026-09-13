/**
 * i18next-flavoured locale files.
 *
 * Nothing special is required: namespaces are just nested objects, plural
 * suffixes (_one / _other) are just keys, and {{interpolation}} is protected
 * like any other placeholder. This example shows that the shape survives.
 *
 * Run with: npm run translate:i18next
 */

import 'dotenv/config'
import { translateJSON, flatten } from '@shipi18n/core'

const content = {
  common: { welcome: 'Welcome', save: 'Save' },
  dashboard: {
    greeting: 'Hello, {{name}}!',
    items_one: 'You have {{count}} item',
    items_other: 'You have {{count}} items',
    nested: 'See $t(common.welcome) above',
  },
  legal: { terms: 'I agree to the <b>Terms of Service</b>' },
}

const { result, stats } = await translateJSON({
  content,
  from: 'en',
  to: 'de',
  provider: 'anthropic',
})

console.log(JSON.stringify(result, null, 2))

// Structure parity is worth asserting in your own pipeline too.
const sameShape =
  JSON.stringify(Object.keys(flatten(content)).sort()) ===
  JSON.stringify(Object.keys(flatten(result)).sort())

console.log(`\nsame key set as source: ${sameShape}`)
console.log(`plural suffixes kept:   ${'items_one' in result.dashboard && 'items_other' in result.dashboard}`)
console.log(`placeholder warnings:   ${stats.placeholderWarnings.length}`)

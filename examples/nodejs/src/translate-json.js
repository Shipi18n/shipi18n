/**
 * Translate a JSON object in memory.
 *
 * The simplest possible use of the engine: object in, object out, same shape.
 *
 * Run with: npm run translate:json
 */

import 'dotenv/config'
import { translateJSON } from '@shipi18n/core'

const content = {
  title: 'Welcome to our app',
  subtitle: 'The best way to manage your projects',
  cta: 'Get started for free',
  greeting: 'Hello, {{name}}!',
}

const { result, stats } = await translateJSON({
  content,
  from: 'en',
  to: 'es',
  provider: 'anthropic', // or 'openai'
})

console.log('Source:')
console.log(JSON.stringify(content, null, 2))
console.log('\nSpanish:')
console.log(JSON.stringify(result, null, 2))
console.log(`\ntranslated: ${stats.translated}  reused: ${stats.reused}`)

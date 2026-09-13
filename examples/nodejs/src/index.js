/**
 * Shipi18n Node.js Example — main entry point.
 *
 * Translates a locale file into several languages with @shipi18n/core, using
 * YOUR OWN LLM key. There is no Shipi18n API, account or key: the request goes
 * from this process straight to Anthropic (or OpenAI) and back.
 *
 * Run with: npm start
 */

import 'dotenv/config'
import { translateJSON, flatten } from '@shipi18n/core'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '..', 'locales')
const outputDir = join(__dirname, '..', 'output')

const TARGETS = ['es', 'fr', 'de']
const PROVIDER = process.env.SHIPI18N_PROVIDER || 'anthropic'

async function main() {
  // The key is your provider's, read from the environment. core falls back to
  // ANTHROPIC_API_KEY / OPENAI_API_KEY on its own, so passing it is optional —
  // we check here only to fail with a clear message instead of a stack trace.
  const apiKey = PROVIDER === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const varName = PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
    console.error(`Error: set ${varName} in your environment or .env file.`)
    console.error('Shipi18n has no account — bring a key from your own LLM provider.')
    process.exit(1)
  }

  console.log('Shipi18n Node.js Example')
  console.log('========================\n')

  const sourceJSON = JSON.parse(await readFile(join(localesDir, 'en.json'), 'utf-8'))
  console.log('Source file: locales/en.json')
  console.log(`Keys to translate: ${Object.keys(flatten(sourceJSON)).length}`)
  console.log(`Target languages: ${TARGETS.join(', ')}`)
  console.log(`Provider: ${PROVIDER}\n`)

  await mkdir(outputDir, { recursive: true })

  // core translates one language per call, so fan out here. Doing it in
  // sequence keeps the output readable and stays clear of rate limits.
  const results = {}
  for (const to of TARGETS) {
    process.stdout.write(`Translating to ${to}... `)
    const { result, stats } = await translateJSON({
      content: sourceJSON,
      from: 'en',
      to,
      provider: PROVIDER,
      apiKey,
    })
    results[to] = result

    await writeFile(join(outputDir, `${to}.json`), JSON.stringify(result, null, 2) + '\n')
    console.log(`${stats.translated} translated → output/${to}.json`)

    // Never ignore this. A dropped placeholder is a crash in production, and
    // it is the one failure mode a language model will not tell you about.
    if (stats.placeholderWarnings.length) {
      console.warn(`  ⚠ ${stats.placeholderWarnings.length} placeholder warning(s):`)
      // Each warning is { path, source, translation, ok, missing, added }.
      for (const w of stats.placeholderWarnings) {
        console.warn(`    ${w.path}: missing ${w.missing.join(', ')}`)
      }
    }
  }

  console.log('\nSample translations (Spanish):')
  console.log('------------------------------')
  const es = results.es
  console.log(`welcome:     "${es.common?.welcome}"`)
  console.log(`goodbye:     "${es.common?.goodbye}"`)
  console.log(`greeting:    "${es.dashboard?.greeting}"`)
  console.log(`items_one:   "${es.dashboard?.items_one}"`)
  console.log(`items_other: "${es.dashboard?.items_other}"`)
  console.log('\nPlaceholders like {{name}} and {{count}} are preserved exactly.')
}

main().catch((err) => {
  console.error('Translation failed:', err.message)
  process.exit(1)
})

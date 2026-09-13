/**
 * Translate a locale file on disk into several languages.
 *
 * This is the shape most projects want: read one source file, write one output
 * file per language, commit the results.
 *
 * Run with: npm run translate:file
 */

import 'dotenv/config'
import { translateJSON } from '@shipi18n/core'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = join(__dirname, '..', 'locales', 'en.json')
const outputDir = join(__dirname, '..', 'output')

const content = JSON.parse(await readFile(source, 'utf-8'))
await mkdir(outputDir, { recursive: true })

for (const to of ['es', 'fr', 'de']) {
  const { result, stats } = await translateJSON({ content, from: 'en', to, provider: 'anthropic' })
  await writeFile(join(outputDir, `${to}.json`), JSON.stringify(result, null, 2) + '\n')
  console.log(`${to}: ${stats.translated} keys → output/${to}.json`)
}

/**
 * Live BYO-LLM parity eval across every publishable surface:
 *   core (library) · cli (spawned bin) · vite-plugin (buildStart) · mcp (in-memory client)
 *
 * Each surface translates the same representative locale and is checked for
 * structure parity and 100% placeholder retention.
 *
 * Run: ANTHROPIC_API_KEY=sk-ant-... node evals/wrappers.mjs
 * (a `.env` in the repo root, or at $SHIPI18N_ENV_FILE, is read as a fallback)
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MONO = path.resolve(new URL('..', import.meta.url).pathname)

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
const fileEnv = readEnvFile(process.env.SHIPI18N_ENV_FILE || path.join(MONO, '..', '.env'))
const apiKey = process.env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('No Anthropic key — set ANTHROPIC_API_KEY (or SHIPI18N_ENV_FILE)')

const EN = {
  common: { greeting: 'Hello, {{name}}!', itemCount: 'You have {{count}} items', save: 'Save' },
  checkout: {
    total: 'Total: {{amount}}',
    terms: 'I agree to the <b>Terms of Service</b>',
    printf: 'Loaded %d of %s files',
  },
}
const PLACEHOLDERS = ['{{name}}', '{{count}}', '{{amount}}', '<b>', '</b>', '%d', '%s']

const { flatten } = await import(path.join(MONO, 'packages/core/src/index.js'))

const results = []
const check = (name, obj, ms) => {
  const srcKeys = Object.keys(flatten(EN)).sort()
  const outKeys = Object.keys(flatten(obj)).sort()
  const structureOk = JSON.stringify(srcKeys) === JSON.stringify(outKeys)
  const blob = JSON.stringify(obj)
  const missing = PLACEHOLDERS.filter((p) => !blob.includes(p))
  const unchanged = outKeys.filter((k) => {
    const a = k.split('.').reduce((o, s) => o?.[s], EN)
    const b = k.split('.').reduce((o, s) => o?.[s], obj)
    return typeof a === 'string' && a === b
  })
  const pass = structureOk && missing.length === 0
  results.push({ name, pass })
  console.log(`\n### ${name} — ${pass ? 'PASS' : 'FAIL'} (${ms}ms)`)
  console.log(
    `  structure: ${structureOk ? 'ok' : 'MISMATCH'}  placeholders: ${
      missing.length === 0 ? 'all held' : 'MISSING ' + missing.join(', ')
    }`
  )
  if (unchanged.length) console.log(`  note: identical to source (may be legitimate): ${unchanged.join(', ')}`)
  console.log('  sample:', JSON.stringify(obj.common?.greeting), JSON.stringify(obj.checkout?.printf))
}

// ---------- 1. core ----------
{
  const { translateJSON } = await import(path.join(MONO, 'packages/core/src/index.js'))
  const t0 = Date.now()
  const { result } = await translateJSON({ content: EN, from: 'en', to: 'es', provider: 'anthropic', apiKey })
  check('core → es', result, Date.now() - t0)
}

// ---------- 2. cli ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipi18n-eval-cli-'))
  fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify(EN, null, 2))
  const t0 = Date.now()
  await execFileAsync(
    process.execPath,
    [path.join(MONO, 'packages/cli/bin/shipi18n.js'), 'translate', path.join(dir, 'en.json'), '-t', 'fr', '-p', 'anthropic'],
    { env: { ...process.env, ANTHROPIC_API_KEY: apiKey }, cwd: dir }
  )
  const ms = Date.now() - t0
  const out = path.join(dir, 'locales/fr.json')
  if (!fs.existsSync(out)) throw new Error('cli produced no locales/fr.json')
  check('cli → fr', JSON.parse(fs.readFileSync(out, 'utf8')), ms)
}

// ---------- 3. vite-plugin ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipi18n-eval-vite-'))
  const srcDir = path.join(dir, 'public/locales/en')
  fs.mkdirSync(srcDir, { recursive: true })
  fs.writeFileSync(path.join(srcDir, 'translation.json'), JSON.stringify(EN, null, 2))
  const { default: shipi18nPlugin } = await import(path.join(MONO, 'packages/vite-plugin/src/index.js'))
  const plugin = shipi18nPlugin({
    provider: 'anthropic',
    apiKey,
    targetLanguages: ['de'],
    sourceDir: 'public/locales/en',
    outputDir: 'public/locales',
    cache: false,
  })
  plugin.configResolved({ root: dir })
  const t0 = Date.now()
  await plugin.buildStart.call({
    error: (e) => {
      throw e
    },
  })
  const ms = Date.now() - t0
  const out = path.join(dir, 'public/locales/de/translation.json')
  if (!fs.existsSync(out)) throw new Error('vite-plugin produced no de/translation.json')
  check('vite-plugin → de', JSON.parse(fs.readFileSync(out, 'utf8')), ms)
}

// ---------- 4. mcp (in-memory client ↔ server, BYO key) ----------
{
  const SDK = path.join(MONO, 'packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm')
  const { Client } = await import(path.join(SDK, 'client/index.js'))
  const { InMemoryTransport } = await import(path.join(SDK, 'inMemory.js'))
  const { createServer } = await import(path.join(MONO, 'packages/mcp/src/server.js'))

  const server = createServer({ ANTHROPIC_API_KEY: apiKey })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'eval', version: '1.0.0' }, { capabilities: {} })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const tools = await client.listTools()
  console.log('\n  mcp tools:', tools.tools.map((t) => t.name).join(', '))

  const t0 = Date.now()
  const res = await client.callTool({
    name: 'translate_json',
    arguments: { content: JSON.stringify(EN), from: 'en', to: 'it', provider: 'anthropic' },
  })
  const ms = Date.now() - t0
  const text = res.content.find((c) => c.type === 'text')?.text ?? ''
  // the tool returns a human-readable preamble followed by the JSON payload
  const parsed = JSON.parse(text.slice(text.indexOf('{')))
  check('mcp → it', parsed.it ?? parsed.result ?? parsed, ms)
  await client.close()
}

// ---------- verdict ----------
const failed = results.filter((r) => !r.pass)
console.log('\n' + '='.repeat(60))
console.log(`PARITY EVAL: ${results.length - failed.length}/${results.length} surfaces PASS`)
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}
console.log('All surfaces: structure preserved, 100% placeholders held.')

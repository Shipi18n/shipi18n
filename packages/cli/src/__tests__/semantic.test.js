/**
 * CLI semantic-pass tests — scripted adapters only, no key, CI-safe.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv from 'ajv'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCheck, runSemantic, verdict } from '../commands/check.js'
import { sarifReport } from '../reporters.js'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

const scripted = (responses) => {
  const adapter = {
    name: 'scripted',
    calls: 0,
    prompts: [],
    async complete(prompt) {
      adapter.calls++
      adapter.prompts.push(prompt)
      const next = responses.shift()
      if (next === undefined) throw new Error('scripted adapter ran dry')
      return next
    },
  }
  return adapter
}

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shipi18n-sem-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (rel, data) => writeFileSync(join(dir, rel), JSON.stringify(data))

/** One clean pair + one structurally-broken pair. */
const seed = () => {
  write('en.json', { good: 'The trial lasts 30 days', broken: 'Hello {{name}} friend' })
  write('es.json', { good: 'La prueba dura 3 días', broken: 'Hola amigo' }) // broken drops {{name}}
  return runCheck({ input: dir, source: 'en' })
}

/** The judge flags whatever ids it sees as mistranslation, every pass. */
const flagAll = (passes = 3) => {
  const adapter = {
    name: 'flag-all',
    calls: 0,
    seenItems: [],
    async complete(prompt) {
      adapter.calls++
      const items = JSON.parse(prompt.slice(prompt.indexOf('Items:') + 6, prompt.lastIndexOf('Respond')))
      adapter.seenItems.push(items)
      return JSON.stringify(items.map((i) => ({ id: i.id, verdict: 'mistranslation', note: 'meaning differs' })))
    },
  }
  return adapter
}

describe('structural-first (gate M4)', () => {
  test('keys with structural errors generate zero judge traffic', async () => {
    const result = seed()
    const adapter = flagAll()
    await runSemantic(result, { provider: adapter, passes: 3 })

    const judgedSources = adapter.seenItems.flat().map((i) => i.source)
    expect(judgedSources).toContain('The trial lasts 30 days')
    expect(judgedSources).not.toContain('Hello {{name}} friend') // excluded: has placeholder-missing error
  })

  test('a fully-broken tree reports what it skipped instead of a bare judged 0', async () => {
    // Every translated key carries a structural error, so the judge has nothing
    // left to look at. Without `excluded` this is indistinguishable from "clean".
    write('en.json', { a: 'Hello {{name}}', b: 'You have {{count}} items' })
    write('es.json', { a: 'Hola', b: 'Tienes elementos' })
    const result = runCheck({ input: dir, source: 'en' })
    const adapter = flagAll()
    const stats = await runSemantic(result, { provider: adapter, passes: 3 })

    expect(stats.judged).toBe(0)
    expect(stats.excluded).toBe(2)
    expect(adapter.calls).toBe(0)
  })

  test('excluded stays 0 when nothing is structurally broken', async () => {
    write('en.json', { good: 'The trial lasts 30 days' })
    write('es.json', { good: 'La prueba dura 3 días' })
    const result = runCheck({ input: dir, source: 'en' })
    const stats = await runSemantic(result, { provider: flagAll(), passes: 3 })

    expect(stats.excluded).toBe(0)
    expect(stats.judged).toBe(1)
  })
})

describe('advisory default (gate M6)', () => {
  test('semantic findings are warnings; default verdict still passes', async () => {
    const result = seed()
    await runSemantic(result, { provider: flagAll(), passes: 3 })

    const es = result.languages[0]
    const semantic = es.namespaces[0].findings.filter((f) => f.type === 'semantic-mistranslation')
    expect(semantic).toHaveLength(1)
    expect(semantic[0].severity).toBe('warning')
    expect(semantic[0].path).toBe('good')

    // structural error still fails; remove it and semantic alone must NOT fail
    write('es.json', { good: 'La prueba dura 3 días', broken: 'Hola {{name}} amigo' })
    const clean = runCheck({ input: dir, source: 'en' })
    await runSemantic(clean, { provider: flagAll(), passes: 3 })
    expect(verdict(clean, { failOn: 'error' }).ok).toBe(true)
  })

  test('--semantic-fail escalates to errors and fails the verdict', async () => {
    write('en.json', { good: 'The trial lasts 30 days', broken: 'Hello {{name}} friend' })
    write('es.json', { good: 'La prueba dura 3 días', broken: 'Hola {{name}} amigo' })
    const result = runCheck({ input: dir, source: 'en' })
    await runSemantic(result, { provider: flagAll(), passes: 3, fail: true })

    expect(result.totals.errors).toBeGreaterThan(0)
    expect(verdict(result, { failOn: 'error' }).ok).toBe(false)
  })

  test('language stats and totals are recomputed after the merge', async () => {
    const result = seed()
    const before = result.totals.warnings
    await runSemantic(result, { provider: flagAll(), passes: 3 })
    expect(result.totals.warnings).toBe(before + 1)
    expect(result.languages[0].stats.warnings).toBe(result.totals.warnings)
  })
})

describe('SARIF with semantic findings (gate M6)', () => {
  test('still validates against the official schema and carries the semantic rule', async () => {
    const result = seed()
    await runSemantic(result, { provider: flagAll(), passes: 3 })
    const sarif = JSON.parse(sarifReport(result, verdict(result), { toolVersion: '2.2.0' }))

    const schema = JSON.parse(readFileSync(join(FIXTURES, 'sarif-schema-2.1.0.json'), 'utf8'))
    const ajv = new Ajv({ strict: false, allErrors: true })
    expect(ajv.validate(schema, sarif)).toBe(true)

    const ids = sarif.runs[0].tool.driver.rules.map((r) => r.id)
    expect(ids).toContain('semantic-mistranslation')
  })
})

describe('glossary through the CLI (gate M5)', () => {
  test('glossary violations surface from runCheck with zero model calls', () => {
    write('en.json', { tag: 'Shipi18n checks your work' })
    write('de.json', { tag: 'SchiffI18n prüft deine Arbeit' })
    const result = runCheck({ input: dir, source: 'en', glossary: { Shipi18n: { dnt: true } } })
    const f = result.languages[0].namespaces[0].findings
    expect(f.some((x) => x.type === 'glossary-violation' && x.severity === 'error')).toBe(true)
  })
})

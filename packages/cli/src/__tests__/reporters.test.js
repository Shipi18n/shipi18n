/**
 * Reporters, ignores and format routing for `shipi18n check`.
 * SARIF is validated against the vendored official 2.1.0 schema; JUnit is
 * parsed back with a real XML parser, including a hostile-string escaping case.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { XMLParser } from 'fast-xml-parser'
import { runCheck, verdict, compileIgnores } from '../commands/check.js'
import { sarifReport, junitReport, jsonReport } from '../reporters.js'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shipi18n-rep-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (relPath, data) => {
  const path = join(dir, relPath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data))
}

/** A tree with one of everything: error, warning, hostile XML string. */
const seedBrokenTree = () => {
  write('en.json', {
    greeting: 'Hello {{name}}',
    terms: 'I agree to the <b>Terms</b> & "conditions"',
    same: 'Save all changes now',
  })
  write('es.json', {
    greeting: 'Hola amigo', // dropped {{name}} → error
    terms: 'Acepto los <b>Términos</b> & "condiciones"',
    same: 'Save all changes now', // untranslated → warning
  })
  return runCheck({ input: dir, source: 'en' })
}

describe('SARIF reporter (gate S1)', () => {
  test('output validates against the official 2.1.0 schema', () => {
    const result = seedBrokenTree()
    const sarif = JSON.parse(sarifReport(result, verdict(result), { toolVersion: '2.1.0' }))

    const schema = JSON.parse(readFileSync(join(FIXTURES, 'sarif-schema-2.1.0.json'), 'utf8'))
    const ajv = new Ajv({ strict: false, allErrors: true })
    const validate = ajv.compile(schema)
    const valid = validate(sarif)
    if (!valid) console.error(validate.errors?.slice(0, 5))
    expect(valid).toBe(true)
  })

  test('one rule per used type, level mirrors severity, files are relative URIs', () => {
    const result = seedBrokenTree()
    const sarif = JSON.parse(sarifReport(result, verdict(result), { toolVersion: '2.1.0' }))
    const run = sarif.runs[0]

    const ruleIds = run.tool.driver.rules.map((r) => r.id)
    expect(ruleIds).toEqual([...new Set(ruleIds)].sort())

    const drop = run.results.find((r) => r.ruleId === 'placeholder-missing')
    expect(drop.level).toBe('error')
    const untranslated = run.results.find((r) => r.ruleId === 'untranslated')
    expect(untranslated.level).toBe('warning')

    for (const r of run.results) {
      const uri = r.locations[0].physicalLocation.artifactLocation.uri
      expect(uri).not.toMatch(/^\//) // relative, not absolute
      expect(uri).not.toContain('\\')
    }
  })

  test('output is deterministic across runs', () => {
    const result = seedBrokenTree()
    const a = sarifReport(result, verdict(result), { toolVersion: 'x' })
    const b = sarifReport(result, verdict(result), { toolVersion: 'x' })
    expect(a).toBe(b)
  })
})

describe('JUnit reporter (gate S2)', () => {
  const parser = new XMLParser({ ignoreAttributes: false })

  test('errors are <failure>, warnings are NOT', () => {
    const result = seedBrokenTree()
    const xml = junitReport(result)
    const doc = parser.parse(xml)

    const suite = doc.testsuites.testsuite
    expect(suite['@_name']).toBe('es')
    expect(Number(doc.testsuites['@_failures'])).toBe(1)

    const testcase = suite.testcase
    expect(testcase.failure).toBeDefined() // the dropped placeholder
    expect(String(testcase['system-out'])).toContain('untranslated') // warning, not failure
  })

  test('hostile strings round-trip escaped', () => {
    // Make the hostile string itself the failure detail by dropping its tag.
    write('en.json', { terms: 'I agree to the <b>Terms</b> & "conditions" {{name}}' })
    write('fr.json', { terms: 'J\'accepte & "conditions"' })
    const result = runCheck({ input: dir, source: 'en' })
    const xml = junitReport(result)

    // Raw XML must not contain unescaped markup from the finding...
    const body = xml.split('<failure')[1]
    expect(body).not.toContain('<b>')
    // ...and a real parser must recover the original text.
    const doc = parser.parse(xml)
    const failure = doc.testsuites.testsuite.testcase.failure['#text']
    expect(failure).toContain('{{name}}')
    expect(String(xml)).toContain('&amp;')
  })
})

describe('--ignore-keys (gate S3)', () => {
  test('glob silences matching findings and stats are recomputed', () => {
    write('en.json', { 'footer.copyright': 'All rights reserved © {{year}}', other: 'Hello {{n}}' })
    write('de.json', { 'footer.copyright': 'All rights reserved © {{year}}', other: 'Hallo' })

    const noisy = runCheck({ input: dir, source: 'en' })
    expect(noisy.totals.warnings).toBe(1) // untranslated copyright
    expect(noisy.totals.errors).toBe(1) // dropped {{n}}

    const quiet = runCheck({ input: dir, source: 'en', ignoreKeys: '*.copyright' })
    expect(quiet.totals.warnings).toBe(0)
    expect(quiet.totals.errors).toBe(1) // non-matching finding untouched
  })

  test('ns:path form matches nested layouts', () => {
    const matches = compileIgnores('home:mcp.badge')
    expect(matches('home', 'mcp.badge')).toBe(true)
    expect(matches('docs', 'mcp.badge')).toBe(false)
  })

  test('an ignored missing key restores coverage', () => {
    write('en.json', { a: 'A text here', legacy: 'Old thing' })
    write('it.json', { a: 'Un testo qui' })
    const r = runCheck({ input: dir, source: 'en', ignoreKeys: 'legacy' })
    expect(r.totals.errors).toBe(0)
    expect(r.languages[0].stats.coverage).toBe(1)
  })
})

describe('format routing', () => {
  test('a directory of .arb files runs in arb mode (gate S5)', () => {
    write('app_en.arb', { '@@locale': 'en', greeting: 'Hello {name}', '@greeting': { description: 'hi' } })
    write('app_es.arb', { '@@locale': 'es', greeting: 'Hola' })
    const r = runCheck({ input: dir, source: 'en' })
    expect(r.layout).toBe('arb')
    const drop = r.languages[0].namespaces[0].findings.find((f) => f.type === 'placeholder-missing')
    expect(drop).toMatchObject({ path: 'greeting', missing: ['{name}'] })
  })

  test('an .xcstrings file runs in xcstrings mode with adapter findings merged (gate S6)', () => {
    write('Localizable.xcstrings', {
      sourceLanguage: 'en',
      strings: {
        'Open %@': {
          localizations: {
            es: { stringUnit: { state: 'needs_review', value: 'Abrir %@' } },
            de: { stringUnit: { state: 'translated', value: 'Öffnen' } },
          },
        },
      },
    })
    const r = runCheck({ input: join(dir, 'Localizable.xcstrings'), source: 'en' })
    expect(r.layout).toBe('xcstrings')

    const de = r.languages.find((l) => l.lang === 'de')
    expect(de.namespaces[0].findings.some((f) => f.type === 'placeholder-missing')).toBe(true)

    const es = r.languages.find((l) => l.lang === 'es')
    expect(es.namespaces[0].findings.some((f) => f.type === 'stale-translation')).toBe(true)
    expect(es.stats.warnings).toBeGreaterThan(0) // adapter findings count into stats
  })
})

describe('reporters never change exit semantics (gate S8)', () => {
  test('verdict is identical no matter which reporter serializes it', () => {
    const result = seedBrokenTree()
    const v = verdict(result, { failOn: 'error' })
    expect(v.ok).toBe(false)
    // Serializing with every reporter must not mutate the result or the verdict.
    sarifReport(result, v, { toolVersion: 'x' })
    junitReport(result)
    jsonReport(result, v)
    expect(verdict(result, { failOn: 'error' })).toEqual(v)
  })
})

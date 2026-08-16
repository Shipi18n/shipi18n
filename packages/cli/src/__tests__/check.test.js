/**
 * Tests for `shipi18n check` — layout discovery, findings, verdicts.
 * All fixtures are written to a temp dir; no network, no key.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverLayout, runCheck, verdict } from '../commands/check.js'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shipi18n-check-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (rel, data) => {
  const path = join(dir, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data))
}

describe('discoverLayout', () => {
  test('detects a flat layout from a directory', () => {
    write('en.json', { a: 'A' })
    write('es.json', { a: 'A' })
    const l = discoverLayout(dir, 'en')
    expect(l.layout).toBe('flat')
    expect(l.targets.map((t) => t.lang)).toEqual(['es'])
  })

  test('detects a nested layout from per-language directories', () => {
    write('en/common.json', { a: 'A' })
    write('en/home.json', { b: 'B' })
    write('fr/common.json', { a: 'A' })
    write('fr/home.json', { b: 'B' })
    const l = discoverLayout(dir, 'en')
    expect(l.layout).toBe('nested')
    expect(Object.keys(l.source).sort()).toEqual(['common', 'home'])
    expect(l.targets.map((t) => t.lang)).toEqual(['fr'])
  })

  test('a source file argument forces flat with its siblings', () => {
    write('en.json', { a: 'A' })
    write('de.json', { a: 'A' })
    const l = discoverLayout(join(dir, 'en.json'), 'ignored')
    expect(l.layout).toBe('flat')
    expect(l.sourceLang).toBe('en')
    expect(l.targets.map((t) => t.lang)).toEqual(['de'])
  })

  test('throws a usable error when no source locale exists', () => {
    write('es.json', { a: 'A' })
    expect(() => discoverLayout(dir, 'en')).toThrow(/no source locale found/)
  })
})

describe('runCheck', () => {
  test('clean tree reports zero errors and full coverage', () => {
    write('en.json', { greeting: 'Hello {{name}}' })
    write('es.json', { greeting: 'Hola {{name}}' })
    const r = runCheck({ input: dir, source: 'en' })
    expect(r.totals).toEqual({ errors: 0, warnings: 0 })
    expect(r.languages[0].stats.coverage).toBe(1)
  })

  test('finds dropped placeholders and missing keys across a nested tree', () => {
    write('en/common.json', { greeting: 'Hello {{name}}', bye: 'Goodbye friend' })
    write('es/common.json', { greeting: 'Hola amigo' })
    const r = runCheck({ input: dir, source: 'en' })
    const findings = r.languages[0].namespaces[0].findings
    expect(findings.map((f) => f.type).sort()).toEqual(['missing-key', 'placeholder-missing'])
    expect(r.totals.errors).toBe(2)
  })

  test('invalid JSON is a finding, not a crash', () => {
    write('en.json', { a: 'A' })
    write('it.json', '{ not json')
    const r = runCheck({ input: dir, source: 'en' })
    expect(r.languages[0].namespaces[0].findings[0].type).toBe('invalid-json')
    expect(r.totals.errors).toBe(1)
  })

  test('a missing namespace file is a finding', () => {
    write('en/common.json', { a: 'A' })
    write('en/home.json', { b: 'B' })
    write('de/common.json', { a: 'A' })
    const r = runCheck({ input: dir, source: 'en' })
    const home = r.languages[0].namespaces.find((n) => n.ns === 'home')
    expect(home.findings[0].type).toBe('missing-file')
  })
})

describe('whole-file failures and layout regressions (bug hunt 2026-08-16)', () => {
  test('H1: a missing namespace file means ZERO coverage, not 98%', () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, `String number ${i}`]))
    write('en/common.json', many)
    mkdirSync(join(dir, 'es'), { recursive: true })
    const r = runCheck({ input: dir, source: 'en' })
    expect(r.languages[0].stats.coverage).toBe(0)
  })

  test('H1b: an unparseable file means ZERO coverage', () => {
    write('en.json', { a: 'Aaa', b: 'Bbb', c: 'Ccc' })
    write('es.json', '{ broken')
    const r = runCheck({ input: dir, source: 'en' })
    expect(r.languages[0].stats.coverage).toBe(0)
  })

  test('H4: dot-directories (like the .shipi18n cache) are never languages', () => {
    write('en/a.json', { x: 'Hello there world' })
    write('es/a.json', { x: 'Hola mundo amigo' })
    mkdirSync(join(dir, '.shipi18n'), { recursive: true })
    const r = runCheck({ input: dir, source: 'en' })
    expect(r.languages.map((l) => l.lang)).toEqual(['es'])
  })
})

describe('verdict', () => {
  const result = (errors, warnings, coverage = 1) => ({
    totals: { errors, warnings },
    languages: [{ lang: 'es', stats: { errors, warnings, coverage } }],
  })

  test('fail-on error: errors fail, warnings pass', () => {
    expect(verdict(result(1, 0), { failOn: 'error' }).ok).toBe(false)
    expect(verdict(result(0, 3), { failOn: 'error' }).ok).toBe(true)
  })

  test('fail-on warning: warnings fail too', () => {
    expect(verdict(result(0, 1), { failOn: 'warning' }).ok).toBe(false)
  })

  test('fail-on none: nothing fails', () => {
    expect(verdict(result(5, 5), { failOn: 'none' }).ok).toBe(true)
  })

  test('min-coverage fails a language below the threshold', () => {
    const v = verdict(result(0, 0, 0.8), { failOn: 'error', minCoverage: 95 })
    expect(v.ok).toBe(false)
    expect(v.failures[0]).toMatch(/es coverage 80.0% < 95%/)
  })
})

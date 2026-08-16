/**
 * Manual-translation locks — gate T3.
 *
 * The scenario: a human fixes a translation by hand, locks it, and then a tool
 * (or another person) overwrites it. check must notice — as a WARNING, because
 * this protects human work and must never block a pipeline.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCheck } from '@shipi18n/core'
import { buildLocks, readLocks, writeLocks, locksFor } from '../commands/lock.js'
import { verdict } from '../commands/check.js'

let dir
let locksPath
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shipi18n-lock-'))
  locksPath = join(dir, 'locks.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (rel, data) => {
  const path = join(dir, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data))
}

const seed = () => {
  write('en.json', { greeting: 'Hello there', legal: 'By continuing you accept the terms' })
  write('es.json', { greeting: 'Hola', legal: 'Al continuar aceptas los términos' })
}

const lockAll = () => {
  const { locks } = buildLocks({ input: dir, source: 'en' })
  writeLocks(locksPath, locks)
  return locks
}

const findingsFor = (locks) => {
  const r = runCheck({ input: dir, source: 'en', locks })
  return r.languages[0].namespaces[0].findings
}

describe('lock round-trip (gate T3)', () => {
  test('locking then checking an unchanged tree produces no lock findings', () => {
    seed()
    const locks = lockAll()
    const types = findingsFor(locks).map((f) => f.type)
    expect(types).not.toContain('manual-translation-clobbered')
    expect(types).not.toContain('manual-translation-stale')
  })

  test('overwriting a locked translation is reported as clobbered — and only warns', () => {
    seed()
    const locks = lockAll()
    write('es.json', { greeting: 'Hola', legal: 'RETRADUCIDO POR UNA MÁQUINA' })

    const result = runCheck({ input: dir, source: 'en', locks })
    const hit = result.languages[0].namespaces[0].findings.find(
      (f) => f.type === 'manual-translation-clobbered'
    )
    expect(hit).toBeDefined()
    expect(hit.path).toBe('legal')
    expect(hit.severity).toBe('warning')
    // Crucially: the default verdict still passes. Locks never block CI.
    expect(verdict(result, { failOn: 'error' }).ok).toBe(true)
  })

  test('a changed SOURCE under a locked translation is reported as stale', () => {
    seed()
    const locks = lockAll()
    write('en.json', { greeting: 'Hello there', legal: 'By continuing you accept the NEW terms' })

    const hit = findingsFor(locks).find((f) => f.type === 'manual-translation-stale')
    expect(hit).toBeDefined()
    expect(hit.path).toBe('legal')
    expect(hit.severity).toBe('warning')
  })

  test('clobbering wins over staleness when both changed — work already lost', () => {
    seed()
    const locks = lockAll()
    write('en.json', { greeting: 'Hello there', legal: 'Different source entirely' })
    write('es.json', { greeting: 'Hola', legal: 'Traducción distinta' })

    const types = findingsFor(locks).map((f) => f.type)
    expect(types).toContain('manual-translation-clobbered')
    expect(types).not.toContain('manual-translation-stale')
  })

  test('unlocked keys are never reported', () => {
    seed()
    const { locks } = buildLocks({ input: dir, source: 'en', keys: 'legal' })
    write('es.json', { greeting: 'CAMBIADO', legal: 'Al continuar aceptas los términos' })

    const types = findingsFor(locks).map((f) => f.type)
    expect(types).not.toContain('manual-translation-clobbered')
  })
})

describe('lock file handling (gate T3)', () => {
  test('--keys globs narrow what gets locked', () => {
    seed()
    const { locks, total } = buildLocks({ input: dir, source: 'en', keys: 'legal' })
    expect(total).toBe(1)
    expect(Object.keys(locks.locked)[0]).toMatch(/legal$/)
  })

  test('--lang narrows to chosen languages', () => {
    seed()
    write('fr.json', { greeting: 'Salut', legal: 'En continuant vous acceptez' })
    const { locks } = buildLocks({ input: dir, source: 'en', langs: ['fr'] })
    expect(Object.keys(locks.locked).every((k) => k.startsWith('fr::'))).toBe(true)
  })

  test('a corrupt lock file is a cold start, never a crash', () => {
    writeFileSync(locksPath, '{ not json at all')
    expect(readLocks(locksPath).locked).toEqual({})
    expect(locksFor({ locks: locksPath })).toBeUndefined()
  })

  test('a future lock version is ignored rather than misread', () => {
    writeFileSync(locksPath, JSON.stringify({ version: 999, locked: { 'x y z': {} } }))
    expect(readLocks(locksPath).locked).toEqual({})
  })

  test('--no-locks disables loading entirely, in the shape commander produces', () => {
    seed()
    writeLocks(locksPath, lockAll())
    // Commander negates the paired --locks option, so --no-locks arrives as
    // `locks: false`. Testing only `noLocks: true` hid a real bug.
    expect(locksFor({ locks: false })).toBeUndefined()
    expect(locksFor({ locks: locksPath, noLocks: true })).toBeUndefined()
    expect(locksFor({ locks: locksPath })).toBeDefined() // still loads normally
  })

  test('re-locking is additive and refreshes hashes for the current state', () => {
    seed()
    const first = buildLocks({ input: dir, source: 'en' })
    write('es.json', { greeting: 'Hola', legal: 'Texto revisado a mano' })
    const second = buildLocks({ input: dir, source: 'en', existing: first.locks })

    expect(second.added).toBe(0) // same ids
    expect(second.total).toBe(first.total)
    // the refreshed hash means the new text is now the blessed one
    expect(findingsFor(second.locks).map((f) => f.type)).not.toContain('manual-translation-clobbered')
  })
})

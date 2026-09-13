import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runCheck } from '../tree.js'
import { verdict } from '../reporters.js'
import {
  applyPolicy,
  buildBaseline,
  findingFingerprint,
  parseSeverity,
  SEVERITY_LEVELS,
} from '../policy.js'

/**
 * A tiny two-language JSON layout with two real problems in `es`:
 *   - `saved` is missing entirely  → missing-key (error)
 *   - `greeting` drops the {name} placeholder → placeholder-missing (error)
 * That's a deterministic, no-LLM check result to run the policy layer against.
 */
function fixtureResult() {
  const dir = mkdtempSync(join(tmpdir(), 'shipi18n-policy-'))
  mkdirSync(join(dir, 'en'))
  mkdirSync(join(dir, 'es'))
  writeFileSync(join(dir, 'en', 'app.json'), JSON.stringify({ greeting: 'Hi {name}', saved: 'Saved' }))
  writeFileSync(join(dir, 'es', 'app.json'), JSON.stringify({ greeting: 'Hola' }))
  const result = runCheck({ input: dir, source: 'en' })
  rmSync(dir, { recursive: true, force: true })
  return result
}

const allFindings = (r) => r.languages.flatMap((l) => l.namespaces.flatMap((n) => n.findings))

describe('policy: parseSeverity', () => {
  test('parses a comma spec into a rule→level map', () => {
    expect(parseSeverity('untranslated=off, placeholder-added=error')).toEqual({
      untranslated: 'off',
      'placeholder-added': 'error',
    })
  })
  test('accepts every valid level and rejects junk', () => {
    for (const lvl of SEVERITY_LEVELS) expect(parseSeverity(`x=${lvl}`)).toEqual({ x: lvl })
    expect(() => parseSeverity('missing-key=fatal')).toThrow(/severity/)
    expect(() => parseSeverity('missing-key')).toThrow(/severity/)
  })
})

describe('policy: baseline', () => {
  test('the fixture starts red (errors present)', () => {
    const r = fixtureResult()
    expect(r.totals.errors).toBeGreaterThan(0)
    expect(verdict(r).ok).toBe(false)
  })

  test('a baseline of the current findings makes the same run pass (nothing NEW)', () => {
    const r = fixtureResult()
    const before = allFindings(r).length
    const baseline = buildBaseline(r)
    expect(baseline.count).toBe(before)

    const { suppressedByBaseline } = applyPolicy(r, { baseline })
    expect(suppressedByBaseline).toBe(before)
    expect(r.totals.errors).toBe(0)
    expect(verdict(r).ok).toBe(true)
    expect(allFindings(r)).toHaveLength(0)
  })

  test('a NEW finding not in the baseline still fails the build', () => {
    const baseline = buildBaseline(fixtureResult()) // baseline missing-key + placeholder
    const r = fixtureResult()
    // Inject a brand-new finding the baseline never saw.
    const ns = r.languages[0].namespaces[0]
    ns.findings.push({ type: 'placeholder-added', severity: 'error', path: 'brand.new', message: 'x' })

    const { suppressedByBaseline } = applyPolicy(r, { baseline })
    expect(suppressedByBaseline).toBeGreaterThan(0) // the old ones were suppressed
    expect(r.totals.errors).toBe(1) // ...but the new one survives
    expect(allFindings(r)).toHaveLength(1)
    expect(allFindings(r)[0].path).toBe('brand.new')
    expect(verdict(r).ok).toBe(false)
  })

  test('fingerprint is stable across runs and independent of the message text', () => {
    const a = findingFingerprint('es', 'app', { path: 'greeting', type: 'placeholder-missing', message: 'dropped {name}' })
    const b = findingFingerprint('es', 'app', { path: 'greeting', type: 'placeholder-missing', message: 'TOTALLY different wording' })
    expect(a).toBe(b)
    const c = findingFingerprint('es', 'app', { path: 'saved', type: 'placeholder-missing' })
    expect(a).not.toBe(c)
  })
})

describe('policy: per-rule severity', () => {
  test("severity=off removes a rule's findings and clears the verdict", () => {
    const r = fixtureResult()
    const { suppressedBySeverity } = applyPolicy(r, {
      severity: { 'missing-key': 'off', 'placeholder-missing': 'off' },
    })
    expect(suppressedBySeverity).toBeGreaterThan(0)
    expect(r.totals.errors).toBe(0)
    expect(verdict(r).ok).toBe(true)
  })

  test('downgrading errors to warning keeps them reported but passes with --fail-on error', () => {
    const r = fixtureResult()
    applyPolicy(r, { severity: { 'missing-key': 'warning', 'placeholder-missing': 'warning' } })
    expect(r.totals.errors).toBe(0)
    expect(r.totals.warnings).toBeGreaterThan(0)
    expect(verdict(r, { failOn: 'error' }).ok).toBe(true)
    expect(verdict(r, { failOn: 'warning' }).ok).toBe(false)
  })

  test('info is a real non-failing level: reported, never counted', () => {
    const r = fixtureResult()
    applyPolicy(r, { severity: { 'missing-key': 'info', 'placeholder-missing': 'info' } })
    expect(r.totals.errors).toBe(0)
    expect(r.totals.warnings).toBe(0)
    // findings still present in the tree (info), just not counted
    expect(allFindings(r).every((f) => f.severity === 'info')).toBe(true)
    expect(verdict(r, { failOn: 'warning' }).ok).toBe(true)
  })
})

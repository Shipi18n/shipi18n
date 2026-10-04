import { fixHints, withFixHints } from '../fixhints.js'
import { sarifReport, jsonReport, humanReport } from '../reporters.js'

const ns = (findings) => ({ layout: 'flat', source: 'en', languages: [{ lang: 'es', stats: { coverage: 1, errors: 1, warnings: 1 }, namespaces: [{ ns: 'translation', file: 'locales/es.json', findings }] }], totals: { errors: 1, warnings: 1 } })
const missing = { type: 'placeholder-missing', severity: 'error', path: 'a', missing: ['{count}'], message: 'dropped {count}' }
const added = { type: 'placeholder-added', severity: 'warning', path: 'a', added: ['{cuenta}'], message: 'unexpected {cuenta}' }

describe('fix hints', () => {
  test('a dropped + invented placeholder at one key is a rename', () => {
    expect(fixHints([missing, added])).toEqual(['rename {cuenta} to {count}', 'rename {cuenta} to {count}'])
  })
  test('an unpaired drop says restore', () => {
    expect(fixHints([missing])[0]).toBe('restore {count} exactly as written in the source')
  })
  test('pairing is per key', () => {
    expect(fixHints([missing, { ...added, path: 'b' }])).toEqual([
      'restore {count} exactly as written in the source',
      'remove {cuenta}, or use a placeholder the source has',
    ])
  })
  test('plural-forms names the form count from the source', () => {
    expect(fixHints([{ type: 'plural-forms', path: 'p', source: 'a | b | c' }])[0]).toMatch(/^write 3 forms/)
  })
  test('unknown rule types get no hint', () => {
    expect(fixHints([{ type: 'semantic-omission', path: 'x' }])).toEqual([undefined])
  })
  test('withFixHints does not mutate the result', () => {
    const r = ns([missing])
    withFixHints(r)
    expect(r.languages[0].namespaces[0].findings[0].fix).toBeUndefined()
  })
})

describe('reporters carry the hint', () => {
  const r = ns([missing, added])
  const v = { ok: false, failures: ['1 error(s)'] }
  test('json: fix on each finding', () => {
    const j = JSON.parse(jsonReport(r, v))
    expect(j.languages[0].namespaces[0].findings.map((f) => f.fix)).toEqual(['rename {cuenta} to {count}', 'rename {cuenta} to {count}'])
  })
  test('sarif: appended to the message', () => {
    const s = JSON.parse(sarifReport(r, v))
    expect(s.runs[0].results[0].message.text).toMatch(/Fix: rename \{cuenta\} to \{count\}\.$/)
  })
  test('human: printed once per key', () => {
    expect(humanReport(r, v).match(/fix: rename/g)).toHaveLength(1)
  })
})

test('XLIFF inline placeholders are named as markup in the fix', () => {
  const f = { type: 'placeholder-missing', path: 'k', missing: ['{x_INTERPOLATION}'] }
  expect(fixHints([f])[0]).toBe('restore <x id="INTERPOLATION"/> exactly as written in the source')
})

import { join } from 'node:path'
import { filterChanged } from '../policy.js'

const dir = '/repo/locales'
const lang = (l, errors) => ({ lang: l, stats: { coverage: 1, errors, warnings: 0 }, namespaces: [{ ns: 'translation', file: join(dir, `${l}.json`), findings: Array(errors).fill({ severity: 'error', type: 'placeholder-missing' }), stats: { sourceKeys: 2, errors, warnings: 0, coverage: 1 } }] })
const result = () => ({ dir, layout: 'flat', languages: [lang('de', 2), lang('es', 1), lang('fr', 0)], totals: { errors: 3, warnings: 0 } })

describe('filterChanged (--changed-only)', () => {
  test('keeps only changed target files and recomputes totals', () => {
    const r = result()
    expect(filterChanged(r, [join(dir, 'de.json'), '/repo/README.md'], { cwd: '/' })).toMatchObject({ filtered: true, kept: 1 })
    expect(r.languages.map((l) => l.lang)).toEqual(['de'])
    expect(r.totals.errors).toBe(2)
  })
  test('a changed source file keeps everything', () => {
    const r = result()
    expect(filterChanged(r, [join(dir, 'en.json')], { cwd: '/' })).toMatchObject({ filtered: false, sourceChanged: true })
    expect(r.languages).toHaveLength(3)
    expect(r.totals.errors).toBe(3)
  })
  test('nothing changed → nothing to report, verdict passes', () => {
    const r = result()
    filterChanged(r, [], { cwd: '/' })
    expect(r.languages).toHaveLength(0)
    expect(r.totals.errors).toBe(0)
  })
  test('non-locale files under the catalog do not count as a source change', () => {
    const r = result()
    expect(filterChanged(r, [join(dir, 'README.md')], { cwd: '/' })).toMatchObject({ sourceChanged: false, kept: 0 })
  })
})

/**
 * Locale integrity.
 *
 * These are the checks worth having in CI for any project whose translations are
 * generated: every language must have the same keys as the source, and every
 * placeholder in an English string must survive into each translation. A missing
 * key renders as a raw key name; a dropped placeholder renders as a wrong string.
 */
import en from '../locales/en.json'
import es from '../locales/es.json'
import fr from '../locales/fr.json'
import de from '../locales/de.json'

const LOCALES = { es, fr, de }

const flatten = (obj, prefix = '') =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' && !Array.isArray(v)
      ? { ...acc, ...flatten(v, key) }
      : { ...acc, [key]: v }
  }, {})

// The same syntaxes @shipi18n/core protects.
const PLACEHOLDERS = /(\{\{[^}]+\}\}|<\/?\d+>|%[0-9]+\$[sd]|%[sd]|\$t\([^)]+\))/g
const placeholdersIn = (s) => (typeof s === 'string' ? (s.match(PLACEHOLDERS) || []).sort() : [])

const enFlat = flatten(en)

describe.each(Object.keys(LOCALES))('%s locale', (lang) => {
  const flat = flatten(LOCALES[lang])

  it('has exactly the same keys as en', () => {
    expect(Object.keys(flat).sort()).toEqual(Object.keys(enFlat).sort())
  })

  it('preserves every placeholder from the source string', () => {
    for (const [key, value] of Object.entries(enFlat)) {
      const want = placeholdersIn(value)
      if (!want.length) continue
      expect(placeholdersIn(flat[key])).toEqual(want)
    }
  })

  it('actually translated something (is not just a copy of en)', () => {
    const changed = Object.keys(enFlat).filter((k) => flat[k] !== enFlat[k])
    expect(changed.length).toBeGreaterThan(Object.keys(enFlat).length / 2)
  })

  it('keeps both plural forms', () => {
    expect(flat['dashboard.items_one']).toBeTruthy()
    expect(flat['dashboard.items_other']).toBeTruthy()
  })
})

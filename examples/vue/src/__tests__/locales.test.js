/**
 * Locale integrity for the files vite-plugin-shipi18n generates.
 *
 * These are the checks worth keeping in CI for any generated translations: same
 * keys as the source, placeholders intact, plural forms present, and the output
 * is not simply a copy of English.
 */
import en from '../locales/en/translation.json'
import es from '../locales/es/translation.json'
import fr from '../locales/fr/translation.json'
import de from '../locales/de/translation.json'

const GENERATED = { es, fr, de }

const flatten = (obj, prefix = '') =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' ? { ...acc, ...flatten(v, key) } : { ...acc, [key]: v }
  }, {})

// vue-i18n uses single-brace interpolation: {name}, {count}
const PLACEHOLDERS = /\{\w+\}/g
const phIn = (s) => (typeof s === 'string' ? (s.match(PLACEHOLDERS) || []).sort() : [])

const enFlat = flatten(en)

describe.each(Object.keys(GENERATED))('%s translation.json', (lang) => {
  const flat = flatten(GENERATED[lang])

  it('has exactly the same keys as en', () => {
    expect(Object.keys(flat).sort()).toEqual(Object.keys(enFlat).sort())
  })

  it('preserves every {placeholder}', () => {
    for (const [key, value] of Object.entries(enFlat)) {
      if (!phIn(value).length) continue
      expect(phIn(flat[key])).toEqual(phIn(value))
    }
  })

  it('keeps the vue-i18n pipe plural separator with both forms', () => {
    // vue-i18n pluralises on a single pipe-separated string — NOT i18next's
    // _one/_other keys. If the model eats the pipe, the plural silently breaks.
    const forms = String(flat['items']).split('|')
    expect(forms).toHaveLength(2)
    for (const form of forms) expect(form).toContain('{count}')
  })

  it('is actually translated, not a copy of English', () => {
    const changed = Object.keys(enFlat).filter((k) => flat[k] !== enFlat[k])
    expect(changed.length).toBeGreaterThan(Object.keys(enFlat).length / 2)
  })
})

describe('source locale', () => {
  it('uses vue-i18n single-brace interpolation', () => {
    expect(enFlat['greeting']).toContain('{name}')
    expect(enFlat['items']).toContain('{count}')
  })

  it('uses pipe syntax for plurals, not i18next _one/_other keys', () => {
    expect(enFlat['items']).toContain('|')
    expect(enFlat['items_one']).toBeUndefined()
    expect(enFlat['items_other']).toBeUndefined()
  })
})

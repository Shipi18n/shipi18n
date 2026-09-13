import { checkJedSync, isJed } from '../formats/wp-jed.js'

// A .po carrying: a plain string, a context-qualified string, and a plural.
const PO = `msgid ""
msgstr ""
"Language: es\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

msgid "Save"
msgstr "Guardar"

msgctxt "button"
msgid "Save"
msgstr "Guardar (botón)"

msgid "%s item"
msgid_plural "%s items"
msgstr[0] "%s artículo"
msgstr[1] "%s artículos"
`

// The JED JSON `wp i18n make-json` would produce from an IN-SYNC .po. Note the
// context key uses gettext's \\u0004 separator; plural forms are array elements.
function jedInSync() {
  return {
    domain: 'messages',
    locale_data: {
      messages: {
        '': { domain: 'messages', lang: 'es', 'plural-forms': 'nplurals=2; plural=(n != 1);' },
        Save: ['Guardar'],
        ['button\u0004Save']: ['Guardar (botón)'],
        '%s item': ['%s artículo', '%s artículos'],
      },
    },
  }
}

describe('wp-jed: isJed', () => {
  test('accepts a JED object, rejects plain JSON', () => {
    expect(isJed(jedInSync())).toBe(true)
    expect(isJed({ greeting: 'Hi' })).toBe(false)
    expect(isJed(null)).toBe(false)
  })
})

describe('wp-jed: sync check', () => {
  test('an in-sync JED produces zero findings (singular, context, and plural all match)', () => {
    const r = checkJedSync(PO, jedInSync())
    expect(r.findings).toHaveLength(0)
    expect(r.stats.checked).toBe(3)
    expect(r.stats.drift).toBe(0)
    expect(r.stats.orphan).toBe(0)
    expect(r.domain).toBe('messages')
  })

  test('a stale singular translation is caught as jed-drift (the make-json-not-rerun bug)', () => {
    const jed = jedInSync()
    jed.locale_data.messages.Save = ['Guardar VIEJO'] // .po says "Guardar"
    const r = checkJedSync(PO, jed)
    const drift = r.findings.filter((f) => f.type === 'jed-drift')
    expect(drift).toHaveLength(1)
    expect(drift[0].severity).toBe('error')
    expect(drift[0].path).toBe('Save')
    expect(drift[0].source).toBe('Guardar') // current .po value
    expect(drift[0].translation).toBe('Guardar VIEJO') // stale JSON value
  })

  test('a stale PLURAL form drifts independently of the singular', () => {
    const jed = jedInSync()
    jed.locale_data.messages['%s item'] = ['%s artículo', '%s items VIEJO'] // form 1 stale
    const r = checkJedSync(PO, jed)
    const drift = r.findings.filter((f) => f.type === 'jed-drift')
    expect(drift).toHaveLength(1)
    expect(drift[0].path).toContain('[form 1]')
  })

  test('context disambiguates: the plain and button "Save" are compared separately', () => {
    const jed = jedInSync()
    jed.locale_data.messages['button\u0004Save'] = ['MAL'] // only the context one drifts
    const r = checkJedSync(PO, jed)
    const drift = r.findings.filter((f) => f.type === 'jed-drift')
    expect(drift).toHaveLength(1)
    expect(drift[0].path).toContain('button')
    expect(drift[0].path).toContain('Save')
  })

  test('a JED string missing from the .po is a jed-orphan (warning), not a drift', () => {
    const jed = jedInSync()
    jed.locale_data.messages['Removed string'] = ['Cadena eliminada']
    const r = checkJedSync(PO, jed)
    const orphans = r.findings.filter((f) => f.type === 'jed-orphan')
    expect(orphans).toHaveLength(1)
    expect(orphans[0].severity).toBe('warning')
    expect(orphans[0].path).toBe('Removed string')
  })

  test('a .po-only string (PHP-only) is NOT flagged — JED is a legitimate subset', () => {
    const po = PO + '\nmsgid "PHP only notice"\nmsgstr "Aviso solo de PHP"\n'
    const r = checkJedSync(po, jedInSync())
    expect(r.findings).toHaveLength(0) // extra .po entry must not create a finding
    expect(r.stats.poEntries).toBeGreaterThan(r.stats.jedEntries)
  })

  test('non-JED JSON yields a single invalid-file error, not a crash', () => {
    const r = checkJedSync(PO, { just: 'a plain locale', greeting: 'Hi' })
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0].type).toBe('invalid-file')
  })
})

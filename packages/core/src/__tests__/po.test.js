import { parsePo } from '../formats/po.js'
import { checkTranslations } from '../check.js'

describe('gettext PO adapter', () => {
  const po = `# a translator comment
msgid ""
msgstr ""
"Language: es\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

msgid "Hello %s"
msgstr "Hola"

msgid "Save"
msgstr ""

#, fuzzy
msgid "Cancel"
msgstr "Cancelar"

msgctxt "menu"
msgid "File"
msgstr "Archivo"

msgid "%d item"
msgid_plural "%d items"
msgstr[0] "%d artículo"
msgstr[1] "artículos"
`

  const parsed = parsePo(po)

  test('reads header language and nplurals', () => {
    expect(parsed.language).toBe('es')
    expect(parsed.nplurals).toBe(2)
  })

  test('msgctxt disambiguates the key (context + separator + msgid)', () => {
    const key = Object.keys(parsed.source).find((k) => k.includes('menu') && k.endsWith('File'))
    expect(key).toBeDefined()
    expect(key).not.toBe('File') // it is context-qualified, not the bare msgid
    expect(parsed.source[key]).toBe('File')
    expect(parsed.target[key]).toBe('Archivo')
  })

  test('generic check catches dropped placeholder and empty msgstr', () => {
    const { findings } = checkTranslations({ source: parsed.source, target: parsed.target, targetLang: 'es' })
    expect(findings.some((f) => f.type === 'placeholder-missing' && f.path === 'Hello %s')).toBe(true)
    expect(findings.some((f) => f.type === 'empty-value' && f.path === 'Save')).toBe(true)
  })

  test('fuzzy entries surface a stale-translation warning', () => {
    expect(parsed.findings).toContainEqual(
      expect.objectContaining({ type: 'stale-translation', path: 'Cancel', severity: 'warning' })
    )
  })

  test('plural form with a dropped placeholder is flagged', () => {
    const drop = parsed.findings.find((f) => f.type === 'placeholder-missing' && /\[plural 1\]/.test(f.path))
    expect(drop).toBeDefined()
    expect(drop.missing).toContain('%d')
  })
})

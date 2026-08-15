import { extractPlaceholders, validatePlaceholders } from '../placeholders.js'
import { parseArbBundle, arbLangFromFilename, stripArbMetadata } from '../formats/arb.js'
import { parseXcstrings } from '../formats/xcstrings.js'
import { checkTranslations } from '../check.js'

describe('Apple format specifiers (gate S4)', () => {
  test('extracts %@ and %lld', () => {
    expect(extractPlaceholders('Save %@ to %lld files')).toEqual(['%@', '%lld'])
  })

  test('extracts positional %1$@ and %2$lld, precision %.2f, %llu and %ld', () => {
    expect(extractPlaceholders('%1$@ took %2$lld ms')).toEqual(['%1$@', '%2$lld'])
    expect(extractPlaceholders('score %.2f, count %llu of %ld')).toEqual(['%.2f', '%ld', '%llu'])
  })

  test('pre-existing syntaxes are unchanged', () => {
    expect(extractPlaceholders('Hi {{name}}, {count} of %d done, %1$s, $t(a.b), %{x}')).toEqual(
      ['$t(a.b)', '%1$s', '%d', '%{x}', '{count}', '{{name}}'].sort()
    )
  })

  test('dropped %@ is reported as missing', () => {
    const r = validatePlaceholders('Open %@', 'Abrir el archivo')
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['%@'])
  })
})

describe('ARB adapter (gate S5)', () => {
  const en = {
    '@@locale': 'en',
    greeting: 'Hello {name}',
    '@greeting': { placeholders: { name: { type: 'String' } } },
    items: '{count} items',
  }
  const es = { '@@locale': 'es', greeting: 'Hola', items: '{count} elementos' }

  test('language from filename, including regional underscore form', () => {
    expect(arbLangFromFilename('app_en.arb')).toBe('en')
    expect(arbLangFromFilename('intl_pt_BR.arb')).toBe('pt-BR')
    expect(arbLangFromFilename('nolang.arb')).toBeNull()
  })

  test('metadata keys are stripped and produce no findings', () => {
    expect(Object.keys(stripArbMetadata(en)).sort()).toEqual(['greeting', 'items'])
  })

  test('bundle + check catches the seeded dropped {name}', () => {
    const { languages } = parseArbBundle({ 'app_en.arb': en, 'app_es.arb': es })
    const r = checkTranslations({ source: languages.en, target: languages.es, targetLang: 'es' })
    const drops = r.findings.filter((f) => f.type === 'placeholder-missing')
    expect(drops).toHaveLength(1)
    expect(drops[0]).toMatchObject({ path: 'greeting', missing: ['{name}'] })
    // no findings about metadata
    expect(r.findings.some((f) => f.path.startsWith('@'))).toBe(false)
  })

  test('falls back to @@locale when the filename has no language', () => {
    const { languages, files } = parseArbBundle({ 'strings.arb': { '@@locale': 'fr', a: 'A' } })
    expect(Object.keys(languages)).toEqual(['fr'])
    expect(files.fr).toBe('strings.arb')
  })
})

describe('xcstrings adapter (gate S6)', () => {
  const catalog = {
    sourceLanguage: 'en',
    version: '1.0',
    strings: {
      'Hello %@': {
        localizations: {
          es: { stringUnit: { state: 'translated', value: 'Hola %@' } },
          de: { stringUnit: { state: 'translated', value: 'Hallo' } }, // seeded: dropped %@
        },
      },
      'Save changes now': {
        localizations: {
          de: { stringUnit: { state: 'translated', value: 'Änderungen jetzt speichern' } },
          // es localization missing entirely → missing-key
        },
      },
      'Needs another look': {
        localizations: {
          es: { stringUnit: { state: 'needs_review', value: 'Necesita revisión' } },
          de: { stringUnit: { state: 'new', value: '' } }, // untranslated → missing
        },
      },
      '%lld files': {
        localizations: {
          en: {
            variations: {
              plural: {
                one: { stringUnit: { state: 'translated', value: '%lld file' } },
                other: { stringUnit: { state: 'translated', value: '%lld files' } },
              },
            },
          },
          ru: {
            variations: {
              plural: {
                one: { stringUnit: { state: 'translated', value: '%lld файл' } },
                few: { stringUnit: { state: 'translated', value: '%lld файла' } },
                many: { stringUnit: { state: 'translated', value: 'файлов' } }, // seeded: dropped %lld in an extra CLDR category
                other: { stringUnit: { state: 'translated', value: '%lld файла' } },
              },
            },
          },
        },
      },
    },
  }

  const parsed = parseXcstrings(catalog)

  test('the key is the source string when no explicit source localization exists', () => {
    expect(parsed.source['Hello %@']).toBe('Hello %@')
  })

  test('missing localization and state "new" both surface as missing keys', () => {
    const es = checkTranslations({ source: parsed.source, target: parsed.languages.es, targetLang: 'es' })
    const missing = es.findings.filter((f) => f.type === 'missing-key').map((f) => f.path)
    expect(missing).toContain('Save changes now')

    const de = checkTranslations({ source: parsed.source, target: parsed.languages.de, targetLang: 'de' })
    const deMissing = de.findings.filter((f) => f.type === 'missing-key').map((f) => f.path)
    expect(deMissing).toContain('Needs another look')
  })

  test('seeded dropped %@ is a placeholder error', () => {
    const de = checkTranslations({ source: parsed.source, target: parsed.languages.de, targetLang: 'de' })
    const drop = de.findings.find((f) => f.type === 'placeholder-missing' && f.path === 'Hello %@')
    expect(drop).toBeDefined()
    expect(drop.missing).toEqual(['%@'])
  })

  test('needs_review yields a stale-translation warning from the adapter', () => {
    expect(parsed.findings).toContainEqual(
      expect.objectContaining({ lang: 'es', path: 'Needs another look', type: 'stale-translation', severity: 'warning' })
    )
  })

  test('extra CLDR plural categories are not orphans, but their placeholders are still checked', () => {
    const ru = checkTranslations({ source: parsed.source, target: parsed.languages.ru, targetLang: 'ru' })
    expect(ru.findings.filter((f) => f.type === 'orphan-key')).toHaveLength(0)
    const adapterDrop = parsed.findings.find(
      (f) => f.lang === 'ru' && f.type === 'placeholder-missing' && f.path === '%lld files.plural.many'
    )
    expect(adapterDrop).toBeDefined()
  })

  test('intact plural variation produces no findings for shared categories', () => {
    const ru = checkTranslations({ source: parsed.source, target: parsed.languages.ru, targetLang: 'ru' })
    expect(ru.findings.filter((f) => f.path.startsWith('%lld files') && f.severity === 'error')).toHaveLength(0)
  })
})

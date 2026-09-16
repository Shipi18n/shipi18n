import { validatePlaceholders, extractPlaceholders, detectFormat, FORMATS } from '../placeholders.js'
import { checkTranslations } from '../check.js'
import { unwrapLocaleRoot, RAILS_ROOT } from '../tree.js'

const byType = (r, t) => r.findings.filter((f) => f.type === t)

// FP#8–#11 were found by the 2026-09-17 refill scan (lotti, omni-tools,
// stream-chat-react, ollama-app, witsy). Each test uses the real string.

describe('FP#8 — a placeholder nested inside an ICU option counts as present', () => {
  test('lotti es: {total} moved inside a plural branch', () => {
    const r = validatePlaceholders('{completed} / {total} done', '{completed, plural, =1{1 / {total} hecho} other{{completed} / {total} hechos}}', { format: 'icu' })
    expect(r.ok).toBe(true)
  })
  test('lotti fr: source plain, translation wraps in plural on a different arg', () => {
    const r = validatePlaceholders('{decided} of {total} reviewed', '{total, plural, =1{{decided} sur {total} examinée} other{{decided} sur {total} examinées}}', { format: 'icu' })
    expect(r.ok).toBe(true)
  })
  test('a genuinely dropped arg inside ICU still flags', () => {
    const r = validatePlaceholders('{a} of {b}', '{b, plural, one{# x} other{# y}}', { format: 'icu' })
    expect(r.missing).toEqual(['{a}'])
  })
})

describe('FP#9 — whitespace and format specs inside {{ }} are not identity', () => {
  test('omni-tools de: {{ plural }} vs {{plural}}', () => {
    expect(validatePlaceholders('{{count}} page{{ plural }} will be extracted', '{{count}} Seite{{plural}} wird extrahiert', { format: 'i18next' }).ok).toBe(true)
  })
  test('stream-chat-react de: {{ moreCount }} vs {{moreCount}}', () => {
    expect(validatePlaceholders('{{ commaSeparatedUsers }} and {{ moreCount }} more', '{{ commaSeparatedUsers }} und {{moreCount}} mehr', { format: 'i18next' }).ok).toBe(true)
  })
  test('{{count, number}} is the variable count', () => {
    expect(validatePlaceholders('{{count, number}} items', '{{count}} Artikel', { format: 'i18next' }).ok).toBe(true)
  })
  test('a renamed {{x}} still flags', () => {
    const r = validatePlaceholders('max {{max}} chars', 'máximo {{mix}} caracteres', { format: 'i18next' })
    expect(r.missing).toEqual(['{{max}}'])
    expect(r.added).toEqual(['{{mix}}'])
  })
})

describe('FP#10 — Ruby %{x} must not fire inside ICU/ARB strings', () => {
  test('ollama-app tr: Turkish puts % before the number', () => {
    expect(validatePlaceholders('download at {percent}%', '%{percent} oranında indir', { format: 'icu' }).ok).toBe(true)
  })
  test('rails grammar still reads %{x}', () => {
    const r = validatePlaceholders('%{names} became unavailable.', 'Um item está indisponível', { format: 'rails' })
    expect(r.missing).toEqual(['%{names}'])
  })
  test('rails grammar ignores printf-looking text', () => {
    expect(validatePlaceholders('100% done', '100% fertig', { format: 'rails' }).ok).toBe(true)
  })
})

describe('FP#11 — vue-i18n literal escapes', () => {
  test("en {'{'}input{'}'} renders literal braces; fr keeps the escape → clean", () => {
    expect(validatePlaceholders("{'{'}input{'}'} will be substituted", "{'{'}input{'}'} sera remplacé", { format: 'vue' }).ok).toBe(true)
  })
  test('witsy de: writing {input} where en escapes it IS a real added variable', () => {
    const r = validatePlaceholders("{'{'}input{'}'} will be substituted", '{input} wird ersetzt', { format: 'vue' })
    expect(r.added).toEqual(['{input}'])
  })
})

describe('format grammars are isolated', () => {
  test('apple grammar: positional ≡ sequential, overflow flagged', () => {
    expect(validatePlaceholders('%@.%@ seconds', '%1$@.%2$@ vteřin', { format: 'apple' }).ok).toBe(true)
    expect(validatePlaceholders('%@% (%@ minimum)', '%1$@%2$ (%3$@ min)', { format: 'apple' }).added).toEqual(['%3$@'])
  })
  test('android grammar: %2$s dropped', () => {
    expect(validatePlaceholders('by <b>%1$s</b>:\n%2$s', 'da <b>%1$s</b>.', { format: 'android' }).missing).toEqual(['%2$s'])
  })
  test('gettext grammar: %(name)s and python {0}', () => {
    expect(validatePlaceholders('%(count)d files in {dir}', '%(count)d Dateien', { format: 'gettext' }).missing).toEqual(['{dir}'])
  })
  test('brace grammar (unknown JSON) still catches translated variable names', () => {
    const r = validatePlaceholders('{shortcut} to clear', '{raccourci} pour effacer', { format: 'brace' })
    expect(r.missing).toEqual(['{shortcut}'])
    expect(r.added).toEqual(['{raccourci}'])
  })
  test('generic (default) is the old union — backward compatible', () => {
    expect(extractPlaceholders('Hi {{name}}, {count} of %s, %{x}')).toEqual(['%s', '%{x}', '{count}', '{{name}}'])
  })
  test('every format name resolves', () => {
    for (const f of Object.keys(FORMATS)) expect(validatePlaceholders('a', 'b', { format: f }).ok).toBe(true)
  })
})

describe('detectFormat sniffs the source strings', () => {
  test('i18next / rails / brace / generic', () => {
    expect(detectFormat(['Hi {{name}}', 'Bye'])).toBe('i18next')
    expect(detectFormat(['%{names} became unavailable'])).toBe('rails')
    expect(detectFormat(['Hello {name}', '{count, plural, one {#} other {#}}'])).toBe('brace')
    expect(detectFormat(['%s items', '{name}'])).toBe('generic')
    expect(detectFormat([], { ext: 'yml' })).toBe('rails')
    expect(detectFormat(['x'], { unwrappedRailsRoot: true })).toBe('rails')
  })
})

describe('Rails root-key unwrap (tree loader)', () => {
  test('en.yml → { en: {…} } is unwrapped and marked', () => {
    const d = unwrapLocaleRoot({ en: { spree: { hello: 'Hi %{name}' } } }, 'en')
    expect(d.spree.hello).toBe('Hi %{name}')
    expect(d[RAILS_ROOT]).toBe('en')
    expect(Object.keys(d)).toEqual(['spree']) // marker is non-enumerable
  })
  test('pt-BR.yml with pt_BR root, and a bare locale-looking root', () => {
    expect(unwrapLocaleRoot({ pt_BR: { a: 1 } }, 'pt-BR')).toEqual({ a: 1 })
    expect(unwrapLocaleRoot({ 'zh-Hant': { a: 1 } }, 'other')).toEqual({ a: 1 })
  })
  test('multi-key roots and nulls are left alone / emptied', () => {
    expect(unwrapLocaleRoot({ a: 1, b: 2 }, 'en')).toEqual({ a: 1, b: 2 })
    expect(unwrapLocaleRoot(null, 'bs')).toEqual({})
  })
  test('two unwrapped Rails files compare key-for-key', () => {
    const en = unwrapLocaleRoot({ en: { spree: { names: '%{names} became unavailable.' } } }, 'en')
    const pt = unwrapLocaleRoot({ 'pt-BR': { spree: { names: 'Um item está indisponível' } } }, 'pt-BR')
    const r = checkTranslations({ source: en, target: pt, targetLang: 'pt-BR', format: 'rails' })
    expect(byType(r, 'missing-key')).toEqual([])
    expect(byType(r, 'placeholder-missing')[0]).toMatchObject({ missing: ['%{names}'] })
  })
})

describe('policy tiers', () => {
  test('plural simplified to one form is a warning, not an error (thunder)', () => {
    const r = checkTranslations({ source: { account: '{count, plural, zero {Account} one {Account} other {Accounts} }' }, target: { account: 'Tili' }, targetLang: 'fi', format: 'icu' })
    expect(byType(r, 'placeholder-missing')[0]).toMatchObject({ severity: 'warning' })
  })
  test('but a non-plural arg dropped alongside stays an error', () => {
    const r = checkTranslations({ source: { k: '{count, plural, one {# by {user}} other {# by {user}}}' }, target: { k: 'many' }, targetLang: 'de', format: 'icu' })
    expect(byType(r, 'placeholder-missing')[0]).toMatchObject({ severity: 'error' })
  })
  test('English suffix variable {plural} / {{ plural }} dropped → warning', () => {
    const a = checkTranslations({ source: { k: 'Replaced in {count} playlist{plural}.' }, target: { k: '{count} 個のプレイリストで置換しました。' }, targetLang: 'ja', format: 'icu' })
    expect(byType(a, 'placeholder-missing')[0]).toMatchObject({ severity: 'warning' })
    const b = checkTranslations({ source: { k: '{{count}} page{{ plural }} rotated' }, target: { k: '{{count}} पृष्ठ घुमाया' }, targetLang: 'hi', format: 'i18next' })
    expect(byType(b, 'placeholder-missing')[0]).toMatchObject({ severity: 'warning' })
  })
  test('i18next _one suffix omitting {{count}} → warning', () => {
    const r = checkTranslations({ source: { votes_one: '{{count}} vote' }, target: { votes_one: '1 voto' }, targetLang: 'es', format: 'i18next' })
    expect(byType(r, 'placeholder-missing')[0]).toMatchObject({ severity: 'warning' })
  })
})

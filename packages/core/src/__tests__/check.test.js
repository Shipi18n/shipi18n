import { checkTranslations } from '../check.js'

const types = (r) => r.findings.map((f) => f.type).sort()
const byType = (r, t) => r.findings.filter((f) => f.type === t)

describe('checkTranslations', () => {
  test('clean translation produces no findings and full coverage', () => {
    const r = checkTranslations({
      source: { a: 'Hello {{name}}', nested: { b: 'You have {count} items' }, n: 5 },
      target: { a: 'Hola {{name}}', nested: { b: 'Tienes {count} elementos' }, n: 5 },
      targetLang: 'es',
    })
    expect(r.findings).toEqual([])
    expect(r.stats.coverage).toBe(1)
    expect(r.stats.errors).toBe(0)
  })

  test('missing key is an error and lowers coverage', () => {
    const r = checkTranslations({
      source: { a: 'One', b: 'Two' },
      target: { a: 'Uno' },
      targetLang: 'es',
    })
    expect(byType(r, 'missing-key')).toHaveLength(1)
    expect(byType(r, 'missing-key')[0]).toMatchObject({ path: 'b', severity: 'error' })
    expect(r.stats.coverage).toBe(0.5)
  })

  test('orphan key in the target is a warning', () => {
    const r = checkTranslations({
      source: { a: 'One' },
      target: { a: 'Uno', stale: 'Viejo' },
    })
    expect(byType(r, 'orphan-key')[0]).toMatchObject({ path: 'stale', severity: 'warning' })
  })

  test('dropped placeholder is an error, invented one a warning', () => {
    const r = checkTranslations({
      source: { a: 'Hello {{name}}', b: 'Plain text here' },
      target: { a: 'Hola amigo', b: 'Texto {{extra}} aquí' },
    })
    expect(byType(r, 'placeholder-missing')[0]).toMatchObject({
      path: 'a',
      severity: 'error',
      missing: ['{{name}}'],
    })
    expect(byType(r, 'placeholder-added')[0]).toMatchObject({
      path: 'b',
      severity: 'warning',
      added: ['{{extra}}'],
    })
  })

  test('collapsed vue-i18n pipe plural is an error', () => {
    const r = checkTranslations({
      source: { items: 'You have {count} item | You have {count} items' },
      target: { items: 'Tienes {count} elementos' },
      targetLang: 'es',
    })
    expect(byType(r, 'plural-forms')[0]).toMatchObject({ path: 'items', severity: 'error' })
  })

  test('a literal pipe in prose (SEO title) is NOT treated as a plural', () => {
    const r = checkTranslations({
      source: { title: 'i18n & Localization Blog | Shipi18n' },
      target: { title: 'Blog - API de traducción de Shipi18n' },
    })
    expect(byType(r, 'plural-forms')).toHaveLength(0)
  })

  test('preserved pipe plural passes', () => {
    const r = checkTranslations({
      source: { items: 'You have {count} item | You have {count} items' },
      target: { items: 'Tienes {count} elemento | Tienes {count} elementos' },
    })
    expect(byType(r, 'plural-forms')).toHaveLength(0)
  })

  test('empty translation of a non-empty source is an error', () => {
    const r = checkTranslations({ source: { a: 'Hello' }, target: { a: '  ' } })
    expect(byType(r, 'empty-value')[0]).toMatchObject({ path: 'a', severity: 'error' })
  })

  test('identical multi-word string warns; short labels do not', () => {
    const r = checkTranslations({
      source: { long: 'Save all changes now', short: 'OK', brand: 'GitHub' },
      target: { long: 'Save all changes now', short: 'OK', brand: 'GitHub' },
    })
    expect(byType(r, 'untranslated')).toHaveLength(1)
    expect(byType(r, 'untranslated')[0].path).toBe('long')
  })

  test('type mismatch is a warning and does not crash the remaining checks', () => {
    const r = checkTranslations({
      source: { a: 'text', n: 5 },
      target: { a: 'texto', n: 'five' },
    })
    expect(byType(r, 'type-mismatch')[0]).toMatchObject({ path: 'n', severity: 'warning' })
  })

  test('multiple problems on one key are all reported', () => {
    const r = checkTranslations({
      source: { a: 'Hi {{name}}, {count} new | Hi {{name}}, {count} news' },
      target: { a: 'Hola' },
    })
    const t = types(r)
    expect(t).toContain('placeholder-missing')
    expect(t).toContain('plural-forms')
  })
})

import { describe as d2, test as t2, expect as e2 } from '@jest/globals'
d2('ICU MessageFormat (P6)', () => {
  const check = (source, target, targetLang = 'es') =>
    checkTranslations({ source, target, targetLang }).findings.map((f) => f.type)

  t2('flags missing CLDR plural categories for the locale (warning)', () => {
    const f = check(
      { n: '{count, plural, one {# item} other {# items}}' },
      { n: '{count, plural, one {# элемент} other {# элементов}}' },
      'ru'
    )
    e2(f).toContain('plural-category')
  })

  t2('a complete Russian plural is clean', () => {
    const f = check(
      { n: '{count, plural, one {# item} other {# items}}' },
      { n: '{count, plural, one {# элемент} few {# элемента} many {# элементов} other {# элемента}}' },
      'ru'
    )
    e2(f).not.toContain('plural-category')
    e2(f).not.toContain('placeholder-missing')
  })

  t2('ICU select sub-messages are NOT read as placeholders (regression fix)', () => {
    const f = check(
      { g: '{gender, select, male {he} female {she} other {they}}' },
      { g: '{gender, select, male {él} female {ella} other {elle}}' }
    )
    e2(f).not.toContain('placeholder-missing')
    e2(f).not.toContain('placeholder-added')
  })

  t2('dropped ICU argument is placeholder-missing', () => {
    const f = check(
      { m: 'Hi {name}, {count, plural, one {# msg} other {# msgs}}' },
      { m: 'Hola, {count, plural, one {# msg} other {# msgs}}' }
    )
    e2(f).toContain('placeholder-missing')
  })

  t2('malformed ICU in a translation is icu-invalid', () => {
    const f = check(
      { n: '{count, plural, one {# item} other {# items}}' },
      { n: '{count, plural, one {# elemento' }
    )
    e2(f).toContain('icu-invalid')
  })

  t2('English one/other plural stays clean (no false positive on complete locales)', () => {
    const f = check(
      { n: '{count, plural, one {# item} other {# items}}' },
      { n: '{count, plural, one {# elemento} other {# elementos}}' },
      'es'
    )
    e2(f).not.toContain('plural-category')
  })
})

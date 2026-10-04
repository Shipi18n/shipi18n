import { checkTranslations } from '../check.js'

// Key-based plurals (i18next `_one`/`_other` suffixes; nested `one:`/`other:` in Rails
// YAML, Android <plurals>, .xcstrings). Each language has its own CLDR categories.
const en = { items_one: '{{count}} item', items_other: '{{count}} items', title: 'Cart' }
const run = (target, targetLang, source = en) => checkTranslations({ source, target, targetLang, format: 'i18next' })
const types = (r) => r.findings.map((f) => `${f.type}:${f.path}`)

describe('i18next suffix plurals', () => {
  test('Japanese with only _other is complete (one category)', () => {
    const r = run({ items_other: '{{count}} 件', title: 'カート' }, 'ja')
    expect(r.findings).toEqual([])
    expect(r.stats.coverage).toBe(1)
  })

  test('Polish _few/_many are not orphans', () => {
    const r = run(
      { items_one: '{{count}} produkt', items_few: '{{count}} produkty', items_many: '{{count}} produktów', items_other: '{{count}} produktu', title: 'Koszyk' },
      'pl'
    )
    expect(r.findings).toEqual([])
  })

  test('Polish with only one/other warns, naming the keys to add', () => {
    const r = run({ items_one: '{{count}} produkt', items_other: '{{count}} produktów', title: 'Koszyk' }, 'pl')
    expect(r.findings).toHaveLength(1)
    const [f] = r.findings
    expect(f.type).toBe('plural-category')
    expect(f.severity).toBe('warning')
    expect(f.path).toBe('items')
    expect(f.keys).toEqual(['items_few', 'items_many'])
    expect(r.stats.errors).toBe(0)
  })

  test('an extra form is checked against the source "other"', () => {
    const r = run(
      { items_one: '{{count}} produkt', items_few: 'kilka produktów', items_many: '{{count}} produktów', items_other: '{{count}} produktu', title: 'Koszyk' },
      'pl'
    )
    expect(types(r)).toEqual(['placeholder-missing:items_few'])
    expect(r.findings[0].severity).toBe('warning') // only the count dropped
  })

  test('an extra form dropping a non-count placeholder is an error', () => {
    const src = { shared_one: '{{actor}} shared {{count}} post', shared_other: '{{actor}} shared {{count}} posts' }
    const r = checkTranslations({
      source: src,
      target: { shared_one: '{{actor}} udostępnił {{count}} post', shared_few: 'udostępnił {{count}} posty', shared_many: '{{actor}} udostępnił {{count}} postów', shared_other: '{{actor}} udostępnił {{count}} posta' },
      targetLang: 'pl',
      format: 'i18next',
    })
    expect(r.findings.map((f) => `${f.type}:${f.path}:${f.severity}`)).toEqual(['placeholder-missing:shared_few:error'])
  })

  test('Arabic "two" without the number is a warning, not an error', () => {
    const src = { mins: { one: '%{count} minute', other: '%{count} minutes' } }
    const ar = { mins: { zero: '%{count} دقيقة', one: 'دقيقة', two: 'دقيقتان', few: '%{count} دقائق', many: '%{count} دقيقة', other: '%{count} دقيقة' } }
    const r = checkTranslations({ source: src, target: ar, targetLang: 'ar', format: 'rails' })
    expect(r.stats.errors).toBe(0)
    expect(r.findings.filter((f) => f.path === 'mins.two').map((f) => f.severity)).toEqual(['warning'])
  })

  test('French and Spanish are not asked for "many" (millions only)', () => {
    expect(run({ items_one: '{{count}} article', items_other: '{{count}} articles', title: 'Panier' }, 'fr').findings).toEqual([])
    // …but i18next generates _many for them, and it is not an orphan
    const r = run({ items_one: '{{count}} artículo', items_many: '{{count}} de artículos', items_other: '{{count}} artículos', title: 'Carrito' }, 'es')
    expect(r.findings).toEqual([])
  })

  test('Hebrew is not asked for the dual (two); a written one is not an orphan', () => {
    expect(run({ items_one: 'פריט אחד', items_other: '{{count}} פריטים', title: 'עגלה' }, 'he').findings.filter((f) => f.type !== 'placeholder-missing')).toEqual([])
    const r = run({ items_one: 'פריט אחד', items_two: 'שני פריטים', items_other: '{{count}} פריטים', title: 'עגלה' }, 'he')
    expect(r.findings.filter((f) => f.type === 'orphan-key' || f.type === 'plural-category')).toEqual([])
  })

  test('a form the language does not have is still an orphan', () => {
    const r = run({ items_one: '{{count}} Artikel', items_few: '{{count}} Artikel', items_other: '{{count}} Artikel', title: 'Korb' }, 'de')
    expect(types(r)).toEqual(['orphan-key:items_few'])
  })

  test('a source category the target language needs is still a missing key', () => {
    const r = run({ items_other: '{{count}} produktów', title: 'Koszyk' }, 'pl')
    expect(types(r)).toContain('missing-key:items_one')
  })

  test('a fully untranslated plural reports the missing keys, not a category warning', () => {
    const r = run({ title: 'カート' }, 'ja')
    expect(types(r)).toEqual(['missing-key:items_other'])
  })

  test('_zero in the source stays required', () => {
    const src = { ...en, items_zero: 'No items' }
    const r = run({ items_other: '{{count}} 件', title: 'カート' }, 'ja', src)
    expect(types(r)).toEqual(['missing-key:items_zero'])
  })

  test('ordinal suffixes use ordinal rules', () => {
    const src = { place_ordinal_one: '{{count}}st', place_ordinal_two: '{{count}}nd', place_ordinal_few: '{{count}}rd', place_ordinal_other: '{{count}}th' }
    // Polish ordinals have one category: only _other is needed
    const r = checkTranslations({ source: src, target: { place_ordinal_other: '{{count}}.' }, targetLang: 'pl', format: 'i18next' })
    expect(r.findings).toEqual([])
  })

  test('a lone *_other key is a word, not a plural', () => {
    const src = { gender_other: 'Other', gender_female: 'Female' }
    const r = checkTranslations({ source: src, target: { gender_other: 'Inna', gender_female: 'Kobieta' }, targetLang: 'pl' })
    expect(r.findings).toEqual([])
  })

  test('an unknown language label keeps key-by-key behavior', () => {
    const r = run({ items_other: '{{count}} x', title: 'x' }, 'target')
    expect(types(r)).toContain('missing-key:items_one')
  })

  test('underscore locale names resolve (pt_BR)', () => {
    const r = run({ items_one: '{{count}} produto', items_other: '{{count}} produtos', title: 'Carrinho' }, 'pt_BR')
    expect(r.findings).toEqual([])
  })
})

describe('nested plural keys (Rails YAML, Android, xcstrings)', () => {
  const src = { cart: { items: { one: '%{count} item', other: '%{count} items' } } }

  test('Russian with only one/other warns', () => {
    const r = checkTranslations({ source: src, target: { cart: { items: { one: '%{count} товар', other: '%{count} товаров' } } }, targetLang: 'ru', format: 'rails' })
    expect(types(r)).toEqual(['plural-category:cart.items'])
    expect(r.findings[0].keys).toEqual(['cart.items.few', 'cart.items.many'])
  })

  test('Russian with all forms passes; Japanese with only other passes', () => {
    const ru = { cart: { items: { one: '%{count} товар', few: '%{count} товара', many: '%{count} товаров', other: '%{count} товара' } } }
    expect(checkTranslations({ source: src, target: ru, targetLang: 'ru', format: 'rails' }).findings).toEqual([])
    expect(checkTranslations({ source: src, target: { cart: { items: { other: '%{count}件' } } }, targetLang: 'ja', format: 'rails' }).findings).toEqual([])
  })

  test('an object mixing category names with other keys is not a plural', () => {
    const s = { poll: { one: 'Option one', other: 'Something else', title: 'Vote' } }
    const t = { poll: { one: 'Opcja pierwsza', other: 'Coś innego', title: 'Głosuj' } }
    expect(checkTranslations({ source: s, target: t, targetLang: 'pl' }).findings).toEqual([])
  })
})

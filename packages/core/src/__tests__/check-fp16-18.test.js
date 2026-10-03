import { checkTranslations } from '../check.js'
import { checkICU } from '../icu.js'

// Found 2026-10-03 by refill scan #2 (npmx.dev, unifideck, nametag).
const run = (source, target, targetLang, format = 'vue') =>
  checkTranslations({ source, target, targetLang, format }).findings

describe('FP#16 — more pipe forms than the source, from custom pluralRules', () => {
  const zeroOneOther = 'No packages found | Found 1 package | Found {count} packages'
  test('Arabic with 6 forms (npmx.dev)', () => {
    const ar = '{count} | واحدة | حزمتين | {count} حزم | {count} حزمة | {count} حزمة'
    expect(run({ k: zeroOneOther }, { k: ar }, 'ar').filter((f) => f.type === 'plural-forms')).toHaveLength(0)
  })
  test('Czech with 3 forms for a 2-form source', () => {
    const cs = '{count} odpověď | {count} odpovědi | {count} odpovědí'
    expect(run({ k: '{count} reply | {count} replies' }, { k: cs }, 'cs-CZ').filter((f) => f.type === 'plural-forms')).toHaveLength(0)
  })
  test('a zero form on top of the language categories (npmx pl)', () => {
    const pl = 'Nie znaleziono pakietów | Znaleziono 1 pakiet | Znaleziono {count} pakiety | Znaleziono {count} pakietów | Znaleziono {count} pakietu'
    expect(run({ k: 'Found 1 package | Found {count} packages' }, { k: pl }, 'pl').filter((f) => f.type === 'plural-forms')).toHaveLength(0)
  })
  test('a zero form may itself show the count (npmx pl "{count} odpowiedzi")', () => {
    const pl = '{count} odpowiedzi | {count} odpowiedź | {count} odpowiedzi | {count} odpowiedzi | {count} odpowiedzi'
    expect(run({ k: '{count} reply | {count} replies' }, { k: pl }, 'pl-PL').filter((f) => f.type === 'plural-forms')).toHaveLength(0)
  })
  test('no zero-form allowance without a count argument (nocodb eu)', () => {
    const src = 'Imported {inserted} row, {failed} failed | Imported {inserted} rows, {failed} failed'
    const eu = '{inserted} ilara | {failed} ilara {inserted} ilarak | {failed} ilara'
    expect(run({ k: src }, { k: eu }, 'eu').filter((f) => f.type === 'plural-forms')).toHaveLength(1)
  })
  test('more forms than the language can ever select is still an error', () => {
    const de = 'a {count} | b {count} | c {count} | d {count}'
    expect(run({ k: '{count} reply | {count} replies' }, { k: de }, 'de').filter((f) => f.type === 'plural-forms')).toHaveLength(1)
  })
  test('fewer forms still an error where the language needs them', () => {
    expect(run({ k: '{count} reply | {count} replies' }, { k: '{count} Antworten' }, 'de').filter((f) => f.type === 'plural-forms')).toHaveLength(1)
  })
})

describe('FP#17 — translator-note keys are not UI text', () => {
  test('_comment is skipped (unifideck)', () => {
    const f = run({ captureLogs: { _comment: 'One button calls capture({{count}}, {{files}})', title: 'Capture {{count}} logs' } },
      { captureLogs: { _comment: 'note (de-DE)', title: '{{count}} Logs erfassen' } }, 'de', 'i18next')
    expect(f).toHaveLength(0)
  })
  test('a real key that merely contains "comment" is still checked', () => {
    const f = run({ comment: { count: '{{count}} comments' } }, { comment: { count: 'Kommentare' } }, 'de', 'i18next')
    expect(f.some((x) => x.type === 'placeholder-missing')).toBe(true)
  })
})

describe('FP#18 — an exact =1 covers `one` where `one` only ever means 1', () => {
  const src = '{count, plural, =1 {1 contact pending import.} other {# contacts pending import.}}'
  test('German =1 covers one (nametag)', () => {
    const t = '{count, plural, =1 {1 Kontakt wartet auf Import.} other {# Kontakte warten auf Import.}}'
    expect(checkICU(src, t, 'de-DE', 'k').filter((f) => f.type === 'plural-category')).toHaveLength(0)
  })
  test('Russian =1 does not cover one (21, 31… are one too)', () => {
    const t = '{count, plural, =1 {1 контакт} other {# контактов}}'
    expect(checkICU(src, t, 'ru', 'k').some((f) => f.type === 'plural-category' && /one/.test(f.message))).toBe(true)
  })
})

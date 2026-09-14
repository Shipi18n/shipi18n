import { validatePlaceholders } from '../placeholders.js'
import { checkTranslations } from '../check.js'
import { flatten } from '../translate.js'

const byType = (r, t) => r.findings.filter((f) => f.type === t)

// FP#3–#7 were found scanning the fixlist repos (Chatwoot, Mastodon, Solidus,
// Phoenix iOS) on 2026-09-13 — see ENGAGEMENT/FIXLIST_FEASIBILITY.md.

describe('FP#3 — a repeated NAMED placeholder is one variable, not N slots', () => {
  test('vue-i18n pipe plural: source repeats {n} per form, translation has one form', () => {
    // Chatwoot de components.json PAGINATION_FOOTER.SHOWING — 150+ bogus reports
    const r = validatePlaceholders(
      'Showing {startItem} - {endItem} of {totalItems} item | Showing {startItem} - {endItem} of {totalItems} items',
      'Zeige {startItem} - {endItem} von {totalItems} Einträgen'
    )
    expect(r.ok).toBe(true)
  })

  test('Rails %{x} used twice in source, once in translation', () => {
    // Mastodon pl admin_mailer.auto_close_registrations.body
    const r = validatePlaceholders('registrations on %{instance} … to prevent %{instance} from …', 'rejestracje na %{instance} wymagają …')
    expect(r.ok).toBe(true)
  })

  test('the pipe-plural collapse is still reported — as plural-forms, once', () => {
    const r = checkTranslations({
      source: { k: '{n} item | {n} items' },
      target: { k: '{n} Einträge' },
      targetLang: 'de',
    })
    expect(byType(r, 'plural-forms')).toHaveLength(1)
    expect(byType(r, 'placeholder-missing')).toHaveLength(0)
  })

  test('a genuinely dropped named placeholder still flags', () => {
    expect(validatePlaceholders('{a} and {b}', '{a} und').missing).toEqual(['{b}'])
  })
})

describe('FP#5 — printf positional ≡ sequential', () => {
  test('%@ %@ is satisfied by %1$@ %2$@ (Phoenix iOS cs/es/fr)', () => {
    expect(validatePlaceholders('%@.%@ seconds', '%1$@.%2$@ vteřin').ok).toBe(true)
  })

  test('reordering with positional args is correct, not a drop', () => {
    expect(validatePlaceholders("The address is for %@, but you're on %@", 'Vous êtes sur %2$@, mais l’adresse est pour %1$@').ok).toBe(true)
  })

  test('bare printf still counts slots: "%s %s" → "%s" drops the 2nd', () => {
    const r = validatePlaceholders('%s of %s', '%s')
    expect(r.missing).toEqual(['%s'])
  })

  test('a slot beyond the source arity is an unexpected argument (real iOS crash)', () => {
    // Phoenix iOS cs "%@% (%@ minimum)" → "%1$@%2$ (%3$@ minimálně)"
    const r = validatePlaceholders('%@% (%@ minimum)', '%1$@%2$ (%3$@ minimálně)')
    expect(r.missing).toEqual(['%@'])
    expect(r.added).toEqual(['%3$@'])
  })

  test('Android %1$s / %2$s: dropping the second is still reported', () => {
    // Phoenix Android it lnurl_pay_error_invalid_malformed
    const r = validatePlaceholders('The invoice returned by <b>%1$s</b> is malformed:\n%2$s', 'La fattura restituita da <b>%1$s</b> è malformata.')
    expect(r.missing).toEqual(['%2$s'])
  })

  test('display text is the token as written on each side', () => {
    const r = validatePlaceholders('Host: %@', 'Hôte :')
    expect(r.missing).toEqual(['%@'])
  })
})

describe('FP#4 — null values and null roots', () => {
  test('a null translation of a string is empty-value, not type-mismatch (Solidus bg)', () => {
    const r = checkTranslations({
      source: { a: { b: 'Base Amount' } },
      target: { a: { b: null } },
      targetLang: 'bg',
    })
    expect(byType(r, 'type-mismatch')).toHaveLength(0)
    expect(byType(r, 'empty-value')).toHaveLength(1)
  })

  test('a null SOURCE value is ignored', () => {
    const r = checkTranslations({ source: { a: null }, target: { a: 'x' } })
    expect(r.findings).toEqual([])
  })

  test('a null locale root does not throw (Mastodon config/locales)', () => {
    expect(flatten(null)).toEqual({})
    expect(() => checkTranslations({ source: { a: 'x' }, target: null, targetLang: 'bs' })).not.toThrow()
  })
})

describe('FP#6 — strftime format keys are not placeholder strings', () => {
  test('Rails time.formats / date.formats are skipped', () => {
    const r = checkTranslations({
      source: { time: { formats: { short: "%b %-d '%y %-l:%M%P" } }, date: { formats: { default: '%Y-%m-%d' } } },
      target: { time: { formats: { short: "%d %b '%y %H:%M" } }, date: { formats: { default: '%d.%m.%Y' } } },
      targetLang: 'it',
    })
    expect(r.findings.filter((f) => f.type.startsWith('placeholder'))).toEqual([])
  })

  test('a %{x} elsewhere in the same file is still checked', () => {
    const r = checkTranslations({
      source: { time: { formats: { short: '%b %-d' } }, greeting: 'Hi %{name}' },
      target: { time: { formats: { short: '%d %b' } }, greeting: 'Ciao' },
    })
    expect(byType(r, 'placeholder-missing').map((f) => f.path)).toEqual(['greeting'])
  })
})

describe('FP#7 — CLDR singular forms may omit the count (soft)', () => {
  test('.one dropping only {count} is a warning, .other stays an error', () => {
    const r = checkTranslations({
      source: { posts: { one: '{count} post', other: '{count} posts' } },
      target: { posts: { one: 'הודעה אחת', other: 'הודעות' } },
      targetLang: 'he',
    })
    const one = r.findings.find((f) => f.path === 'posts.one')
    const other = r.findings.find((f) => f.path === 'posts.other')
    expect(one).toMatchObject({ type: 'placeholder-missing', severity: 'warning' })
    expect(other).toMatchObject({ type: 'placeholder-missing', severity: 'error' })
  })

  test('.one dropping a NON-count placeholder is still an error', () => {
    const r = checkTranslations({
      source: { x: { one: '{count} file from {user}' } },
      target: { x: { one: 'one file' } },
    })
    expect(r.findings[0]).toMatchObject({ type: 'placeholder-missing', severity: 'error' })
  })
})

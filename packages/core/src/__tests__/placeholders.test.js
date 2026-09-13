import { validatePlaceholders } from '../placeholders.js'
import { checkTranslations } from '../check.js'

describe('validatePlaceholders: ICU-argument reconciliation (real-world FP)', () => {
  // Found by scanning real repos (Immich ca.json): a translation that upgrades a
  // plain {count} to a correct ICU plural was wrongly reported as "dropped {count}".
  test('a plain {x} upgraded to an ICU plural is NOT a dropped placeholder', () => {
    const r = validatePlaceholders('{count} items moved', '{count, plural, one {# element} other {# elements}}')
    expect(r.ok).toBe(true)
    expect(r.missing).toEqual([])
    expect(r.added).toEqual([])
  })

  test('the reverse (source ICU plural, translation plain {x}) is also clean', () => {
    const r = validatePlaceholders('{count, plural, one {# item} other {# items}}', '{count} coses')
    expect(r.ok).toBe(true)
  })

  test('number ICU arg reconciles at the placeholder level', () => {
    expect(validatePlaceholders('{amount} due', '{amount, number, ::currency/EUR} adeudado').ok).toBe(true)
  })

  // Select sub-messages carry translated text in braces, so reconciliation for
  // select is the check.js pipeline's job (it routes ICU strings); verify there.
  test('an ICU select translation produces no placeholder findings (pipeline)', () => {
    const { findings } = checkTranslations({
      source: { k: '{g, select, male {He} female {She} other {They}}' },
      target: { k: '{g, select, male {Él} female {Ella} other {Ellos}}' },
      targetLang: 'es',
    })
    expect(findings.filter((f) => f.type.startsWith('placeholder'))).toEqual([])
  })

  test('does NOT over-suppress: a genuinely dropped {x} still flags when a DIFFERENT var is used', () => {
    const r = validatePlaceholders('{count} left', '{gender, select, male {He} other {They}} left')
    expect(r.missing).toContain('{count}')
  })

  test('real bugs still flag — renamed single-brace variable', () => {
    const r = validatePlaceholders('Connected to {name}', 'Gekoppel aan {naam}')
    expect(r.missing).toContain('{name}')
    expect(r.added).toContain('{naam}')
  })

  test('real bugs still flag — renamed double-brace variable', () => {
    const r = validatePlaceholders('max {{max}} chars', 'máximo {{mix}} caracteres')
    expect(r.missing).toContain('{{max}}')
    expect(r.added).toContain('{{mix}}')
  })

  test('printf placeholders are unaffected by the ICU logic', () => {
    expect(validatePlaceholders('Loaded %d of %s', 'Cargados %d de %s').ok).toBe(true)
    expect(validatePlaceholders('Loaded %d of %s', 'Cargados %d').missing).toContain('%s')
  })
})

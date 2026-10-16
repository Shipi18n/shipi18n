import { checkTranslations } from '../check.js'

const byType = (r, t) => r.findings.filter((f) => f.type === t)

// FP#19 (2026-10-13): good_job es/fr/ru set `number.format.delimiter: " "` against
// en ",". A space is the CLDR thousands separator for those locales, not a gap.

describe('FP#19 — a whitespace thousands separator is not an empty translation', () => {
  const source = { number: { format: { delimiter: ',', separator: '.' } } }
  const run = (delimiter, targetLang = 'fr') =>
    checkTranslations({
      source,
      target: { number: { format: { delimiter, separator: ',' } } },
      targetLang,
      format: 'rails',
    })

  test.each([
    ['space', ' '],
    ['no-break space U+00A0', ' '],
    ['narrow no-break space U+202F', ' '],
  ])('%s for "," is not flagged', (_, delimiter) => {
    const r = run(delimiter)
    expect(byType(r, 'empty-value')).toHaveLength(0)
    expect(r.stats.errors).toBe(0)
  })

  test('an empty string for "," is still empty', () => {
    expect(byType(run(''), 'empty-value')).toHaveLength(1)
  })

  test('a space for a real word is still an empty translation', () => {
    const r = checkTranslations({ source: { title: 'Hello' }, target: { title: ' ' }, targetLang: 'de', format: 'brace' })
    const empties = byType(r, 'empty-value')
    expect(empties).toHaveLength(1)
    expect(empties[0].severity).toBe('error')
  })
})

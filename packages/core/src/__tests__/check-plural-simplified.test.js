import { checkTranslations } from '../check.js'

// 2026-10-03: a single form that keeps the variables is a simplification (warn);
// a single form holding both sentences is the separator lost (error).
const plural = (src, tr, lang) =>
  checkTranslations({ source: { k: src }, target: { k: tr }, targetLang: lang, format: 'vue' })
    .findings.filter((f) => f.type === 'plural-forms')

describe('single-form plurals', () => {
  test('simplification is a warning (npmx es)', () => {
    const f = plural('{count} more dependency | {count} more dependencies', '{count} dependencias más', 'es')
    expect(f).toHaveLength(1)
    expect(f[0].severity).toBe('warning')
    expect(f[0].message).toMatch(/one form for every count/)
  })
  test('both sentences merged is still an error (nocodb sv)', () => {
    const f = plural('{count} filter | {count} filters', '{count} filter <unk> {count} filter', 'sv')
    expect(f).toHaveLength(1)
    expect(f[0].severity).toBe('error')
  })
  test('a wrong number of separated forms is still an error', () => {
    const f = plural('a {count} | b {count}', 'a {count} | b {count} | c {count} | d {count}', 'de')
    expect(f[0].severity).toBe('error')
  })
})

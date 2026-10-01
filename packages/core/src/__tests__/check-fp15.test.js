import { checkTranslations } from '../check.js'

// FP#15, found 2026-09-28/10-01 on Hoppscotch (cn) and Chatwoot (zh_CN, zh_TW):
// languages with a single plural category translate a pipe plural as one form,
// which is correct. nocodb's ja and zh-Hant show the case that must stay an error:
// one "form" that is really both sentences with the separator lost.

const run = (source, target, targetLang) =>
  checkTranslations({ source: { k: source }, target: { k: target }, targetLang, format: 'vue' })
    .findings.filter((f) => f.type === 'plural-forms')

describe('FP#15 — single-category languages may use one plural form', () => {
  const src = 'Inheriting from {count} collection | Inheriting from {count} collections'

  test.each([['zh'], ['zh_CN'], ['zh-TW'], ['ja'], ['ko'], ['cn'], ['tw']])('%s: one form is fine', (lang) => {
    expect(run(src, '从 {count} 个集合继承', lang)).toHaveLength(0)
  })

  test('several placeholders, still one form (Chatwoot zh_CN pagination)', () => {
    const s = 'Showing {startItem} - {endItem} of {totalItems} item | Showing {startItem} - {endItem} of {totalItems} items'
    expect(run(s, '显示第 {startItem} - {endItem} 项，共 {totalItems} 项', 'zh_CN')).toHaveLength(0)
  })

  test('both sentences run together is still an error (nocodb ja)', () => {
    const s = 'Drop here to create {count} new record | Drop here to create {count} new records'
    const t = '{count} 新しいレコードを作成するにはここにドロップします。 {count} 新しいレコードを作成するにはここにドロップします'
    expect(run(s, t, 'ja')).toHaveLength(1)
  })

  test('full-width bar is not a separator (nocodb zh-Hant)', () => {
    expect(run('{count} day | {count} days', '{count} 日｜ {count} 日', 'zh-Hant')).toHaveLength(1)
  })

  test('languages with one/other still need both forms', () => {
    expect(run(src, 'Erbt von {count} Sammlungen', 'de')).toHaveLength(1)
    expect(run(src, 'Herda de {count} coleções', 'pt_BR')).toHaveLength(1)
  })
})

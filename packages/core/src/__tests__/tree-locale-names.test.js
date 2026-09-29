import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { flatLayout } from '../tree.js'
import { checkICU } from '../icu.js'

// Found 2026-09-28 on 24pullrequests: pt_br.yml, zh_Hans.yml and zh_Hant.yml
// were dropped from the language list without a word, so 4 real interpolation
// bugs in them went unreported while every other locale was checked.

const dirWith = (names) => {
  const dir = mkdtempSync(join(tmpdir(), 'shipi18n-names-'))
  for (const n of names) writeFileSync(join(dir, n), '{}')
  return dir
}
const langs = (dir) => flatLayout(dir, 'en').targets.map((t) => t.lang).sort()

describe('flat layout — underscore locale names', () => {
  test('Rails/POSIX underscore names are languages', () => {
    const dir = dirWith(['en.yml', 'pt_br.yml', 'zh_Hans.yml', 'zh_Hant.yml', 'en_US.json', 'es_419.json', 'sr_Latn_RS.yml'])
    expect(langs(dir)).toEqual(['en_US', 'es_419', 'pt_br', 'sr_Latn_RS', 'zh_Hans', 'zh_Hant'])
  })

  test('hyphenated names still work', () => {
    expect(langs(dirWith(['en.json', 'pt-BR.json', 'zh-Hant-TW.json']))).toEqual(['pt-BR', 'zh-Hant-TW'])
  })

  test('underscore companions are not languages', () => {
    const dir = dirWith(['en.json', 'de.json', 'app_config.json', 'de_formal.json', 'glossary.json', 'simple_form.en.yml'])
    expect(langs(dir)).toEqual(['de'])
  })
})

describe('ICU plural categories for underscore locale tags', () => {
  test('ru_RU still requires few/many', () => {
    const f = checkICU('{n, plural, one {# file} other {# files}}', '{n, plural, one {# файл} other {# файлов}}', 'ru_RU', 'k')
    expect(f.some((x) => /few|many/.test(x.message))).toBe(true)
  })
})

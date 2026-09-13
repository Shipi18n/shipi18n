import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { androidEscapingFindings } from '../formats/android.js'
import { runCheck } from '../tree.js'

const xml = (body) => `<resources>${body}</resources>`
const types = (xmlStr) => androidEscapingFindings(xmlStr).map((f) => f.type)

describe('androidEscapingFindings', () => {
  test('a bare apostrophe is the AAPT compile error', () => {
    const f = androidEscapingFindings(xml(`<string name="a">C'est la vie</string>`))
    expect(f).toHaveLength(1)
    expect(f[0].type).toBe('android-unescaped-apostrophe')
    expect(f[0].severity).toBe('error')
    expect(f[0].path).toBe('a')
  })

  test('a backslash-escaped apostrophe is clean', () => {
    // JS `\\'` → the two characters \' in the XML text
    expect(androidEscapingFindings(xml(`<string name="a">C\\'est la vie</string>`))).toHaveLength(0)
  })

  test('a fully "…"-wrapped string may contain apostrophes', () => {
    expect(androidEscapingFindings(xml(`<string name="a">"C'est la vie"</string>`))).toHaveLength(0)
  })

  test('an unbalanced double-quote is flagged', () => {
    expect(types(xml(`<string name="a">say "hi there</string>`))).toEqual(['android-unbalanced-quote'])
  })

  test('an escaped double-quote is clean', () => {
    expect(androidEscapingFindings(xml(`<string name="a">say \\"hi\\" now</string>`))).toHaveLength(0)
  })

  test('plural items are checked and pathed by quantity', () => {
    const f = androidEscapingFindings(
      xml(`<plurals name="n"><item quantity="one">%d élément</item><item quantity="other">%d d'éléments</item></plurals>`)
    )
    expect(f).toHaveLength(1)
    expect(f[0].path).toBe('n[other]')
  })

  test('string-array items are checked and pathed by index', () => {
    const f = androidEscapingFindings(xml(`<string-array name="days"><item>lundi</item><item>c'est mardi</item></string-array>`))
    expect(f).toHaveLength(1)
    expect(f[0].path).toBe('days[1]')
  })

  test('translatable="false" entries are skipped', () => {
    expect(androidEscapingFindings(xml(`<string name="a" translatable="false">C'est</string>`))).toHaveLength(0)
  })

  test('clean copy with placeholders produces nothing', () => {
    expect(androidEscapingFindings(xml(`<string name="a">Hello %1$s, you have %2$d</string>`))).toHaveLength(0)
  })
})

describe('runCheck: Android escaping surfaces per target', () => {
  test('a bare apostrophe in values-fr is reported against that language', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shipi18n-android-'))
    try {
      mkdirSync(join(dir, 'values'))
      mkdirSync(join(dir, 'values-fr'))
      writeFileSync(join(dir, 'values', 'strings.xml'), xml(`<string name="greet">Welcome</string>`))
      writeFileSync(join(dir, 'values-fr', 'strings.xml'), xml(`<string name="greet">C'est parti</string>`))
      const result = runCheck({ input: dir, source: 'en' })
      const fr = result.languages.find((l) => l.lang === 'fr')
      const f = fr.namespaces.flatMap((n) => n.findings).find((x) => x.type === 'android-unescaped-apostrophe')
      expect(f).toBeTruthy()
      expect(f.path).toBe('greet')
      expect(fr.stats.errors).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

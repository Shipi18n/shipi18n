import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseAndroidStrings } from '../formats/android.js'
import { parseXliff } from '../formats/xliff.js'
import { runCheck } from '../tree.js'

describe('format-adapter security', () => {
  const XXE = `<?xml version="1.0"?>
<!DOCTYPE r [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<resources><string name="p">&xxe;</string></resources>`

  test('external entities (XXE) are refused, never resolved to file contents', () => {
    expect(() => parseAndroidStrings(XXE)).toThrow()
    expect(() => parseXliff(XXE)).toThrow() // (not a valid xliff either, but must not read the file)
  })

  test('internal entity expansion (billion laughs) does not blow up', () => {
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
]>
<resources><string name="x">&lol4;</string></resources>`
    const r = parseAndroidStrings(bomb)
    expect((r.x || '').length).toBeLessThan(100) // no exponential expansion
  })

  test('crafted __proto__ / constructor keys do not pollute Object.prototype', () => {
    parseAndroidStrings('<resources><string name="__proto__">x</string><string name="constructor">y</string></resources>')
    expect({}.polluted).toBeUndefined()
    expect(Object.prototype.polluted).toBeUndefined()
  })

  test('a malformed target file is reported as invalid-file, not a crash, and other locales still check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shipi18n-sec-'))
    try {
      mkdirSync(join(dir, 'values'))
      mkdirSync(join(dir, 'values-es'))
      mkdirSync(join(dir, 'values-fr'))
      writeFileSync(join(dir, 'values', 'strings.xml'), '<resources><string name="a">Hi</string></resources>')
      writeFileSync(join(dir, 'values-es', 'strings.xml'), '<resources><string name="a">Hola</string></resources>')
      writeFileSync(join(dir, 'values-fr', 'strings.xml'), XXE) // malicious: external entity → refused
      const r = runCheck({ input: dir, source: 'en' })
      const fr = r.languages.find((l) => l.lang === 'fr')
      expect(fr.namespaces[0].findings.some((f) => f.type === 'invalid-file')).toBe(true)
      // es (valid) is still present and checked
      expect(r.languages.find((l) => l.lang === 'es')).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

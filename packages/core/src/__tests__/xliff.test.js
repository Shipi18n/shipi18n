import { parseXliff } from '../formats/xliff.js'
import { checkTranslations } from '../check.js'

describe('XLIFF 1.2 adapter', () => {
  const xml = `<?xml version="1.0"?>
<xliff version="1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="app">
    <body>
      <trans-unit id="hello">
        <source>Hello <ph id="1">%s</ph></source>
        <target>Hola</target>
      </trans-unit>
      <trans-unit id="save">
        <source>Save</source>
        <target state="needs-translation">Save</target>
      </trans-unit>
      <group>
        <trans-unit id="bye">
          <source>Goodbye</source>
          <target></target>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>`
  const p = parseXliff(xml)

  test('reads languages and version', () => {
    expect(p.version).toBe('1.2')
    expect(p.srcLang).toBe('en')
    expect(p.trgLang).toBe('es')
  })

  test('captures placeholder inside <ph> and nested <group> units', () => {
    expect(p.source.hello).toContain('%s')
    expect(p.source.bye).toBe('Goodbye') // came from inside <group>
  })

  test('generic check catches dropped placeholder and empty target', () => {
    const { findings } = checkTranslations({ source: p.source, target: p.target, targetLang: 'es' })
    expect(findings.some((f) => f.type === 'placeholder-missing' && f.path === 'hello')).toBe(true)
    expect(findings.some((f) => f.type === 'empty-value' && f.path === 'bye')).toBe(true)
  })

  test('needs-translation state yields a stale-translation warning', () => {
    expect(p.findings).toContainEqual(
      expect.objectContaining({ type: 'stale-translation', path: 'save', severity: 'warning' })
    )
  })
})

describe('XLIFF 2.0 adapter', () => {
  const xml = `<xliff version="2.0" srcLang="en" trgLang="fr">
  <file id="f1">
    <unit id="greet">
      <segment>
        <source>Hi %s</source>
        <target>Bonjour</target>
      </segment>
    </unit>
    <group id="g">
      <unit id="ok">
        <segment state="initial">
          <source>OK</source>
          <target>OK</target>
        </segment>
      </unit>
    </group>
  </file>
</xliff>`
  const p = parseXliff(xml)

  test('reads srcLang/trgLang from the root and units from nested groups', () => {
    expect(p.version).toBe('2.0')
    expect(p.srcLang).toBe('en')
    expect(p.trgLang).toBe('fr')
    expect(p.source.ok).toBe('OK') // from inside <group>
  })

  test('generic check catches a dropped placeholder', () => {
    const { findings } = checkTranslations({ source: p.source, target: p.target, targetLang: 'fr' })
    expect(findings.some((f) => f.type === 'placeholder-missing' && f.path === 'greet')).toBe(true)
  })

  test('segment state "initial" yields a stale-translation warning', () => {
    expect(p.findings).toContainEqual(
      expect.objectContaining({ type: 'stale-translation', path: 'ok', severity: 'warning' })
    )
  })
})

// 2026-10-04: empty inline placeholders were invisible, so an Angular app could
// drop {{ name }} (written as <x id="INTERPOLATION"/>) and pass.
import { checkTranslations as __check } from '../check.js'
import { parseXliff as __parseXliff } from '../formats/xliff.js'
describe('empty inline placeholders (Angular <x/>, XLIFF 2.0 <ph/>)', () => {
  const run = (xml) => {
    const { source, target } = __parseXliff(xml)
    return __check({ source, target, targetLang: 'de', format: 'generic' }).findings.filter((f) => f.type === 'placeholder-missing')
  }
  const v12 = (src, tgt) => `<?xml version="1.0"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file source-language="en" target-language="de" datatype="plaintext" original="x"><body><trans-unit id="k"><source>${src}</source><target>${tgt}</target></trans-unit></body></file></xliff>`
  test('dropped Angular interpolation is caught', () => {
    expect(run(v12('Hello <x id="INTERPOLATION" equiv-text="{{ name }}"/>!', 'Hallo!'))).toHaveLength(1)
  })
  test('kept Angular interpolation passes, even when moved', () => {
    expect(run(v12('Hello <x id="INTERPOLATION"/>!', '<x id="INTERPOLATION"/>, hallo!'))).toHaveLength(0)
  })
  test('XLIFF 2.0 <ph equiv> dropped is caught', () => {
    const xml = `<?xml version="1.0"?><xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="en" trgLang="de"><file id="f"><unit id="k"><segment><source>Hi <ph id="0" equiv="{{ name }}"/></source><target>Hallo</target></segment></unit></file></xliff>`
    expect(run(xml)).toHaveLength(1)
  })
  test('<ph> with text still uses its text', () => {
    expect(run(v12('Hello <ph id="1">%s</ph>', 'Hallo <ph id="1">%s</ph>'))).toHaveLength(0)
  })
})

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

import { jest } from '@jest/globals'
import { translateJSON, flatten, unflatten } from '../translate.js'
import { extractPlaceholders, validatePlaceholders } from '../placeholders.js'
import { getLanguageName } from '../languages.js'

/**
 * A mock adapter that fakes translation deterministically: it wraps each source
 * string as "[es] <source>" but faithfully preserves placeholders (mirroring a
 * well-behaved LLM). This lets us test the whole engine with no network/key.
 */
function mockAdapter(transform = (s) => `[t] ${s}`) {
  return {
    name: 'mock',
    calls: [],
    async complete(prompt) {
      this.calls.push(prompt)
      // The prompt embeds a JSON array of strings; echo a translated JSON array.
      const match = prompt.match(/\[[\s\S]*\]/)
      const inputs = JSON.parse(match[0])
      return JSON.stringify(inputs.map(transform))
    },
  }
}

describe('flatten / unflatten', () => {
  test('round-trips nested objects and arrays', () => {
    const obj = { a: { b: 'x' }, list: ['one', 'two'], n: 5 }
    const flat = flatten(obj)
    expect(flat['a.b']).toBe('x')
    expect(flat['list.0']).toBe('one')
    expect(flat['n']).toBe(5)
    expect(unflatten(flat)).toEqual(obj)
  })
})

describe('placeholders', () => {
  test('extracts the common placeholder syntaxes', () => {
    expect(extractPlaceholders('Hi {{name}}, you have {count} of %s')).toEqual(
      ['%s', '{count}', '{{name}}'].sort()
    )
  })
  test('validate flags dropped placeholders', () => {
    const check = validatePlaceholders('Hello {{name}}', 'Hola')
    expect(check.ok).toBe(false)
    expect(check.missing).toContain('{{name}}')
  })
  test('validate passes when preserved', () => {
    expect(validatePlaceholders('Hello {{name}}', 'Hola {{name}}').ok).toBe(true)
  })
})

describe('getLanguageName', () => {
  test('maps codes and regional variants', () => {
    expect(getLanguageName('es')).toBe('Spanish')
    expect(getLanguageName('pt-BR')).toBe('Portuguese')
    expect(getLanguageName('xx')).toBe('xx')
  })
})

describe('translateJSON (BYO-LLM via mock adapter)', () => {
  test('translates strings, preserves structure and placeholders', async () => {
    const adapter = mockAdapter((s) => s.replace(/^/, '[es] '))
    const { result, stats } = await translateJSON({
      content: { greeting: 'Hello {{name}}', nested: { bye: 'Goodbye' }, count: 3 },
      from: 'en',
      to: 'es',
      provider: adapter,
    })
    expect(result.greeting).toBe('[es] Hello {{name}}')
    expect(result.nested.bye).toBe('[es] Goodbye')
    expect(result.count).toBe(3) // non-string leaf untouched
    expect(stats.translated).toBe(2)
    expect(stats.placeholderWarnings).toHaveLength(0)
  })

  test('incremental: reuses existing translations, only translates new keys', async () => {
    const adapter = mockAdapter((s) => `[es] ${s}`)
    const spy = jest.spyOn(adapter, 'complete')
    const { result, stats } = await translateJSON({
      content: { a: 'Alpha', b: 'Beta' },
      existing: { a: 'Alfa' },
      from: 'en',
      to: 'es',
      provider: adapter,
    })
    expect(result.a).toBe('Alfa') // reused
    expect(result.b).toBe('[es] Beta') // newly translated
    expect(stats.translated).toBe(1)
    expect(stats.reused).toBe(1)
    // Only one batch call, containing only the untranslated 'Beta'
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toContain('Beta')
    expect(spy.mock.calls[0][0]).not.toContain('Alpha')
  })

  test('flags placeholder drift when the model drops one', async () => {
    const adapter = mockAdapter((s) => s.replace(/\{\{name\}\}/, '')) // drops {{name}}
    const { stats } = await translateJSON({
      content: { hi: 'Hi {{name}}' },
      from: 'en',
      to: 'es',
      provider: adapter,
    })
    expect(stats.placeholderWarnings).toHaveLength(1)
    expect(stats.placeholderWarnings[0].missing).toContain('{{name}}')
  })

  test('unknown provider name throws a helpful error', async () => {
    await expect(
      translateJSON({ content: { a: 'x' }, from: 'en', to: 'es', provider: 'bard' })
    ).rejects.toThrow(/Unknown provider/)
  })
})

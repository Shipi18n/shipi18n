/**
 * Tests for the Shipi18n Node.js example.
 *
 * These run the REAL engine against a mock adapter rather than mocking the
 * engine itself — so they exercise the actual flatten/unflatten, placeholder
 * and incremental logic, and would catch a breaking change in @shipi18n/core.
 * No API key and no network access are required.
 */

import { jest } from '@jest/globals'
import {
  translateJSON,
  translateStrings,
  flatten,
  unflatten,
  extractPlaceholders,
  validatePlaceholders,
  resolveAdapter,
} from '@shipi18n/core'

/**
 * A stand-in for a real provider. It echoes back the requested JSON array with
 * a language tag, preserving any placeholders it finds, which is enough to
 * verify the engine's own behaviour deterministically.
 */
const mockAdapter = (transform = (s) => `[es] ${s}`) => ({
  name: 'mock',
  async complete(prompt) {
    const match = prompt.match(/\[\s*\n?\s*"[\s\S]*\]/)
    const texts = match ? JSON.parse(match[0]) : []
    return JSON.stringify(texts.map(transform))
  },
})

describe('translateJSON', () => {
  it('translates strings and preserves nested structure', async () => {
    const content = { common: { greeting: 'Hello', farewell: 'Goodbye' } }
    const { result } = await translateJSON({
      content,
      from: 'en',
      to: 'es',
      provider: mockAdapter(),
    })

    expect(Object.keys(flatten(result)).sort()).toEqual(Object.keys(flatten(content)).sort())
    expect(result.common.greeting).toBe('[es] Hello')
    expect(result.common.farewell).toBe('[es] Goodbye')
  })

  it('leaves non-string leaves untouched', async () => {
    const content = { label: 'Save', maxItems: 10, enabled: true, missing: null }
    const { result } = await translateJSON({
      content,
      from: 'en',
      to: 'es',
      provider: mockAdapter(),
    })

    expect(result.maxItems).toBe(10)
    expect(result.enabled).toBe(true)
    expect(result.missing).toBeNull()
    expect(result.label).toBe('[es] Save')
  })

  it('reuses existing translations in incremental mode', async () => {
    const content = { a: 'Alpha', b: 'Beta' }
    const existing = { a: 'Alfa ya traducida' }

    const { result, stats } = await translateJSON({
      content,
      from: 'en',
      to: 'es',
      provider: mockAdapter(),
      existing,
    })

    expect(result.a).toBe('Alfa ya traducida') // untouched
    expect(result.b).toBe('[es] Beta') // newly translated
    expect(stats.reused).toBe(1)
    expect(stats.translated).toBe(1)
  })

  it('reports a warning when the model drops a placeholder', async () => {
    const { stats } = await translateJSON({
      content: { greeting: 'Hello {{name}}' },
      from: 'en',
      to: 'es',
      // this adapter deliberately eats the placeholder
      provider: mockAdapter(() => 'Hola amigo'),
    })

    expect(stats.placeholderWarnings.length).toBe(1)
    expect(stats.placeholderWarnings[0].missing).toContain('{{name}}')
  })

  it('rejects an unknown provider with a helpful message', async () => {
    await expect(
      translateJSON({ content: { a: 'A' }, from: 'en', to: 'es', provider: 'not-a-provider' })
    ).rejects.toThrow(/Unknown provider/)
  })
})

describe('translateStrings', () => {
  it('returns translations in the same order as the input', async () => {
    const texts = ['One', 'Two', 'Three']
    const out = await translateStrings(texts, {
      adapter: mockAdapter(),
      from: 'en',
      to: 'es',
    })

    expect(out).toEqual(['[es] One', '[es] Two', '[es] Three'])
  })
})

describe('placeholders', () => {
  it('recognises the common syntaxes', () => {
    const found = extractPlaceholders(
      'Hi {{name}}, you have {count} of %d items — $t(common.x) <b>bold</b>'
    )
    expect(found).toEqual(expect.arrayContaining(['{{name}}', '{count}', '%d', '$t(common.x)']))
  })

  it('flags a dropped placeholder and passes when preserved', () => {
    // validatePlaceholders returns { ok, missing, added } — not a bare array.
    const dropped = validatePlaceholders('Hello {{name}}', 'Hola')
    expect(dropped.ok).toBe(false)
    expect(dropped.missing).toContain('{{name}}')

    const kept = validatePlaceholders('Hello {{name}}', 'Hola {{name}}')
    expect(kept.ok).toBe(true)
    expect(kept.missing).toHaveLength(0)
  })

  it('also flags a placeholder the model invented', () => {
    const invented = validatePlaceholders('Hello', 'Hola {{name}}')
    expect(invented.ok).toBe(false)
    expect(invented.added).toContain('{{name}}')
  })
})

describe('flatten / unflatten', () => {
  it('round-trips a nested object', () => {
    const original = { a: { b: { c: 'deep' } }, list: ['x', 'y'] }
    expect(unflatten(flatten(original))).toEqual(original)
  })
})

describe('resolveAdapter', () => {
  it('passes a custom { complete } object straight through', () => {
    const custom = { name: 'custom', complete: async () => '[]' }
    expect(resolveAdapter(custom)).toBe(custom)
  })

  it('throws on an unknown provider name', () => {
    expect(() => resolveAdapter('nope')).toThrow(/Unknown provider/)
  })
})

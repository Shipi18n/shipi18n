import { jest } from '@jest/globals'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  translateJsonTool,
  translateFileTool,
  listLanguagesTool,
  checkPlaceholdersTool,
} from '../tools.js'
import { resolveProvider, samplingAdapter } from '../provider.js'
import { makeMockMcpServer, makeNoSamplingServer } from './mockServer.js'

const DICT = {
  'Hello {{name}}': { Spanish: 'Hola {{name}}', French: 'Bonjour {{name}}' },
  'You have {{count}} items': { Spanish: 'Tienes {{count}} artículos', French: 'Vous avez {{count}} articles' },
}
// No env key → tools fall through to the sampling path (our mock server).
const NOENV = {}

describe('translate_json tool', () => {
  test('translates to multiple languages via sampling, preserving structure + placeholders', async () => {
    const server = makeMockMcpServer(DICT)
    const tool = translateJsonTool(server, NOENV)
    const res = await tool.handler({
      content: JSON.stringify({ greeting: 'Hello {{name}}', cart: { items: 'You have {{count}} items' } }),
      to: 'es,fr',
      from: 'en',
    })
    expect(res.isError).toBeFalsy()
    const { translations, mode } = res.structuredContent
    expect(mode).toBe('mcp-sampling (deprecated fallback)')
    expect(translations.es.greeting).toBe('Hola {{name}}')
    expect(translations.es.cart.items).toContain('{{count}}')
    expect(translations.fr.greeting).toBe('Bonjour {{name}}')
  })

  test('returns an error result on invalid JSON', async () => {
    const tool = translateJsonTool(makeMockMcpServer(), NOENV)
    const res = await tool.handler({ content: '{ not json }', to: 'es' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Invalid JSON')
  })
})

describe('translate_file tool', () => {
  let dir
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mcp-test-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('reads a file, writes <lang>.json outputs', async () => {
    const src = join(dir, 'en.json')
    writeFileSync(src, JSON.stringify({ greeting: 'Hello {{name}}' }))
    const tool = translateFileTool(makeMockMcpServer(DICT), NOENV)
    const res = await tool.handler({ path: src, to: 'es,fr' })
    expect(res.isError).toBeFalsy()

    const es = JSON.parse(readFileSync(join(dir, 'es.json'), 'utf8'))
    const fr = JSON.parse(readFileSync(join(dir, 'fr.json'), 'utf8'))
    expect(es.greeting).toBe('Hola {{name}}')
    expect(fr.greeting).toBe('Bonjour {{name}}')
    expect(res.structuredContent.written).toHaveLength(2)
  })

  test('incremental mode reuses existing keys and only translates new ones', async () => {
    const src = join(dir, 'en.json')
    writeFileSync(src, JSON.stringify({ greeting: 'Hello {{name}}', extra: 'You have {{count}} items' }))
    // pre-seed es.json with the greeting already translated
    writeFileSync(join(dir, 'es.json'), JSON.stringify({ greeting: 'YA-TRADUCIDO' }))

    const server = makeMockMcpServer(DICT)
    const tool = translateFileTool(server, NOENV)
    const res = await tool.handler({ path: src, to: 'es', incremental: true })

    const es = JSON.parse(readFileSync(join(dir, 'es.json'), 'utf8'))
    expect(es.greeting).toBe('YA-TRADUCIDO')        // reused, not re-translated
    expect(es.extra).toContain('{{count}}')          // newly translated
    expect(res.structuredContent.written[0].reused).toBe(1)
    expect(res.structuredContent.written[0].translated).toBe(1)
  })

  test('errors when the file does not exist', async () => {
    const tool = translateFileTool(makeMockMcpServer(), NOENV)
    const res = await tool.handler({ path: join(dir, 'nope.json'), to: 'es' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('File not found')
  })
})

describe('list_languages tool', () => {
  test('lists known languages', async () => {
    const res = await listLanguagesTool().handler({})
    const codes = res.structuredContent.languages.map((l) => l.code)
    expect(codes).toEqual(expect.arrayContaining(['en', 'es', 'fr', 'ja']))
    expect(res.content[0].text).toContain('es — Spanish')
  })
})

describe('check_placeholders tool', () => {
  test('passes when placeholders survive', async () => {
    const res = await checkPlaceholdersTool().handler({ source: 'Hi {{name}}', translation: 'Hola {{name}}' })
    expect(res.structuredContent.ok).toBe(true)
    expect(res.content[0].text).toContain('preserved')
  })
  test('flags a dropped placeholder', async () => {
    const res = await checkPlaceholdersTool().handler({ source: 'Hi {{name}}', translation: 'Hola' })
    expect(res.structuredContent.ok).toBe(false)
    expect(res.content[0].text).toContain('{{name}}')
  })
})

describe('resolveProvider', () => {
  test('explicit provider without a key throws', () => {
    expect(() => resolveProvider({ mcpServer: makeMockMcpServer(), provider: 'anthropic', env: {} }))
      .toThrow(/needs a key/)
  })
  test('env ANTHROPIC_API_KEY selects the anthropic adapter', () => {
    const { adapter, mode } = resolveProvider({ mcpServer: makeMockMcpServer(), env: { ANTHROPIC_API_KEY: 'sk-x' } })
    expect(adapter.name).toBe('anthropic')
    expect(mode).toContain('anthropic')
  })
  test('no provider + no key falls back to sampling', () => {
    const { adapter, mode } = resolveProvider({ mcpServer: makeMockMcpServer(), env: {} })
    expect(adapter.name).toBe('mcp-sampling')
    expect(mode).toContain('sampling')
  })
  test('unknown provider throws', () => {
    expect(() => resolveProvider({ mcpServer: makeMockMcpServer(), provider: 'gemini', env: {} }))
      .toThrow(/Unknown provider/)
  })
})

describe('samplingAdapter', () => {
  test('returns the client text', async () => {
    const server = makeMockMcpServer(DICT)
    const out = await samplingAdapter(server).complete('Translate from English to Spanish.\nJSON array):\n["Hello {{name}}"]')
    expect(JSON.parse(out)).toEqual(['Hola {{name}}'])
  })
  test('gives a helpful error when the client lacks sampling', async () => {
    await expect(samplingAdapter(makeNoSamplingServer()).complete('x'))
      .rejects.toThrow(/deprecated MCP sampling fallback is unavailable/)
  })
})

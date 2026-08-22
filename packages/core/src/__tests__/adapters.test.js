/**
 * openaiAdapter + baseURL — the "any OpenAI-compatible endpoint" contract
 * (Ollama, Gemini compat, Groq, LM Studio, vLLM). Tested against a real local
 * HTTP server through the real `openai` SDK, not a mock of our own adapter.
 */
import { createServer } from 'node:http'
import { openaiAdapter, resolveAdapter } from '../adapters/index.js'
import { translateJSON } from '../translate.js'

let server
let port
let seen // last request: { auth, path, body }

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', () => {
      const body = JSON.parse(raw)
      seen = { auth: req.headers.authorization, path: req.url, body }
      // Echo-translate: find the JSON array of texts in the prompt and return
      // one "translated" string per entry — the engine's whole contract.
      const content = body.messages[0].content
      const match = content.match(/\[[\s\S]*\]/)
      const texts = match ? JSON.parse(match[0]) : []
      const translated = texts.map((t) => `[xx] ${t}`)
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          id: 'cmpl-1',
          object: 'chat.completion',
          model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(translated) }, finish_reason: 'stop' }],
        })
      )
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  port = server.address().port
})
afterAll(() => new Promise((r) => server.close(r)))

const base = () => `http://127.0.0.1:${port}/v1`

describe('openaiAdapter with baseURL', () => {
  test('keyless endpoint works: placeholder key is sent, response comes back', async () => {
    delete process.env.OPENAI_API_KEY
    const adapter = openaiAdapter({ baseURL: base() })
    const out = await adapter.complete('Translate: ["Hello"]')
    expect(JSON.parse(out)).toEqual(['[xx] Hello'])
    expect(seen.auth).toBe('Bearer not-needed')
    expect(seen.path).toBe('/v1/chat/completions')
  })

  test('an explicit key still wins over the placeholder', async () => {
    const adapter = openaiAdapter({ baseURL: base(), apiKey: 'sk-test-123' })
    await adapter.complete('Translate: ["Hi"]')
    expect(seen.auth).toBe('Bearer sk-test-123')
  })

  test('model override reaches the endpoint', async () => {
    const adapter = openaiAdapter({ baseURL: base(), model: 'llama3.2' })
    await adapter.complete('Translate: ["Hey"]')
    expect(seen.body.model).toBe('llama3.2')
  })

  test('without baseURL the default (env key) behavior is unchanged', async () => {
    delete process.env.OPENAI_API_KEY
    const adapter = openaiAdapter({})
    await expect(adapter.complete('x')).rejects.toThrow() // SDK refuses without any key
  })

  test('resolveAdapter threads baseURL through', async () => {
    const adapter = resolveAdapter('openai', { baseURL: base(), model: 'qwen2.5' })
    await adapter.complete('Translate: ["Yo"]')
    expect(seen.body.model).toBe('qwen2.5')
  })
})

describe('translateJSON over an OpenAI-compatible endpoint', () => {
  test('full engine path: structure preserved, placeholders intact, no key anywhere', async () => {
    delete process.env.OPENAI_API_KEY
    const { result, stats } = await translateJSON({
      content: { greeting: 'Hello {{name}}', nested: { cta: 'Start now' } },
      from: 'en',
      to: 'es',
      provider: 'openai',
      baseURL: base(),
    })
    expect(result).toEqual({ greeting: '[xx] Hello {{name}}', nested: { cta: '[xx] Start now' } })
    expect(stats.translated).toBe(2)
    expect(stats.placeholderWarnings).toEqual([])
  })
})

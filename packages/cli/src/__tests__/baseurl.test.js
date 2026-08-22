/**
 * --base-url through the real CLI binary — the exact path a user runs.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'shipi18n.js')

let server, port, dir
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', () => {
      const texts = JSON.parse(JSON.parse(raw).messages[0].content.match(/\[[\s\S]*\]/)[0])
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(texts.map((t) => `[es] ${t}`)) }, finish_reason: 'stop' }],
      }))
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  port = server.address().port
})
afterAll(() => new Promise((r) => server.close(r)))
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'shipi18n-baseurl-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

// async spawn, NOT spawnSync: the mock server lives in this process, and
// spawnSync would block the event loop it needs to answer the child. Deadlock.
const run = (args, env = {}) =>
  new Promise((resolve) => {
    const child = spawn('node', [BIN, ...args], {
      cwd: dir,
      env: { ...process.env, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', ...env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })

test('--base-url without -p openai is an explicit error, not silent magic', async () => {
  writeFileSync(join(dir, 'en.json'), '{"a":"Hi"}')
  const r = await run(['translate', 'en.json', '-t', 'es', '--base-url', 'http://127.0.0.1:9/v1'])
  expect(r.status).toBe(1)
  expect(r.stderr).toContain('-p openai')
})

test('translate against a keyless OpenAI-compatible endpoint, no key set anywhere', async () => {
  writeFileSync(join(dir, 'en.json'), JSON.stringify({ greeting: 'Hello {{name}}' }))
  const r = await run(['translate', 'en.json', '-t', 'es', '-p', 'openai', '--base-url', `http://127.0.0.1:${port}/v1`, '-o', '.'])
  expect(r.status).toBe(0)
  const es = JSON.parse(readFileSync(join(dir, 'es.json'), 'utf8'))
  expect(es).toEqual({ greeting: '[es] Hello {{name}}' })
})

test('a missing key without --base-url still fails loudly (unchanged behavior)', async () => {
  writeFileSync(join(dir, 'en.json'), '{"a":"Hi"}')
  const r = await run(['translate', 'en.json', '-t', 'es', '-p', 'openai'])
  expect(r.status).toBe(1)
  expect(r.stderr).toContain('No API key')
})

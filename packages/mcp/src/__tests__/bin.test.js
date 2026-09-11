/**
 * Regression tests for the executable entrypoint.
 *
 * npm installs `bin` as a symlink, so `npx @shipi18n/mcp` runs the server through
 * `node_modules/.bin/shipi18n-mcp` rather than the real file. A guard that compares
 * `process.argv[1]` to `import.meta.url` without realpath'ing both never matches there,
 * and the server exits silently instead of serving. These tests spawn the real binary
 * the way a client does.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, symlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDirectRun } from '../server.js'

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'server.js')

const INITIALIZE =
  JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  }) + '\n'

/** Spawn `node <entry>`, send an MCP initialize, and collect what comes back. */
const handshake = (entry) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    child.stdin.write(INITIALIZE)
    const done = () => {
      child.kill()
      resolve({ stdout, stderr })
    }
    // Give the server a moment to boot and answer.
    setTimeout(done, 4000)
  })

describe('isDirectRun', () => {
  test('matches when argv[1] is the module itself', () => {
    expect(isDirectRun(SERVER, `file://${SERVER}`)).toBe(true)
  })

  test('matches through a symlink to the module (the npm bin layout)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shipi18n-bin-'))
    const link = join(dir, 'shipi18n-mcp')
    symlinkSync(SERVER, link)
    try {
      expect(isDirectRun(link, `file://${SERVER}`)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('does not match an unrelated entrypoint (imported, not run)', () => {
    expect(isDirectRun('/somewhere/else/jest.js', `file://${SERVER}`)).toBe(false)
  })

  test('does not match when there is no argv[1]', () => {
    expect(isDirectRun(undefined, `file://${SERVER}`)).toBe(false)
  })
})

describe('server binary', () => {
  test('responds to initialize when run directly', async () => {
    const { stdout, stderr } = await handshake(SERVER)
    expect(stderr).toContain('ready')
    expect(JSON.parse(stdout.split('\n')[0]).result.serverInfo.name).toBe('shipi18n')
  }, 15000)

  test('responds to initialize when run through a bin symlink', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shipi18n-bin-'))
    const link = join(dir, 'shipi18n-mcp')
    symlinkSync(SERVER, link)
    try {
      const { stdout, stderr } = await handshake(link)
      expect(stderr).toContain('ready')
      expect(JSON.parse(stdout.split('\n')[0]).result.serverInfo.name).toBe('shipi18n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 15000)
})

/**
 * Full stdio smoke test — the round-trip a real client drives: initialize →
 * initialized → tools/list → tools/call. This is the regression harness that
 * catches breaks in-memory unit tests miss (bad bundle wiring, missing tool
 * metadata, a validator that throws under the real transport).
 */
describe('server binary — full MCP flow over stdio', () => {
  // Drive a sequence of requests and collect one JSON-RPC response per id.
  const converse = (entry, messages) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'pipe'] })
      let buf = ''
      const byId = {}
      child.stdout.on('data', (d) => {
        buf += d
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          try {
            const msg = JSON.parse(line)
            if (msg.id != null) byId[msg.id] = msg
          } catch {
            /* partial / non-JSON banner line */
          }
        }
      })
      for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n')
      setTimeout(() => {
        child.kill()
        resolve(byId)
      }, 5000)
    })

  test('initialize → tools/list → tools/call check_locales', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'shipi18n-loc-'))
    writeFileSync(join(fixture, 'en.json'), JSON.stringify({ a: 'Hello {{name}}', b: 'Bye' }))
    writeFileSync(join(fixture, 'es.json'), JSON.stringify({ a: 'Hola' })) // missing b, dropped {{name}}
    try {
      const byId = await converse(SERVER, [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_locales', arguments: { path: fixture, source: 'en' } } },
      ])

      // initialize
      expect(byId[1]?.result?.serverInfo?.name).toBe('shipi18n')

      // tools/list — all eight tools, with the metadata registries score on
      const tools = byId[2]?.result?.tools ?? []
      expect(tools).toHaveLength(8)
      const check = tools.find((t) => t.name === 'check_locales')
      expect(check.annotations?.readOnlyHint).toBe(true)
      expect(check.outputSchema).toBeDefined()

      // tools/call — the validator actually runs over the real transport and
      // finds the planted defects
      const call = byId[3]?.result
      expect(call?.isError).toBeFalsy()
      const sc = call?.structuredContent
      expect(sc?.totals?.errors).toBeGreaterThan(0)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  }, 15000)
})

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
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs'
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

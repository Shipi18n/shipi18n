import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// server.json is what the official MCP Registry lists. It sat at 2.1.1 while npm
// shipped 2.3.0 (found 2026-10-03), so clients discovering the server saw a stale
// version. Fail the build whenever it drifts from the package.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const pkg = read(join(here, '../../package.json'))
const server = read(join(here, '../../../../server.json'))

describe('server.json matches @shipi18n/mcp', () => {
  test('server version', () => expect(server.version).toBe(pkg.version))
  test('npm package entry', () => {
    const npm = server.packages.find((p) => p.registryType === 'npm')
    expect(npm.identifier).toBe(pkg.name)
    expect(npm.version).toBe(pkg.version)
  })
  test('registry name is the package mcpName', () => expect(server.name).toBe(pkg.mcpName))
  test('description fits the registry limit (100 chars)', () => expect(server.description.length).toBeLessThanOrEqual(100))
})

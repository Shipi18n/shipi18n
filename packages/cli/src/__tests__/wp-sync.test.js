/**
 * Wiring tests for `shipi18n wp-sync` — spawns the real bin so command
 * registration, sibling auto-discovery, and exit codes are all exercised.
 * The drift/orphan LOGIC is covered by core's wp-jed tests.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'shipi18n.js')

const PO = `msgid ""
msgstr ""
"Language: es\\n"

msgid "Save"
msgstr "Guardar"
`

// JED with the "" metadata key; built here so plurals/context could be added later.
const jed = (save) => JSON.stringify({ domain: 'messages', locale_data: { messages: { '': { lang: 'es' }, Save: [save] } } })

// Run the bin; return { code, stdout }. execFileSync throws on non-zero exit,
// so capture the thrown error's status/stdout.
function run(args, cwd) {
  try {
    const stdout = execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, stdout }
  } catch (err) {
    return { code: err.status, stdout: (err.stdout || '') + (err.stderr || '') }
  }
}

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shipi18n-wp-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('an in-sync JED passes (exit 0) via sibling auto-discovery', () => {
  writeFileSync(join(dir, 'es.po'), PO)
  writeFileSync(join(dir, 'app-es-abc.json'), jed('Guardar'))
  const { code, stdout } = run(['wp-sync', join(dir, 'es.po')], dir)
  expect(code).toBe(0)
  expect(stdout).toMatch(/in sync/)
})

test('a stale JED fails (exit 1) and names the drift', () => {
  writeFileSync(join(dir, 'es.po'), PO)
  writeFileSync(join(dir, 'app-es-abc.json'), jed('Guardar VIEJO'))
  const { code, stdout } = run(['wp-sync', join(dir, 'es.po')], dir)
  expect(code).toBe(1)
  expect(stdout).toMatch(/jed-drift/)
})

test('no JED files found is a usage error (exit 2), not a false pass', () => {
  writeFileSync(join(dir, 'es.po'), PO)
  const { code } = run(['wp-sync', join(dir, 'es.po')], dir)
  expect(code).toBe(2)
})

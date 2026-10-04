import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The contract an AI agent (or any script) relies on: 0 clean, 1 findings,
// 2 usage error — never 1 for a bad flag — plus --changed-only against git.
// SHIPI18N_BIN points this suite at another build — CI runs it against the single-file bundle.
const BIN = process.env.SHIPI18N_BIN || join(dirname(fileURLToPath(import.meta.url)), '../../bin/shipi18n.js')
const run = (args, cwd) => spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' })

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'shipi18n-agent-'))
  mkdirSync(join(d, 'locales'))
  writeFileSync(join(d, 'locales/en.json'), '{"a":"Hi {name}"}')
  writeFileSync(join(d, 'locales/es.json'), '{"a":"Hola {name}"}')
  writeFileSync(join(d, 'locales/fr.json'), '{"a":"Salut"}')
  const git = (...a) => execFileSync('git', a, { cwd: d, stdio: 'ignore' })
  git('init', '-q')
  git('add', '-A')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')
  return d
}

describe('exit codes', () => {
  test('findings → 1', () => expect(run(['check', 'locales', '-s', 'en'], repo()).status).toBe(1))
  test('clean → 0', () => {
    const d = repo()
    writeFileSync(join(d, 'locales/fr.json'), '{"a":"Salut {name}"}')
    expect(run(['check', 'locales', '-s', 'en'], d).status).toBe(0)
  })
  test.each([[['check', '--bogus']], [['check', '--severity']], [['nosuchcmd']], [['check', 'does/not/exist']]])('usage error %j → 2', (args) => {
    expect(run(args, repo()).status).toBe(2)
  })
  test.each([[['--version']], [['check', '--help']]])('%j → 0', (args) => expect(run(args, repo()).status).toBe(0))
})

describe('--changed-only', () => {
  test('ignores an existing broken locale nobody touched', () => {
    expect(run(['check', 'locales', '-s', 'en', '--changed-only'], repo()).status).toBe(0)
  })
  test('reports the file the agent just wrote', () => {
    const d = repo()
    writeFileSync(join(d, 'locales/de.json'), '{"a":"Hallo {Name}"}')
    const r = run(['check', 'locales', '-s', 'en', '--changed-only', '--json'], d)
    expect(r.status).toBe(1)
    const j = JSON.parse(r.stdout)
    expect(j.languages.map((l) => l.lang)).toEqual(['de'])
    expect(j.languages[0].namespaces[0].findings[0].fix).toBe('rename {Name} to {name}')
  })
  test('a source change checks everything', () => {
    const d = repo()
    writeFileSync(join(d, 'locales/en.json'), '{"a":"Hello {name}"}')
    const r = run(['check', 'locales', '-s', 'en', '--changed-only', '--json'], d)
    expect(JSON.parse(r.stdout).languages.map((l) => l.lang)).toEqual(['es', 'fr'])
  })
  test('unknown ref → 2', () => expect(run(['check', 'locales', '--changed-only', 'no-such-ref'], repo()).status).toBe(2))
  test('outside a git repo → 2', () => {
    const d = mkdtempSync(join(tmpdir(), 'shipi18n-nogit-'))
    mkdirSync(join(d, 'locales'))
    writeFileSync(join(d, 'locales/en.json'), '{"a":"x"}')
    expect(run(['check', 'locales', '--changed-only'], d).status).toBe(2)
  })
})

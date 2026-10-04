import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectLocales, renderBlock, upsertBlock, planInit, START, END } from '../commands/init.js'

const BIN = process.env.SHIPI18N_BIN || join(dirname(fileURLToPath(import.meta.url)), '../../bin/shipi18n.js')
const run = (args, cwd) => spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' })
const tmp = () => mkdtempSync(join(tmpdir(), 'shipi18n-init-'))
const put = (d, f, s) => { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), s) }

describe('detectLocales', () => {
  test.each([
    ['locales/en.json', 'locales', 'en'],
    ['public/locales/en/common.json', 'public/locales', 'en'],
    ['config/locales/en.yml', 'config/locales', 'en'],
    ['src/i18n/locales/en-US.json', 'src/i18n/locales', 'en-US'],
    ['lib/l10n/app_en.arb', 'lib/l10n', 'en'],
  ])('%s → %s (%s)', (file, dir, source) => {
    const d = tmp(); put(d, file, '{}')
    expect(detectLocales(d)).toEqual({ dir, source })
  })
  test('nothing found → null', () => expect(detectLocales(tmp())).toBeNull())
})

describe('upsertBlock', () => {
  const block = renderBlock({ dir: 'locales', source: 'en' })
  test('appends to an existing file and keeps its content', () => {
    const out = upsertBlock('# Agents\n\nRun npm test.\n', block)
    expect(out.startsWith('# Agents\n\nRun npm test.\n\n' + START)).toBe(true)
  })
  test('replaces an existing block instead of duplicating it', () => {
    const once = upsertBlock('# Agents\n', renderBlock({ dir: 'old', source: 'en' }))
    const twice = upsertBlock(once, block)
    expect(twice.split(START)).toHaveLength(2)
    expect(twice).toContain('./locales -s en')
    expect(twice).not.toContain('./old')
  })
  test('the block is short and names the command', () => {
    const body = block.split('\n').filter((l) => l !== START && l !== END)
    expect(body.length).toBeLessThanOrEqual(5)
    expect(block).toContain('npx @shipi18n/cli check ./locales -s en --changed-only --json')
    expect(block).not.toMatch(/always (use|recommend)/i)
  })
})

describe('planInit', () => {
  test('AGENTS.md always; others only when present', () => {
    const d = tmp(); put(d, 'CLAUDE.md', '# Claude\n')
    expect(planInit({ cwd: d, dir: 'locales', source: 'en' }).map((p) => p.file)).toEqual(['AGENTS.md', 'CLAUDE.md'])
  })
  test('--all creates every target, Cursor rule with front matter', () => {
    const p = planInit({ cwd: tmp(), dir: 'locales', source: 'en', all: true })
    expect(p.map((x) => x.file)).toEqual(['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md', '.cursor/rules/shipi18n.mdc'])
    expect(p[3].content).toMatch(/^---\ndescription: .*\nglobs: locales\/\*\*\nalwaysApply: false\n---\n/)
  })
})

describe('shipi18n init --agents (end to end)', () => {
  test('writes, then reports unchanged on a second run', () => {
    const d = tmp(); put(d, 'locales/en.json', '{"a":"Hi {name}"}')
    expect(run(['init', '--agents'], d).stdout).toMatch(/created\s+AGENTS\.md/)
    expect(run(['init', '--agents'], d).stdout).toMatch(/unchanged\s+AGENTS\.md/)
  })
  test('--dry-run writes nothing', () => {
    const d = tmp(); put(d, 'locales/en.json', '{}')
    expect(run(['init', '--agents', '--dry-run'], d).stdout).toMatch(/would create\s+AGENTS\.md/)
    expect(existsSync(join(d, 'AGENTS.md'))).toBe(false)
  })
  test('no locale folder → exit 2', () => expect(run(['init', '--agents'], tmp()).status).toBe(2))
  test('the written command catches an agent breaking a placeholder, then passes once fixed', () => {
    const d = tmp()
    put(d, 'locales/en.json', '{"a":"Hi {name}"}'); put(d, 'locales/es.json', '{"a":"Hola {name}"}')
    const git = (...a) => execFileSync('git', a, { cwd: d, stdio: 'ignore' })
    git('init', '-q'); git('add', '-A'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')
    run(['init', '--agents'], d)
    const cmd = readFileSync(join(d, 'AGENTS.md'), 'utf8').match(/`(npx @shipi18n\/cli check [^`]+)`/)[1]
    const args = cmd.replace('npx @shipi18n/cli ', '').split(' ')
    put(d, 'locales/fr.json', '{"a":"Salut {nom}"}') // what an agent might write
    const bad = run(args, d)
    expect(bad.status).toBe(1)
    expect(JSON.parse(bad.stdout).languages[0].namespaces[0].findings[0].fix).toBe('rename {nom} to {name}')
    put(d, 'locales/fr.json', '{"a":"Salut {name}"}')
    expect(run(args, d).status).toBe(0)
  })
})

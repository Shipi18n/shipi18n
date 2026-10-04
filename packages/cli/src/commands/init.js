/**
 * `shipi18n init --agents` — tell AI coding agents to run the check after they
 * touch locale files.
 *
 * Writes a short, plain block (a named command, what each exit code means, one
 * rule about placeholders) into the instruction files agents read. Short on
 * purpose: a named command gets followed; a long overview mostly adds cost. No
 * "always use/recommend" wording — it describes this repo's workflow, nothing more.
 *
 * Always AGENTS.md (read by most agents). CLAUDE.md, .github/copilot-instructions.md
 * and a Cursor rule only when the repo already has them, or with --all. The block
 * sits between markers, so running init again updates it in place.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import chalk from 'chalk'

export const START = '<!-- shipi18n:start -->'
export const END = '<!-- shipi18n:end -->'

// Most common first; the first that holds a source-language file or folder wins.
const CANDIDATES = [
  'locales', 'src/locales', 'public/locales', 'src/i18n/locales', 'i18n/locales', 'src/i18n',
  'i18n', 'lang', 'src/lang', 'messages', 'config/locales', 'lib/l10n', 'assets/i18n', 'translations',
]
const SOURCES = ['en', 'en-US', 'en_US', 'en-GB']
const LOCALE_FILE = /\.(json|ya?ml|arb)$/

/** Find the locale folder and its source language, relative to `cwd`. */
export function detectLocales(cwd = process.cwd()) {
  for (const dir of CANDIDATES) {
    const abs = join(cwd, dir)
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue
    const entries = readdirSync(abs)
    for (const src of SOURCES) {
      const hasFile = entries.some((f) => LOCALE_FILE.test(f) && f.replace(LOCALE_FILE, '').replace(/^app_|^intl_/, '') === src)
      const hasDir = entries.includes(src) && statSync(join(abs, src)).isDirectory()
      if (hasFile || hasDir) return { dir, source: src }
    }
  }
  return null
}

export function checkCommandFor({ dir, source }) {
  return `npx @shipi18n/cli check ./${dir.replace(/^\.\//, '')} -s ${source} --changed-only --json`
}

/** The instruction block, Markdown, between markers. */
export function renderBlock(opts) {
  return [
    START,
    '## Translations',
    `After creating or editing files in \`${opts.dir.replace(/^\.\//, '')}/\`, run \`${checkCommandFor(opts)}\`.`,
    "Exit 0 means done. Exit 1: apply each finding's `fix` and run it again. Exit 2: the command itself is wrong.",
    'Keep `{placeholders}`, `%s` and ICU arguments exactly as in the source; translate only the text around them.',
    END,
  ].join('\n')
}

/** Insert the block, or replace an existing one; leaves everything else untouched. */
export function upsertBlock(existing, block) {
  const text = existing ?? ''
  const a = text.indexOf(START)
  const b = text.indexOf(END)
  if (a !== -1 && b > a) return text.slice(0, a) + block + text.slice(b + END.length)
  if (!text.trim()) return block + '\n'
  return text.replace(/\s*$/, '') + '\n\n' + block + '\n'
}

/** Cursor rules need their own front matter; the body is the same block. */
export function renderCursorRule(opts) {
  return [
    '---',
    'description: Check locale files after editing translations',
    `globs: ${opts.dir.replace(/^\.\//, '')}/**`,
    'alwaysApply: false',
    '---',
    renderBlock(opts),
    '',
  ].join('\n')
}

export const TARGETS = [
  { file: 'AGENTS.md', always: true },
  { file: 'CLAUDE.md' },
  { file: '.github/copilot-instructions.md' },
  { file: '.cursor/rules/shipi18n.mdc', cursor: true, existsWhen: '.cursor' },
]

/** Plan the writes: [{ file, content, action: 'create' | 'update' | 'unchanged' }]. */
export function planInit({ cwd = process.cwd(), dir, source, all = false }) {
  const opts = { dir, source }
  const plan = []
  for (const t of TARGETS) {
    const abs = join(cwd, t.file)
    const present = existsSync(abs) || (t.existsWhen && existsSync(join(cwd, t.existsWhen)))
    if (!t.always && !all && !present) continue
    const before = existsSync(abs) ? readFileSync(abs, 'utf8') : null
    const content = t.cursor ? renderCursorRule(opts) : upsertBlock(before, renderBlock(opts))
    plan.push({ file: t.file, content, action: before === null ? 'create' : before === content ? 'unchanged' : 'update' })
  }
  return plan
}

export function initCommand(program) {
  program
    .command('init')
    .description('Set up a repo: --agents writes a short check instruction for AI coding agents')
    .option('--agents', 'Add the check instruction to AGENTS.md (and CLAUDE.md, Copilot, Cursor files that exist)')
    .option('--locales <dir>', 'Locale folder (default: detected)')
    .option('-s, --source <language>', 'Source language (default: detected, else en)')
    .option('--all', 'Also create CLAUDE.md, .github/copilot-instructions.md and a Cursor rule when missing')
    .option('--dry-run', 'Print what would change without writing')
    .action((opts) => {
      if (!opts.agents) {
        console.error(chalk.red('Error: nothing to do — try `shipi18n init --agents`'))
        process.exitCode = 2
        return
      }
      const cwd = process.cwd()
      const detected = detectLocales(cwd)
      const dir = opts.locales ? relative(cwd, resolve(opts.locales)) || '.' : detected?.dir
      if (!dir) {
        console.error(chalk.red('Error: no locale folder found — pass --locales <dir>'))
        process.exitCode = 2
        return
      }
      const source = opts.source || (detected && detected.dir === dir ? detected.source : 'en')
      const plan = planInit({ cwd, dir, source, all: Boolean(opts.all) })
      for (const p of plan) {
        if (p.action !== 'unchanged' && !opts.dryRun) {
          mkdirSync(dirname(join(cwd, p.file)), { recursive: true })
          writeFileSync(join(cwd, p.file), p.content)
        }
        const verb = opts.dryRun ? `would ${p.action}` : p.action === 'create' ? 'created' : p.action === 'update' ? 'updated' : 'unchanged'
        console.log(`${verb.padEnd(14)} ${p.file}`)
      }
      console.log(chalk.gray(`\nagents will run: ${checkCommandFor({ dir, source })}`))
    })
}

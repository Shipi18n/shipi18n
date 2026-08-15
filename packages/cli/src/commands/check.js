/**
 * `shipi18n check` — structural QA for locale files, designed to live in CI.
 *
 * Deterministic and offline: no LLM, no API key, no network. Reports the
 * failure modes machine translation actually produces — dropped placeholders,
 * collapsed plurals, missing keys, untranslated copy — and exits non-zero so a
 * pipeline can gate on it.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import chalk from 'chalk'
import { checkTranslations } from '@shipi18n/core'

/**
 * Discover how the locale tree is laid out. Two shapes cover the ecosystem:
 *
 *   flat:    locales/en.json, locales/es.json
 *   nested:  locales/en/common.json, locales/es/common.json
 *
 * A source *file* argument (locales/en.json) forces flat with its siblings.
 */
export function discoverLayout(inputPath, sourceLang) {
  const path = resolve(inputPath)
  if (!existsSync(path)) throw new Error(`path not found: ${inputPath}`)

  if (statSync(path).isFile()) {
    const dir = resolve(path, '..')
    const lang = basename(path).replace(/\.json$/, '')
    return flatLayout(dir, lang)
  }

  const entries = readdirSync(path, { withFileTypes: true })
  if (entries.some((e) => e.isFile() && e.name === `${sourceLang}.json`)) {
    return flatLayout(path, sourceLang)
  }
  if (entries.some((e) => e.isDirectory() && e.name === sourceLang)) {
    return nestedLayout(path, sourceLang)
  }
  throw new Error(
    `no source locale found: expected ${join(inputPath, sourceLang + '.json')} or ${join(inputPath, sourceLang)}/`
  )
}

function flatLayout(dir, sourceLang) {
  const langs = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
  if (!langs.includes(sourceLang)) throw new Error(`source file not found: ${join(dir, sourceLang + '.json')}`)
  const files = (lang) => ({ translation: join(dir, `${lang}.json`) })
  return {
    layout: 'flat',
    dir,
    sourceLang,
    source: files(sourceLang),
    targets: langs.filter((l) => l !== sourceLang).map((lang) => ({ lang, files: files(lang) })),
  }
}

function nestedLayout(dir, sourceLang) {
  const langDirs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
  const nsFiles = (lang) =>
    Object.fromEntries(
      readdirSync(join(dir, lang))
        .filter((f) => f.endsWith('.json'))
        .map((f) => [f.replace(/\.json$/, ''), join(dir, lang, f)])
    )
  return {
    layout: 'nested',
    dir,
    sourceLang,
    source: nsFiles(sourceLang),
    targets: langDirs.filter((l) => l !== sourceLang).map((lang) => ({ lang, files: nsFiles(lang) })),
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/**
 * Run the check across every target language and namespace.
 * Unparseable or missing files become findings, never crashes — CI must always
 * get a report and an exit code, not a stack trace.
 */
export function runCheck({ input, source = 'en' }) {
  const layout = discoverLayout(input, source)

  const sourceData = {}
  for (const [ns, file] of Object.entries(layout.source)) sourceData[ns] = readJson(file) // source must parse: a broken source is a usage error

  const languages = []
  for (const { lang, files } of layout.targets) {
    const namespaces = []
    for (const ns of Object.keys(layout.source)) {
      const file = files[ns]
      if (!file || !existsSync(file)) {
        namespaces.push({
          ns,
          findings: [{ type: 'missing-file', severity: 'error', path: ns, message: `file missing: ${lang}/${ns}.json` }],
          stats: { sourceKeys: Object.keys(sourceData[ns]).length, targetKeys: 0, missing: 0, errors: 1, warnings: 0, coverage: 0 },
        })
        continue
      }
      let data
      try {
        data = readJson(file)
      } catch (err) {
        namespaces.push({
          ns,
          findings: [{ type: 'invalid-json', severity: 'error', path: ns, message: `invalid JSON: ${err.message}` }],
          stats: { sourceKeys: Object.keys(sourceData[ns]).length, targetKeys: 0, missing: 0, errors: 1, warnings: 0, coverage: 0 },
        })
        continue
      }
      const { findings, stats } = checkTranslations({ source: sourceData[ns], target: data, targetLang: lang })
      namespaces.push({ ns, findings, stats })
    }

    const agg = namespaces.reduce(
      (a, n) => ({
        sourceKeys: a.sourceKeys + n.stats.sourceKeys,
        errors: a.errors + n.stats.errors,
        warnings: a.warnings + n.stats.warnings,
        covered: a.covered + Math.round(n.stats.coverage * n.stats.sourceKeys),
      }),
      { sourceKeys: 0, errors: 0, warnings: 0, covered: 0 }
    )
    languages.push({
      lang,
      namespaces,
      stats: { ...agg, coverage: agg.sourceKeys ? agg.covered / agg.sourceKeys : 1 },
    })
  }

  const totals = languages.reduce(
    (a, l) => ({ errors: a.errors + l.stats.errors, warnings: a.warnings + l.stats.warnings }),
    { errors: 0, warnings: 0 }
  )
  return { layout: layout.layout, dir: layout.dir, source, languages, totals }
}

/** Decide the exit code from findings and flags. */
export function verdict(result, { failOn = 'error', minCoverage } = {}) {
  const failures = []
  if (failOn === 'error' && result.totals.errors > 0) failures.push(`${result.totals.errors} error(s)`)
  if (failOn === 'warning' && result.totals.errors + result.totals.warnings > 0)
    failures.push(`${result.totals.errors} error(s), ${result.totals.warnings} warning(s)`)
  if (minCoverage != null) {
    for (const l of result.languages) {
      if (l.stats.coverage * 100 < minCoverage)
        failures.push(`${l.lang} coverage ${(l.stats.coverage * 100).toFixed(1)}% < ${minCoverage}%`)
    }
  }
  return { ok: failures.length === 0, failures }
}

function printHuman(result, { verdictResult }) {
  console.log(`\n🔎 shipi18n check — ${result.layout} layout, source '${result.source}', ${result.languages.length} target language(s)\n`)
  for (const l of result.languages) {
    const all = l.namespaces.flatMap((n) => n.findings.map((f) => ({ ...f, ns: n.ns })))
    const mark = l.stats.errors ? chalk.red('✗') : all.length ? chalk.yellow('⚠') : chalk.green('✓')
    console.log(`${mark} ${chalk.bold(l.lang)}  coverage ${(l.stats.coverage * 100).toFixed(1)}%  ${l.stats.errors} error(s), ${l.stats.warnings} warning(s)`)
    for (const f of all.slice(0, 50)) {
      const color = f.severity === 'error' ? chalk.red : chalk.yellow
      const where = result.layout === 'nested' ? `${f.ns}:${f.path}` : f.path
      console.log(`    ${color(f.severity)}  ${chalk.cyan(where)}  ${f.type} — ${f.message}`)
    }
    if (all.length > 50) console.log(chalk.gray(`    … and ${all.length - 50} more`))
  }
  console.log()
  if (verdictResult.ok) console.log(chalk.green('✓ check passed'))
  else console.log(chalk.red(`✗ check failed: ${verdictResult.failures.join('; ')}`))
}

export function checkCommand(program) {
  program
    .command('check [input]')
    .description('Validate translated locale files against the source language (no LLM, no key)')
    .option('-s, --source <language>', 'Source language', 'en')
    .option('--json', 'Machine-readable JSON output')
    .option('--fail-on <level>', 'Exit non-zero on: error | warning | none', 'error')
    .option('--min-coverage <pct>', 'Fail any language below this coverage percentage', parseFloat)
    .action((input = './locales', opts) => {
      let result
      try {
        result = runCheck({ input, source: opts.source })
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`))
        process.exitCode = 2
        return
      }
      const verdictResult = verdict(result, { failOn: opts.failOn, minCoverage: opts.minCoverage })
      if (opts.json) console.log(JSON.stringify({ ...result, ok: verdictResult.ok, failures: verdictResult.failures }, null, 2))
      else printHuman(result, { verdictResult })
      if (!verdictResult.ok) process.exitCode = 1
    })
}

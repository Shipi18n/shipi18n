/**
 * `shipi18n check` — structural QA for locale files, designed to live in CI.
 *
 * Deterministic and offline: no LLM, no API key, no network. Reports the
 * failure modes machine translation actually produces — dropped placeholders,
 * collapsed plurals, missing keys, untranslated copy — and exits non-zero so a
 * pipeline can gate on it.
 *
 * Formats: plain JSON locale trees (flat `locales/<lang>.json` or nested
 * `locales/<lang>/<ns>.json`), Flutter ARB directories, and Apple String
 * Catalogs (`.xcstrings`). Reporters: human, json, sarif, junit.
 */
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { join, basename, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { checkTranslations, parseArbBundle, parseXcstrings } from '@shipi18n/core'
import { REPORTERS } from '../reporters.js'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8')
)

/* ---------------------------------------------------------------- layouts */

/**
 * Discover how a plain-JSON locale tree is laid out. Two shapes cover the
 * ecosystem:
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

/* ------------------------------------------------------- ignores + stats */

/** '*'-glob over the flattened path; matched against both `path` and `ns:path`. */
export function compileIgnores(patterns) {
  if (!patterns) return () => false
  const regexes = String(patterns)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*')}$`))
  return (ns, path) => regexes.some((r) => r.test(path) || r.test(`${ns}:${path}`))
}

/** Stats are recomputed AFTER ignores so a silenced finding vanishes entirely. */
const statsFrom = (findings, sourceKeys, targetKeys) => {
  const missing = findings.filter((f) => f.type === 'missing-key' || f.type === 'missing-file').length
  return {
    sourceKeys,
    targetKeys,
    missing,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    coverage: sourceKeys ? Math.max(0, sourceKeys - missing) / sourceKeys : 1,
  }
}

const rel = (p) => relative(process.cwd(), p).split('\\').join('/')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const countLeaves = (obj) =>
  Object.values(obj).reduce((n, v) => n + (v && typeof v === 'object' ? countLeaves(v) : 1), 0)

/* ------------------------------------------------------------------ modes */

function jsonMode({ input, source, isIgnored }) {
  const layout = discoverLayout(input, source)

  const sourceData = {}
  for (const [ns, file] of Object.entries(layout.source)) sourceData[ns] = readJson(file) // broken source = usage error

  const languages = []
  for (const { lang, files } of layout.targets) {
    const namespaces = []
    for (const ns of Object.keys(layout.source)) {
      const srcKeys = countLeaves(sourceData[ns])
      const file = files[ns]
      if (!file || !existsSync(file)) {
        const findings = [
          { type: 'missing-file', severity: 'error', path: ns, message: `file missing: ${lang}/${ns}.json` },
        ].filter((f) => !isIgnored(ns, f.path))
        namespaces.push({ ns, file: rel(join(layout.dir, lang, `${ns}.json`)), findings, stats: statsFrom(findings, srcKeys, 0) })
        continue
      }
      let data
      try {
        data = readJson(file)
      } catch (err) {
        const findings = [{ type: 'invalid-json', severity: 'error', path: ns, message: `invalid JSON: ${err.message}` }]
        namespaces.push({ ns, file: rel(file), findings, stats: statsFrom(findings, srcKeys, 0) })
        continue
      }
      const { findings, stats } = checkTranslations({ source: sourceData[ns], target: data, targetLang: lang })
      const kept = findings.filter((f) => !isIgnored(ns, f.path))
      namespaces.push({ ns, file: rel(file), findings: kept, stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys) })
    }
    languages.push(aggregateLanguage(lang, namespaces))
  }
  return finishResult({ layout: layout.layout, dir: layout.dir, source, languages })
}

function arbMode({ input, source, isIgnored }) {
  const dir = resolve(input)
  const names = readdirSync(dir).filter((f) => f.endsWith('.arb'))
  const filesByName = Object.fromEntries(names.map((n) => [n, readJson(join(dir, n))]))
  const { languages: byLang, files } = parseArbBundle(filesByName)

  if (!byLang[source]) throw new Error(`no ARB file for source language '${source}' in ${input}`)

  const languages = []
  for (const [lang, data] of Object.entries(byLang)) {
    if (lang === source) continue
    const { findings, stats } = checkTranslations({ source: byLang[source], target: data, targetLang: lang })
    const kept = findings.filter((f) => !isIgnored('arb', f.path))
    const ns = files[lang].replace(/\.arb$/, '')
    languages.push(
      aggregateLanguage(lang, [
        { ns, file: rel(join(dir, files[lang])), findings: kept, stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys) },
      ])
    )
  }
  return finishResult({ layout: 'arb', dir, source, languages })
}

function xcstringsMode({ input, source, isIgnored }) {
  const file = resolve(input)
  const parsed = parseXcstrings(readJson(file))
  const sourceLang = source !== 'en' ? source : parsed.sourceLang
  const ns = basename(file)

  const languages = []
  for (const [lang, data] of Object.entries(parsed.languages)) {
    const { findings, stats } = checkTranslations({ source: parsed.source, target: data, targetLang: lang })
    const adapterFindings = parsed.findings.filter((f) => f.lang === lang).map(({ lang: _l, ...f }) => f)
    const kept = [...findings, ...adapterFindings].filter((f) => !isIgnored(ns, f.path))
    languages.push(
      aggregateLanguage(lang, [{ ns, file: rel(file), findings: kept, stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys) }])
    )
  }
  return finishResult({ layout: 'xcstrings', dir: dirname(file), source: sourceLang, languages })
}

function aggregateLanguage(lang, namespaces) {
  const agg = namespaces.reduce(
    (a, n) => ({
      sourceKeys: a.sourceKeys + n.stats.sourceKeys,
      errors: a.errors + n.stats.errors,
      warnings: a.warnings + n.stats.warnings,
      covered: a.covered + Math.round(n.stats.coverage * n.stats.sourceKeys),
    }),
    { sourceKeys: 0, errors: 0, warnings: 0, covered: 0 }
  )
  return { lang, namespaces, stats: { ...agg, coverage: agg.sourceKeys ? agg.covered / agg.sourceKeys : 1 } }
}

function finishResult(result) {
  result.languages.sort((a, b) => a.lang.localeCompare(b.lang))
  result.totals = result.languages.reduce(
    (a, l) => ({ errors: a.errors + l.stats.errors, warnings: a.warnings + l.stats.warnings }),
    { errors: 0, warnings: 0 }
  )
  return result
}

/**
 * Route by what the input actually is: an .xcstrings catalog, a directory of
 * .arb files, or a plain JSON locale tree.
 */
export function runCheck({ input, source = 'en', ignoreKeys } = {}) {
  const isIgnored = compileIgnores(ignoreKeys)
  const path = resolve(input)
  if (existsSync(path) && statSync(path).isFile() && path.endsWith('.xcstrings')) {
    return xcstringsMode({ input, source, isIgnored })
  }
  if (existsSync(path) && statSync(path).isDirectory() && readdirSync(path).some((f) => f.endsWith('.arb'))) {
    return arbMode({ input, source, isIgnored })
  }
  return jsonMode({ input, source, isIgnored })
}

/* ---------------------------------------------------------------- verdict */

/** Decide the exit code from findings and flags. Reporters never influence this. */
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

/* ---------------------------------------------------------------- command */

export function checkCommand(program) {
  program
    .command('check [input]')
    .description('Validate translated locale files against the source language (no LLM, no key)')
    .option('-s, --source <language>', 'Source language', 'en')
    .option('-r, --reporter <name>', 'Output format: human | json | sarif | junit', 'human')
    .option('-o, --output <file>', 'Write the report to a file instead of stdout')
    .option('--json', 'Shorthand for --reporter json')
    .option('--ignore-keys <patterns>', "Comma-separated '*' globs of keys to silence (path or ns:path)")
    .option('--fail-on <level>', 'Exit non-zero on: error | warning | none', 'error')
    .option('--min-coverage <pct>', 'Fail any language below this coverage percentage', parseFloat)
    .action((input = './locales', opts) => {
      let result
      try {
        result = runCheck({ input, source: opts.source, ignoreKeys: opts.ignoreKeys })
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`))
        process.exitCode = 2
        return
      }
      const verdictResult = verdict(result, { failOn: opts.failOn, minCoverage: opts.minCoverage })

      const name = opts.json ? 'json' : opts.reporter
      const reporter = REPORTERS[name]
      if (!reporter) {
        console.error(chalk.red(`Error: unknown reporter '${name}' (human | json | sarif | junit)`))
        process.exitCode = 2
        return
      }
      const report = reporter(result, verdictResult, { toolVersion: pkg.version })
      if (opts.output) {
        writeFileSync(opts.output, report.endsWith('\n') ? report : report + '\n')
        if (name !== 'human') console.error(chalk.gray(`report written to ${opts.output}`))
      } else {
        console.log(report)
      }
      if (!verdictResult.ok) process.exitCode = 1
    })
}

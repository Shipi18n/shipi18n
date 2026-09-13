/**
 * `shipi18n wp-sync` — the WordPress .po ↔ JED .json drift check.
 *
 * WP JS strings are translated from a JED JSON that `wp i18n make-json` generates
 * from the .po. Edit the .po, forget to re-run make-json, and the JS side quietly
 * ships the stale translation. This command catches that, per JED file, and reuses
 * the same reporters/verdict/baseline machinery as `check` (so SARIF PR annotations
 * and --baseline "fail only on new" work here too).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join, basename, relative } from 'node:path'
import chalk from 'chalk'
import {
  checkJedSync,
  isJed,
  statsFrom,
  aggregateLanguage,
  verdict,
  applyPolicy,
  buildBaseline,
  parseSeverity,
} from '@shipi18n/core'
import { REPORTERS } from '../reporters.js'

const DEFAULT_BASELINE = '.shipi18n/baseline.json'
const rel = (p) => relative(process.cwd(), p) || p

/** JED .json files to check: explicit args (dirs expanded) or sibling auto-discovery. */
function resolveJedFiles(poFile, args) {
  const collect = (dir) => {
    let out = []
    try {
      out = readdirSync(dir)
        .filter((n) => n.endsWith('.json'))
        .map((n) => join(dir, n))
        .filter((f) => {
          try {
            return isJed(JSON.parse(readFileSync(f, 'utf8')))
          } catch {
            return false
          }
        })
    } catch {
      /* unreadable dir → nothing */
    }
    return out
  }
  if (!args || args.length === 0) return collect(dirname(resolve(poFile)))
  const files = []
  for (const a of args) {
    const p = resolve(a)
    if (existsSync(p) && statSync(p).isDirectory()) files.push(...collect(p))
    else files.push(p)
  }
  return files
}

/** Wrap one JED file's findings as a "language" in the standard result shape. */
function fileToLanguage(jedFile, findings) {
  const ns = rel(jedFile)
  const stats = statsFrom(findings, findings.length || 1, findings.length || 1)
  return aggregateLanguage(basename(jedFile), [{ ns, findings, stats }])
}

/** Compact, wp-sync-flavoured human output (the default reporter). */
function humanWpReport(result, v) {
  const lines = ['', `🔎 shipi18n wp-sync — .po '${result.source}' vs ${result.languages.length} JED file(s)`, '']
  for (const l of result.languages) {
    const all = l.namespaces.flatMap((n) => n.findings)
    const n = (t) => all.filter((f) => f.type === t).length
    const mark = l.stats.errors ? chalk.red('✗') : all.length ? chalk.yellow('⚠') : chalk.green('✓')
    const bad = n('invalid-file')
    lines.push(
      `${mark} ${chalk.bold(l.lang)}  ${n('jed-drift')} drift, ${n('jed-orphan')} orphan${bad ? `, ${bad} unreadable` : ''}`
    )
    for (const f of all.slice(0, 50)) {
      const color = f.severity === 'error' ? chalk.red : f.severity === 'warning' ? chalk.yellow : chalk.gray
      const detail =
        f.type === 'jed-drift' ? chalk.gray(`  (.po: "${f.source}" → JSON: "${f.translation}")`) : ''
      lines.push(`    ${color(f.severity)}  ${chalk.cyan(f.path)}  ${f.type} — ${f.message}${detail}`)
    }
    if (all.length > 50) lines.push(chalk.gray(`    … and ${all.length - 50} more`))
  }
  lines.push('')
  lines.push(v.ok ? chalk.green('✓ .po and JED in sync') : chalk.red(`✗ out of sync: ${v.failures.join('; ')}`))
  return lines.join('\n')
}

export function wpSyncCommand(program) {
  program
    .command('wp-sync <po> [jed...]')
    .description('WordPress: check that JED .json files are in sync with their source .po (re-run make-json?)')
    .option('-r, --reporter <name>', 'Output format: human | json | sarif | junit', 'human')
    .option('-o, --output <file>', 'Write the report to a file instead of stdout')
    .option('--json', 'Shorthand for --reporter json')
    .option('--severity <spec>', "Per-rule severity overrides, e.g. 'jed-orphan=off' (error|warning|info|off)")
    .option('--baseline <file>', 'Baseline file: findings already recorded in it do not fail the build')
    .option('--write-baseline', 'Snapshot current findings into --baseline (default .shipi18n/baseline.json) and exit')
    .option('--fail-on <level>', 'Exit non-zero on: error | warning | none', 'error')
    .action((po, jed, opts) => {
      const poFile = resolve(po)
      let poText
      try {
        poText = readFileSync(poFile, 'utf8')
      } catch (err) {
        console.error(chalk.red(`Error: cannot read .po ${po}: ${err.message}`))
        process.exitCode = 2
        return
      }

      const jedFiles = resolveJedFiles(poFile, jed)
      if (jedFiles.length === 0) {
        console.error(
          chalk.yellow(
            `No JED .json files found next to ${po}. Pass them explicitly, or run \`wp i18n make-json\` first.`
          )
        )
        process.exitCode = 2
        return
      }

      const languages = []
      for (const jf of jedFiles) {
        let json
        try {
          json = JSON.parse(readFileSync(jf, 'utf8'))
        } catch (err) {
          languages.push(
            fileToLanguage(jf, [{ type: 'invalid-file', severity: 'error', path: rel(jf), message: `invalid JSON: ${err.message}` }])
          )
          continue
        }
        const { findings } = checkJedSync(poText, json)
        languages.push(fileToLanguage(jf, findings))
      }

      const result = { layout: 'wp-jed', source: basename(poFile), languages }
      result.totals = languages.reduce(
        (a, l) => ({ errors: a.errors + l.stats.errors, warnings: a.warnings + l.stats.warnings }),
        { errors: 0, warnings: 0 }
      )

      if (opts.writeBaseline) {
        const file = resolve(opts.baseline || DEFAULT_BASELINE)
        try {
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, JSON.stringify(buildBaseline(result), null, 2) + '\n')
        } catch (err) {
          console.error(chalk.red(`Error: cannot write baseline ${file}: ${err.message}`))
          process.exitCode = 2
          return
        }
        console.error(chalk.gray(`baseline: recorded findings → ${opts.baseline || DEFAULT_BASELINE}`))
        return
      }

      let severityMap
      if (opts.severity) {
        try {
          severityMap = parseSeverity(opts.severity)
        } catch (err) {
          console.error(chalk.red(`Error: ${err.message}`))
          process.exitCode = 2
          return
        }
      }
      let baseline
      if (opts.baseline) {
        const file = resolve(opts.baseline)
        if (existsSync(file)) {
          try {
            baseline = JSON.parse(readFileSync(file, 'utf8'))
          } catch (err) {
            console.error(chalk.red(`Error: cannot read baseline ${opts.baseline}: ${err.message}`))
            process.exitCode = 2
            return
          }
        } else {
          console.error(chalk.yellow(`note: baseline ${opts.baseline} not found — reporting all findings.`))
        }
      }
      if (severityMap || baseline) applyPolicy(result, { severity: severityMap, baseline })

      const verdictResult = verdict(result, { failOn: opts.failOn })
      const name = opts.json ? 'json' : opts.reporter
      let report
      if (name === 'human') {
        report = humanWpReport(result, verdictResult)
      } else {
        const reporter = REPORTERS[name]
        if (!reporter) {
          console.error(chalk.red(`Error: unknown reporter '${name}' (human | json | sarif | junit)`))
          process.exitCode = 2
          return
        }
        report = reporter(result, verdictResult, {})
      }

      if (opts.output) {
        writeFileSync(opts.output, report.endsWith('\n') ? report : report + '\n')
        if (name !== 'human') console.error(chalk.gray(`report written to ${opts.output}`))
      } else {
        console.log(report)
      }
      if (!verdictResult.ok) process.exitCode = 1
    })
}

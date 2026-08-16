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
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import {
  runCheck,
  runSemantic,
  discoverLayout,
  compileIgnores,
  statsFrom,
  aggregateLanguage,
  SEP,
} from '@shipi18n/core'
import { REPORTERS } from '../reporters.js'
import { locksFor, DEFAULT_LOCKS_PATH } from './lock.js'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8')
)

/* ------------------------------------------------------------------ engine */

// Layout discovery and tree walking live in @shipi18n/core so the CLI and the
// MCP validator tools cannot drift apart. Re-exported here because the CLI's
// tests and semantic pass are written against these names.
export { runCheck, runSemantic, discoverLayout, compileIgnores, statsFrom, aggregateLanguage, SEP }

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
    .option('--glossary <file>', 'Glossary JSON: DNT terms + locked per-language translations (deterministic)')
    .option('--semantic', 'Add the LLM-as-judge pass (BYO key; advisory warnings by default)')
    .option('--semantic-fail', 'Escalate semantic findings to errors (opt-in)')
    .option('-p, --provider <name>', 'LLM provider for --semantic: anthropic | openai', 'anthropic')
    .option('--api-key <key>', 'LLM API key for --semantic (else provider env var)')
    .option('--semantic-model <model>', 'Judge model override')
    .option('--semantic-passes <n>', 'Judge passes for the majority vote', (v) => parseInt(v, 10), 3)
    .option('--semantic-cache <file>', 'Verdict cache path', '.shipi18n/semantic-cache.json')
    .option('--locks <file>', 'Manual-translation lock file', DEFAULT_LOCKS_PATH)
    .option('--no-locks', 'Ignore manual-translation locks')
    .action(async (input = './locales', opts) => {
      let glossary
      if (opts.glossary) {
        try {
          glossary = JSON.parse(readFileSync(opts.glossary, 'utf8'))
        } catch (err) {
          console.error(chalk.red(`Error: cannot read glossary ${opts.glossary}: ${err.message}`))
          process.exitCode = 2
          return
        }
      }

      let result
      try {
        result = runCheck({
          input,
          source: opts.source,
          ignoreKeys: opts.ignoreKeys,
          glossary,
          locks: locksFor(opts),
        })
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`))
        process.exitCode = 2
        return
      }

      if (opts.semantic) {
        const cachePath = resolve(opts.semanticCache)
        let cache = {}
        if (existsSync(cachePath)) {
          try {
            cache = JSON.parse(readFileSync(cachePath, 'utf8'))
          } catch {
            cache = {} // a corrupt cache is just a cold cache
          }
        }
        try {
          const judge = await runSemantic(result, {
            provider: opts.provider,
            apiKey: opts.apiKey,
            model: opts.semanticModel,
            passes: opts.semanticPasses,
            glossary,
            cache,
            fail: Boolean(opts.semanticFail),
          })
          mkdirSync(dirname(cachePath), { recursive: true })
          writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n')
          console.error(
            chalk.gray(
              `semantic: judged ${judge.judged} (${judge.cached} cached), flagged ${judge.flagged}, ` +
                `${judge.calls} model call(s), ${judge.parseFailures} discarded pass(es)`
            )
          )
        } catch (err) {
          console.error(chalk.red(`Semantic pass failed: ${err.message}`))
          process.exitCode = 2
          return
        }
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

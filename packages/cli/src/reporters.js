/**
 * Output formats for `shipi18n check`.
 *
 * Reporters SERIALIZE a result; they never decide it. Exit codes come from
 * `verdict()` alone, so switching reporter can never change whether CI fails.
 */
import chalk from 'chalk'

/* ------------------------------------------------------------------ human */

export function humanReport(result, verdictResult) {
  const lines = []
  lines.push('')
  lines.push(
    `🔎 shipi18n check — ${result.layout} layout, source '${result.source}', ${result.languages.length} target language(s)`
  )
  lines.push('')
  for (const l of result.languages) {
    const all = l.namespaces.flatMap((n) => n.findings.map((f) => ({ ...f, ns: n.ns })))
    const mark = l.stats.errors ? chalk.red('✗') : all.length ? chalk.yellow('⚠') : chalk.green('✓')
    lines.push(
      `${mark} ${chalk.bold(l.lang)}  coverage ${(l.stats.coverage * 100).toFixed(1)}%  ${l.stats.errors} error(s), ${l.stats.warnings} warning(s)`
    )
    for (const f of all.slice(0, 50)) {
      const color = f.severity === 'error' ? chalk.red : chalk.yellow
      const where = result.layout === 'flat' ? f.path : `${f.ns}:${f.path}`
      lines.push(`    ${color(f.severity)}  ${chalk.cyan(where)}  ${f.type} — ${f.message}`)
    }
    if (all.length > 50) lines.push(chalk.gray(`    … and ${all.length - 50} more`))
  }
  lines.push('')
  lines.push(
    verdictResult.ok
      ? chalk.green('✓ check passed')
      : chalk.red(`✗ check failed: ${verdictResult.failures.join('; ')}`)
  )
  return lines.join('\n')
}

/* ------------------------------------------------------------------- json */

export function jsonReport(result, verdictResult) {
  return JSON.stringify({ ...result, ok: verdictResult.ok, failures: verdictResult.failures }, null, 2)
}

/* ------------------------------------------------------------------ sarif */

const RULE_META = {
  'missing-key': 'A key present in the source language is missing from a translation.',
  'orphan-key': 'A key present in a translation does not exist in the source language.',
  'placeholder-missing': 'A placeholder from the source string was dropped in the translation.',
  'placeholder-added': 'The translation contains a placeholder the source does not have.',
  'plural-forms': 'A pipe-separated plural lost one or more of its forms in translation.',
  'empty-value': 'The translation of a non-empty source string is empty.',
  'untranslated': 'The translation is identical to a multi-word source string.',
  'type-mismatch': 'Source and translation values have different JSON types.',
  'invalid-json': 'A locale file could not be parsed as JSON.',
  'missing-file': 'An expected locale file does not exist.',
  'stale-translation': 'The catalog marks this translation as needing review.',
  'glossary-violation': 'A do-not-translate or locked glossary term was not respected.',
  'semantic-mistranslation': 'LLM judge (majority vote): the translation states something different from the source.',
  'semantic-omission': 'LLM judge (majority vote): meaningful source content is missing from the translation.',
  'semantic-addition': 'LLM judge (majority vote): the translation contains claims the source does not make.',
}

/** SARIF 2.1.0 — one run, one rule per finding type, one result per finding. */
export function sarifReport(result, _verdictResult, { toolVersion = '0.0.0' } = {}) {
  const findings = []
  for (const l of result.languages) {
    for (const n of l.namespaces) {
      for (const f of n.findings) findings.push({ lang: l.lang, ns: n.ns, file: n.file, ...f })
    }
  }
  // Deterministic output: stable ordering makes committed SARIF diffable.
  findings.sort((a, b) =>
    `${a.file}|${a.path}|${a.type}`.localeCompare(`${b.file}|${b.path}|${b.type}`)
  )

  const usedTypes = [...new Set(findings.map((f) => f.type))].sort()
  const ruleIndex = Object.fromEntries(usedTypes.map((t, i) => [t, i]))

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'shipi18n-check',
            informationUri: 'https://github.com/Shipi18n/shipi18n',
            version: toolVersion,
            rules: usedTypes.map((t) => ({
              id: t,
              shortDescription: { text: RULE_META[t] || t },
              helpUri: 'https://shipi18n.com/docs/cli/commands',
            })),
          },
        },
        results: findings.map((f) => ({
          ruleId: f.type,
          ruleIndex: ruleIndex[f.type],
          level: f.severity === 'error' ? 'error' : 'warning',
          message: { text: `[${f.lang}] ${f.path}: ${f.message}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: (f.file || '').split('\\').join('/') },
              },
            },
          ],
        })),
      },
    ],
  }
  return JSON.stringify(sarif, null, 2)
}

/* ------------------------------------------------------------------ junit */

const xmlEscape = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/**
 * One <testsuite> per language, one <testcase> per namespace.
 * Errors become <failure>; warnings go to <system-out> — a warning that fails
 * CI gets the tool uninstalled.
 */
export function junitReport(result) {
  const suites = []
  let totalTests = 0
  let totalFailures = 0

  for (const l of result.languages) {
    const cases = []
    let failures = 0
    for (const n of l.namespaces) {
      totalTests++
      const errors = n.findings.filter((f) => f.severity === 'error')
      const warnings = n.findings.filter((f) => f.severity === 'warning')
      const body = []
      if (errors.length) {
        failures++
        totalFailures++
        // Include the offending strings: "dropped {{name}}" is not actionable
        // without seeing WHICH string dropped it.
        const detail = errors
          .map((f) => {
            const lines = [`${f.path}: ${f.type} — ${f.message}`]
            if (f.source != null) lines.push(`  source:      ${f.source}`)
            if (f.translation != null) lines.push(`  translation: ${f.translation}`)
            return lines.join('\n')
          })
          .join('\n')
        body.push(
          `      <failure message="${xmlEscape(`${errors.length} error(s) in ${l.lang}/${n.ns}`)}">${xmlEscape(detail)}</failure>`
        )
      }
      if (warnings.length) {
        const detail = warnings.map((f) => `${f.path}: ${f.type} — ${f.message}`).join('\n')
        body.push(`      <system-out>${xmlEscape(detail)}</system-out>`)
      }
      cases.push(
        body.length
          ? `    <testcase classname="${xmlEscape(l.lang)}" name="${xmlEscape(n.ns)}">\n${body.join('\n')}\n    </testcase>`
          : `    <testcase classname="${xmlEscape(l.lang)}" name="${xmlEscape(n.ns)}"/>`
      )
    }
    suites.push(
      `  <testsuite name="${xmlEscape(l.lang)}" tests="${l.namespaces.length}" failures="${failures}">\n${cases.join('\n')}\n  </testsuite>`
    )
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="shipi18n-check" tests="${totalTests}" failures="${totalFailures}">`,
    ...suites,
    '</testsuites>',
    '',
  ].join('\n')
}

export const REPORTERS = { human: humanReport, json: jsonReport, sarif: sarifReport, junit: junitReport }

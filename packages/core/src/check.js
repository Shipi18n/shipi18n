/**
 * Structural QA for translated locale objects — the `check` half of check→fix.
 *
 * Deterministic: no LLM, no network, no key. Safe for CI and pre-commit, and
 * fast enough to run on every push. The semantic (LLM-as-judge) layer builds on
 * top of these findings; it never replaces them.
 */
import { flatten } from './translate.js'
import { validatePlaceholders } from './placeholders.js'

/**
 * vue-i18n expresses plurals as one pipe-separated string
 * ("You have {count} item | You have {count} items"). If translation collapses
 * the forms, the UI silently renders the wrong plural — or the raw key.
 *
 * Only strings that also interpolate something ({count}, {{n}}, …) are treated
 * as plurals: a literal pipe in prose — "Blog | Shipi18n" SEO titles — is
 * common and must not trip the check. (Found by running check on our own site.)
 */
const pluralFormCount = (str) => String(str).split('|').length
const looksLikePipePlural = (str) => pluralFormCount(str) > 1 && /\{[^}]+\}/.test(str)

/** Heuristic for "probably untranslated": multi-word and contains letters. */
const looksTranslatable = (str) => /\s/.test(str.trim()) && /[a-zA-Z]/.test(str)

/**
 * Compare a source locale object against one translated locale object.
 *
 * @param {object} params
 * @param {Record<string, any>} params.source      source-language locale object
 * @param {Record<string, any>} params.target      translated locale object
 * @param {string} [params.targetLang]             label used in messages
 * @returns {{ findings: Array<object>, stats: object }}
 *
 * Finding: { type, severity: 'error'|'warning', path, message, ...detail }
 * Types: missing-key, orphan-key, placeholder-missing, placeholder-added,
 *        plural-forms, empty-value, untranslated, type-mismatch
 */
/**
 * Deterministic glossary enforcement — no LLM, no key.
 * dnt terms must survive verbatim (case-sensitive: brands are spelled one way);
 * locked per-language terms must appear (case-insensitive) whenever the source
 * uses the term.
 */
function glossaryFindings(s, t, glossary, targetLang, path) {
  const findings = []
  for (const [term, cfg] of Object.entries(glossary)) {
    // Match the term as it actually appears in the source: "@shipi18n/mcp" is a
    // package name, and a translation that preserves it verbatim (lowercase) is
    // CORRECT even though the canonical brand casing differs. Found by the M7
    // eval: three clean pairs were flagged for exactly this.
    const occurrences = s.match(
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    )
    if (!occurrences) continue
    if (cfg.dnt && ![...new Set(occurrences)].every((m) => t.includes(m))) {
      findings.push({
        type: 'glossary-violation',
        severity: 'error',
        path,
        message: `do-not-translate term "${term}" is missing from the translation`,
        source: s,
        translation: t,
      })
    } else if (!cfg.dnt && typeof cfg[targetLang] === 'string' && !t.toLowerCase().includes(cfg[targetLang].toLowerCase())) {
      findings.push({
        type: 'glossary-violation',
        severity: 'error',
        path,
        message: `locked term "${term}" must be translated as "${cfg[targetLang]}"`,
        source: s,
        translation: t,
      })
    }
  }
  return findings
}

export function checkTranslations({ source, target, targetLang = 'target', glossary }) {
  const findings = []
  const src = flatten(source)
  const tgt = flatten(target)
  const srcKeys = Object.keys(src)
  const srcSet = new Set(srcKeys)
  const tgtKeys = Object.keys(tgt)
  const tgtSet = new Set(tgtKeys)

  for (const path of srcKeys) {
    if (!tgtSet.has(path)) {
      findings.push({
        type: 'missing-key',
        severity: 'error',
        path,
        message: `missing in ${targetLang}`,
      })
      continue
    }

    const s = src[path]
    const t = tgt[path]

    if (typeof s !== typeof t) {
      findings.push({
        type: 'type-mismatch',
        severity: 'warning',
        path,
        message: `source is ${typeof s}, ${targetLang} is ${typeof t}`,
      })
      continue
    }
    if (typeof s !== 'string') continue // numbers/booleans/null pass through untranslated by design

    if (t.trim() === '' && s.trim() !== '') {
      findings.push({
        type: 'empty-value',
        severity: 'error',
        path,
        message: 'empty translation',
        source: s,
      })
      continue
    }

    const { missing, added } = validatePlaceholders(s, t)
    if (missing.length) {
      findings.push({
        type: 'placeholder-missing',
        severity: 'error',
        path,
        missing,
        message: `dropped ${missing.join(', ')}`,
        source: s,
        translation: t,
      })
    }
    if (added.length) {
      findings.push({
        type: 'placeholder-added',
        severity: 'warning',
        path,
        added,
        message: `unexpected ${added.join(', ')}`,
        source: s,
        translation: t,
      })
    }

    const srcForms = pluralFormCount(s)
    if (looksLikePipePlural(s) && pluralFormCount(t) !== srcForms) {
      findings.push({
        type: 'plural-forms',
        severity: 'error',
        path,
        message: `source has ${srcForms} plural forms ('|'), ${targetLang} has ${pluralFormCount(t)}`,
        source: s,
        translation: t,
      })
    }

    if (glossary) findings.push(...glossaryFindings(s, t, glossary, targetLang, path))

    // Warning only: "OK", brand names and short labels are often legitimately identical.
    if (s === t && looksTranslatable(s)) {
      findings.push({
        type: 'untranslated',
        severity: 'warning',
        path,
        message: 'identical to source',
        source: s,
      })
    }
  }

  for (const path of tgtKeys) {
    if (!srcSet.has(path)) {
      findings.push({
        type: 'orphan-key',
        severity: 'warning',
        path,
        message: 'not present in source',
      })
    }
  }

  const missingCount = findings.filter((f) => f.type === 'missing-key').length
  return {
    findings,
    stats: {
      sourceKeys: srcKeys.length,
      targetKeys: tgtKeys.length,
      missing: missingCount,
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      coverage: srcKeys.length ? (srcKeys.length - missingCount) / srcKeys.length : 1,
    },
  }
}

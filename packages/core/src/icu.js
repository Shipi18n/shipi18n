/**
 * ICU MessageFormat validation (P6).
 *
 * Strings like `{count, plural, one {# item} other {# items}}` are ICU
 * MessageFormat, not plain placeholders — the sub-messages `{# item}` are NOT
 * interpolation tokens, so the ordinary placeholder check mis-reads them. When
 * the source is an ICU control message we validate it ICU-aware instead:
 *
 *   - the same ARGUMENTS survive translation (dropped/added → placeholder-*),
 *   - the translation still PARSES as ICU (malformed → icu-invalid),
 *   - each plural has the plural CATEGORIES its target locale requires per CLDR
 *     (missing → plural-category). CLDR categories come from the runtime's
 *     built-in Intl.PluralRules — no data dependency, always current.
 *
 * plural-category is a WARNING: some projects intentionally simplify plurals,
 * and a QA gate that fails builds on that judgment call gets uninstalled.
 */
import { parse, TYPE } from '@formatjs/icu-messageformat-parser'

/** Does this string use ICU plural/select control syntax (vs. a plain {name})? */
export const isICUControl = (s) =>
  typeof s === 'string' && /\{\s*[a-zA-Z0-9_]+\s*,\s*(?:plural|selectordinal|select)\s*,/.test(s)

/** Walk an ICU AST collecting argument names and plural nodes. */
function analyze(ast, acc) {
  for (const n of ast) {
    if (n.type === TYPE.argument) acc.args.add(n.value)
    if (n.type === TYPE.select || n.type === TYPE.plural) {
      acc.args.add(n.value)
      if (n.type === TYPE.plural) {
        acc.plurals.push({
          arg: n.value,
          ordinal: n.pluralType === 'ordinal',
          categories: Object.keys(n.options).filter((k) => !k.startsWith('=')),
        })
      }
      for (const opt of Object.values(n.options)) analyze(opt.value, acc)
    }
    if (n.type === TYPE.tag) analyze(n.children || [], acc)
  }
}

const parseICU = (s) => {
  const acc = { args: new Set(), plurals: [] }
  analyze(parse(s), acc)
  return acc
}

/**
 * Plural categories a locale needs for everyday INTEGER quantities, plus the
 * always-mandatory `other`. Sampling integers (not resolvedOptions) is
 * deliberate: Spanish/French declare a `many` category that only fires for
 * compact notation (millions), never plain counts — flagging its absence would
 * be pedantic noise. Integer sampling keeps the high-value cases (Russian/
 * Arabic/Polish few·many, reachable at small counts) and drops that noise.
 */
function requiredCategories(lang, ordinal) {
  try {
    const pr = new Intl.PluralRules(lang, { type: ordinal ? 'ordinal' : 'cardinal' })
    const cats = new Set(['other']) // ICU always requires `other`
    for (let n = 0; n <= 200; n++) cats.add(pr.select(n))
    return [...cats]
  } catch {
    return null // unknown/invalid locale tag — skip the category check
  }
}

/**
 * Validate an ICU source/translation pair. Returns finding objects shaped like
 * the rest of check.js (type/severity/path/message).
 */
export function checkICU(source, translation, targetLang, path) {
  const findings = []
  let src
  try {
    src = parseICU(source)
  } catch {
    return findings // malformed SOURCE is a usage error, not a translation defect
  }

  let tr
  try {
    tr = parseICU(translation)
  } catch (err) {
    findings.push({
      type: 'icu-invalid',
      severity: 'error',
      path,
      message: `translation is not valid ICU MessageFormat: ${err.message}`,
      source,
      translation,
    })
    return findings // can't compare further against a string we can't parse
  }

  const missing = [...src.args].filter((a) => !tr.args.has(a))
  const added = [...tr.args].filter((a) => !src.args.has(a))
  if (missing.length)
    findings.push({
      type: 'placeholder-missing',
      severity: 'error',
      path,
      missing: missing.map((a) => `{${a}}`),
      message: `dropped ${missing.map((a) => `{${a}}`).join(', ')}`,
      source,
      translation,
    })
  if (added.length)
    findings.push({
      type: 'placeholder-added',
      severity: 'warning',
      path,
      added: added.map((a) => `{${a}}`),
      message: `unexpected ${added.map((a) => `{${a}}`).join(', ')}`,
      source,
      translation,
    })

  for (const p of tr.plurals) {
    const required = requiredCategories(targetLang, p.ordinal)
    if (!required) continue
    const missingCats = required.filter((c) => !p.categories.includes(c))
    if (missingCats.length)
      findings.push({
        type: 'plural-category',
        severity: 'warning',
        path,
        message: `plural {${p.arg}} is missing CLDR ${targetLang} categor${missingCats.length > 1 ? 'ies' : 'y'} ${missingCats.join(', ')} (has ${p.categories.join(', ') || 'none'})`,
        source,
        translation,
      })
  }

  return findings
}

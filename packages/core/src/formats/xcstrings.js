/**
 * Apple String Catalog (.xcstrings, Xcode 15+) adapter.
 *
 * One file carries every language:
 *
 *   {
 *     "sourceLanguage": "en",
 *     "strings": {
 *       "Hello %@": {
 *         "localizations": {
 *           "es": { "stringUnit": { "state": "translated", "value": "Hola %@" } },
 *           "de": { "variations": { "plural": {
 *             "one":   { "stringUnit": { "state": "translated", "value": "%lld Datei" } },
 *             "other": { "stringUnit": { "state": "translated", "value": "%lld Dateien" } }
 *           } } }
 *         }
 *       }
 *     }
 *   }
 *
 * Conventions honoured here:
 * - The KEY is the source string when no explicit source localization exists
 *   (that is how Xcode populates catalogs from code).
 * - state "new" (or a missing localization) means untranslated → the key is
 *   omitted from that language's object, so it surfaces as a missing key.
 * - state "needs_review" / "stale" keeps its value but yields a warning finding.
 * - Plural variations become nested objects; target categories the source does
 *   not declare are checked for placeholder parity against the source's "other"
 *   form instead of being reported as orphans — CLDR category sets legitimately
 *   differ per language (ru needs few/many; en does not).
 */
import { validatePlaceholders } from '../placeholders.js'

const unitValue = (node) => node?.stringUnit?.value
const unitState = (node) => node?.stringUnit?.state

function sourceValueFor(key, entry, sourceLang) {
  const explicit = entry?.localizations?.[sourceLang]
  if (!explicit) return key
  if (explicit.stringUnit) return unitValue(explicit) ?? key
  if (explicit.variations?.plural) {
    const out = {}
    for (const [cat, node] of Object.entries(explicit.variations.plural)) out[cat] = unitValue(node)
    return { plural: out }
  }
  return key
}

/**
 * @param {object} parsed  the parsed .xcstrings JSON
 * @returns {{
 *   sourceLang: string,
 *   source: Record<string, any>,
 *   languages: Record<string, object>,
 *   findings: Array<{lang: string, path: string, type: string, severity: string, message: string}>
 * }}
 */
export function parseXcstrings(parsed) {
  const sourceLang = parsed?.sourceLanguage || 'en'
  const strings = parsed?.strings || {}
  const findings = []

  // Which target languages exist anywhere in the catalog?
  const langs = new Set()
  for (const entry of Object.values(strings)) {
    for (const lang of Object.keys(entry?.localizations || {})) {
      if (lang !== sourceLang) langs.add(lang)
    }
  }

  const source = {}
  const languages = Object.fromEntries([...langs].map((l) => [l, {}]))

  for (const [key, entry] of Object.entries(strings)) {
    const srcValue = sourceValueFor(key, entry, sourceLang)
    source[key] = srcValue

    for (const lang of langs) {
      const loc = entry?.localizations?.[lang]
      if (!loc) continue // missing localization → missing-key via the normal check

      if (loc.stringUnit) {
        const state = unitState(loc)
        if (state === 'new') continue // untranslated: treat exactly like missing
        const value = unitValue(loc)
        if (value == null) continue
        if (state === 'needs_review' || state === 'stale') {
          findings.push({
            lang,
            path: key,
            type: 'stale-translation',
            severity: 'warning',
            message: `state is "${state}"`,
          })
        }
        languages[lang][key] = value
        continue
      }

      if (loc.variations?.plural) {
        const srcPlural = typeof srcValue === 'object' ? srcValue.plural : null
        const srcCats = srcPlural ? Object.keys(srcPlural) : []
        const reference = srcPlural ? (srcPlural.other ?? Object.values(srcPlural)[0]) : srcValue
        const kept = {}
        for (const [cat, node] of Object.entries(loc.variations.plural)) {
          const value = unitValue(node)
          if (value == null || unitState(node) === 'new') continue
          if (!srcPlural || srcCats.includes(cat)) {
            kept[cat] = value // shared category → normal parity + placeholder checks
          } else if (typeof reference === 'string') {
            // Extra CLDR category (ru "few"/"many"): legitimate, not an orphan —
            // but its placeholders must still match the source.
            const { missing } = validatePlaceholders(reference, value)
            if (missing.length) {
              findings.push({
                lang,
                path: `${key}.plural.${cat}`,
                type: 'placeholder-missing',
                severity: 'error',
                message: `dropped ${missing.join(', ')}`,
              })
            }
          }
        }
        if (Object.keys(kept).length) languages[lang][key] = { plural: kept }
      }
    }
  }

  return { sourceLang, source, languages, findings }
}

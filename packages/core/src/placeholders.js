/**
 * Placeholder detection + validation.
 *
 * i18n strings embed placeholders that must survive translation byte-for-byte:
 *   - i18next / ICU:  {{name}}, {count}
 *   - printf:         %s, %d, %1$s
 *   - i18next nesting: $t(some.key)
 *   - React-intl:     {name}
 *   - Ruby / others:  %{name}
 *
 * The translation prompt instructs the model to preserve these; these helpers
 * VERIFY the model obeyed, so callers can retry or flag drift.
 */

const PLACEHOLDER_PATTERNS = [
  /\{\{[^}]+\}\}/g, // {{name}}
  /\$t\([^)]*\)/g, // $t(key)
  /%\{[^}]+\}/g, // %{name}
  /%\d+\$[sdfx]/g, // %1$s
  /%[sdfx]/g, // %s %d
  /\{[a-zA-Z0-9_.]+\}/g, // {count} {name}  (after the {{ }} pass)
]

/**
 * Extract all placeholders from a string, in a stable, comparable multiset.
 * @param {string} str
 * @returns {string[]} sorted list of placeholder tokens (duplicates preserved)
 */
export function extractPlaceholders(str) {
  if (typeof str !== 'string') return []
  let working = str
  const found = []
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = working.match(pattern) || []
    for (const m of matches) found.push(m)
    // blank out matched spans so later, looser patterns don't double-count
    working = working.replace(pattern, (m) => ' '.repeat(m.length))
  }
  return found.sort()
}

/**
 * Does the translation preserve exactly the placeholders of the source?
 * @param {string} source
 * @param {string} translation
 * @returns {{ ok: boolean, missing: string[], added: string[] }}
 */
export function validatePlaceholders(source, translation) {
  const src = extractPlaceholders(source)
  const out = extractPlaceholders(translation)
  const outCounts = tally(out)
  const srcCounts = tally(src)
  const missing = []
  const added = []
  for (const [ph, n] of Object.entries(srcCounts)) {
    const diff = n - (outCounts[ph] || 0)
    for (let i = 0; i < diff; i++) missing.push(ph)
  }
  for (const [ph, n] of Object.entries(outCounts)) {
    const diff = n - (srcCounts[ph] || 0)
    for (let i = 0; i < diff; i++) added.push(ph)
  }
  return { ok: missing.length === 0 && added.length === 0, missing, added }
}

function tally(arr) {
  const t = {}
  for (const x of arr) t[x] = (t[x] || 0) + 1
  return t
}

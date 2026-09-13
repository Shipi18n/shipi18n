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
  /%\d+\$(?:@|l{1,2}[du]|[sdfx])/g, // %1$s %1$@ %2$lld  (positional, before bare forms)
  /%l{1,2}[du]/g, // %lld %llu %ld %lu  (Apple/C long forms, before bare %d)
  /%@/g, // %@  (Apple object specifier)
  /%\.\d+f/g, // %.2f  (precision floats)
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

// An ICU argument used with a function: {count, plural, …}, {gender, select, …},
// {n, selectordinal, …}, {v, number}, {d, date}, … The bare `{count,` form does
// not match the single-brace placeholder pattern, so a translation that upgrades
// a plain {count} to an ICU plural would otherwise read as "dropped {count}".
const ICU_ARG =
  /\{\s*([a-zA-Z0-9_]+)\s*,\s*(?:plural|selectordinal|select|number|date|time|spellout|ordinal|duration)\b/g
const SIMPLE_BRACE = /^\{([a-zA-Z0-9_.]+)\}$/ // a react-intl/ICU {name} placeholder token

/** Names used as ICU function arguments in a string. */
function icuArgNames(str) {
  const set = new Set()
  if (typeof str !== 'string') return set
  ICU_ARG.lastIndex = 0
  let m
  while ((m = ICU_ARG.exec(str)) !== null) set.add(m[1])
  return set
}

/**
 * Does the translation preserve exactly the placeholders of the source?
 * A source `{x}` is considered present when the translation uses `x` as an ICU
 * argument (`{x, plural|select|…}`) and vice-versa — upgrading a plain variable
 * to an ICU plural is correct, not a dropped placeholder.
 * @param {string} source
 * @param {string} translation
 * @returns {{ ok: boolean, missing: string[], added: string[] }}
 */
export function validatePlaceholders(source, translation) {
  const src = extractPlaceholders(source)
  const out = extractPlaceholders(translation)
  const outCounts = tally(out)
  const srcCounts = tally(src)
  const srcIcu = icuArgNames(source)
  const outIcu = icuArgNames(translation)
  const missing = []
  const added = []
  for (const [ph, n] of Object.entries(srcCounts)) {
    let diff = n - (outCounts[ph] || 0)
    const b = SIMPLE_BRACE.exec(ph)
    if (diff > 0 && b && outIcu.has(b[1])) diff = 0 // used as an ICU arg in the translation
    for (let i = 0; i < diff; i++) missing.push(ph)
  }
  for (const [ph, n] of Object.entries(outCounts)) {
    let diff = n - (srcCounts[ph] || 0)
    const b = SIMPLE_BRACE.exec(ph)
    if (diff > 0 && b && srcIcu.has(b[1])) diff = 0 // source used it as an ICU arg
    for (let i = 0; i < diff; i++) added.push(ph)
  }
  return { ok: missing.length === 0 && added.length === 0, missing, added }
}

function tally(arr) {
  const t = {}
  for (const x of arr) t[x] = (t[x] || 0) + 1
  return t
}

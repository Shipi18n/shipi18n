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
  return extractOrdered(str).sort()
}

/** Same, in document order — bare printf slots are numbered by appearance. */
function extractOrdered(str) {
  if (typeof str !== 'string') return []
  let working = str
  const found = []
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = working.match(pattern) || []
    for (const m of matches) found.push(m)
    // blank out matched spans so later, looser patterns don't double-count
    working = working.replace(pattern, (m) => ' '.repeat(m.length))
  }
  return found
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
 * Remove balanced ICU argument blocks — `{count, plural, one {…} other {…}}`,
 * `{gender, select, …}` — from a string. Their sub-message text is wrapped in
 * braces as ICU syntax, not placeholders, so `{count, plural, one {element}…}`
 * must not read `{element}` as an invented placeholder. The argument name itself
 * is recovered separately via icuArgNames, so nothing is lost. (Rare real
 * placeholders NESTED inside a sub-message are dropped too — a safe under-report,
 * never a false alarm; ICU-source strings are validated by the ICU checker.)
 */
const ICU_ARG_AT =
  /^\{\s*[a-zA-Z0-9_]+\s*,\s*(?:plural|selectordinal|select|number|date|time|spellout|ordinal|duration)\b/

function stripIcuArgBlocks(str) {
  if (typeof str !== 'string') return ''
  let out = ''
  for (let i = 0; i < str.length; ) {
    if (str[i] === '{' && ICU_ARG_AT.test(str.slice(i))) {
      // walk to the brace that closes this block
      let depth = 0
      let j = i
      for (; j < str.length; j++) {
        if (str[j] === '{') depth++
        else if (str[j] === '}' && --depth === 0) {
          j++
          break
        }
      }
      out += ' '
      i = j
    } else {
      out += str[i]
      i++
    }
  }
  return out
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
  // An empty source string defines no placeholders — nothing to preserve or
  // violate. Key-as-source formats (gettext-JSON / Jed) put the English in the
  // key and leave the base value empty; without this, every placeholder in a
  // translation would read as "added".
  if (typeof source !== 'string' || source.trim() === '') return { ok: true, missing: [], added: [] }
  const srcIcu = icuArgNames(source)
  const outIcu = icuArgNames(translation)
  // Extract from ICU-stripped copies so plural/select sub-message text is not
  // mistaken for placeholders; the argument names are recovered via *Icu above.
  const src = normalizeTokens(extractOrdered(stripIcuArgBlocks(source)))
  const out = normalizeTokens(extractOrdered(stripIcuArgBlocks(translation)))
  const missing = []
  const added = []
  for (const [key, display] of src) {
    if (out.has(key)) continue
    const b = SIMPLE_BRACE.exec(key)
    if (b && outIcu.has(b[1])) continue // used as an ICU arg in the translation
    missing.push(display)
  }
  for (const [key, display] of out) {
    if (src.has(key)) continue
    const b = SIMPLE_BRACE.exec(key)
    if (b && srcIcu.has(b[1])) continue // source used it as an ICU arg
    added.push(display)
  }
  missing.sort()
  added.sort()
  return { ok: missing.length === 0 && added.length === 0, missing, added }
}

// printf-family specifier, bare (%s, %@, %lld, %.2f) or positional (%1$s, %2$@).
const PRINTF_POSITIONAL = /^%(\d+)\$(.+)$/
const PRINTF_BARE = /^%(?!\{)(.+)$/

/**
 * Turn an extracted token list into a comparable identity → display-text map.
 *
 * Named placeholders ({name}, {{name}}, %{name}, $t(key)) identify a VARIABLE:
 * a source that repeats one — vue-i18n pipe plurals "{n} item | {n} items",
 * Rails "%{instance} … %{instance}" — is satisfied by a translation that uses it
 * once (FP#3, found on Chatwoot/Mastodon: 150+ bogus "dropped" reports).
 * Sets, not multisets, for those.
 *
 * printf specifiers identify an ARGUMENT SLOT by position. Bare ones are
 * numbered by order of appearance, so "%@ %@" ≡ "%1$@ %2$@" (FP#5, found on
 * Phoenix iOS: translators switch to positional to reorder — legal and correct),
 * while "%s %s" → "%s" still reports the second slot dropped, and "%3$@" against
 * a two-argument source still reports an unexpected slot (a real crash).
 * Display text stays the token as written in that string.
 */
function normalizeTokens(tokens) {
  const map = new Map()
  let slot = 0
  for (const tok of tokens) {
    let key = tok
    let m
    if ((m = PRINTF_POSITIONAL.exec(tok))) key = `%${m[1]}$${m[2]}`
    else if ((m = PRINTF_BARE.exec(tok))) key = `%${++slot}$${m[1]}`
    if (!map.has(key)) map.set(key, tok)
  }
  return map
}


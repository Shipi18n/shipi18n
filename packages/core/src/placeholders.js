/**
 * Placeholder detection + validation — FORMAT-AWARE.
 *
 * i18n strings embed placeholders that must survive translation:
 *   ICU / react-intl / ARB   {name}  {count, plural, …}  (nested args inside options)
 *   i18next                  {{name}}  {{ name }}  {{count, number}}  $t(key)
 *   vue-i18n                 {name}  {0}  and the literal escape {'{'}
 *   Rails / Ruby             %{name}  %<name>s
 *   gettext / Python         %s %d %1$s %(name)s {name} {0}
 *   Android                  %1$s %s %d %.2f
 *   Apple                    %@ %lld %1$@ %.2f
 *
 * One regex bag for every format was the root cause of most false positives
 * found scanning real repos (a Ruby `%{x}` pattern eating a Turkish `%{percent}`
 * inside an ARB file; `%@ %@` vs `%1$@ %2$@`; `{{ x }}` vs `{{x}}`). Each
 * format now gets its own grammar; JSON trees are sniffed for i18next vs ICU
 * vs vue-i18n. Unknown → `generic` (the old union) so nothing is missed.
 *
 * Identity model: a NAMED placeholder identifies a variable — repeats are one
 * identity (set compare). A bare printf specifier identifies an argument SLOT
 * by position; bare specifiers are numbered by appearance so `%@ %@` ≡
 * `%1$@ %2$@`, while `%s %s` → `%s` still drops slot 2 and `%3$@` against a
 * two-argument source is still an unexpected slot.
 */
import { parse, TYPE } from '@formatjs/icu-messageformat-parser'

/* ------------------------------------------------------------ patterns */
const PAT = {
  DOUBLE: /\{\{\s*[^{}]+?\s*\}\}/g, // {{name}} {{ name }} {{count, number}}
  TFUNC: /\$t\([^)]*\)/g, // $t(key)
  RUBY: /%\{[^}]+\}/g, // %{name}
  RUBY_FMT: /%<[^>]+>[sdfi]/g, // %<name>s
  PY_NAMED: /%\([^)]+\)[sdifr]/g, // %(name)s
  POSITIONAL: /%\d+\$(?:@|l{1,2}[du]|[sdfx])/g, // %1$s %1$@ %2$lld
  APPLE_LONG: /%l{1,2}[du]/g, // %lld %llu %ld %lu
  APPLE_OBJ: /%@/g, // %@
  PRINTF_PREC: /%\.\d+f/g, // %.2f
  PRINTF: /%[sdfx]/g, // %s %d
  BRACE: /\{[a-zA-Z0-9_.]+\}/g, // {name} {0}
}

/**
 * Grammar per format. `ast` = try the ICU parser first (collects argument
 * names recursively, so a `{total}` nested inside a plural option counts).
 * `literal` = strip vue-i18n literal escapes `{'…'}` before the regex pass.
 */
export const FORMATS = {
  icu: { patterns: [PAT.BRACE], ast: true, literal: false },
  i18next: { patterns: [PAT.DOUBLE, PAT.TFUNC], ast: false, literal: false },
  vue: { patterns: [PAT.BRACE, PAT.RUBY], ast: true, literal: true }, // vue-i18n also accepts legacy %{name}
  brace: { patterns: [PAT.DOUBLE, PAT.TFUNC, PAT.BRACE], ast: true, literal: true }, // JSON, style unknown
  rails: { patterns: [PAT.RUBY, PAT.RUBY_FMT], ast: false, literal: false },
  gettext: { patterns: [PAT.PY_NAMED, PAT.POSITIONAL, PAT.PRINTF_PREC, PAT.PRINTF, PAT.BRACE], ast: false, literal: false },
  android: { patterns: [PAT.POSITIONAL, PAT.PRINTF_PREC, PAT.PRINTF], ast: false, literal: false },
  apple: { patterns: [PAT.POSITIONAL, PAT.APPLE_LONG, PAT.APPLE_OBJ, PAT.PRINTF_PREC, PAT.PRINTF], ast: false, literal: false },
  generic: { patterns: Object.values(PAT), ast: true, literal: true },
}

/** A grammar may be a named format or an ad-hoc `{patterns, ast, literal}` object. */
const grammarOf = (format) => (typeof format === 'string' ? FORMATS[format] || FORMATS.generic : format || FORMATS.generic)

/**
 * Sniff the interpolation style of a JSON/YAML locale tree from its SOURCE
 * strings. Returns a format name for validatePlaceholders.
 *   `{{` anywhere            → i18next
 *   `%{`                     → rails
 *   printf-ish `%s`/`%1$s`   → generic (brace + printf; some JSON apps use %s)
 *   otherwise                → brace (ICU / react-intl / vue-i18n share {name})
 */
export function detectFormat(sourceValues, { ext = 'json', unwrappedRailsRoot = false } = {}) {
  if (unwrappedRailsRoot) return 'rails'
  const yaml = /ya?ml/i.test(ext)
  let dbl = 0, ruby = 0, printf = 0, brace = 0, n = 0
  for (const v of sourceValues) {
    if (typeof v !== 'string') continue
    n++
    // `{{` inside ICU control messages (`other {{counter} people}`) is nesting, not i18next.
    if (!ICU_CONTROL.test(v)) dbl += (v.match(I18NEXT_TOKEN) || []).length
    ruby += (v.match(PAT.RUBY) || []).length
    brace += (v.replace(PAT.RUBY, ' ').match(PAT.BRACE) || []).length // `%{x}` is not also `{x}`
    printf += (v.match(/%(\d+\$)?[sd@]\b/g) || []).length
  }
  if (!n) return yaml ? 'rails' : 'brace'
  if (dbl && dbl >= brace / 4) return 'i18next' // {{x}} present and not dwarfed by ICU {x}
  if (ruby && yaml) return 'rails'
  if (ruby && brace) return 'vue' // vue-i18n trees mix {x} with legacy %{x} (Chatwoot)
  if (ruby) return 'rails'
  if (printf && printf * 4 >= brace) return 'generic' // some JSON apps use %s alongside {x}
  return 'brace'
}
const ICU_CONTROL = /\{\s*[a-zA-Z0-9_]+\s*,\s*(?:plural|selectordinal|select)\s*,/
const I18NEXT_TOKEN = /(?<!\{)\{\{\s*[a-zA-Z_$][\w.$-]*\s*(?:,[^{}]*)?\}\}/g

/* --------------------------------------------------------------- ICU AST */
/** Collect ICU argument names recursively (plural/select options, tags). */
function icuArgs(ast, acc) {
  for (const n of ast) {
    if (n.type === TYPE.argument || n.type === TYPE.number || n.type === TYPE.date || n.type === TYPE.time) acc.add(n.value)
    else if (n.type === TYPE.plural || n.type === TYPE.select) {
      acc.add(n.value)
      for (const opt of Object.values(n.options)) icuArgs(opt.value, acc)
    } else if (n.type === TYPE.tag) icuArgs(n.children || [], acc)
  }
  return acc
}

/**
 * Try to read a brace-style string as ICU. Returns a Set of argument names, or
 * null when the string is not parseable as ICU (i18next `{{x}}`, vue literal
 * escapes, stray braces) — callers then fall back to the regex grammar.
 */
function tryIcuArgs(str) {
  // i18next-style {{x}} tokens are not ICU; ICU's own `{a, plural, one {{b} x}}` nesting is fine.
  if (!str.includes('{') || I18NEXT_TOKEN.test(str)) return null
  I18NEXT_TOKEN.lastIndex = 0
  try {
    return icuArgs(parse(str), new Set())
  } catch {
    return null
  }
}

/**
 * Blank out balanced ICU argument blocks (`{n, plural, one {…} other {…}}`) so a
 * regex pass doesn't read option text like `{element}` as a placeholder (FP#2a).
 * Arguments INSIDE the blocks are recovered from the AST instead (FP#8).
 */
const ICU_ARG_AT = /^\{\s*[a-zA-Z0-9_]+\s*,\s*(?:plural|selectordinal|select|number|date|time|spellout|ordinal|duration)\b/
function stripIcuArgBlocks(str) {
  let out = ''
  for (let i = 0; i < str.length; ) {
    if (str[i] === '{' && ICU_ARG_AT.test(str.slice(i))) {
      let depth = 0, j = i
      for (; j < str.length; j++) {
        if (str[j] === '{') depth++
        else if (str[j] === '}' && --depth === 0) { j++; break }
      }
      out += ' '.repeat(j - i)
      i = j
    } else out += str[i++]
  }
  return out
}

/* ---------------------------------------------------------- extraction */
const VUE_LITERAL = /\{'[^']*'\}/g // vue-i18n: {'{'} renders a literal brace

/** Regex pass in document order (bare printf slots are numbered by appearance). */
function extractOrdered(str, grammar) {
  if (typeof str !== 'string') return []
  let working = grammar.literal ? str.replace(VUE_LITERAL, (m) => ' '.repeat(m.length)) : str
  const found = []
  for (const pattern of grammar.patterns) {
    const matches = working.match(pattern) || []
    for (const m of matches) found.push(m)
    // blank out matched spans so later, looser patterns don't double-count
    working = working.replace(pattern, (m) => ' '.repeat(m.length))
  }
  return found
}

/**
 * Extract all placeholder tokens from a string (sorted, duplicates preserved).
 * Public API kept stable; pass a format name for format-aware extraction.
 * @param {string} str
 * @param {string} [format='generic']
 * @returns {string[]}
 */
export function extractPlaceholders(str, format = 'generic') {
  return extractOrdered(str, grammarOf(format)).sort()
}

/* ------------------------------------------------------- normalization */
const PRINTF_POSITIONAL = /^%(\d+)\$(.+)$/
const PRINTF_BARE = /^%(?![{<(])(.+)$/
const DOUBLE_INNER = /^\{\{\s*([^{},]+?)\s*(?:,.*)?\}\}$/ // {{ name, format }} → name

/**
 * Turn a token list into identity → display map.
 *   {{ name }} / {{name, number}}  → identity {{name}}      (whitespace + format spec ignored)
 *   %1$s explicit / bare %s        → identity %<slot>$spec  (bare numbered by appearance)
 *   everything else                → identity = token
 */
function identities(tokens) {
  const map = new Map()
  let slot = 0
  for (const tok of tokens) {
    let key = tok
    let m
    if ((m = PRINTF_POSITIONAL.exec(tok))) key = `%${m[1]}$${m[2]}`
    else if ((m = PRINTF_BARE.exec(tok))) key = `%${++slot}$${m[1]}`
    else if ((m = DOUBLE_INNER.exec(tok))) key = `{{${m[1]}}}`
    if (!map.has(key)) map.set(key, tok)
  }
  return map
}

/** Identities for one side: ICU AST when the grammar allows and the string parses, else regex. */
function sideIdentities(str, grammar) {
  if (grammar.ast) {
    const args = tryIcuArgs(str)
    if (args) {
      // AST args (incl. those nested in plural/select options) ∪ regex tokens found
      // OUTSIDE ICU blocks. The regex leg keeps apostrophe-adjacent placeholders —
      // `{completed}'{total}` — which strict ICU reads as a quoted literal but Flutter
      // (use-escaping off by default) and most JSON runtimes still interpolate.
      const map = new Map()
      for (const a of args) map.set(`{${a}}`, `{${a}}`)
      for (const [k, v] of identities(extractOrdered(stripIcuArgBlocks(str), grammar))) if (!map.has(k)) map.set(k, v)
      return map
    }
  }
  return identities(extractOrdered(str, grammar))
}

/**
 * Does the translation preserve the placeholders of the source?
 * @param {string} source
 * @param {string} translation
 * @param {{format?: string|object}} [opts]  format name (see FORMATS) — default generic
 * @returns {{ ok: boolean, missing: string[], added: string[] }}
 */
export function validatePlaceholders(source, translation, opts = {}) {
  // An empty source defines no placeholders — key-as-source formats (gettext-JSON / Jed)
  // leave the base value empty; without this every translated placeholder reads as "added".
  if (typeof source !== 'string' || source.trim() === '') return { ok: true, missing: [], added: [] }
  const grammar = grammarOf(opts.format)
  const src = sideIdentities(source, grammar)
  const out = sideIdentities(typeof translation === 'string' ? translation : '', grammar)
  const missing = []
  const added = []
  for (const [key, display] of src) if (!out.has(key)) missing.push(display)
  for (const [key, display] of out) if (!src.has(key)) added.push(display)
  missing.sort()
  added.sort()
  return { ok: missing.length === 0 && added.length === 0, missing, added }
}

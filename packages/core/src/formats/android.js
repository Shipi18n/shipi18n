/**
 * Android string resources adapter (the `res/values` + `res/values-<lang>`
 * `strings.xml` files).
 *
 * Android keys the language off the DIRECTORY, not the filename: `values/` is the
 * default (source) and `values-<qualifier>/` holds a translation — `values-es`,
 * `values-fr`, `values-zh-rCN` (r-prefixed region), or the BCP47 `values-b+zh+Hans`.
 * The file is always `strings.xml`.
 *
 * The check engine works on plain locale objects, so this adapter only parses XML
 * into one: `<string>` → key/value, `<plurals>` → a nested { quantity: value }
 * object (so a missing plural form surfaces as a missing key), and
 * `<string-array>` → an array. `translatable="false"` entries are skipped — they
 * are intentionally not localized. XML entities are decoded by the parser;
 * external entities/DTDs are NOT resolved (no XXE).
 */
import { XMLParser } from 'fast-xml-parser'
import { XML_ENTITY_LIMITS } from './xml-safety.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  // Always arrays so a file with one <string> parses like a file with many.
  isArray: (name) => name === 'string' || name === 'item' || name === 'plurals' || name === 'string-array',
  ...XML_ENTITY_LIMITS,
})

/**
 * `values` → null (the default/source dir); `values-es` → 'es';
 * `values-zh-rCN` → 'zh-CN'; `values-b+zh+Hans` → 'zh-Hans'. Non-locale
 * qualifiers (`values-land`, `values-sw600dp`) → null (skipped).
 */
export function androidLangFromValuesDir(dirName) {
  if (dirName === 'values') return null
  const bcp = /^values-b\+(.+)$/.exec(dirName)
  if (bcp) return bcp[1].replace(/\+/g, '-')
  const m = /^values-([a-z]{2,3})(?:-r([A-Z]{2}))?$/.exec(dirName)
  if (!m) return null
  return m[2] ? `${m[1]}-${m[2]}` : m[1]
}

/** Recursively concatenate text, including nested markup like <xliff:g>%1$s</xliff:g>. */
function nodeText(node) {
  if (node == null) return ''
  if (typeof node !== 'object') return String(node)
  let out = ''
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('@_')) continue
    if (k === '#text') out += Array.isArray(v) ? v.join('') : String(v)
    else if (Array.isArray(v)) out += v.map(nodeText).join('')
    else out += nodeText(v)
  }
  return out
}

/** Android backslash escapes (XML entities are already decoded by the parser). */
function unescapeAndroid(s) {
  return String(s)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
}

const isUntranslatable = (el) => el['@_translatable'] === 'false' || el['@_translatable'] === false
const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v])

/**
 * AAPT string-escaping rules, applied to the RAW text (before backslash
 * unescaping). An apostrophe outside a "…"-quoted span must be `\'`, and every
 * `"` must be balanced or escaped `\"` — an unescaped apostrophe is the classic
 * `values-fr/strings.xml` build breaker ("Apostrophe not preceded by \\").
 * Returns a finding descriptor, or null if the string is clean.
 */
function androidEscapingProblem(raw) {
  let inQuote = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '\\') {
      i++ // the next char is escaped — skip it
      continue
    }
    if (c === '"') {
      inQuote = !inQuote
      continue
    }
    if (c === "'" && !inQuote) {
      return {
        type: 'android-unescaped-apostrophe',
        message: "unescaped apostrophe — Android needs \\' or a \"…\"-wrapped string (AAPT compile error)",
      }
    }
  }
  if (inQuote) {
    return {
      type: 'android-unbalanced-quote',
      message: 'unbalanced double-quote — Android needs \\" for a literal quote (AAPT compile error)',
    }
  }
  return null
}

/**
 * Escaping findings for one strings.xml document — the errors AAPT would throw
 * that the check engine can't see once the parser has decoded the values.
 * Checked on the raw node text (backslashes/quotes intact). Untranslatable and
 * unnamed entries are skipped, matching parseAndroidStrings.
 * @param {string} xml
 * @returns {Array<{type:string, severity:'error', path:string, message:string}>}
 */
export function androidEscapingFindings(xml) {
  const res = parser.parse(xml)?.resources || {}
  const findings = []
  const check = (raw, path) => {
    const p = androidEscapingProblem(String(raw))
    if (p) findings.push({ type: p.type, severity: 'error', path, message: p.message })
  }
  for (const s of res.string || []) {
    if (!s['@_name'] || isUntranslatable(s)) continue
    check(nodeText(s), s['@_name'])
  }
  for (const p of res.plurals || []) {
    if (!p['@_name'] || isUntranslatable(p)) continue
    for (const it of asArray(p.item)) if (it['@_quantity']) check(nodeText(it), `${p['@_name']}[${it['@_quantity']}]`)
  }
  for (const a of res['string-array'] || []) {
    if (!a['@_name'] || isUntranslatable(a)) continue
    asArray(a.item).forEach((it, i) => check(nodeText(it), `${a['@_name']}[${i}]`))
  }
  return findings
}

/**
 * Parse a strings.xml document into a plain locale object.
 * @param {string} xml
 * @returns {Record<string, any>}
 */
export function parseAndroidStrings(xml) {
  const res = parser.parse(xml)?.resources || {}
  const out = Object.create(null) // null-proto: crafted __proto__/constructor keys can't pollute

  for (const s of res.string || []) {
    const name = s['@_name']
    if (!name || isUntranslatable(s)) continue
    out[name] = unescapeAndroid(nodeText(s))
  }

  for (const p of res.plurals || []) {
    const name = p['@_name']
    if (!name || isUntranslatable(p)) continue
    const forms = Object.create(null)
    for (const it of asArray(p.item)) {
      const q = it['@_quantity']
      if (q) forms[q] = unescapeAndroid(nodeText(it))
    }
    out[name] = forms
  }

  for (const a of res['string-array'] || []) {
    const name = a['@_name']
    if (!name || isUntranslatable(a)) continue
    out[name] = asArray(a.item).map((it) => unescapeAndroid(nodeText(it)))
  }

  return out
}

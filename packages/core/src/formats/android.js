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

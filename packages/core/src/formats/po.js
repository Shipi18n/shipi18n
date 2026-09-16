/**
 * gettext PO / POT adapter.
 *
 * A PO file carries BOTH sides: the source is the `msgid`, the translation is the
 * `msgstr` (so, like Apple .xcstrings, one file per language holds source+target).
 * This adapter parses to a source object (msgid) and a target object (msgstr) that
 * the generic check engine compares, and emits its own findings for plural forms
 * (which don't map cleanly onto the flat key model): an empty/missing plural form,
 * and placeholders dropped from a plural form relative to the source.
 *
 * Keys are the msgid, disambiguated by msgctxt when present (`ctxt\u0004msgid`,
 * gettext's own separator). The header entry (empty msgid) is parsed for
 * Plural-Forms/Language, not checked.
 */
import { extractPlaceholders } from '../placeholders.js'

export const CTXT_SEP = '\u0004'

/** Decode the C-style escapes gettext uses in quoted strings. */
function unescapePo(s) {
  return s.replace(/\\(["\\ntr]|.)/g, (_, c) => {
    if (c === 'n') return '\n'
    if (c === 't') return '\t'
    if (c === 'r') return '\r'
    return c // \" \\ and any other escaped char → the char itself
  })
}

/** nplurals from a `Plural-Forms: nplurals=N; ...` header value. */
function npluralsFromHeader(headerMsgstr) {
  const m = /nplurals\s*=\s*(\d+)/.exec(headerMsgstr || '')
  return m ? parseInt(m[1], 10) : null
}

/**
 * Low-level: parse a .po/.pot into raw entries (msgid/msgctxt/msgstr/msgstrs/
 * fuzzy), before any check semantics. Shared by parsePo and the WordPress JED
 * sync check, which needs the plural msgstrs that parsePo folds away.
 * @param {string} text
 * @returns {Array<{msgid?:string,msgctxt?:string,msgidPlural?:string,msgstr?:string,msgstrs?:string[],fuzzy?:boolean}>}
 */
export function readPoEntries(text) {
  const lines = text.split(/\r?\n/)
  const entries = []
  let cur = null
  let field = null // which buffer trailing "..." continuation lines append to

  const flush = () => {
    if (cur && (cur.msgid !== undefined || cur.msgctxt !== undefined)) entries.push(cur)
    cur = null
    field = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') {
      flush()
      continue
    }
    if (line.startsWith('#')) {
      if (!cur) cur = {}
      if (line.startsWith('#,')) cur.fuzzy = /\bfuzzy\b/.test(line)
      continue
    }
    const q = (s) => {
      const m = /"((?:[^"\\]|\\.)*)"/.exec(s)
      return m ? unescapePo(m[1]) : ''
    }
    if (line.startsWith('msgctxt')) {
      if (!cur) cur = {}
      cur.msgctxt = q(line); field = 'msgctxt'
    } else if (line.startsWith('msgid_plural')) {
      cur.msgidPlural = q(line); field = 'msgidPlural'
    } else if (line.startsWith('msgid')) {
      if (!cur) cur = {}
      cur.msgid = q(line); field = 'msgid'
    } else if (line.startsWith('msgstr[')) {
      const idx = parseInt(/msgstr\[(\d+)\]/.exec(line)[1], 10)
      cur.msgstrs = cur.msgstrs || []
      cur.msgstrs[idx] = q(line); field = `msgstr[${idx}]`
    } else if (line.startsWith('msgstr')) {
      cur.msgstr = q(line); field = 'msgstr'
    } else if (line.startsWith('"')) {
      // continuation of the previous field
      const val = q(line)
      if (field === 'msgctxt') cur.msgctxt += val
      else if (field === 'msgidPlural') cur.msgidPlural += val
      else if (field === 'msgid') cur.msgid += val
      else if (field === 'msgstr') cur.msgstr = (cur.msgstr || '') + val
      else if (field && field.startsWith('msgstr[')) {
        const i = parseInt(/\[(\d+)\]/.exec(field)[1], 10)
        cur.msgstrs[i] = (cur.msgstrs[i] || '') + val
      }
    }
  }
  flush()
  return entries
}

/**
 * Parse a .po/.pot document into source/target/findings for the check engine.
 * @param {string} text
 * @returns {{ language: string|null, nplurals: number|null,
 *             source: Record<string,string>, target: Record<string,string>,
 *             findings: Array<object> }}
 */
export function parsePo(text) {
  const entries = readPoEntries(text)
  const source = Object.create(null) // null-proto: crafted keys can't pollute
  const target = Object.create(null)
  const findings = []
  let language = null
  let nplurals = null

  for (const e of entries) {
    // Header entry: empty msgid, no context.
    if (e.msgid === '' && e.msgctxt === undefined) {
      const h = e.msgstr || ''
      nplurals = npluralsFromHeader(h)
      const lm = /Language:\s*([\w@-]+)/.exec(h)
      if (lm) language = lm[1].replace(/_/g, '-')
      continue
    }
    const key = e.msgctxt !== undefined ? `${e.msgctxt}${CTXT_SEP}${e.msgid}` : e.msgid
    if (key === undefined) continue

    if (e.msgidPlural !== undefined) {
      // Plural entry — checked here, not via the flat engine.
      const need = extractPlaceholders(e.msgidPlural, 'gettext')
      const forms = e.msgstrs || []
      const expected = nplurals ?? forms.length
      for (let i = 0; i < expected; i++) {
        const v = forms[i]
        if (v === undefined || v === '') {
          findings.push({ type: 'missing-key', severity: 'error', path: `${e.msgid} [plural ${i}]`, message: `missing plural form msgstr[${i}]` })
          continue
        }
        const have = new Set(extractPlaceholders(v, 'gettext'))
        const missing = need.filter((p) => !have.has(p))
        if (missing.length) {
          findings.push({ type: 'placeholder-missing', severity: 'error', path: `${e.msgid} [plural ${i}]`, missing, message: `dropped ${missing.join(', ')}`, source: e.msgidPlural, translation: v })
        }
      }
    } else {
      // Regular entry — hand to the generic engine.
      source[key] = e.msgid
      target[key] = e.msgstr ?? ''
      if (e.fuzzy && e.msgstr) {
        findings.push({ type: 'stale-translation', severity: 'warning', path: e.msgid, message: 'marked fuzzy — needs review' })
      }
    }
  }

  return { language, nplurals, source, target, findings }
}

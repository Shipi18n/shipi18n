/**
 * WordPress `.po` ↔ JED `.json` sync check.
 *
 * Since WP 5.0, JavaScript strings are translated from a JED-format JSON that
 * `wp i18n make-json` GENERATES from the `.po`. The trap: editing the `.po` and
 * forgetting to re-run make-json. The PHP side then shows the new translation
 * while the JS side silently serves the stale one — and nothing in the WP
 * toolchain flags it. This check does.
 *
 * Direction matters. The JED file holds only the strings used in JS, so it is a
 * SUBSET of the `.po`. We therefore validate JED → `.po`:
 *   - jed-drift : a string whose JED translation differs from the current `.po`
 *                 msgstr → the JSON is stale, re-run `wp i18n make-json`.
 *   - jed-orphan: a string in the JED that no longer exists in the `.po` → a
 *                 removed/renamed source string the JSON still references.
 * A `.po` string absent from the JED is NOT flagged — that's a normal PHP-only
 * string, and flagging it would bury the real signal in noise.
 *
 * JED shape (make-json output):
 *   { "domain": "messages",
 *     "locale_data": { "messages": {
 *        "": { "domain": ..., "lang": ..., "plural-forms": ... },   // metadata
 *        "Save": ["Guardar"],                                        // singular
 *        "ctxtSave": ["Guardar (ctx)"],                        // + context
 *        "%s item": ["%s artículo", "%s artículos"] } } }           // plural forms
 */
import { readPoEntries, CTXT_SEP } from './po.js'

/** A key → translation-forms[] map from a `.po`, matching JED's keying. */
function poMap(text) {
  const map = Object.create(null)
  for (const e of readPoEntries(text)) {
    if (e.msgid === undefined) continue
    if (e.msgid === '' && e.msgctxt === undefined) continue // header entry
    const key = e.msgctxt !== undefined ? `${e.msgctxt}${CTXT_SEP}${e.msgid}` : e.msgid
    map[key] = e.msgidPlural !== undefined ? e.msgstrs || [] : [e.msgstr ?? '']
  }
  return map
}

/** True if a parsed JSON value looks like a JED locale file. */
export function isJed(json) {
  return !!json && typeof json === 'object' && !!json.locale_data && typeof json.locale_data === 'object'
}

/** Pull the active domain's translation entries out of a JED object. */
function jedEntries(json) {
  const ld = json.locale_data
  const domains = Object.keys(ld)
  // Prefer the declared domain when present; else the first (make-json emits one).
  const domain = json.domain && ld[json.domain] ? json.domain : domains[0]
  const block = ld[domain]
  if (!block || typeof block !== 'object') throw new Error('JED locale_data has no usable domain block')
  const entries = Object.create(null)
  for (const k of Object.keys(block)) {
    if (k === '') continue // the "" pseudo-entry is metadata, not a string
    const v = block[k]
    entries[k] = Array.isArray(v) ? v : [v] // tolerate a bare string value
  }
  return { domain, entries }
}

/** Human-readable form of a possibly context-qualified key. */
function showKey(key) {
  return key.includes(CTXT_SEP) ? key.split(CTXT_SEP).join(' ⁄ ') : key
}

/**
 * Compare one JED JSON against its source `.po`.
 * @param {string} poText  raw .po/.pot text
 * @param {object} jed     parsed JED JSON object
 * @returns {{ domain?: string, findings: object[],
 *             stats: { checked:number, drift:number, orphan:number,
 *                      jedEntries:number, poEntries:number } }}
 */
export function checkJedSync(poText, jed) {
  if (!isJed(jed)) {
    return {
      findings: [{ type: 'invalid-file', severity: 'error', path: '(jed)', message: 'not a JED file — no locale_data object' }],
      stats: { checked: 0, drift: 0, orphan: 0, jedEntries: 0, poEntries: 0 },
    }
  }
  const po = poMap(poText)
  const { domain, entries } = jedEntries(jed)
  const findings = []
  let checked = 0
  let drift = 0
  let orphan = 0

  for (const key of Object.keys(entries)) {
    const jedForms = entries[key]
    const poForms = po[key]
    const shown = showKey(key)

    if (poForms === undefined) {
      orphan++
      findings.push({
        type: 'jed-orphan',
        severity: 'warning',
        path: shown,
        message: 'in the JS JSON but not in the .po — a removed/renamed source string the build still ships',
      })
      continue
    }

    checked++
    const n = Math.max(jedForms.length, poForms.length)
    for (let i = 0; i < n; i++) {
      const jt = jedForms[i] ?? ''
      const pt = poForms[i] ?? ''
      if (jt !== pt) {
        drift++
        findings.push({
          type: 'jed-drift',
          severity: 'error',
          path: n > 1 ? `${shown} [form ${i}]` : shown,
          message: 'JS JSON is out of sync with the .po — re-run `wp i18n make-json`',
          source: pt,
          translation: jt,
        })
      }
    }
  }

  return {
    domain,
    findings,
    stats: { checked, drift, orphan, jedEntries: Object.keys(entries).length, poEntries: Object.keys(po).length },
  }
}

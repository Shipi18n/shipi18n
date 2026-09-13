/**
 * XLIFF adapter (1.2 and 2.0) — the TMS/CAT interchange format.
 *
 * One XLIFF file carries both sides: `<source>` is the source, `<target>` the
 * translation (like PO / .xcstrings). This adapter parses to source/target
 * objects the generic engine compares (catching dropped placeholders, empty and
 * missing targets), and emits its own `stale-translation` warnings from the
 * segment/target `state` (needs-translation / needs-review / initial).
 *
 *   1.2: <file source-language=".." target-language=".."><body>
 *          <trans-unit id="k"><source/><target state=".."/></trans-unit>  (nestable in <group>)
 *   2.0: <xliff srcLang=".." trgLang=".."><file>
 *          <unit id="k"><segment state=".."><source/><target/></segment></unit>  (nestable in <group>)
 *
 * Inline placeholder markup (<ph>%s</ph>, <g>, <x/>) is captured by concatenating
 * element text, so a placeholder inside <ph> is still checked. Placeholders that
 * live ONLY in an equiv-text/equivText attribute are a known gap (v1). XML
 * entities are decoded; external entities/DTDs are not resolved (no XXE).
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
  isArray: (name) => ['file', 'group', 'trans-unit', 'unit', 'segment'].includes(name),
  ...XML_ENTITY_LIMITS,
})

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v])
const norm = (l) => (typeof l === 'string' && l ? l.replace(/_/g, '-') : null)

/** Recursively concatenate text, including inline markup like <ph>%s</ph>. */
function elemText(node) {
  if (node == null) return ''
  if (typeof node !== 'object') return String(node)
  let out = ''
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('@_')) continue
    if (k === '#text') out += Array.isArray(v) ? v.join('') : String(v)
    else if (Array.isArray(v)) out += v.map(elemText).join('')
    else out += elemText(v)
  }
  return out
}

// States (either version) that mean "not a finished translation".
const UNFINISHED = new Set(['needs-translation', 'new', 'initial', 'needs-adaptation', 'needs-l10n'])
const REVIEW = new Set(['needs-review-translation', 'needs-review-adaptation', 'needs-review-l10n'])

/** Collect all <tag> nodes under a node, descending through <group>. */
function collect(node, tag, out = []) {
  if (!node || typeof node !== 'object') return out
  for (const n of asArray(node[tag])) out.push(n)
  for (const g of asArray(node.group)) collect(g, tag, out)
  return out
}

/**
 * @param {string} xml
 * @returns {{ version:string|null, srcLang:string|null, trgLang:string|null,
 *             source:Record<string,string>, target:Record<string,string>,
 *             findings:Array<object> }}
 */
export function parseXliff(xml) {
  const root = parser.parse(xml)?.xliff
  const empty = { version: null, srcLang: null, trgLang: null, source: {}, target: {}, findings: [] }
  if (!root) return empty

  const version = String(root['@_version'] || '')
  const is20 = version.startsWith('2')
  const source = Object.create(null) // null-proto: crafted unit ids can't pollute
  const target = Object.create(null)
  const findings = []
  let srcLang = is20 ? root['@_srcLang'] : null
  let trgLang = is20 ? root['@_trgLang'] : null

  for (const file of asArray(root.file)) {
    if (!is20) {
      srcLang = srcLang || file['@_source-language']
      trgLang = trgLang || file['@_target-language']
      for (const tu of collect(file.body || file, 'trans-unit')) {
        const id = tu['@_id']
        if (id == null) continue
        source[id] = elemText(tu.source)
        target[id] = elemText(tu.target)
        const state = tu.target && tu.target['@_state']
        if (target[id] && (UNFINISHED.has(state) || REVIEW.has(state))) {
          findings.push({ type: 'stale-translation', severity: 'warning', path: String(id), message: `target state "${state}"` })
        }
      }
    } else {
      for (const unit of collect(file, 'unit')) {
        const id = unit['@_id']
        if (id == null) continue
        let src = ''
        let tgt = ''
        let unfinished = false
        for (const seg of asArray(unit.segment)) {
          src += elemText(seg.source)
          tgt += elemText(seg.target)
          const state = seg['@_state']
          if (elemText(seg.target) && (UNFINISHED.has(state) || REVIEW.has(state))) unfinished = state
        }
        source[id] = src
        target[id] = tgt
        if (unfinished) {
          findings.push({ type: 'stale-translation', severity: 'warning', path: String(id), message: `segment state "${unfinished}"` })
        }
      }
    }
  }

  return { version, srcLang: norm(srcLang), trgLang: norm(trgLang), source, target, findings }
}

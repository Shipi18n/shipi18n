/**
 * Duplicate keys in a JSON object. `JSON.parse` (and Go's encoding/json, Python's
 * json) keep the last value without a word, so a locale file with `"archive"` twice
 * in one object silently loses a translation (matcha ar.json, 2026-10). The parsed
 * object can't show it — this scans the text.
 *
 * Returns one entry per repeated key: dotted path (same shape as `flatten`), the
 * 1-based lines of the first and the repeated occurrence, and whether both values
 * are the same primitive (redundant) or not (one of them is lost).
 * Assumes valid JSON: call it after `JSON.parse` succeeded.
 */
export function findDuplicateKeys(text) {
  const out = []
  const stack = [] // { obj, path, keys: Map<key, { line, raw }>, key, index }
  let line = 1
  let i = 0
  let target = null // where the next value belongs: { entry } for a first occurrence, { dup } for a repeat

  const join = (path, key) => (path ? `${path}.${key}` : String(key))
  const top = () => stack[stack.length - 1]

  // Every value passes through here; `raw` is undefined for an object or array.
  const onValue = (raw) => {
    if (target?.entry) target.entry.raw = raw
    if (target?.dup) {
      const d = target.dup
      out.push({ path: d.path, line: d.line, firstLine: d.first.line, same: raw !== undefined && raw === d.first.raw })
    }
    target = null
  }

  while (i < text.length) {
    const c = text[i]
    if (c === '\n') {
      line++
      i++
    } else if (c === '{' || c === '[') {
      const parent = top()
      const path = !parent ? '' : parent.obj ? join(parent.path, parent.key) : join(parent.path, parent.index)
      onValue(undefined)
      stack.push({ obj: c === '{', path, keys: new Map(), key: null, index: 0 })
      i++
    } else if (c === '}' || c === ']') {
      stack.pop()
      i++
    } else if (c === ',') {
      if (top() && !top().obj) top().index++
      i++
    } else if (c === '"') {
      const startLine = line
      let j = i + 1
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j++
        else if (text[j] === '\n') line++
        j++
      }
      const raw = text.slice(i, j + 1)
      i = j + 1
      let k = i
      while (k < text.length && /\s/.test(text[k])) k++
      const o = top()
      if (o && o.obj && text[k] === ':') {
        // a key
        const key = JSON.parse(raw)
        const first = o.keys.get(key)
        if (first) target = { dup: { path: join(o.path, key), line: startLine, first } }
        else {
          const entry = { line: startLine, raw: undefined }
          o.keys.set(key, entry)
          target = { entry }
        }
        o.key = key
        i = k + 1
      } else {
        onValue(raw)
      }
    } else if (/[-0-9tfn]/.test(c)) {
      let j = i
      while (j < text.length && /[-+0-9.eEtruefalsn]/.test(text[j])) j++
      onValue(text.slice(i, j))
      i = j
    } else {
      i++ // whitespace, ':'
    }
  }
  return out
}

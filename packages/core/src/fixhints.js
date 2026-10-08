/**
 * One-line, imperative fix hints — the line an AI agent (or a tired human) acts on.
 *
 * Reporters attach `fix` to each finding; nothing here influences the verdict.
 * A dropped placeholder and an invented one at the same key are almost always one
 * translated variable name, so they are paired: `{count}` missing + `{cuenta}`
 * added reads as "rename {cuenta} to {count}", grammar-agnostic.
 */

// XLIFF empty inline placeholders are tracked as {x_INTERPOLATION}; name the real markup.
const shown = (ph) => {
  const m = /^\{(x|ph|bx|ex|sc|ec)_(.+)\}$/.exec(ph)
  return m ? `<${m[1]} id="${m[2]}"/>` : ph
}
const list = (xs) => xs.map(shown).join(', ')

function hint(f, pair) {
  switch (f.type) {
    case 'placeholder-missing':
      if (pair?.added?.length === f.missing?.length && f.missing.length === 1)
        return `rename ${pair.added[0]} to ${f.missing[0]}`
      if (pair?.added?.length) return `restore ${list(f.missing)}; remove ${list(pair.added)}`
      return `restore ${list(f.missing || [])} exactly as written in the source`
    case 'placeholder-added':
      if (pair?.missing?.length === f.added?.length && f.added.length === 1)
        return `rename ${f.added[0]} to ${pair.missing[0]}`
      return `remove ${list(f.added || [])}, or use a placeholder the source has`
    case 'plural-forms': {
      const n = String(f.source ?? '').split('|').length
      return `write ${n} forms separated by a plain '|', each keeping the source form's placeholders`
    }
    case 'plural-category':
      if (f.keys?.length) return `add ${f.keys.join(', ')}, translated for those counts`
      return 'add the missing plural categories named above to the ICU plural'
    case 'icu-invalid':
      return 'keep the source ICU structure ({arg, plural|select, …}) and translate only the text inside it'
    case 'missing-key':
      return 'add this key with a translation of the source value'
    case 'orphan-key':
      return 'delete this key, or add it to the source language'
    case 'empty-value':
      return 'translate it, or delete the key so the app falls back to the source language'
    case 'untranslated':
      return "translate it, or ignore the key if it's a name or identifier"
    case 'type-mismatch':
      return 'use the same value type as the source (string vs object/array)'
    case 'invalid-json':
      return 'fix the file syntax so it parses'
    case 'duplicate-key':
      return 'keep one entry for this key (the last one is what users see) and delete the other'
    case 'missing-file':
      return 'create this locale file'
    case 'glossary-violation':
      return 'use the glossary term exactly as specified'
    case 'android-unescaped-apostrophe':
      return "escape the apostrophe as \\' or wrap the whole string in double quotes"
    case 'android-unbalanced-quote':
      return 'escape the double quote as \\" or balance the quotes'
    default:
      return undefined
  }
}

/** Return the hint for each finding of one namespace, in order (undefined if none). */
export function fixHints(findings) {
  const byPath = new Map()
  for (const f of findings) {
    if (f.type !== 'placeholder-missing' && f.type !== 'placeholder-added') continue
    const e = byPath.get(f.path) || {}
    if (f.type === 'placeholder-missing') e.missing = f.missing
    else e.added = f.added
    byPath.set(f.path, e)
  }
  return findings.map((f) => {
    const e = byPath.get(f.path)
    const pair = f.type === 'placeholder-missing' ? { added: e?.added } : f.type === 'placeholder-added' ? { missing: e?.missing } : undefined
    return hint(f, pair)
  })
}

/** Copy of a check result with `fix` on every finding that has a hint. */
export function withFixHints(result) {
  return {
    ...result,
    languages: result.languages.map((l) => ({
      ...l,
      namespaces: l.namespaces.map((n) => {
        const hints = fixHints(n.findings)
        return { ...n, findings: n.findings.map((f, i) => (hints[i] ? { ...f, fix: hints[i] } : f)) }
      }),
    })),
  }
}

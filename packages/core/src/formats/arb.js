/**
 * Flutter ARB (Application Resource Bundle) adapter.
 *
 * ARB is flat JSON: string keys map to string values, `@key` objects carry
 * per-key metadata, and `@@`-prefixed keys are file-level globals. All the
 * checking logic works on plain locale objects, so this adapter only strips
 * metadata and identifies the language — it does no I/O.
 */

const FILENAME_LANG = /_([a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*)\.arb$/

/** `app_en.arb` → 'en', `intl_pt_BR.arb` → 'pt-BR', anything else → null. */
export function arbLangFromFilename(filename) {
  const m = FILENAME_LANG.exec(filename)
  return m ? m[1].replace(/_/g, '-') : null
}

/** The language an ARB document declares for itself, if any. */
export function arbLangFromContent(parsed) {
  const locale = parsed?.['@@locale']
  return typeof locale === 'string' && locale ? locale.replace(/_/g, '-') : null
}

/** Drop `@@globals` and `@key` metadata; keep only translatable entries. */
export function stripArbMetadata(parsed) {
  const out = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('@')) continue
    out[key] = value
  }
  return out
}

/**
 * Normalize a set of parsed ARB documents into per-language locale objects.
 *
 * @param {Record<string, object>} filesByName  basename → parsed JSON
 * @returns {{ languages: Record<string, object>, files: Record<string, string> }}
 *          languages: lang → clean locale object; files: lang → source basename
 */
export function parseArbBundle(filesByName) {
  const languages = {}
  const files = {}
  for (const [name, parsed] of Object.entries(filesByName)) {
    // Filename wins over @@locale: it is what the build system keys off.
    const lang = arbLangFromFilename(name) ?? arbLangFromContent(parsed)
    if (!lang) continue
    languages[lang] = stripArbMetadata(parsed)
    files[lang] = name
  }
  return { languages, files }
}

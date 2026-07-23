/**
 * Core translation engine — provider-agnostic. Ported from the backend's
 * context-aware Claude path, with the single `client.messages.create` call
 * replaced by an injected LLMAdapter.
 */
import { resolveAdapter } from './adapters/index.js'
import { getLanguageName } from './languages.js'
import { validatePlaceholders } from './placeholders.js'

const BATCH_PROMPT = `You are a professional software localizer. Translate each UI string accurately.

Translate from {SOURCE_LANG} to {TARGET_LANG}.

STRINGS TO TRANSLATE (JSON array):
{TEXTS}

Requirements:
1. Preserve ALL placeholders exactly as they appear: {{name}}, {count}, %s, %d, %1$s, $t(...), %{name}.
2. Do not translate placeholder contents, HTML tags, or code.
3. Keep the tone appropriate for application UI (concise, natural).
4. Return ONLY a JSON array of translated strings, in the same order and length as the input. No prose, no markdown fences.`

/**
 * Flatten a nested object into dot-path → string entries (arrays indexed).
 * Non-string leaves (numbers, booleans, null) are left in place and not translated.
 */
export function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, out)
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v && typeof v === 'object') flatten(v, `${path}.${i}`, out)
        else out[`${path}.${i}`] = v
      })
    } else {
      out[path] = value
    }
  }
  return out
}

/** Rebuild a nested object from dot-path entries. */
export function unflatten(flat) {
  const root = {}
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      const nextIsIndex = /^\d+$/.test(parts[i + 1])
      if (node[key] == null) node[key] = nextIsIndex ? [] : {}
      node = node[key]
    }
    node[parts[parts.length - 1]] = value
  }
  return root
}

function parseJsonArray(text, expectedLength) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('LLM did not return a JSON array')
    parsed = JSON.parse(match[0])
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} translations, got ${parsed?.length ?? 0}`)
  }
  return parsed
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Translate a batch of strings via the adapter.
 * @param {string[]} texts
 * @param {object} opts { adapter, from, to, batchSize }
 * @returns {Promise<string[]>}
 */
export async function translateStrings(texts, { adapter, from, to, batchSize = 40 }) {
  const results = new Array(texts.length)
  const batches = chunk(
    texts.map((t, i) => ({ t, i })),
    batchSize
  )
  for (const batch of batches) {
    const prompt = BATCH_PROMPT
      .replace('{SOURCE_LANG}', getLanguageName(from))
      .replace('{TARGET_LANG}', getLanguageName(to))
      .replace('{TEXTS}', JSON.stringify(batch.map((b) => b.t), null, 2))
    const raw = await adapter.complete(prompt, { maxTokens: 8192 })
    const translated = parseJsonArray(raw, batch.length)
    batch.forEach((b, idx) => {
      results[b.i] = translated[idx]
    })
  }
  return results
}

/**
 * Translate a locale JSON object from one language to another, preserving
 * structure and placeholders. BYO-LLM: pass provider + key (or a custom adapter).
 *
 * @param {object} params
 * @param {Record<string, any>} params.content   source locale object
 * @param {string} params.from                   source language code
 * @param {string} params.to                     target language code
 * @param {'anthropic'|'openai'|object} params.provider  provider name or a custom adapter
 * @param {string} [params.apiKey]               LLM API key (else provider env var)
 * @param {string} [params.model]                override the provider's default model
 * @param {Record<string,any>} [params.existing] prior translation → only re-translate changed/new keys (incremental)
 * @returns {Promise<{ result: object, stats: { translated: number, reused: number, placeholderWarnings: Array }}>}
 */
export async function translateJSON({ content, from, to, provider, apiKey, model, existing }) {
  const adapter = resolveAdapter(provider, { apiKey, model })
  const sourceFlat = flatten(content)
  const existingFlat = existing ? flatten(existing) : {}

  // Incremental: only translate keys that are new or whose source presumably changed.
  // (Without a stored source snapshot we treat "already has a translation" as reusable;
  //  callers that track source hashes can pass a filtered `existing`.)
  const entries = Object.entries(sourceFlat)
  const toTranslate = []
  const outFlat = {}
  for (const [path, value] of entries) {
    if (typeof value !== 'string') {
      outFlat[path] = value // non-string leaves pass through untouched
    } else if (existingFlat[path] != null && existingFlat[path] !== '') {
      outFlat[path] = existingFlat[path] // reuse prior translation
    } else {
      toTranslate.push({ path, value })
    }
  }

  const placeholderWarnings = []
  if (toTranslate.length > 0) {
    const translated = await translateStrings(
      toTranslate.map((e) => e.value),
      { adapter, from, to }
    )
    toTranslate.forEach((e, i) => {
      const out = translated[i]
      outFlat[e.path] = out
      const check = validatePlaceholders(e.value, out)
      if (!check.ok) {
        placeholderWarnings.push({ path: e.path, source: e.value, translation: out, ...check })
      }
    })
  }

  return {
    result: unflatten(outFlat),
    stats: {
      translated: toTranslate.length,
      reused: entries.length - toTranslate.length - entries.filter(([, v]) => typeof v !== 'string').length,
      placeholderWarnings,
    },
  }
}

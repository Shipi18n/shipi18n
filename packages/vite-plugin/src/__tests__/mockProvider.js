/**
 * Deterministic mock LLM adapter for tests — no network, no key.
 *
 * @shipi18n/core calls `adapter.complete(prompt)` and expects a JSON-array string of
 * translations in the same order/length as the input array embedded in the prompt.
 * This mock parses the target language name and the input array out of core's batch
 * prompt, then returns dictionary translations (falling back to the source text).
 *
 * @param {Record<string, Record<string,string>>} dict  { sourceText: { LangName: translation } }
 */
export function makeMockProvider(dict = {}) {
  return {
    name: 'mock',
    async complete(prompt) {
      const langMatch = prompt.match(/Translate from .+? to (.+?)\./)
      const langName = langMatch ? langMatch[1].trim() : ''
      const marker = prompt.indexOf('JSON array):')
      const region = marker >= 0 ? prompt.slice(marker) : prompt
      const arrMatch = region.match(/\[[\s\S]*\]/)
      const texts = arrMatch ? JSON.parse(arrMatch[0]) : []
      return JSON.stringify(
        texts.map((t) => {
          const entry = dict[t]
          return entry && entry[langName] != null ? entry[langName] : t
        })
      )
    },
  }
}

/** A provider whose complete() always throws — to exercise error/fallback paths. */
export function makeThrowingProvider(message = 'mock LLM failure') {
  return {
    name: 'mock-throwing',
    async complete() {
      throw new Error(message)
    },
  }
}

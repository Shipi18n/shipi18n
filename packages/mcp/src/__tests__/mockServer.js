/**
 * A fake low-level MCP server whose `createMessage` (sampling) returns deterministic
 * translations, so tools exercise the REAL @shipi18n/core path with no network/key.
 */
export function makeMockMcpServer(dict = {}) {
  return {
    calls: 0,
    async createMessage({ messages }) {
      this.calls++
      const prompt = messages[0].content.text
      const langMatch = prompt.match(/Translate from .+? to (.+?)\./)
      const langName = langMatch ? langMatch[1].trim() : ''
      const marker = prompt.indexOf('JSON array):')
      const region = marker >= 0 ? prompt.slice(marker) : prompt
      const arr = JSON.parse(region.match(/\[[\s\S]*\]/)[0])
      const out = arr.map((t) => (dict[t] && dict[t][langName] != null ? dict[t][langName] : t))
      return { role: 'assistant', model: 'mock', content: { type: 'text', text: JSON.stringify(out) } }
    },
  }
}

/** A sampling server that always rejects — simulates a client without sampling support. */
export function makeNoSamplingServer() {
  return {
    async createMessage() {
      throw new Error('Method not found')
    },
  }
}

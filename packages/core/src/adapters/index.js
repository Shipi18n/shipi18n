/**
 * LLM provider adapters. Each adapter exposes a single method:
 *   complete(prompt: string, opts?: { maxTokens?: number }): Promise<string>
 *
 * This is the ONLY provider-specific surface in @shipi18n/core. The translation
 * engine, prompts, placeholder handling, and batching are all provider-agnostic.
 *
 * @typedef {Object} LLMAdapter
 * @property {(prompt: string, opts?: { maxTokens?: number }) => Promise<string>} complete
 * @property {string} name
 */

/**
 * The SDKs are optional peer deps, so a missing one is the single most common
 * first-run failure. Naming `npm i <sdk>` alone is a trap for the npx path:
 * `npx @shipi18n/cli` runs the CLI out of npm's throwaway cache, which resolves
 * imports against itself and never sees the project's node_modules. The only
 * fix that works there is installing both, then running the local binary.
 * @param {string} provider
 * @param {string} sdk
 * @returns {Error}
 */
function missingSdkError(provider, sdk) {
  return new Error(
    `The '${provider}' provider requires the '${sdk}' package.\n` +
      `  Install it next to the CLI:  npm i -D @shipi18n/cli ${sdk}\n` +
      `  then run:                    npx shipi18n <command>\n` +
      `  If you ran 'npx @shipi18n/cli', installing ${sdk} on its own will not help — ` +
      `that copy of the CLI cannot see your project's node_modules.`
  )
}

/**
 * Anthropic Claude adapter. Requires the optional peer dep `@anthropic-ai/sdk`.
 * Key resolved from opts.apiKey or the ANTHROPIC_API_KEY env var (SDK default).
 * @param {{ apiKey?: string, model?: string }} [config]
 * @returns {LLMAdapter}
 */
export function anthropicAdapter(config = {}) {
  const model = config.model || 'claude-opus-4-8'
  let clientPromise = null
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = import('@anthropic-ai/sdk')
        .then(({ default: Anthropic }) => new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {}))
        .catch(() => {
          throw missingSdkError('anthropic', '@anthropic-ai/sdk')
        })
    }
    return clientPromise
  }

  return {
    name: 'anthropic',
    async complete(prompt, opts = {}) {
      const client = await getClient()
      // Adaptive thinking + generous default; the model decides depth.
      const res = await client.messages.create({
        model,
        max_tokens: opts.maxTokens || 4096,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = (res.content || []).find((b) => b.type === 'text')
      if (!text) throw new Error('Anthropic response contained no text block')
      return text.text.trim()
    },
  }
}

/**
 * OpenAI adapter. Requires the optional peer dep `openai`.
 * Key resolved from opts.apiKey or the OPENAI_API_KEY env var (SDK default).
 * @param {{ apiKey?: string, model?: string }} [config]
 * @returns {LLMAdapter}
 */
export function openaiAdapter(config = {}) {
  const model = config.model || 'gpt-4o'
  let clientPromise = null
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = import('openai')
        .then(({ default: OpenAI }) => new OpenAI(config.apiKey ? { apiKey: config.apiKey } : {}))
        .catch(() => {
          throw missingSdkError('openai', 'openai')
        })
    }
    return clientPromise
  }

  return {
    name: 'openai',
    async complete(prompt, opts = {}) {
      const client = await getClient()
      const res = await client.chat.completions.create({
        model,
        max_tokens: opts.maxTokens || 4096,
        messages: [{ role: 'user', content: prompt }],
      })
      const content = res.choices?.[0]?.message?.content
      if (!content) throw new Error('OpenAI response contained no content')
      return content.trim()
    },
  }
}

/**
 * Resolve a provider name (+ config) to an adapter instance.
 * @param {'anthropic'|'openai'|LLMAdapter} provider
 * @param {{ apiKey?: string, model?: string }} [config]
 * @returns {LLMAdapter}
 */
export function resolveAdapter(provider, config = {}) {
  if (provider && typeof provider === 'object' && typeof provider.complete === 'function') {
    return provider // already an adapter (also lets users bring a custom provider)
  }
  switch (provider) {
    case 'anthropic':
      return anthropicAdapter(config)
    case 'openai':
      return openaiAdapter(config)
    default:
      throw new Error(
        `Unknown provider '${provider}'. Use 'anthropic', 'openai', or pass a custom { complete } adapter.`
      )
  }
}

/**
 * Provider resolution for the MCP server.
 *
 * Two modes, both feeding @shipi18n/core's single `{ complete }` adapter interface:
 *
 *   1. BYO-LLM  — an explicit `provider` arg, or an ANTHROPIC_API_KEY / OPENAI_API_KEY in the
 *                 server env → core's anthropic/openai adapter calls YOUR model directly.
 *   2. Sampling — no provider and no key → a "zero-config" adapter that asks the MCP *client*
 *                 (Claude Desktop, Cursor, …) to run the completion via `sampling/createMessage`.
 *                 No API key needed; uses whatever model the client is running.
 */
import { resolveAdapter } from '@shipi18n/core'

const PROVIDER_ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }

/**
 * Build an LLM adapter backed by MCP sampling — the client runs the completion.
 * @param {{ createMessage: Function }} mcpServer  the low-level server (McpServer#server)
 * @returns {{ name: string, complete: (prompt: string, opts?: { maxTokens?: number }) => Promise<string> }}
 */
export function samplingAdapter(mcpServer) {
  return {
    name: 'mcp-sampling',
    async complete(prompt, opts = {}) {
      let res
      try {
        res = await mcpServer.createMessage({
          messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
          maxTokens: opts.maxTokens || 4096,
        })
      } catch (err) {
        throw new Error(
          'This MCP client does not support sampling, and no LLM API key is set. ' +
            'Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the server env, or pass a `provider`. ' +
            `(sampling error: ${err?.message || err})`
        )
      }
      const block = res?.content
      const text = Array.isArray(block)
        ? block.find((b) => b?.type === 'text')?.text
        : block?.type === 'text'
          ? block.text
          : undefined
      if (typeof text !== 'string') throw new Error('Sampling returned no text content')
      return text.trim()
    },
  }
}

/**
 * Resolve the adapter + a human-readable mode label for a tool call.
 * @param {object} params
 * @param {{ createMessage: Function }} params.mcpServer
 * @param {'anthropic'|'openai'} [params.provider]  explicit provider (optional)
 * @param {string} [params.apiKey]                  explicit key (optional)
 * @param {string} [params.model]                   model override (optional)
 * @param {NodeJS.ProcessEnv} [params.env]          defaults to process.env
 * @returns {{ adapter: object, mode: string }}
 */
export function resolveProvider({ mcpServer, provider, apiKey, model, env = process.env }) {
  // 1. Explicit provider wins.
  if (provider) {
    if (!PROVIDER_ENV[provider]) {
      throw new Error(`Unknown provider '${provider}'. Use 'anthropic', 'openai', or omit it to use MCP sampling.`)
    }
    const key = apiKey || env[PROVIDER_ENV[provider]]
    if (!key) {
      throw new Error(`Provider '${provider}' needs a key: set ${PROVIDER_ENV[provider]} or pass apiKey.`)
    }
    return { adapter: resolveAdapter(provider, { apiKey: key, model }), mode: `${provider} (BYO key)` }
  }

  // 2. Env key present → BYO-LLM without an explicit provider arg.
  if (env[PROVIDER_ENV.anthropic]) {
    return { adapter: resolveAdapter('anthropic', { apiKey: env[PROVIDER_ENV.anthropic], model }), mode: 'anthropic (env key)' }
  }
  if (env[PROVIDER_ENV.openai]) {
    return { adapter: resolveAdapter('openai', { apiKey: env[PROVIDER_ENV.openai], model }), mode: 'openai (env key)' }
  }

  // 3. Fall back to MCP sampling (client's model, zero key).
  return { adapter: samplingAdapter(mcpServer), mode: 'mcp-sampling (client model)' }
}

/**
 * @shipi18n/core — open-source, bring-your-own-LLM i18n translation engine.
 *
 * @example
 *   import { translateJSON } from '@shipi18n/core'
 *   const { result } = await translateJSON({
 *     content: { greeting: 'Hello {{name}}' },
 *     from: 'en', to: 'es',
 *     provider: 'anthropic',           // or 'openai', or a custom { complete } adapter
 *     apiKey: process.env.ANTHROPIC_API_KEY,
 *   })
 */
export { translateJSON, translateStrings, flatten, unflatten } from './translate.js'
export { extractPlaceholders, validatePlaceholders } from './placeholders.js'
export { getLanguageName } from './languages.js'
export { anthropicAdapter, openaiAdapter, resolveAdapter } from './adapters/index.js'

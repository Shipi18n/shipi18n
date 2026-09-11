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
export { isICUControl, checkICU } from './icu.js'
export { checkTranslations } from './check.js'
export { runCheck, runSemantic, discoverLayout, compileIgnores, statsFrom, aggregateLanguage, SEP } from './tree.js'
export { lockId, lockEntry, lockFinding, emptyLocks, normalizeLocks, LOCKS_VERSION } from './locks.js'
export { parseArbBundle, arbLangFromFilename, arbLangFromContent, stripArbMetadata } from './formats/arb.js'
export { parseXcstrings } from './formats/xcstrings.js'
export { reviewTranslations, DEFAULT_JUDGE_MODELS, buildReviewPrompt, parseVerdicts, pairHash } from './review.js'
export { getLanguageName, LANGUAGE_NAMES } from './languages.js'
export { anthropicAdapter, openaiAdapter, resolveAdapter } from './adapters/index.js'
// Reporters + verdict lived in the CLI through 2.5.x; lifted here (core 2.6.0)
// so the GitHub Action can run `check` without depending on the CLI. The CLI
// re-exports these names for compatibility.
export { humanReport, jsonReport, sarifReport, junitReport, REPORTERS, RULE_META, verdict } from './reporters.js'

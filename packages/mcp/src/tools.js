/**
 * Tool definitions for the Shipi18n MCP server. Each factory returns
 * `{ name, config, handler }` where `handler(args)` resolves to an MCP tool result.
 * Handlers are provider-agnostic — they resolve an adapter (BYO key or MCP sampling)
 * and run @shipi18n/core.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { translateJSON, translateStrings, validatePlaceholders, LANGUAGE_NAMES } from '@shipi18n/core'
import { resolveProvider } from './provider.js'
import { validatorTools } from './validators.js'

const PROVIDER_ARG = z.enum(['anthropic', 'openai']).optional()

function ok(text, structuredContent) {
  const res = { content: [{ type: 'text', text }] }
  if (structuredContent) res.structuredContent = structuredContent
  return res
}
function fail(text) {
  return { content: [{ type: 'text', text }], isError: true }
}
function parseTargets(to) {
  return String(to).split(',').map((s) => s.trim()).filter(Boolean)
}

/** translate_json — translate an in-memory locale JSON object to one or more languages. */
export function translateJsonTool(mcpServer, env) {
  return {
    name: 'translate_json',
    config: {
      title: 'Translate JSON',
      description:
        'Translate an i18n locale JSON object to one or more target languages, preserving structure and placeholders. ' +
        'Requires your own LLM key (ANTHROPIC_API_KEY/OPENAI_API_KEY). For key-free work use the validation tools. Legacy: the MCP client\'s model via sampling.',
      inputSchema: {
        content: z.string().describe('The source locale as a JSON string, e.g. {"greeting":"Hello {{name}}"}'),
        to: z.string().describe('Target language code(s), comma-separated, e.g. "es,fr,de"'),
        from: z.string().optional().describe('Source language code (default: en)'),
        provider: PROVIDER_ARG.describe('Force a provider: anthropic or openai. Omit to auto-detect / use sampling.'),
        model: z.string().optional().describe('Override the provider default model'),
      },
    },
    async handler({ content, to, from = 'en', provider, model }) {
      let source
      try {
        source = JSON.parse(content)
      } catch (e) {
        return fail(`Invalid JSON in "content": ${e.message}`)
      }
      let adapter, mode
      try {
        ;({ adapter, mode } = resolveProvider({ mcpServer, provider, model, env }))
      } catch (e) {
        return fail(e.message)
      }

      const targets = parseTargets(to)
      const result = {}
      const warnings = []
      for (const lang of targets) {
        const { result: r, stats } = await translateJSON({ content: source, from, to: lang, provider: adapter })
        result[lang] = r
        for (const w of stats.placeholderWarnings) warnings.push({ lang, ...w })
      }

      const summary =
        `Translated ${Object.keys(source).length ? '' : '(empty) '}locale from ${from} to ${targets.join(', ')} via ${mode}.` +
        (warnings.length ? ` ⚠ ${warnings.length} placeholder warning(s).` : '')
      return ok(`${summary}\n\n${JSON.stringify(result, null, 2)}`, { translations: result, warnings, mode })
    },
  }
}

/** translate_file — read a locale file, translate it, and write <lang>.json outputs. */
export function translateFileTool(mcpServer, env) {
  return {
    name: 'translate_file',
    config: {
      title: 'Translate File',
      description:
        'Read a JSON locale file from disk, translate it into one or more languages, and write <lang>.json files. ' +
        'Set incremental=true to reuse existing output files and only translate new/missing keys.',
      inputSchema: {
        path: z.string().describe('Path to the source locale JSON file, e.g. locales/en.json'),
        to: z.string().describe('Target language code(s), comma-separated, e.g. "es,fr,de"'),
        from: z.string().optional().describe('Source language code (default: en)'),
        outDir: z.string().optional().describe('Output directory (default: same directory as the source file)'),
        incremental: z.boolean().optional().describe('Reuse existing <lang>.json and only translate new keys'),
        provider: PROVIDER_ARG,
        model: z.string().optional(),
      },
    },
    async handler({ path, to, from = 'en', outDir, incremental = false, provider, model }) {
      const srcPath = resolve(path)
      if (!existsSync(srcPath)) return fail(`File not found: ${srcPath}`)
      let source
      try {
        source = JSON.parse(readFileSync(srcPath, 'utf8'))
      } catch (e) {
        return fail(`Invalid JSON in ${srcPath}: ${e.message}`)
      }
      let adapter, mode
      try {
        ;({ adapter, mode } = resolveProvider({ mcpServer, provider, model, env }))
      } catch (e) {
        return fail(e.message)
      }

      const targetDir = outDir ? resolve(outDir) : dirname(srcPath)
      mkdirSync(targetDir, { recursive: true })
      const targets = parseTargets(to)
      const written = []
      const warnings = []
      for (const lang of targets) {
        const outPath = join(targetDir, `${lang}.json`)
        const existing = incremental && existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : undefined
        const { result, stats } = await translateJSON({ content: source, from, to: lang, provider: adapter, existing })
        writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8')
        written.push({ lang, path: outPath, translated: stats.translated, reused: stats.reused })
        for (const w of stats.placeholderWarnings) warnings.push({ lang, path: w.path, missing: w.missing })
      }

      const lines = written.map((w) => `  • ${w.path} (${w.translated} translated, ${w.reused} reused)`).join('\n')
      const summary =
        `Translated ${srcPath} (${from} → ${targets.join(', ')}) via ${mode}:\n${lines}` +
        (warnings.length ? `\n⚠ ${warnings.length} placeholder warning(s): ${warnings.map((w) => `${w.lang}:${w.path}`).join(', ')}` : '')
      return ok(summary, { written, warnings, mode })
    },
  }
}

/** list_languages — enumerate supported language codes/names. */
export function listLanguagesTool() {
  return {
    name: 'list_languages',
    config: {
      title: 'List Languages',
      description: 'List the language codes and names Shipi18n recognizes (any BCP-47 code works; these have friendly names).',
      inputSchema: {},
    },
    async handler() {
      const langs = Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ code, name }))
      const text = langs.map((l) => `${l.code} — ${l.name}`).join('\n')
      return ok(text, { languages: langs })
    },
  }
}

/** check_placeholders — validate that a translation preserves a source string's placeholders. */
export function checkPlaceholdersTool() {
  return {
    name: 'check_placeholders',
    config: {
      title: 'Check Placeholders',
      description: 'Verify a translated string preserves all placeholders from the source (no LLM call).',
      inputSchema: {
        source: z.string().describe('The source string'),
        translation: z.string().describe('The translated string to check'),
      },
    },
    async handler({ source, translation }) {
      const check = validatePlaceholders(source, translation)
      const text = check.ok
        ? '✓ All placeholders preserved.'
        : `✗ Placeholder mismatch — missing: ${JSON.stringify(check.missing)}${check.added?.length ? `, unexpected: ${JSON.stringify(check.added)}` : ''}`
      return ok(text, check)
    },
  }
}

export function allTools(mcpServer, env = process.env) {
  return [
    // Keyless validators first — they are the headline capability and the only
    // tools that work with no configuration whatsoever.
    ...validatorTools(),
    listLanguagesTool(),
    checkPlaceholdersTool(),
    // Translation requires a provider key.
    translateJsonTool(mcpServer, env),
    translateFileTool(mcpServer, env),
  ]
}

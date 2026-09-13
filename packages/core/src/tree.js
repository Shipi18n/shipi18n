/**
 * Locale-tree walking: layout discovery, per-file checking, aggregation.
 *
 * Lives in core so that every consumer — the CLI, the MCP validator tools, and
 * anything users build — sees identical discovery rules. A second copy would
 * drift, and these rules have been bought with real bugs: dot-directories are
 * not languages (our own .shipi18n/ cache lives there), ARB language codes are
 * a locale-shaped filename tail, and a missing or unparseable file means zero
 * coverage rather than one finding.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, resolve, relative, dirname } from 'node:path'
import { checkTranslations } from './check.js'
import { parse as parseYaml } from 'yaml'
import { parseArbBundle } from './formats/arb.js'
import { parseXcstrings } from './formats/xcstrings.js'
import { parseAndroidStrings, androidLangFromValuesDir } from './formats/android.js'
import { parsePo } from './formats/po.js'
import { parseXliff } from './formats/xliff.js'

// Locale files are JSON or YAML. The check logic is format-agnostic once the
// file is parsed to an object, so support is entirely a parse + discovery
// concern. `.json` is matched first so it stays the default when both exist.
const LOCALE_EXT = /\.(json|ya?ml)$/i
const stripExt = (name) => name.replace(LOCALE_EXT, '')
const readData = (file) =>
  /\.ya?ml$/i.test(file) ? parseYaml(readFileSync(file, 'utf8')) : JSON.parse(readFileSync(file, 'utf8'))

// Bound worst-case memory on untrusted locale files: a huge single text node or
// attribute (or an enormous PO msgstr) that entity/nesting limits don't cover.
// Real locale files are far smaller than 10 MB.
const MAX_LOCALE_BYTES = 10 * 1024 * 1024
const readTextCapped = (file) => {
  const { size } = statSync(file)
  if (size > MAX_LOCALE_BYTES) throw new Error(`file too large: ${size} bytes (limit ${MAX_LOCALE_BYTES})`)
  return readFileSync(file, 'utf8')
}
import { flatten, MAX_DEPTH } from './translate.js'
import { lockId, lockFinding } from './locks.js'
import { reviewTranslations } from './review.js'

/** Separator for `ns<NUL>path` composite keys (paths may contain ':'). */
export const SEP = '\u0000'

/* ---------------------------------------------------------------- layouts */

/**
 * Discover how a plain-JSON locale tree is laid out. Two shapes cover the
 * ecosystem:
 *
 *   flat:    locales/en.json, locales/es.json
 *   nested:  locales/en/common.json, locales/es/common.json
 *
 * A source *file* argument (locales/en.json) forces flat with its siblings.
 */
export function discoverLayout(inputPath, sourceLang) {
  const path = resolve(inputPath)
  if (!existsSync(path)) throw new Error(`path not found: ${inputPath}`)

  if (statSync(path).isFile()) {
    const dir = resolve(path, '..')
    const lang = stripExt(basename(path))
    return flatLayout(dir, lang)
  }

  const entries = readdirSync(path, { withFileTypes: true })
  if (entries.some((e) => e.isFile() && LOCALE_EXT.test(e.name) && stripExt(e.name) === sourceLang)) {
    return flatLayout(path, sourceLang)
  }
  if (entries.some((e) => e.isDirectory() && e.name === sourceLang)) {
    return nestedLayout(path, sourceLang)
  }
  throw new Error(
    `no source locale found: expected ${join(inputPath, sourceLang + '.{json,yaml}')} or ${join(inputPath, sourceLang)}/`
  )
}

/**
 * A locale file is named after a locale. Requiring BCP-47 shape keeps
 * companions out of the language list — glossary.json, manifest.json,
 * package.json all live happily beside locale files, and treating them as
 * languages produces a wall of nonsense findings. (Found in review: passing
 * --glossary locales/glossary.json made "glossary" a 0%-coverage language.)
 */
const LOCALE_NAME = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

export function flatLayout(dir, sourceLang) {
  // lang → actual file path (extension resolved, since a tree may be .json or
  // .yaml — .json wins if both somehow exist for the same lang).
  const pathByLang = {}
  for (const f of readdirSync(dir).sort()) {
    if (f.startsWith('.') || !LOCALE_EXT.test(f)) continue
    const name = stripExt(f)
    if (!(LOCALE_NAME.test(name) || name === sourceLang)) continue
    if (!pathByLang[name] || f.endsWith('.json')) pathByLang[name] = join(dir, f)
  }
  const langs = Object.keys(pathByLang)
  if (!langs.includes(sourceLang))
    throw new Error(`source file not found: ${join(dir, sourceLang + '.{json,yaml}')}`)
  return {
    layout: 'flat',
    dir,
    sourceLang,
    source: { translation: pathByLang[sourceLang] },
    targets: langs
      .filter((l) => l !== sourceLang)
      .map((lang) => ({ lang, files: { translation: pathByLang[lang] } })),
  }
}

export function nestedLayout(dir, sourceLang) {
  const langDirs = readdirSync(dir, { withFileTypes: true })
    // Dot-directories are never locales — .shipi18n/ (our own cache) and .git/
    // would otherwise show up as 100%-missing "languages" — and neither is
    // anything that isn't shaped like a locale code.
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        e.name !== 'node_modules' &&
        (LOCALE_NAME.test(e.name) || e.name === sourceLang)
    )
    .map((e) => e.name)
  const nsFiles = (lang) => {
    const out = {}
    for (const f of readdirSync(join(dir, lang)).sort()) {
      if (!LOCALE_EXT.test(f)) continue
      const ns = stripExt(f)
      if (!out[ns] || f.endsWith('.json')) out[ns] = join(dir, lang, f)
    }
    return out
  }
  return {
    layout: 'nested',
    dir,
    sourceLang,
    source: nsFiles(sourceLang),
    targets: langDirs.filter((l) => l !== sourceLang).map((lang) => ({ lang, files: nsFiles(lang) })),
  }
}

/* ------------------------------------------------------- ignores + stats */

/** '*'-glob over the flattened path; matched against both `path` and `ns:path`. */
export function compileIgnores(patterns) {
  if (!patterns) return () => false
  const regexes = String(patterns)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*')}$`))
  return (ns, path) => regexes.some((r) => r.test(path) || r.test(`${ns}:${path}`))
}

/** Stats are recomputed AFTER ignores so a silenced finding vanishes entirely. */
export const statsFrom = (findings, sourceKeys, targetKeys) => {
  // A missing or unparseable FILE means every source key is untranslated —
  // one finding, but zero coverage. (Bug found in review: a 50-key namespace
  // with its file missing reported 98% coverage.)
  const wholeFileFailure = findings.some((f) => f.type === 'missing-file' || f.type === 'invalid-json')
  const missing = wholeFileFailure
    ? sourceKeys
    : findings.filter((f) => f.type === 'missing-key').length
  return {
    sourceKeys,
    targetKeys,
    missing,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    coverage: sourceKeys ? Math.max(0, sourceKeys - missing) / sourceKeys : 1,
  }
}

const rel = (p) => relative(process.cwd(), p).split('\\').join('/')

/**
 * Semantic pairs are collected during the structural pass so --semantic never
 * re-reads files. Keys are `ns\u0000path` (NUL separator: paths may contain ':').
 * The map is attached to the result NON-enumerably so JSON/SARIF reports don't
 * ship every source string twice.
 */
const addPairs = (perLang, lang, ns, sourceObj, targetObj, isIgnored) => {
  const srcFlat = flatten(sourceObj)
  const tgtFlat = flatten(targetObj)
  const entry = (perLang[lang] ??= { source: {}, target: {} })
  for (const [key, value] of Object.entries(srcFlat)) {
    if (typeof value !== 'string' || typeof tgtFlat[key] !== 'string') continue
    if (isIgnored(ns, key)) continue
    entry.source[`${ns}${SEP}${key}`] = value
    entry.target[`${ns}${SEP}${key}`] = tgtFlat[key]
  }
}
/** Compare a namespace against recorded manual-translation locks. */
function lockFindings(locks, lang, ns, sourceObj, targetObj) {
  const out = []
  const src = flatten(sourceObj)
  const tgt = flatten(targetObj)
  for (const [path, value] of Object.entries(src)) {
    const entry = locks.locked?.[lockId(lang, ns, path)]
    if (!entry || typeof value !== 'string' || typeof tgt[path] !== 'string') continue
    const hit = lockFinding(entry, value, tgt[path])
    // Warnings only: locks protect human work, they must never fail a pipeline.
    if (hit) out.push({ ...hit, severity: 'warning', path, source: value, translation: tgt[path] })
  }
  return out
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const countLeaves = (obj, depth = 0) => {
  if (depth > MAX_DEPTH) throw new Error(`locale nesting too deep (exceeds ${MAX_DEPTH} levels)`)
  return Object.values(obj).reduce((n, v) => n + (v && typeof v === 'object' ? countLeaves(v, depth + 1) : 1), 0)
}

/* ------------------------------------------------------------------ modes */

export function jsonMode({ input, source, isIgnored, glossary, locks }) {
  const layout = discoverLayout(input, source)

  const sourceData = {}
  for (const [ns, file] of Object.entries(layout.source)) sourceData[ns] = readData(file) // broken source = usage error

  const perLang = {}
  const languages = []
  for (const { lang, files } of layout.targets) {
    const namespaces = []
    for (const ns of Object.keys(layout.source)) {
      const srcKeys = countLeaves(sourceData[ns])
      const file = files[ns]
      if (!file || !existsSync(file)) {
        const findings = [
          { type: 'missing-file', severity: 'error', path: ns, message: `file missing: ${lang}/${ns}.json` },
        ].filter((f) => !isIgnored(ns, f.path))
        namespaces.push({ ns, file: rel(join(layout.dir, lang, `${ns}.json`)), findings, stats: statsFrom(findings, srcKeys, 0) })
        continue
      }
      let data
      try {
        data = readData(file)
      } catch (err) {
        const findings = [{ type: 'invalid-json', severity: 'error', path: ns, message: `could not parse ${rel(file)}: ${err.message}` }]
        namespaces.push({ ns, file: rel(file), findings, stats: statsFrom(findings, srcKeys, 0) })
        continue
      }
      const { findings, stats } = checkTranslations({ source: sourceData[ns], target: data, targetLang: lang, glossary })
      if (locks) findings.push(...lockFindings(locks, lang, ns, sourceData[ns], data))
      const kept = findings.filter((f) => !isIgnored(ns, f.path))
      addPairs(perLang, lang, ns, sourceData[ns], data, isIgnored)
      namespaces.push({ ns, file: rel(file), findings: kept, stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys) })
    }
    languages.push(aggregateLanguage(lang, namespaces))
  }
  return finishResult({ layout: layout.layout, dir: layout.dir, source, languages }, perLang)
}

export function arbMode({ input, source, isIgnored, glossary }) {
  const dir = resolve(input)
  const names = readdirSync(dir).filter((f) => f.endsWith('.arb'))
  const filesByName = Object.fromEntries(names.map((n) => [n, readJson(join(dir, n))]))
  const { languages: byLang, files } = parseArbBundle(filesByName)

  if (!byLang[source]) throw new Error(`no ARB file for source language '${source}' in ${input}`)

  const perLang = {}
  const languages = []
  for (const [lang, data] of Object.entries(byLang)) {
    if (lang === source) continue
    const ns = files[lang].replace(/\.arb$/, '')
    const { findings, stats } = checkTranslations({ source: byLang[source], target: data, targetLang: lang, glossary })
    const kept = findings.filter((f) => !isIgnored(ns, f.path))
    addPairs(perLang, lang, ns, byLang[source], data, isIgnored)
    languages.push(
      aggregateLanguage(lang, [
        { ns, file: rel(join(dir, files[lang])), findings: kept, stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys) },
      ])
    )
  }
  return finishResult({ layout: 'arb', dir, source, languages }, perLang)
}

export function xcstringsMode({ input, source, isIgnored, glossary }) {
  const file = resolve(input)
  const parsed = parseXcstrings(readJson(file))
  const sourceLang = source !== 'en' ? source : parsed.sourceLang
  const ns = basename(file)

  const perLang = {}
  const languages = []
  for (const [lang, data] of Object.entries(parsed.languages)) {
    const { findings, stats } = checkTranslations({ source: parsed.source, target: data, targetLang: lang, glossary })
    addPairs(perLang, lang, ns, parsed.source, data, isIgnored)
    const adapterFindings = parsed.findings.filter((f) => f.lang === lang).map(({ lang: _l, ...f }) => f)
    const kept = [...findings, ...adapterFindings].filter((f) => !isIgnored(ns, f.path))
    languages.push(
      aggregateLanguage(lang, [{ ns, file: rel(file), findings: kept, stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys) }])
    )
  }
  return finishResult({ layout: 'xcstrings', dir: dirname(file), source: sourceLang, languages }, perLang)
}

export function androidStringsMode({ input, source, isIgnored, glossary }) {
  const dir = resolve(input)
  const valueDirs = readdirSync(dir).filter(
    (d) => /^values(-.+)?$/.test(d) && existsSync(join(dir, d, 'strings.xml'))
  )
  if (!valueDirs.includes('values')) {
    throw new Error(`no default values/strings.xml (source) found in ${input}`)
  }
  const sourceData = parseAndroidStrings(readTextCapped(join(dir, 'values', 'strings.xml')))

  const perLang = {}
  const languages = []
  for (const d of valueDirs) {
    if (d === 'values') continue
    const lang = androidLangFromValuesDir(d)
    if (!lang) continue // non-locale qualifier dir (values-land, values-sw600dp, ...)
    const file = join(dir, d, 'strings.xml')
    const ns = 'strings'
    let data
    try {
      data = parseAndroidStrings(readTextCapped(file))
    } catch (err) {
      // A malformed/malicious target (bad XML, external entities, …) is a finding, not a crash.
      const findings = [{ type: 'invalid-file', severity: 'error', path: ns, message: `could not parse ${rel(file)}: ${err.message}` }]
      languages.push(aggregateLanguage(lang, [{ ns, file: rel(file), findings, stats: statsFrom(findings, 0, 0) }]))
      continue
    }
    const { findings, stats } = checkTranslations({ source: sourceData, target: data, targetLang: lang, glossary })
    const kept = findings.filter((f) => !isIgnored(ns, f.path))
    addPairs(perLang, lang, ns, sourceData, data, isIgnored)
    languages.push(
      aggregateLanguage(lang, [
        { ns, file: rel(file), findings: kept, stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys) },
      ])
    )
  }
  return finishResult({ layout: 'android', dir, source, languages }, perLang)
}

const collectPoFiles = (dir, depth = 0, out = []) => {
  if (depth > 3) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) collectPoFiles(full, depth + 1, out)
    else if (/\.pot?$/i.test(e.name)) out.push(full)
  }
  return out
}

// Language from a gettext path: `<lang>/LC_MESSAGES/domain.po` → `<lang>`, else the filename stem.
const poLangFromPath = (file) => {
  const parts = file.split(/[/\\]/)
  const lc = parts.lastIndexOf('LC_MESSAGES')
  if (lc > 0) return parts[lc - 1].replace(/_/g, '-')
  return basename(file).replace(/\.pot?$/i, '').replace(/_/g, '-')
}

export function poMode({ input, source, isIgnored, glossary }) {
  const path = resolve(input)
  const asFile = statSync(path).isFile()
  // Directory mode: real translations only (.po); skip .pot templates (all-empty by design).
  const files = asFile ? [path] : collectPoFiles(path).filter((f) => /\.po$/i.test(f))
  const dir = asFile ? dirname(path) : path

  const perLang = {}
  const byLang = {}
  for (const file of files) {
    const ns = basename(file).replace(/\.pot?$/i, '')
    let parsed
    try {
      parsed = parsePo(readTextCapped(file))
    } catch (err) {
      const lang = poLangFromPath(file)
      const findings = [{ type: 'invalid-file', severity: 'error', path: ns, message: `could not parse ${rel(file)}: ${err.message}` }]
      ;(byLang[lang] = byLang[lang] || []).push({ ns, file: rel(file), findings, stats: statsFrom(findings, 0, 0) })
      continue
    }
    const lang = parsed.language || poLangFromPath(file)
    if (!asFile && lang === source) continue // the source-language catalog isn't a target
    const { findings, stats } = checkTranslations({ source: parsed.source, target: parsed.target, targetLang: lang, glossary })
    addPairs(perLang, lang, ns, parsed.source, parsed.target, isIgnored)
    const kept = [...findings, ...parsed.findings].filter((f) => !isIgnored(ns, f.path))
    ;(byLang[lang] = byLang[lang] || []).push({
      ns,
      file: rel(file),
      findings: kept,
      stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys),
    })
  }
  const languages = Object.entries(byLang).map(([lang, nss]) => aggregateLanguage(lang, nss))
  return finishResult({ layout: 'po', dir, source, languages }, perLang)
}

const XLIFF_EXT = /\.(xlf|xliff)$/i

export function xliffMode({ input, source, isIgnored, glossary }) {
  const path = resolve(input)
  const asFile = statSync(path).isFile()
  const files = asFile
    ? [path]
    : readdirSync(path).filter((f) => XLIFF_EXT.test(f)).map((f) => join(path, f))
  const dir = asFile ? dirname(path) : path

  const perLang = {}
  const byLang = {}
  for (const file of files) {
    const ns = basename(file).replace(XLIFF_EXT, '')
    let parsed
    try {
      parsed = parseXliff(readTextCapped(file))
    } catch (err) {
      const lang = basename(file).replace(XLIFF_EXT, '').replace(/_/g, '-')
      const findings = [{ type: 'invalid-file', severity: 'error', path: ns, message: `could not parse ${rel(file)}: ${err.message}` }]
      ;(byLang[lang] = byLang[lang] || []).push({ ns, file: rel(file), findings, stats: statsFrom(findings, 0, 0) })
      continue
    }
    const lang = parsed.trgLang || basename(file).replace(XLIFF_EXT, '').replace(/_/g, '-')
    if (!asFile && lang === source) continue // source-language catalog isn't a target
    const { findings, stats } = checkTranslations({ source: parsed.source, target: parsed.target, targetLang: lang, glossary })
    addPairs(perLang, lang, ns, parsed.source, parsed.target, isIgnored)
    const kept = [...findings, ...parsed.findings].filter((f) => !isIgnored(ns, f.path))
    ;(byLang[lang] = byLang[lang] || []).push({
      ns,
      file: rel(file),
      findings: kept,
      stats: statsFrom(kept, stats.sourceKeys, stats.targetKeys),
    })
  }
  const languages = Object.entries(byLang).map(([lang, nss]) => aggregateLanguage(lang, nss))
  return finishResult({ layout: 'xliff', dir, source, languages }, perLang)
}

export function aggregateLanguage(lang, namespaces) {
  const agg = namespaces.reduce(
    (a, n) => ({
      sourceKeys: a.sourceKeys + n.stats.sourceKeys,
      errors: a.errors + n.stats.errors,
      warnings: a.warnings + n.stats.warnings,
      covered: a.covered + Math.round(n.stats.coverage * n.stats.sourceKeys),
    }),
    { sourceKeys: 0, errors: 0, warnings: 0, covered: 0 }
  )
  return { lang, namespaces, stats: { ...agg, coverage: agg.sourceKeys ? agg.covered / agg.sourceKeys : 1 } }
}

export function finishResult(result, perLang = {}) {
  result.languages.sort((a, b) => a.lang.localeCompare(b.lang))
  recomputeTotals(result)
  Object.defineProperty(result, 'semanticPairs', { enumerable: false, value: perLang })
  return result
}

export function recomputeTotals(result) {
  result.totals = result.languages.reduce(
    (a, l) => ({ errors: a.errors + l.stats.errors, warnings: a.warnings + l.stats.warnings }),
    { errors: 0, warnings: 0 }
  )
}

/**
 * Route by what the input actually is: an .xcstrings catalog, a directory of
 * .arb files, or a plain JSON locale tree.
 */
export function runCheck({ input, source = 'en', ignoreKeys, glossary, locks } = {}) {
  const isIgnored = compileIgnores(ignoreKeys)
  const path = resolve(input)
  if (existsSync(path) && statSync(path).isFile() && path.endsWith('.xcstrings')) {
    return xcstringsMode({ input, source, isIgnored, glossary })
  }
  if (existsSync(path) && statSync(path).isFile() && /\.pot?$/i.test(path)) {
    return poMode({ input, source, isIgnored, glossary })
  }
  if (existsSync(path) && statSync(path).isFile() && XLIFF_EXT.test(path)) {
    return xliffMode({ input, source, isIgnored, glossary })
  }
  if (existsSync(path) && statSync(path).isDirectory() && readdirSync(path).some((f) => f.endsWith('.arb'))) {
    return arbMode({ input, source, isIgnored, glossary })
  }
  if (
    existsSync(path) &&
    statSync(path).isDirectory() &&
    readdirSync(path).some((d) => /^values(-.+)?$/.test(d) && existsSync(join(path, d, 'strings.xml')))
  ) {
    return androidStringsMode({ input, source, isIgnored, glossary })
  }
  if (existsSync(path) && statSync(path).isDirectory() && collectPoFiles(path).some((f) => /\.po$/i.test(f))) {
    return poMode({ input, source, isIgnored, glossary })
  }
  if (existsSync(path) && statSync(path).isDirectory() && readdirSync(path).some((f) => XLIFF_EXT.test(f))) {
    return xliffMode({ input, source, isIgnored, glossary })
  }
  return jsonMode({ input, source, isIgnored, glossary, locks })
}

/**
 * Run the LLM-judge semantic pass over a structural result and merge findings.
 *
 * Structural-first: keys that already carry a structural ERROR are excluded —
 * there is no reason to pay a judge to look at a string with a dropped
 * placeholder. Semantic findings are WARNINGS unless `fail` is set; a noisy
 * gate that blocks PRs gets uninstalled.
 *
 * `excluded` counts the pairs skipped for that reason. It exists so callers can
 * tell "nothing was wrong" apart from "everything was too wrong to judge" — a
 * fully-broken tree otherwise reports `judged 0` and reads like a dead feature.
 *
 * @returns aggregated judge stats { judged, cached, flagged, calls, parseFailures, excluded }
 */

export async function runSemantic(result, { provider, apiKey, model, baseURL, passes, glossary, cache, fail = false }) {
  const totals = { judged: 0, cached: 0, flagged: 0, calls: 0, parseFailures: 0, excluded: 0 }

  for (const l of result.languages) {
    const pairs = result.semanticPairs?.[l.lang]
    if (!pairs) continue

    const errorPaths = new Set(
      l.namespaces.flatMap((n) =>
        n.findings.filter((f) => f.severity === 'error').map((f) => `${n.ns}${SEP}${f.path}`)
      )
    )
    const src = {}
    const tgt = {}
    for (const key of Object.keys(pairs.source)) {
      if (errorPaths.has(key)) {
        totals.excluded++
        continue
      }
      src[key] = pairs.source[key]
      tgt[key] = pairs.target[key]
    }
    if (!Object.keys(src).length) continue

    const { findings, stats } = await reviewTranslations({
      source: src, target: tgt, from: result.source, to: l.lang,
      provider, apiKey, model, baseURL, passes, glossary, cache,
    })
    for (const k of Object.keys(stats)) totals[k] = (totals[k] ?? 0) + (stats[k] ?? 0)

    for (const f of findings) {
      const sepAt = f.path.indexOf(SEP)
      const ns = f.path.slice(0, sepAt)
      const path = f.path.slice(sepAt + 1)
      const nsEntry = l.namespaces.find((n) => n.ns === ns)
      if (!nsEntry) continue
      nsEntry.findings.push({
        type: `semantic-${f.category}`,
        severity: fail ? 'error' : 'warning',
        path,
        message: f.note || f.category,
        source: f.source,
        translation: f.translation,
      })
    }
    for (const n of l.namespaces) n.stats = statsFrom(n.findings, n.stats.sourceKeys, n.stats.targetKeys)
    const re = aggregateLanguage(l.lang, l.namespaces)
    l.stats = re.stats
  }
  recomputeTotals(result)
  return totals
}


/**
 * UIStringBench leaderboard runner.
 *
 * Runs the shipi18n semantic judge (3-pass majority vote) across a matrix of
 * judge models and corpus splits, and writes machine-readable results:
 *   - aggregate metrics per (model, split)
 *   - item-level verdicts (pair id → flagged category | null)
 *
 * The gate semantics of run.mjs are unchanged and still authoritative for CI;
 * this runner MEASURES, it does not gate.
 *
 * Usage:
 *   node leaderboard.mjs --models anthropic:claude-haiku-4-5,anthropic:claude-sonnet-5 \
 *     --split public --out results/
 *   node leaderboard.mjs --models ... --split heldout --corpus /path/to/heldout.jsonl --out /private/results
 *
 * Model spec: <provider>:<model>[@<baseURL>]   provider = anthropic | openai
 *   openai:gpt-…                    (needs OPENAI_API_KEY)
 *   openai:<model>@http://host/v1   (OpenAI-compatible endpoint, e.g. Ollama — key optional)
 * Env keys fall back to the repo-root .env like run.mjs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reviewTranslations, checkTranslations, resolveAdapter } from '../../packages/core/src/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PASSES = 3

/* ---------------------------------------------------------------- args */
const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => {
    const [k, ...v] = s.trim().split(/\s+/)
    return [k, v.join(' ')]
  })
)
const split = args.split || 'public'
const outDir = resolve(args.out || join(HERE, 'results'))
const modelSpecs = (args.models || 'anthropic:claude-haiku-4-5').split(',').map((s) => s.trim())

/* ----------------------------------------------------------------- env */
const envFile = join(HERE, '..', '..', '..', '.env')
const fileEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
      })
    )
  : {}
const keyFor = (provider) =>
  provider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY
    : provider === 'gemini'
      ? process.env.GEMINI_API_KEY || fileEnv.GEMINI_API_KEY
      : process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY

// Gemini rides the OpenAI-compatible endpoint with its own key.
const GEMINI_COMPAT = 'https://generativelanguage.googleapis.com/v1beta/openai/'

/* -------------------------------------------------------------- corpus */
function loadCorpus() {
  if (args.corpus) {
    const raw = readFileSync(resolve(args.corpus), 'utf8')
    if (args.corpus.endsWith('.jsonl')) {
      return raw.split('\n').filter(Boolean).map((l) => {
        const r = JSON.parse(l)
        return { id: r.id, lang: r.lang, source: r.source, translation: r.translation,
                 expected: r.label === 'clean' ? null : r.label }
      })
    }
    return JSON.parse(raw).pairs
  }
  return JSON.parse(readFileSync(join(HERE, 'corpus', 'corpus.json'), 'utf8')).pairs
}
const pairs = loadCorpus()
const glossary = JSON.parse(readFileSync(join(HERE, 'corpus', 'glossary.json'), 'utf8'))
const langs = [...new Set(pairs.map((p) => p.lang))]

/* ------------------------------------------------- deterministic baseline */
// Model-independent: glossary + structural checks. Reported once per split so
// the leaderboard can show what needs no model at all.
function deterministicRow() {
  const flagged = {}
  for (const p of pairs) {
    const { findings } = checkTranslations({
      source: { [p.id]: p.source }, target: { [p.id]: p.translation },
      targetLang: p.lang, glossary,
    })
    const hit = findings.find((f) => f.type === 'glossary-violation')
    if (hit) flagged[p.id] = 'glossary'
  }
  return flagged
}

/* ----------------------------------------------------------------- score */
function score(flaggedBy) {
  const planted = pairs.filter((p) => ['mistranslation', 'omission', 'addition'].includes(p.expected))
  const clean = pairs.filter((p) => p.expected === null)
  const caught = planted.filter((p) => flaggedBy[p.id])
  const labelCorrect = planted.filter((p) => flaggedBy[p.id] === p.expected)
  const fp = clean.filter((p) => flaggedBy[p.id])
  const catRecall = {}
  for (const cat of ['mistranslation', 'omission', 'addition']) {
    const of = planted.filter((p) => p.expected === cat)
    catRecall[cat] = of.length ? of.filter((p) => flaggedBy[p.id]).length / of.length : null
  }
  return {
    planted: planted.length, clean: clean.length,
    caught: caught.length, catchRate: planted.length ? caught.length / planted.length : null,
    labelAccuracy: caught.length ? labelCorrect.length / caught.length : null,
    falsePositives: fp.length, fpRate: clean.length ? fp.length / clean.length : null,
    categoryRecall: catRecall,
  }
}

/* ------------------------------------------------------------------ run */
mkdirSync(outDir, { recursive: true })
const summary = []

for (const spec of modelSpecs) {
  const m = spec.match(/^(anthropic|openai|gemini):([^@]+)(?:@(.+))?$/)
  if (!m) { console.error(`bad model spec: ${spec}`); process.exit(2) }
  const [, provider, model, specURL] = m
  const apiKey = keyFor(provider)
  const baseURL = provider === 'gemini' ? GEMINI_COMPAT : specURL
  if (!apiKey && !baseURL) { console.error(`no API key for ${spec} — skipping`); continue }

  let chars = 0
  const adapterProvider = provider === 'gemini' ? 'openai' : provider
  const base = resolveAdapter(adapterProvider, { apiKey, model, ...(baseURL ? { baseURL } : {}) })
  const counting = {
    name: 'counting', calls: 0,
    async complete(prompt, opts) {
      counting.calls++; chars += prompt.length
      const out = await base.complete(prompt, opts)
      chars += out.length; return out
    },
  }

  console.log(`\n━━━ ${spec} · split=${split} · ${pairs.length} pairs · ${PASSES} passes ━━━`)
  const flaggedBy = {}
  let parseFailures = 0
  const t0 = Date.now()
  try {
  for (const lang of langs) {
    const subset = pairs.filter((p) => p.lang === lang)
    const source = Object.fromEntries(subset.map((p) => [p.id, p.source]))
    const target = Object.fromEntries(subset.map((p) => [p.id, p.translation]))
    process.stdout.write(`  ${lang} (${subset.length})… `)
    const { findings, stats } = await reviewTranslations({
      source, target, from: 'en', to: lang, provider: counting, passes: PASSES, glossary,
    })
    for (const f of findings) flaggedBy[f.path] = f.category
    parseFailures += stats.parseFailures
    console.log(`${findings.length} flagged`)
  }
  } catch (err) {
    // One provider's outage or billing problem must not sink the whole board.
    console.error(`  ✗ ${spec} failed: ${err.message?.slice(0, 140)} — skipping model`)
    continue
  }
  const secs = (Date.now() - t0) / 1000
  const metrics = score(flaggedBy)
  const row = {
    model: spec, split, passes: PASSES, pairs: pairs.length,
    ...metrics, calls: counting.calls, parseFailures,
    approxTokens: Math.round(chars / 4), seconds: Math.round(secs),
  }
  summary.push(row)

  const slug = spec.replace(/[^a-z0-9.-]+/gi, '_')
  writeFileSync(join(outDir, `${slug}.${split}.json`), JSON.stringify({
    ...row,
    items: pairs.map((p) => ({ id: p.id, lang: p.lang, gold: p.expected || 'clean',
                               judged: flaggedBy[p.id] || null })),
  }, null, 2) + '\n')
  const pc = (x) => (x == null ? '—' : (100 * x).toFixed(1) + '%')
  console.log(`  catch ${metrics.caught}/${metrics.planted} (${pc(metrics.catchRate)}) · ` +
    `FP ${metrics.falsePositives}/${metrics.clean} (${pc(metrics.fpRate)}) · ` +
    `labels ${pc(metrics.labelAccuracy)} · ~${row.approxTokens / 1000 | 0}k tok · ${row.seconds}s`)
}

/* ---------------------------------------------------- deterministic row */
const detFlagged = deterministicRow()
const detMetrics = score(detFlagged)
summary.push({ model: 'deterministic-only (no LLM)', split, passes: 0, pairs: pairs.length, ...detMetrics })

// Merge with any existing summary so incremental runs (one new model) don't
// clobber earlier rows. Keyed by model spec; latest run wins.
const summaryPath = join(outDir, `summary.${split}.json`)
const prior = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : []
const merged = [...prior.filter((r) => !summary.some((n) => n.model === r.model)), ...summary]
writeFileSync(summaryPath, JSON.stringify(merged, null, 2) + '\n')
console.log(`\nwrote ${summaryPath} (${merged.length} rows)`)

/**
 * Stage-2 LIVE eval — gate M7 of CHECK_STAGE2_SEMANTIC_LOOP.md.
 *
 * Runs the semantic judge over the committed corpus with a REAL key and
 * measures it against thresholds that were fixed before the judge existed:
 *
 *   catch rate            >= 80%  (planted errors flagged, any category)
 *   per-category recall   >= 60%  (each of mistranslation/omission/addition)
 *   false-positive rate   <  10%  (clean pairs flagged; adversarial count as clean)
 *   glossary recall       == 100% (deterministic — anything less is a bug)
 *
 * THIS RUNNER IS THE GATE: it exits 1 when a threshold is missed.
 *
 * Usage:  node run.mjs            (key from env or the repo-root .env)
 *         JUDGE_MODEL=... node run.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  reviewTranslations,
  checkTranslations,
  resolveAdapter,
  DEFAULT_JUDGE_MODELS,
} from '../../packages/core/src/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))

/* ------------------------------------------------------------------- key */
const envFile = join(HERE, '..', '..', '..', '.env')
const fileEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split('\n')
        .filter((l) => l.includes('='))
        .map((l) => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
        })
    )
  : {}
const apiKey = process.env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('No ANTHROPIC_API_KEY available')

const model = process.env.JUDGE_MODEL || DEFAULT_JUDGE_MODELS.anthropic
const PASSES = 3

/* ---------------------------------------------------------------- corpus */
const { pairs } = JSON.parse(readFileSync(join(HERE, 'corpus', 'corpus.json'), 'utf8'))
const glossary = JSON.parse(readFileSync(join(HERE, 'corpus', 'glossary.json'), 'utf8'))

/* --------------------------------------------- deterministic glossary gate */
let glossaryCaught = 0
let glossaryFalse = 0
for (const p of pairs) {
  const { findings } = checkTranslations({
    source: { [p.id]: p.source },
    target: { [p.id]: p.translation },
    targetLang: p.lang,
    glossary,
  })
  const hit = findings.some((f) => f.type === 'glossary-violation')
  if (p.expected === 'glossary' && hit) glossaryCaught++
  if (p.expected !== 'glossary' && hit) glossaryFalse++
}

/* --------------------------------------------------------- semantic judge */
let chars = 0
const base = resolveAdapter('anthropic', { apiKey, model })
const counting = {
  name: 'counting',
  calls: 0,
  async complete(prompt, opts) {
    counting.calls++
    chars += prompt.length
    const out = await base.complete(prompt, opts)
    chars += out.length
    return out
  },
}

const flaggedBy = {} // id → category
const stats = { calls: 0, parseFailures: 0 }
const t0 = Date.now()

for (const lang of ['es', 'de', 'ja']) {
  const subset = pairs.filter((p) => p.lang === lang)
  const source = Object.fromEntries(subset.map((p) => [p.id, p.source]))
  const target = Object.fromEntries(subset.map((p) => [p.id, p.translation]))
  process.stdout.write(`judging ${lang} (${subset.length} pairs, ${PASSES} passes)… `)
  const { findings, stats: s } = await reviewTranslations({
    source, target, from: 'en', to: lang,
    provider: counting, passes: PASSES, glossary,
  })
  for (const f of findings) flaggedBy[f.path] = f.category
  stats.calls = counting.calls
  stats.parseFailures += s.parseFailures
  console.log(`${findings.length} flagged`)
}

/* ----------------------------------------------------------------- score */
const planted = pairs.filter((p) => ['mistranslation', 'omission', 'addition'].includes(p.expected))
const clean = pairs.filter((p) => p.expected === null)

const caught = planted.filter((p) => flaggedBy[p.id])
const labelCorrect = planted.filter((p) => flaggedBy[p.id] === p.expected)
const falsePositives = clean.filter((p) => flaggedBy[p.id])

const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : '—')
const catRecall = {}
for (const cat of ['mistranslation', 'omission', 'addition']) {
  const of = planted.filter((p) => p.expected === cat)
  catRecall[cat] = of.filter((p) => flaggedBy[p.id]).length / of.length
}

console.log('\n══════════ SEMANTIC EVAL — gate M7 ══════════')
console.log(`model: ${model} · passes: ${PASSES} · ${((Date.now() - t0) / 1000).toFixed(0)}s`)
console.log(`calls: ${stats.calls} · discarded passes: ${stats.parseFailures} · ~${Math.round(chars / 4 / 1000)}k tokens (chars/4)`)
console.log('──────────────────────────────────────────────')
console.log(`catch rate:        ${caught.length}/${planted.length}  (${pct(caught.length, planted.length)}%)   [need ≥80%]`)
for (const cat of ['mistranslation', 'omission', 'addition']) {
  console.log(`  ${cat.padEnd(16)} ${pct(catRecall[cat] * 18, 18)}%   [need ≥60%]`)
}
console.log(`label accuracy:    ${labelCorrect.length}/${caught.length} of caught  (${pct(labelCorrect.length, caught.length)}%)   [reported, not gated]`)
console.log(`false positives:   ${falsePositives.length}/${clean.length}  (${pct(falsePositives.length, clean.length)}%)   [need <10%]`)
console.log(`glossary:          ${glossaryCaught}/6 caught, ${glossaryFalse} false  [need 6/6, 0 false]`)

if (falsePositives.length) {
  console.log('\nfalse positives (each should be at least arguable):')
  for (const p of falsePositives.slice(0, 15)) {
    console.log(`  [${p.id} ${p.lang} → ${flaggedBy[p.id]}] "${p.source.slice(0, 60)}" / "${p.translation.slice(0, 60)}"`)
  }
}
const missed = planted.filter((p) => !flaggedBy[p.id])
if (missed.length) {
  console.log('\nmissed planted errors:')
  for (const p of missed.slice(0, 15)) console.log(`  [${p.id} ${p.lang} ${p.expected}] ${p.note}`)
}

const gates = [
  ['catch >=80%', caught.length / planted.length >= 0.8],
  ['mistranslation recall >=60%', catRecall.mistranslation >= 0.6],
  ['omission recall >=60%', catRecall.omission >= 0.6],
  ['addition recall >=60%', catRecall.addition >= 0.6],
  ['FP <10%', falsePositives.length / clean.length < 0.1],
  ['glossary 6/6 + 0 false', glossaryCaught === 6 && glossaryFalse === 0],
]
console.log('')
let ok = true
for (const [name, pass] of gates) {
  console.log(`${pass ? '✓' : '✗'} ${name}`)
  if (!pass) ok = false
}
console.log(ok ? '\n✅ M7 PASS' : '\n❌ M7 FAIL')
process.exit(ok ? 0 : 1)

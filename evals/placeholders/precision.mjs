#!/usr/bin/env node
/**
 * Precision / recall of the structural placeholder check on the real-world corpus.
 *   node evals/placeholders/precision.mjs            → per-format table
 *   node evals/placeholders/precision.mjs --verbose  → also list every miss
 * A row is a "positive" when expect != clean. TP = flagged & positive; FP = flagged & clean;
 * FN = not flagged & positive. Exit code 1 if any row disagrees with its label.
 */
import { readFileSync } from 'node:fs'
import { validatePlaceholders } from '../../packages/core/src/placeholders.js'

const rows = readFileSync(new URL('./corpus.jsonl', import.meta.url), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const verbose = process.argv.includes('--verbose')
const verdict = ({ missing, added }) => (missing.length && added.length ? 'missing+added' : missing.length ? 'missing' : added.length ? 'added' : 'clean')
const stats = {}
let disagreements = 0
for (const r of rows) {
  const got = verdict(validatePlaceholders(r.source, r.translation, { format: r.format }))
  const s = (stats[r.format] ||= { tp: 0, fp: 0, fn: 0, tn: 0, n: 0 }); s.n++
  const flagged = got !== 'clean', positive = r.expect !== 'clean'
  if (flagged && positive) s.tp++; else if (flagged && !positive) s.fp++; else if (!flagged && positive) s.fn++; else s.tn++
  if (got !== r.expect) { disagreements++; if (verbose) console.log(`  ✗ ${r.id} [${r.format}] expected ${r.expect}, got ${got}`) }
}
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(0) + '%' : '—')
console.log('format     n   TP  FP  FN  precision  recall')
let T = { tp: 0, fp: 0, fn: 0, n: 0 }
for (const [f, s] of Object.entries(stats).sort()) { console.log(`${f.padEnd(9)} ${String(s.n).padStart(3)}  ${String(s.tp).padStart(3)} ${String(s.fp).padStart(3)} ${String(s.fn).padStart(3)}  ${pct(s.tp, s.tp + s.fp).padStart(9)}  ${pct(s.tp, s.tp + s.fn).padStart(6)}`); T.tp += s.tp; T.fp += s.fp; T.fn += s.fn; T.n += s.n }
console.log(`${'ALL'.padEnd(9)} ${String(T.n).padStart(3)}  ${String(T.tp).padStart(3)} ${String(T.fp).padStart(3)} ${String(T.fn).padStart(3)}  ${pct(T.tp, T.tp + T.fp).padStart(9)}  ${pct(T.tp, T.tp + T.fn).padStart(6)}`)
console.log(disagreements ? `\n${disagreements} row(s) disagree with their label` : '\nall rows agree with their labels')
process.exit(disagreements ? 1 : 0)

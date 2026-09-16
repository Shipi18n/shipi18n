/**
 * Real-world placeholder corpus (evals/placeholders/corpus.jsonl): every
 * false positive found scanning real repos AND every true positive we filed
 * upstream. A fix that makes an FP row clean must not make a TP row clean.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validatePlaceholders } from '../placeholders.js'

const here = dirname(fileURLToPath(import.meta.url))
const rows = readFileSync(join(here, '../../../../evals/placeholders/corpus.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))

const verdict = ({ missing, added }) => (missing.length && added.length ? 'missing+added' : missing.length ? 'missing' : added.length ? 'added' : 'clean')

describe('placeholder corpus', () => {
  test.each(rows.map((r) => [r.id, r]))('%s', (_id, r) => {
    const v = verdict(validatePlaceholders(r.source, r.translation, { format: r.format }))
    expect(v).toBe(r.expect)
  })
  test('corpus has both classes', () => {
    expect(rows.filter((r) => r.class === 'TP').length).toBeGreaterThan(10)
    expect(rows.filter((r) => r.class !== 'TP').length).toBeGreaterThan(8)
  })
})

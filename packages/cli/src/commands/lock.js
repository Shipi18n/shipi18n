/**
 * `shipi18n lock` — mark translations as hand-edited so `check` can tell you
 * when something overwrites them, or when their source moves underneath.
 *
 * Writes `.shipi18n/locks.json` (safe to commit — it is the record of which
 * translations a human has blessed).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import chalk from 'chalk'
import {
  runCheck,
  discoverLayout,
  compileIgnores,
  lockId,
  lockEntry,
  emptyLocks,
  normalizeLocks,
  flatten,
} from '@shipi18n/core'

export const DEFAULT_LOCKS_PATH = '.shipi18n/locks.json'

/** Tolerant read — a missing or corrupt file is simply "no locks yet". */
export function readLocks(path) {
  if (!existsSync(path)) return emptyLocks()
  try {
    return normalizeLocks(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return emptyLocks()
  }
}

export function writeLocks(path, locks) {
  mkdirSync(dirname(resolve(path)), { recursive: true })
  writeFileSync(resolve(path), JSON.stringify(locks, null, 2) + '\n')
}

/**
 * Build the lock set for a tree. Only pairs that actually exist in both source
 * and target are lockable — you cannot bless a translation that isn't there.
 */
export function buildLocks({ input, source = 'en', keys, existing = emptyLocks(), langs }) {
  const isSelected = compileIgnores(keys) // same glob syntax as --ignore-keys
  const selectAll = !keys
  const layout = discoverLayout(input, source)
  const locked = { ...existing.locked }
  let added = 0

  const sourceData = {}
  for (const [ns, file] of Object.entries(layout.source)) {
    sourceData[ns] = JSON.parse(readFileSync(file, 'utf8'))
  }

  for (const { lang, files } of layout.targets) {
    if (langs && !langs.includes(lang)) continue
    for (const [ns, srcObj] of Object.entries(sourceData)) {
      const file = files[ns]
      if (!file || !existsSync(file)) continue
      let targetObj
      try {
        targetObj = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        continue // an unparseable file has nothing lockable in it
      }
      const src = flatten(srcObj)
      const tgt = flatten(targetObj)
      for (const [path, value] of Object.entries(src)) {
        if (typeof value !== 'string' || typeof tgt[path] !== 'string') continue
        if (!selectAll && !isSelected(ns, path)) continue
        const id = lockId(lang, ns, path)
        if (!(id in locked)) added++
        locked[id] = lockEntry(value, tgt[path])
      }
    }
  }
  return { locks: { ...emptyLocks(), locked }, added, total: Object.keys(locked).length }
}

export function lockCommand(program) {
  program
    .command('lock [input]')
    .description('Record translations as hand-edited, so check warns when they are overwritten')
    .option('-s, --source <language>', 'Source language', 'en')
    .option('-k, --keys <patterns>', "Only lock keys matching these '*' globs (default: all)")
    .option('-l, --lang <languages>', 'Only lock these languages (comma-separated)')
    .option('--locks <file>', 'Lock file path', DEFAULT_LOCKS_PATH)
    .option('--relock', 'Update hashes for keys already locked (accept current state as blessed)')
    .action((input = './locales', opts) => {
      try {
        const path = resolve(opts.locks)
        const existing = opts.relock ? emptyLocks() : readLocks(path)
        const langs = opts.lang ? opts.lang.split(',').map((l) => l.trim()) : undefined
        const { locks, added, total } = buildLocks({
          input,
          source: opts.source,
          keys: opts.keys,
          existing,
          langs,
        })
        writeLocks(path, locks)
        console.log(
          chalk.green(`✓ locked ${added} new translation(s); ${total} total in ${opts.locks}`)
        )
        if (!opts.keys) {
          console.log(
            chalk.gray('  Tip: --keys narrows this to the strings you actually hand-edited.')
          )
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`))
        process.exitCode = 2
      }
    })
}

/**
 * Used by `check` to load locks unless disabled.
 *
 * Commander pairs `--no-locks` with `--locks <file>`, so the negation arrives as
 * `opts.locks === false` rather than `opts.noLocks` — checking only the latter
 * made --no-locks silently do nothing (caught by an end-to-end run, not by a
 * unit test that hand-built the options object).
 */
export function locksFor(opts = {}) {
  if (opts.locks === false || opts.noLocks) return undefined
  const path = resolve(typeof opts.locks === 'string' ? opts.locks : DEFAULT_LOCKS_PATH)
  if (!existsSync(path)) return undefined
  const locks = readLocks(path)
  return Object.keys(locks.locked).length ? locks : undefined
}

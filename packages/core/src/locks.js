/**
 * Manual-translation locks — protect hand-edited translations from being
 * silently overwritten.
 *
 * The complaint this answers is common to every LLM translation tool: you fix a
 * translation by hand, the tool re-runs, and your fix is gone. A lock records
 * what the pair looked like when a human blessed it, so `check` can say either:
 *
 *   clobbered — the translation text changed since it was locked (someone
 *               re-translated over the human's work)
 *   stale     — the SOURCE changed under a locked translation, so the human
 *               edit may no longer be correct and wants another look
 *
 * Both are WARNINGS. This feature exists to protect people's work, not to block
 * their pipeline — a lock that fails CI would just get deleted.
 */
import { createHash } from 'node:crypto'

export const LOCKS_VERSION = 1

const hash = (str) => createHash('sha256').update(String(str)).digest('hex').slice(0, 16)

/**
 * Composite id for a locked entry: `lang::namespace::key`.
 * Human-readable on purpose — the lock file is committed and reviewed, so a
 * person must be able to read and grep it.
 */
export const lockId = (lang, ns, path) => `${lang}::${ns}::${path}`

/** Record for one pair. */
export const lockEntry = (source, translation) => ({
  sourceHash: hash(source),
  translationHash: hash(translation),
})

/**
 * Compare current text against a recorded lock.
 * @returns {null | { type: 'manual-translation-clobbered'|'manual-translation-stale', message: string }}
 */
export function lockFinding(entry, source, translation) {
  if (!entry) return null

  // Clobbering is the more urgent of the two: work has already been lost.
  if (entry.translationHash !== hash(translation)) {
    return {
      type: 'manual-translation-clobbered',
      message: 'this translation was locked as hand-edited and has since changed',
    }
  }
  if (entry.sourceHash !== hash(source)) {
    return {
      type: 'manual-translation-stale',
      message: 'the source changed after this translation was locked — the manual edit may be out of date',
    }
  }
  return null
}

/** Shape a fresh lock file. */
export const emptyLocks = () => ({ version: LOCKS_VERSION, locked: {} })

/**
 * Tolerant read: a missing, unreadable, corrupt or future-versioned lock file
 * behaves exactly like "no locks". A QA tool must never fail because of its own
 * bookkeeping.
 */
export function normalizeLocks(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== LOCKS_VERSION || typeof raw.locked !== 'object') {
    return emptyLocks()
  }
  return { version: LOCKS_VERSION, locked: raw.locked ?? {} }
}

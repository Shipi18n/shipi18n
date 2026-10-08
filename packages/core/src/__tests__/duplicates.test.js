import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findDuplicateKeys } from '../duplicates.js'
import { runCheck } from '../tree.js'

// Found 2026-10 in matcha: every locale had `inbox.archive` twice ("Archive" the folder,
// "archive" the action). JSON.parse keeps the last one without a word.

describe('findDuplicateKeys', () => {
  test('a repeated key with a different value: path, both lines, not the same', () => {
    const text = '{\n  "inbox": {\n    "archive": "Archive",\n    "trash": "Trash",\n    "archive": "archive"\n  }\n}'
    expect(findDuplicateKeys(text)).toEqual([{ path: 'inbox.archive', line: 5, firstLine: 3, same: false }])
  })

  test('the same value twice is marked same', () => {
    expect(findDuplicateKeys('{"a": "x", "b": 1, "a": "x"}')).toEqual([{ path: 'a', line: 1, firstLine: 1, same: true }])
  })

  test('equal keys in different objects are not duplicates', () => {
    expect(findDuplicateKeys('{"a": {"title": "x"}, "b": {"title": "x"}}')).toEqual([])
  })

  test('escaped quotes, colons inside strings, arrays and object values', () => {
    const text = '{"q": "say \\"a\\": b", "list": [{"k": 1, "k": 2}], "o": {"n": 1}, "o": "flat"}'
    expect(findDuplicateKeys(text)).toEqual([
      { path: 'list.0.k', line: 1, firstLine: 1, same: false },
      { path: 'o', line: 1, firstLine: 1, same: false },
    ])
  })

  test('a string value that looks like a key is not a key', () => {
    expect(findDuplicateKeys('{"a": "b", "c": "b"}')).toEqual([])
  })
})

describe('duplicate-key finding', () => {
  const tree = (files) => {
    const dir = mkdtempSync(join(tmpdir(), 'shipi18n-dup-'))
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
    return dir
  }
  const dupFindings = (dir) =>
    runCheck({ input: dir, source: 'en' }).languages.flatMap((l) =>
      l.namespaces.flatMap((n) => n.findings.filter((f) => f.type === 'duplicate-key').map((f) => `${l.lang}:${f.path}:${f.severity}`))
    )

  test('a different value is an error, the same value a warning', () => {
    const dir = tree({
      'en.json': '{"inbox": {"archive": "Archive", "delete": "delete"}}',
      'de.json': '{"inbox": {"archive": "Archiv", "delete": "löschen", "archive": "archivieren"}}',
      'fr.json': '{"inbox": {"archive": "Archives", "delete": "supprimer", "archive": "Archives"}}',
    })
    expect(dupFindings(dir).sort()).toEqual(['de:inbox.archive:error', 'fr:inbox.archive:warning'])
  })

  test('a clean tree has none', () => {
    expect(dupFindings(tree({ 'en.json': '{"a": "A"}', 'de.json': '{"a": "Ä"}' }))).toEqual([])
  })
})

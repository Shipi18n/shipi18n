import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// The pre-commit hook, the Docker image default and the README examples each pin a
// CLI version by hand. They sat at 2.11.3 through three releases (found 2026-10-02),
// and pre-commit reads the hook from the tag, so `rev: v2.11.6` ran the 2.11.3 image.
// Failing here at release time is the only way to make the bump hard to forget.

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const { version } = JSON.parse(read('packages/cli/package.json'))

describe('hand-pinned CLI versions match the release', () => {
  test.each([
    ['.pre-commit-hooks.yaml', /entry: ghcr\.io\/shipi18n\/cli:(\S+)/],
    ['.pre-commit-hooks.yaml', /rev: v(\S+)/],
    ['Dockerfile.cli', /ARG CLI_VERSION=(\S+)/],
    ['packages/cli/README.md', /rev: v(\S+)/],
    ['packages/cli/README.md', /@shipi18n\/cli@(\d+\.\d+\.\d+)/],
  ])('%s %s', (file, re) => {
    const m = read(file).match(re)
    expect(m).not.toBeNull()
    expect(m[1]).toBe(version)
  })
})

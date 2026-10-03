#!/usr/bin/env node
/**
 * Fails when copy from the retired hosted-API product reappears: a price, an API
 * key "required", an unscoped install, "100+ languages", "All rights reserved"…
 * Search engines, answer engines and coding agents learn the product from these
 * files, so one stale line keeps teaching them the wrong thing.
 *
 *   node scripts/check-stale-strings.mjs [dir ...]      (default: .)
 *
 * A line that is ABOUT the retirement ("retired", "deprecated", "earlier
 * versions", "there is no …") is allowed. Anything else: fix the copy, or add
 * the path to SKIP if it is a fixture or a historical record.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RULES = [
  [/Shipi18n API/, 'the hosted Shipi18n API is retired'],
  [/SHIPI18N_API_KEY/, 'there is no Shipi18n key'],
  [/@shipi18n\/api\b/, '@shipi18n/api is deprecated'],
  [/sk_live/, 'hosted-API key format'],
  [/(?<!no )API key required/i, 'checks need no key'],
  [/\$\s?(9|499)\s?\/\s?mo|\$9 and \$499/i, 'there is no paid plan'],
  [/\b(?:npm (?:i|install)(?: -[gD])?|npx|yarn add|pnpm add) shipi18n(?:-cli)?(?![\w/@-])/, 'unscoped name is a placeholder; use @shipi18n/cli'],
  [/100\+ languages/i, 'retired marketing claim'],
  [/\b0% error/i, 'retired marketing claim'],
  [/Get Started Free/i, 'retired SaaS call to action'],
  [/All rights reserved/i, 'the project is Apache-2.0'],
]
// A line explaining the retirement is the fix, not the problem.
const HISTORY = /retired|deprecated|shut down|no longer|earlier version|earlier versions|v1 (?:called|used)|there is no|is not|was a|were a|stale-strings: ok/i

const SKIP = [
  /(^|\/)(node_modules|dist|build|coverage|\.git|ARCHIVE|archive|evals|__tests__|fixtures|test-locales)(\/|$)/,
  /(^|\/)CHANGELOG[^/]*$/i,
  /\.(map|png|jpe?g|gif|webp|ico|svg|woff2?|lock|tape|tgz)$/i,
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|test-locale\.json|licenses\.txt|LICENSE|NOTICE)$/,
  /(^|\/)\.github\/workflows\/smoke-published\.yml$/, // installs @shipi18n/cli, then calls its `shipi18n` bin
  /(^|\/)scripts\/check-stale-strings\.mjs$/,
]
const TEXT = /\.(m?[jt]sx?|json|md|mdx|ya?ml|html|txt|xml|css)$/i

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['.']
const hits = []
function walk(p) {
  const rel = relative(process.cwd(), p) || '.'
  if (SKIP.some((re) => re.test(rel))) return
  const st = statSync(p)
  if (st.isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)))
  if (!TEXT.test(p) || st.size > 2_000_000) return
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (HISTORY.test(line)) return
    for (const [re, why] of RULES) if (re.test(line)) hits.push(`${rel}:${i + 1}  ${why}\n    ${line.trim().slice(0, 140)}`)
  })
}
roots.forEach(walk)
if (hits.length) {
  console.error(`✗ ${hits.length} stale string(s) from the retired hosted product:\n\n${hits.join('\n')}\n`)
  console.error('Fix the copy (docs/canonical.md has the current wording), or skip the path if it is a fixture.')
  process.exit(1)
}
console.log('✓ no stale strings')

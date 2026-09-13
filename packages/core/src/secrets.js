/**
 * Secret / PII detection — a pre-flight before `--semantic` ships strings to a
 * third-party LLM, and an opt-in `check` rule.
 *
 * The BYO-LLM privacy story has a hole: a locale string that contains an API key,
 * a private key, or a customer's email/card gets sent verbatim to the model
 * provider the moment you run `--semantic`. No i18n tool guards that send. This
 * does — and because the semantic pass only ever transmits the pairs we scan
 * here, the pre-flight is complete by construction: what gets sent gets scanned.
 *
 * Bias: high precision over recall. False positives that fail a build teach users
 * to add `--severity secret-preflight=off` and stop trusting the tool, so every
 * pattern is prefix- or checksum-anchored (Luhn for cards, known key prefixes),
 * example/test values are filtered out, and phone matching requires a `+` country
 * code. Matches are always MASKED — a finding never echoes the secret it found.
 */

/** Mask a matched value so it never appears in a finding, log, or report. */
export function maskSecret(s) {
  if (s.length <= 6) return '•'.repeat(s.length)
  return s.slice(0, 3) + '•'.repeat(Math.min(6, s.length - 5)) + s.slice(-2)
}

/** Luhn checksum — filters random digit runs from real card numbers. */
function luhnValid(digits) {
  let sum = 0
  let dbl = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (dbl) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    dbl = !dbl
  }
  return sum % 10 === 0 && digits.length >= 13
}

// Placeholder / documentation emails that should not trip the PII detector.
const EXAMPLE_EMAIL =
  /@(?:example\.(?:com|org|net)|test(?:\.\w+)?|localhost|(?:your|my)?(?:company|domain|email|site)\.\w+|acme\.\w+)$/i

// High-confidence secrets first; email/phone (PII) last. Order matters: the first
// pattern to claim a span wins, so a provider key is never re-reported as a
// generic token. `re` must be global (we exec in a loop).
const PATTERNS = [
  { kind: 'private-key', severity: 'error', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g },
  { kind: 'aws-access-key', severity: 'error', re: /\b(?:AKIA|ASIA|AGPA|AIDA)[0-9A-Z]{16}\b/g },
  { kind: 'gcp-api-key', severity: 'error', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'github-token', severity: 'error', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { kind: 'github-pat', severity: 'error', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { kind: 'slack-token', severity: 'error', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'stripe-key', severity: 'error', re: /\b[rs]k_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
  { kind: 'anthropic-key', severity: 'error', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'openai-key', severity: 'error', re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g },
  { kind: 'jwt', severity: 'error', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: 'credit-card', severity: 'error', re: /\b(?:\d[ -]?){13,19}\b/g, luhn: true },
  {
    kind: 'email',
    severity: 'warning',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    filter: (m) => !EXAMPLE_EMAIL.test(m),
  },
  // Phone: require a leading + country code — a bare 10-digit run is far too
  // ambiguous (IDs, timestamps, quantities) to flag without crying wolf.
  { kind: 'phone', severity: 'warning', re: /\+\d[\d ().-]{7,}\d/g },
]

/**
 * Scan one string for secrets / PII.
 * @param {string} str
 * @returns {Array<{kind:string, severity:'error'|'warning', masked:string}>}
 *          masked values only — never the raw secret.
 */
export function scanSecrets(str) {
  if (!str || typeof str !== 'string') return []
  const hits = []
  const claimed = [] // [start,end) spans already attributed to a higher-confidence pattern
  const overlaps = (a, b) => claimed.some(([s, e]) => a < e && b > s)

  for (const p of PATTERNS) {
    p.re.lastIndex = 0
    let m
    while ((m = p.re.exec(str)) !== null) {
      const val = m[0]
      if (val === '') {
        p.re.lastIndex++
        continue
      }
      const start = m.index
      const end = start + val.length
      if (overlaps(start, end)) continue
      if (p.filter && !p.filter(val)) continue
      if (p.luhn && !luhnValid(val.replace(/\D/g, ''))) continue
      claimed.push([start, end])
      hits.push({ kind: p.kind, severity: p.severity, masked: maskSecret(val) })
      if (hits.length >= 50) return hits // pathological input backstop
    }
  }
  return hits
}

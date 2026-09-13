import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanSecrets, maskSecret } from '../secrets.js'
import { runCheck, runSemantic, scanResultSecrets } from '../tree.js'

// A syntactically-valid-looking (but fake) Anthropic key and a Luhn-valid test card.
const FAKE_ANTHROPIC = 'sk-ant-api03-abcdefghijklmnop1234567890'
const VISA_TEST = '4111 1111 1111 1111' // passes Luhn

describe('scanSecrets: precision', () => {
  test('detects high-confidence secrets as errors', () => {
    for (const [str, kind] of [
      [`key is ${FAKE_ANTHROPIC}`, 'anthropic-key'],
      ['AKIAIOSFODNN7EXAMPLE now', 'aws-access-key'],
      ['-----BEGIN RSA PRIVATE KEY-----', 'private-key'],
      ['tok ghp_' + 'a'.repeat(36), 'github-token'],
      ['pay with ' + VISA_TEST, 'credit-card'],
    ]) {
      const hits = scanSecrets(str)
      expect(hits.map((h) => h.kind)).toContain(kind)
      expect(hits.find((h) => h.kind === kind).severity).toBe('error')
    }
  })

  test('a real email is a warning; example/test emails are ignored', () => {
    const hits = scanSecrets('write jane.doe@acmecorp.io today')
    expect(hits.map((h) => h.kind)).toContain('email')
    expect(hits.find((h) => h.kind === 'email').severity).toBe('warning')
    expect(scanSecrets('e.g. user@example.com')).toHaveLength(0)
    expect(scanSecrets('support@test')).toHaveLength(0)
  })

  test('Luhn filters random 16-digit runs from real cards', () => {
    expect(scanSecrets('order 4111 1111 1111 1112')).toHaveLength(0) // one digit off → fails Luhn
    expect(scanSecrets(VISA_TEST).map((h) => h.kind)).toContain('credit-card')
  })

  test('phone needs a + country code — bare digit runs do not cry wolf', () => {
    expect(scanSecrets('call 4155550123')).toHaveLength(0)
    expect(scanSecrets('call +1 415 555 0123').map((h) => h.kind)).toContain('phone')
  })

  test('clean UI copy and placeholders produce nothing', () => {
    expect(scanSecrets('Welcome, {name}! You have %d new messages.')).toHaveLength(0)
    expect(scanSecrets('')).toHaveLength(0)
    expect(scanSecrets(null)).toHaveLength(0)
  })

  test('findings never echo the raw secret (masked only)', () => {
    const hit = scanSecrets(`x ${FAKE_ANTHROPIC}`)[0]
    expect(hit.masked).not.toBe(FAKE_ANTHROPIC)
    expect(hit.masked).toContain('•')
    expect(maskSecret('short')).toBe('•••••')
  })
})

// Build a nested-layout result whose only translated pair carries a secret.
function resultWithSecretPair() {
  const dir = mkdtempSync(join(tmpdir(), 'shipi18n-secret-'))
  mkdirSync(join(dir, 'en'))
  mkdirSync(join(dir, 'es'))
  writeFileSync(join(dir, 'en', 'app.json'), JSON.stringify({ note: 'Set your API token here' }))
  writeFileSync(join(dir, 'es', 'app.json'), JSON.stringify({ note: `Usa ${FAKE_ANTHROPIC}` }))
  const result = runCheck({ input: dir, source: 'en' })
  rmSync(dir, { recursive: true, force: true })
  return result
}

describe('--detect-secrets: scanResultSecrets', () => {
  test('flags a secret sitting in a locale string', () => {
    const r = resultWithSecretPair()
    const flagged = scanResultSecrets(r)
    expect(flagged).toBe(1)
    const f = r.languages.flatMap((l) => l.namespaces.flatMap((n) => n.findings)).find((x) => x.type === 'secret-detected')
    expect(f).toBeTruthy()
    expect(f.severity).toBe('error')
    expect(f.path).toBe('note')
    expect(r.totals.errors).toBeGreaterThan(0)
  })
})

describe('semantic pre-flight: secrets are withheld from the LLM', () => {
  test('the only pair carries a secret → withheld, no model call, finding recorded', async () => {
    const r = resultWithSecretPair()
    // apiKey is unused: with the sole pair withheld, reviewTranslations is never reached.
    const totals = await runSemantic(r, { provider: 'anthropic', apiKey: 'unused', passes: 1, cache: {} })
    expect(totals.redacted).toBe(1)
    expect(totals.calls).toBe(0) // nothing sent to the provider
    const f = r.languages.flatMap((l) => l.namespaces.flatMap((n) => n.findings)).find((x) => x.type === 'secret-preflight')
    expect(f).toBeTruthy()
    expect(f.message).toMatch(/withheld from the LLM/)
    expect(r.totals.errors).toBeGreaterThan(0)
  })
})

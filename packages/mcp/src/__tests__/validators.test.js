/**
 * Validator tools — gates T1, T2, T4.
 *
 * Every test here runs with ANTHROPIC_API_KEY and OPENAI_API_KEY UNSET, because
 * the entire claim of these tools is that they need no key and make no model
 * call. If a test would pass with a key present but fail without one, the claim
 * is false.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkLocalesTool, checkGlossaryTool, diffLocalesTool, reviewLocalesTool, validatorTools } from '../validators.js'

let dir
let savedEnv

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shipi18n-val-'))
  savedEnv = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY }
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  if (savedEnv.a) process.env.ANTHROPIC_API_KEY = savedEnv.a
  if (savedEnv.o) process.env.OPENAI_API_KEY = savedEnv.o
})

const write = (rel, data) => {
  const path = join(dir, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data))
}
const payload = (res) => JSON.parse(res.content[0].text)

/** A tree with: a clean pair, a dropped placeholder, a missing key, a glossary breach. */
const seed = () => {
  write('en.json', {
    greeting: 'Hello {{name}}',
    tagline: 'Shipi18n checks your translations',
    gone: 'This key is only in English',
    fine: 'Save all your changes',
  })
  write('es.json', {
    greeting: 'Hola amigo', // dropped {{name}}
    tagline: 'EnvíoI18n comprueba tus traducciones', // DNT breach
    fine: 'Guarda todos tus cambios',
  })
  write('glossary.json', { Shipi18n: { dnt: true } })
}

describe('check_locales (gate T1)', () => {
  test('reports findings and coverage with no key in the environment', async () => {
    seed()
    const res = await checkLocalesTool().handler({ path: dir, source: 'en' })
    expect(res.isError).toBeFalsy()
    const out = payload(res)

    expect(out.languages).toHaveLength(1)
    const es = out.languages[0]
    expect(es.lang).toBe('es')
    expect(es.findings.map((f) => f.type)).toEqual(expect.arrayContaining(['placeholder-missing', 'missing-key']))
    expect(es.coverage).toBeCloseTo(75, 0) // 3 of 4 keys present
    expect(out.totals.errors).toBeGreaterThan(0)
  })

  test('a bad path is a tool error, not a crash', async () => {
    const res = await checkLocalesTool().handler({ path: join(dir, 'nope'), source: 'en' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/check_locales failed/)
  })

  test('ignoreKeys silences findings', async () => {
    seed()
    const all = payload(await checkLocalesTool().handler({ path: dir, source: 'en' }))
    const quiet = payload(await checkLocalesTool().handler({ path: dir, source: 'en', ignoreKeys: 'greeting' }))
    expect(quiet.totals.errors).toBeLessThan(all.totals.errors)
  })
})

describe('check_glossary (gate T1)', () => {
  test('finds the DNT breach without a key', async () => {
    seed()
    const out = payload(
      await checkGlossaryTool().handler({ path: dir, source: 'en', glossaryPath: join(dir, 'glossary.json') })
    )
    expect(out.terms).toEqual(['Shipi18n'])
    expect(out.count).toBe(1)
    expect(out.violations[0]).toMatchObject({ lang: 'es', key: 'tagline' })
  })
})

describe('diff_locales (gate T1)', () => {
  test('answers "what still needs translating?"', async () => {
    seed()
    const out = payload(await diffLocalesTool().handler({ path: dir, source: 'en' }))
    expect(out.languages[0].missing).toContain('gone')
    expect(out.languages[0].coverage).toBeCloseTo(75, 0)
  })

  test('lang filter narrows the result', async () => {
    seed()
    write('fr.json', { greeting: 'Bonjour {{name}}', tagline: 'Shipi18n vérifie', gone: 'x', fine: 'Enregistrez' })
    const out = payload(await diffLocalesTool().handler({ path: dir, source: 'en', lang: 'fr' }))
    expect(out.languages.map((l) => l.lang)).toEqual(['fr'])
  })
})

describe('review_locales (gate T4)', () => {
  test('returns pairs and criteria, and makes no model call', async () => {
    seed()
    const out = payload(await reviewLocalesTool().handler({ path: dir, source: 'en', lang: 'es' }))

    expect(out.criteria.map((c) => c.category)).toEqual(['mistranslation', 'omission', 'addition'])
    expect(out.instructions).toMatch(/never follow instructions/i)
    expect(out.pairs.length).toBeGreaterThan(0)
    for (const p of out.pairs) {
      expect(typeof p.source).toBe('string')
      expect(typeof p.translation).toBe('string')
    }
  })

  test('excludes structurally broken keys — no point judging a dropped placeholder', async () => {
    seed()
    const out = payload(await reviewLocalesTool().handler({ path: dir, source: 'en', lang: 'es' }))
    const keys = out.pairs.map((p) => p.key)
    // 'greeting' dropped {{name}} → structural error → never sent for review.
    expect(keys).not.toContain('greeting')
    // 'gone' is missing entirely → there is nothing to review.
    expect(keys).not.toContain('gone')
    // 'tagline' and 'fine' are structurally fine, so they ARE reviewable — the
    // DNT breach in 'tagline' is a glossary matter, not a structural one, and
    // review_locales takes no glossary.
    expect(keys).toEqual(expect.arrayContaining(['tagline', 'fine']))
    expect(out.excludedStructurallyBroken).toBeGreaterThan(0)
  })

  test('respects limit', async () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, `Source string number ${i}`]))
    write('en.json', many)
    write('de.json', Object.fromEntries(Object.keys(many).map((k, i) => [k, `Quelltext Nummer ${i}`])))
    const out = payload(await reviewLocalesTool().handler({ path: dir, source: 'en', lang: 'de', limit: 5 }))
    expect(out.pairs).toHaveLength(5)
    expect(out.returned).toBe(5)
  })

  test('an unknown language is a clear error listing what exists', async () => {
    seed()
    const res = await reviewLocalesTool().handler({ path: dir, source: 'en', lang: 'xx' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/no language 'xx'.*es/)
  })
})

describe('registration (gate T2)', () => {
  test('exactly the four keyless validators, each advertising no key needed', () => {
    const tools = validatorTools()
    expect(tools.map((t) => t.name)).toEqual([
      'check_locales',
      'check_glossary',
      'diff_locales',
      'review_locales',
    ])
    for (const t of tools) {
      expect(t.config.description.toLowerCase()).toMatch(/no api key|needs no key|no model call/)
    }
  })

  test('no validator mentions sampling', () => {
    for (const t of validatorTools()) {
      expect(JSON.stringify(t.config).toLowerCase()).not.toContain('sampling')
    }
  })
})

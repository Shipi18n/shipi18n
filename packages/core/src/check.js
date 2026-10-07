/**
 * Structural QA for translated locale objects — the `check` half of check→fix.
 *
 * Deterministic: no LLM, no network, no key. Safe for CI and pre-commit, and
 * fast enough to run on every push. The semantic (LLM-as-judge) layer builds on
 * top of these findings; it never replaces them.
 */
import { flatten } from './translate.js'
import { validatePlaceholders } from './placeholders.js'
import { isICUControl, checkICU, requiredCategories } from './icu.js'

/**
 * vue-i18n expresses plurals as one pipe-separated string
 * ("You have {count} item | You have {count} items"). If translation collapses
 * the forms, the UI silently renders the wrong plural — or the raw key.
 *
 * Only strings that also interpolate something ({count}, {{n}}, …) are treated
 * as plurals: a literal pipe in prose — "Blog | Shipi18n" SEO titles — is
 * common and must not trip the check. (Found by running check on our own site.)
 */
const pluralFormCount = (str) => String(str).split('|').length
const looksLikePipePlural = (str) => pluralFormCount(str) > 1 && /\{[^}]+\}/.test(str)

// FP#15: Chinese, Japanese, Korean, Thai, Vietnamese, Indonesian… have one plural
// category, so a pipe plural translated as a single form is correct for them
// (found on Hoppscotch cn and Chatwoot zh_CN/zh_TW). It is only a break when the
// one form is really both forms run together — the separator lost, as in nocodb
// ja "…ドロップします。 {count} …ドロップします" — which shows up as more
// placeholders than any single source form carries.
const LANG_ALIASES = { cn: 'zh', tw: 'zh-TW' }
function hasSinglePluralCategory(lang) {
  const tag = String(lang).replace(/_/g, '-')
  try {
    const pr = new Intl.PluralRules(LANG_ALIASES[tag.toLowerCase()] || tag)
    for (let n = 0; n <= 200; n++) if (pr.select(n) !== 'other') return false
    return true
  } catch {
    return false
  }
}
// FP#16: an app can define its own pluralRules (vue-i18n `pluralRules`), giving a
// language more pipe forms than English has — npmx.dev: Arabic 6, Czech 3. More
// forms than the source is fine while it fits the language's CLDR plural
// categories — or one more for vue-i18n's zero form, which only exists for
// count-based plurals ({count}/{n} in the source): npmx pl "{count} odpowiedzi |
// {count} odpowiedź | …" (zero + one/few/many/other = 5). A blanket +1 hid nocodb's
// Basque string, whose source counts with {inserted}/{failed}: 3 garbled forms for
// a 2-category language, still flagged.
function pluralCategoryCount(lang) {
  const tag = String(lang).replace(/_/g, '-')
  try {
    // The full CLDR set, fractions included: npmx's Polish rules use one/few/many/other
    // (+ a zero form = 5), and `other` there only ever fires for non-integers.
    return new Intl.PluralRules(LANG_ALIASES[tag.toLowerCase()] || tag).resolvedOptions().pluralCategories.length
  } catch {
    return 0
  }
}

// FP#17: keys like `_comment` carry notes for translators, not UI text
// (unifideck's captureLogs._comment was flagged in 15 locales).
const COUNT_ARG = /\{\s*(count|n)\s*\}/
const countsWithCountArg = (s) => COUNT_ARG.test(s)

const isMetaKey = (path) => /(^|\.)_(comment|comments|note|notes|description|desc|context|meta|todo|doc|docs)$/i.test(path)

const placeholderCount = (str) => (String(str).match(/\{[^{}]+\}/g) || []).length
const isMergedPlural = (s, t) =>
  placeholderCount(t) > Math.max(...String(s).split('|').map(placeholderCount))

/**
 * Pipe-separated plurals are a vue-i18n/JSON convention. Rails pluralizes with
 * `one:`/`other:` keys, gettext with msgstr[n], Android with <plurals>, Apple with
 * .stringsdict — all of them treat `|` as an ordinary character. Running the pipe
 * rule on those grammars reports prose as a collapsed plural (FP#13: ifme's
 * `'if-me.org | Your meeting "%{meeting_name}" is tomorrow at %{time}!'` against
 * id/vi translations that simply dropped the brand prefix).
 */
const PIPE_PLURAL_GRAMMARS = new Set(['vue', 'brace', 'generic', 'i18next', 'icu'])

/** `a.b.part_1` / `a.b.line_2` — one slot of a sentence split across numbered keys. */
const FRAGMENT_KEY = /(^|\.)([a-z_]*?_)?(part|line|segment|frag)_?(\d+)$/i
const isNumberedFragment = (path) => FRAGMENT_KEY.test(path)
/** True when a sibling fragment under the same parent carries a real translation. */
function hasTranslatedSibling(path, tgt) {
  const parent = path.slice(0, path.lastIndexOf('.'))
  if (!parent) return false
  for (const [k, v] of Object.entries(tgt)) {
    if (k === path || !k.startsWith(parent + '.')) continue
    if (!isNumberedFragment(k)) continue
    if (typeof v === 'string' && v.trim() !== '') return true
  }
  return false
}

/** Rails/i18n-gem date & time format keys hold strftime patterns, not placeholders. */
const isDateFormatKey = (path) => /(^|\.)(date|time)\.formats(\.|$)/.test(path)
/** CLDR plural category keys whose form may legitimately omit the count. */
const isCldrSingularKey = (path) => /(^|\.)(one|zero)$|_(one|zero)$/.test(path)
const isCountPlaceholder = (ph) => /^(\{\{?|%\{)(count|n|num|number)\}?\}$/.test(ph)

/**
 * Key-based plurals: i18next suffixes (`items_one`, `items_ordinal_few`) and nested
 * category keys (`items.one` — Rails YAML, Android <plurals>, .xcstrings variations).
 * Each language has its own CLDR categories, so the key set legitimately differs from
 * the source: Polish adds `_few`/`_many`, Japanese has only `_other`. Compared key by
 * key, a correct Polish file read as two orphans ("delete this key"), a correct
 * Japanese one failed on a missing `_one`, and Polish with only one/other passed.
 */
const PLURAL_CATS = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])
const SUFFIX_PLURAL = /^(.+?)_(ordinal_)?(zero|one|two|few|many|other)$/
const NESTED_PLURAL = /^(.+)\.(zero|one|two|few|many|other)$/
const pluralKey = (g, cat) => (g.nested ? `${g.base}.${cat}` : `${g.base}_${g.ordinal ? 'ordinal_' : ''}${cat}`)

function pluralGroupOf(path) {
  let m = SUFFIX_PLURAL.exec(path)
  if (m) return { id: `${m[1]}_${m[2] || ''}`, base: m[1], ordinal: Boolean(m[2]), nested: false, cat: m[3] }
  m = NESTED_PLURAL.exec(path)
  if (m) return { id: `${m[1]}.`, base: m[1], ordinal: false, nested: true, cat: m[2] }
  return null
}

/** Source plural groups: at least two categories including `other` (a lone `gender_other` is a word, not a plural). */
function pluralGroups(srcKeys) {
  const groups = new Map()
  const children = new Map() // nested parent → every child key name, to require all-category children
  for (const path of srcKeys) {
    const dot = path.lastIndexOf('.')
    if (dot > 0) {
      const parent = path.slice(0, dot)
      if (!children.has(parent)) children.set(parent, [])
      children.get(parent).push(path.slice(dot + 1))
    }
    const g = pluralGroupOf(path)
    if (!g) continue
    if (!groups.has(g.id)) groups.set(g.id, { ...g, cats: new Set() })
    groups.get(g.id).cats.add(g.cat)
  }
  for (const [id, g] of groups) {
    const ok =
      g.cats.has('other') && g.cats.size >= 2 && (!g.nested || children.get(g.base).every((k) => PLURAL_CATS.has(k)))
    if (!ok) groups.delete(id)
  }
  return groups
}

/** Every CLDR category a language has (incl. ones only reached by decimals or millions), or null if unknown. */
function allCategories(lang, ordinal) {
  const tag = String(lang).replace(/_/g, '-')
  const resolved = LANG_ALIASES[tag.toLowerCase()] || tag
  try {
    if (!Intl.PluralRules.supportedLocalesOf(resolved).length) return null
    return new Intl.PluralRules(resolved, { type: ordinal ? 'ordinal' : 'cardinal' }).resolvedOptions().pluralCategories
  } catch {
    return null
  }
}

function neededCategories(lang, ordinal) {
  const tag = String(lang).replace(/_/g, '-')
  const resolved = LANG_ALIASES[tag.toLowerCase()] || tag
  try {
    if (!Intl.PluralRules.supportedLocalesOf(resolved).length) return null
  } catch {
    return null
  }
  return requiredCategories(resolved, ordinal)
}

/**
 * Whole numbers above 1 that a language's `one` category also covers — Ukrainian and
 * Russian `one` is 1, 21, 31…, so a `one` hard-coding "1 хвилина" shows "1" for 21
 * minutes (good_job #1848). Empty where `one` means exactly 1 (English, German…) and
 * omitting the count is fine. Two examples are enough for the message.
 */
const oneCoversCache = new Map()
function oneAlsoCovers(lang) {
  const tag = String(lang).replace(/_/g, '-')
  if (oneCoversCache.has(tag)) return oneCoversCache.get(tag)
  const resolved = LANG_ALIASES[tag.toLowerCase()] || tag
  const out = []
  try {
    if (Intl.PluralRules.supportedLocalesOf(resolved).length) {
      const pr = new Intl.PluralRules(resolved)
      for (let n = 2; n <= 101 && out.length < 2; n++) if (pr.select(n) === 'one') out.push(n)
    }
  } catch {
    // unknown tag: treat `one` as exactly 1
  }
  oneCoversCache.set(tag, out)
  return out
}

/** Heuristic for "probably untranslated": multi-word and contains letters. */
const looksTranslatable = (str) => /\s/.test(str.trim()) && /[a-zA-Z]/.test(str)

/**
 * Compare a source locale object against one translated locale object.
 *
 * @param {object} params
 * @param {Record<string, any>} params.source      source-language locale object
 * @param {Record<string, any>} params.target      translated locale object
 * @param {string} [params.targetLang]             label used in messages
 * @returns {{ findings: Array<object>, stats: object }}
 *
 * Finding: { type, severity: 'error'|'warning', path, message, ...detail }
 * Types: missing-key, orphan-key, placeholder-missing, placeholder-added,
 *        plural-forms, empty-value, untranslated, type-mismatch
 */
/**
 * Deterministic glossary enforcement — no LLM, no key.
 * dnt terms must survive verbatim (case-sensitive: brands are spelled one way);
 * locked per-language terms must appear (case-insensitive) whenever the source
 * uses the term.
 */
function glossaryFindings(s, t, glossary, targetLang, path) {
  const findings = []
  for (const [term, cfg] of Object.entries(glossary)) {
    // Match the term as it actually appears in the source: "@shipi18n/mcp" is a
    // package name, and a translation that preserves it verbatim (lowercase) is
    // CORRECT even though the canonical brand casing differs. Found by the M7
    // eval: three clean pairs were flagged for exactly this.
    const occurrences = s.match(
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    )
    if (!occurrences) continue
    if (cfg.dnt && ![...new Set(occurrences)].every((m) => t.includes(m))) {
      findings.push({
        type: 'glossary-violation',
        severity: 'error',
        path,
        message: `do-not-translate term "${term}" is missing from the translation`,
        source: s,
        translation: t,
      })
    } else if (!cfg.dnt && typeof cfg[targetLang] === 'string' && !t.toLowerCase().includes(cfg[targetLang].toLowerCase())) {
      findings.push({
        type: 'glossary-violation',
        severity: 'error',
        path,
        message: `locked term "${term}" must be translated as "${cfg[targetLang]}"`,
        source: s,
        translation: t,
      })
    }
  }
  return findings
}

/**
 * Source-only "suffix" variables: `{plural}` / `{{ plural }}` / `{s}` carry an
 * English "s"; most languages legitimately drop them. Never a hard error.
 */
const isSuffixPlaceholder = (ph) => /^(\{\{?\s*|%\{)(plural|s|es|pluralSuffix)\s*\}?\}$/.test(ph)

export function checkTranslations({ source, target, targetLang = 'target', glossary, format = 'generic' }) {
  const findings = []
  const src = flatten(source)
  const tgt = flatten(target)
  const srcKeys = Object.keys(src)
  const srcSet = new Set(srcKeys)
  const tgtKeys = Object.keys(tgt)
  const tgtSet = new Set(tgtKeys)

  // Key-based plurals, per this target language (see PLURAL_CATS above).
  const exemptMissing = new Set() // source categories this language doesn't have (ja `items_one`)
  const extraForms = new Map() // target-only categories it does have (pl `items_few`) → source `other` key
  const pluralFindings = []
  const srcPluralGroups = pluralGroups(srcKeys)
  // A tree that writes plurals in ICU (`{count, plural, …}`) picks `_one` suffix keys in
  // app code (`if (count === 1) t('count_one')`, bulwark), not by plural rule: only
  // nested category keys (Rails, Android, xcstrings) are selected per CLDR there.
  const icuPlurals = srcKeys.some((k) => typeof src[k] === 'string' && /\{\s*\w+\s*,\s*(?:plural|selectordinal)\s*,/.test(src[k]))
  const ruleSelectsOne = (g) => Boolean(g) && g.cat === 'one' && srcPluralGroups.has(g.id) && (g.nested || !icuPlurals)
  for (const g of srcPluralGroups.values()) {
    const needed = neededCategories(targetLang, g.ordinal)
    const all = allCategories(targetLang, g.ordinal)
    if (!needed || !all) continue
    const has = [...PLURAL_CATS].filter((c) => tgtSet.has(pluralKey(g, c)))
    for (const c of g.cats) {
      if (c !== 'other' && c !== 'zero' && !all.includes(c)) exemptMissing.add(pluralKey(g, c))
    }
    for (const c of has) {
      if (!g.cats.has(c) && (all.includes(c) || c === 'zero')) extraForms.set(pluralKey(g, c), pluralKey(g, 'other'))
    }
    if (!has.length) continue // nothing translated yet: the missing `other` key already reports it
    const lacking = [...PLURAL_CATS].filter((c) => needed.includes(c) && !has.includes(c) && !g.cats.has(c))
    if (lacking.length) {
      pluralFindings.push({
        type: 'plural-category',
        severity: 'warning',
        path: g.nested ? g.base : `${g.base}${g.ordinal ? '_ordinal' : ''}`,
        missing: lacking,
        message: `plural is missing CLDR ${targetLang} categor${lacking.length > 1 ? 'ies' : 'y'} ${lacking.join(', ')} (has ${has.join(', ')})`,
        keys: lacking.map((c) => pluralKey(g, c)),
      })
    }
  }

  for (const path of srcKeys) {
    if (isMetaKey(path)) continue
    if (!tgtSet.has(path) && exemptMissing.has(path)) continue
    if (!tgtSet.has(path)) {
      findings.push({
        type: 'missing-key',
        severity: 'error',
        path,
        message: `missing in ${targetLang}`,
      })
      continue
    }

    const s = src[path]
    const t = tgt[path]

    // `null` is `typeof 'object'`, so a null translation of a string used to
    // read as a type mismatch (FP#4: 8,000+ on Solidus bg.yml). It is an empty
    // translation. A null SOURCE defines nothing to translate — pass through.
    if (s === null || s === undefined) continue
    if (t === null) {
      if (typeof s === 'string' && s.trim() !== '') {
        findings.push({ type: 'empty-value', severity: 'error', path, message: 'empty translation', source: s })
      }
      continue
    }

    if (typeof s !== typeof t) {
      findings.push({
        type: 'type-mismatch',
        severity: 'warning',
        path,
        message: `source is ${typeof s}, ${targetLang} is ${typeof t}`,
      })
      continue
    }
    if (typeof s !== 'string') continue // numbers/booleans/null pass through untranslated by design

    if (t.trim() === '' && s.trim() !== '') {
      // A sentence split across numbered fragments (part_1/part_2/part_3, or _1/_2)
      // is legitimately empty in one slot for languages that reorder the clause:
      // Hoppscotch's `sso.…step_2.part_1` is empty in ja and ko because both move
      // the verb into part_3, while the other fragments are translated (FP#12).
      // An empty fragment whose siblings are ALL empty is still a real gap.
      const emptiedFragment = isNumberedFragment(path) && hasTranslatedSibling(path, tgt)
      findings.push({
        type: 'empty-value',
        severity: emptiedFragment ? 'info' : 'error',
        path,
        message: emptiedFragment
          ? 'empty translation (numbered sentence fragment; siblings are translated, so this is probably deliberate word order)'
          : 'empty translation',
        source: s,
      })
      continue
    }

    // ICU MessageFormat (plural/select) is validated ICU-aware — the regex
    // placeholder check would read its sub-messages as bogus placeholders.
    if (isICUControl(s)) {
      const icu = checkICU(s, t, targetLang, path)
      // A plural collapsed to one form ("{n, plural, …}" → "Tili") drops only the
      // plural argument. Fidelity loss, not a broken variable → warning tier.
      if (!isICUControl(t)) {
        const pluralArgs = [...s.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*,\s*(?:plural|selectordinal)\s*,/g)].map((m) => `{${m[1]}}`)
        for (const f of icu) {
          if (f.type === 'placeholder-missing' && f.missing.every((x) => pluralArgs.includes(x))) {
            f.severity = 'warning'
            f.message += ' (plural simplified to a single form)'
          }
        }
      }
      findings.push(...icu)
    } else if (isDateFormatKey(path)) {
      // strftime patterns — Rails `time.formats.short: "%b %-d"` — aren't
      // placeholders, and locales legitimately reorder/drop fields (FP#6).
    } else {
      const { missing, added } = validatePlaceholders(s, t, { format })
      if (missing.length) {
        // Warning tier (policy, not parsing): CLDR/i18next singular forms may omit
        // the count ("one post" → "בהודעה אחת"); English plural-suffix variables
        // ({plural}, {{ plural }}) are dropped by design in most languages.
        // A literal `{}` in the translation is a placeholder that lost its name — always a real break.
        const emptyBrace = /\{\s*\}/.test(t)
        const singular = !emptyBrace && isCldrSingularKey(path) && missing.every(isCountPlaceholder)
        const suffix = !emptyBrace && missing.every(isSuffixPlaceholder)
        const covers = singular && ruleSelectsOne(pluralGroupOf(path)) ? oneAlsoCovers(targetLang) : []
        const note = singular
          ? covers.length
            ? ` (${targetLang} "one" also covers ${covers.join(', ')}… — check the text is right for those numbers)`
            : ' (singular form — may be intentional)'
          : suffix
            ? ' (English plural-suffix variable — usually intentional)'
            : ''
        findings.push({
          type: 'placeholder-missing',
          severity: singular || suffix ? 'warning' : 'error',
          path,
          missing,
          message: `dropped ${missing.join(', ')}${note}`,
          source: s,
          translation: t,
        })
      } else {
        // English `one` is exactly 1, so "1 minute" with no count is right there and the
        // comparison above passes. Where this language's `one` also covers 21, 31…, hold
        // its `one` to the source `other` instead: "1 хвилина" for 21 minutes is wrong.
        const g = pluralGroupOf(path)
        const covers = ruleSelectsOne(g) ? oneAlsoCovers(targetLang) : []
        const other = covers.length ? src[pluralKey(g, 'other')] : undefined
        if (typeof other === 'string') {
          const dropped = validatePlaceholders(other, t, { format }).missing.filter(isCountPlaceholder)
          if (dropped.length && !/\{\s*\}/.test(t)) {
            findings.push({
              type: 'placeholder-missing',
              severity: 'warning',
              path,
              missing: dropped,
              message: `dropped ${dropped.join(', ')} (${targetLang} "one" also covers ${covers.join(', ')}… — check the text is right for those numbers)`,
              source: other,
              translation: t,
            })
          }
        }
      }
      // A plural form that spells the count where the source's `one` writes "1"
      // ("%{count} хвилина" for "1 minute") is the fix above, not a stray variable,
      // as long as the source's `other` uses that count.
      const g = pluralGroupOf(path)
      const srcOther = g && srcPluralGroups.has(g.id) ? src[pluralKey(g, 'other')] : undefined
      const unexpected =
        typeof srcOther === 'string'
          ? added.filter((ph) => !(isCountPlaceholder(ph) && srcOther.includes(ph)))
          : added
      if (unexpected.length) {
        findings.push({
          type: 'placeholder-added',
          severity: 'warning',
          path,
          added: unexpected,
          message: `unexpected ${unexpected.join(', ')}`,
          source: s,
          translation: t,
        })
      }
    }

    const srcForms = pluralFormCount(s)
    const singleFormOk =
      pluralFormCount(t) === 1 && hasSinglePluralCategory(targetLang) && !isMergedPlural(s, t)
    const moreFormsOk =
      pluralFormCount(t) > srcForms &&
      pluralFormCount(t) <= pluralCategoryCount(targetLang) + (countsWithCountArg(s) ? 1 : 0)
    if (PIPE_PLURAL_GRAMMARS.has(format) && looksLikePipePlural(s) && pluralFormCount(t) !== srcForms && !singleFormOk && !moreFormsOk) {
      // One form that still carries the right variables is a simplification
      // ("{count} dependencias más" for every count): grammatically off for some
      // counts, but nothing breaks, so it warns. One form holding both sentences is
      // the separator lost (nocodb "… <unk> …"): both render together, an error.
      const simplified = pluralFormCount(t) === 1 && !isMergedPlural(s, t)
      findings.push({
        type: 'plural-forms',
        severity: simplified ? 'warning' : 'error',
        path,
        message: simplified
          ? `source has ${srcForms} plural forms ('|'), ${targetLang} uses one form for every count`
          : `source has ${srcForms} plural forms ('|'), ${targetLang} has ${pluralFormCount(t)}`,
        source: s,
        translation: t,
      })
    }

    if (glossary) findings.push(...glossaryFindings(s, t, glossary, targetLang, path))

    // Warning only: "OK", brand names and short labels are often legitimately identical.
    if (s === t && looksTranslatable(s)) {
      findings.push({
        type: 'untranslated',
        severity: 'warning',
        path,
        message: 'identical to source',
        source: s,
      })
    }
  }

  for (const path of tgtKeys) {
    if (isMetaKey(path)) continue
    if (extraForms.has(path)) {
      // A form the source language lacks (pl `items_few`): check it against the source's `other`.
      const s = src[extraForms.get(path)]
      const t = tgt[path]
      if (typeof s === 'string' && typeof t === 'string' && t.trim() !== '' && !/(^|\.|_)zero$/.test(path)) {
        const { missing } = validatePlaceholders(s, t, { format })
        // Only the count dropped: Arabic `two` is "دقيقتان" ("two minutes"), no digit — like English `one`.
        // Still worth a look (Ukrainian `few` hard-coding "1 хвилини" is wrong for 2–4), but nothing breaks.
        // Any other placeholder dropped is a broken variable.
        const countOnly = !/\{\s*\}/.test(t) && missing.every(isCountPlaceholder)
        if (missing.length)
          findings.push({
            type: 'placeholder-missing',
            severity: countOnly ? 'warning' : 'error',
            path,
            missing,
            message: `dropped ${missing.join(', ')}${countOnly ? ' (count left out of a plural form — check the text is right for every number in this category)' : ''}`,
            source: s,
            translation: t,
          })
      }
      continue
    }
    if (!srcSet.has(path)) {
      findings.push({
        type: 'orphan-key',
        severity: 'warning',
        path,
        message: 'not present in source',
      })
    }
  }

  findings.push(...pluralFindings)
  const missingCount = findings.filter((f) => f.type === 'missing-key').length
  const counted = srcKeys.length - [...exemptMissing].filter((p) => !tgtSet.has(p)).length
  return {
    findings,
    stats: {
      sourceKeys: srcKeys.length,
      targetKeys: tgtKeys.length,
      missing: missingCount,
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      coverage: counted ? (counted - missingCount) / counted : 1,
    },
  }
}

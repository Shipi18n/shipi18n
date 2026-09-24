import { checkTranslations } from '../check.js'

const byType = (r, t) => r.findings.filter((f) => f.type === t)

// FP#12 and FP#13 were found by running the checker over ifme and Hoppscotch on
// 2026-09-20 while gating two Rails PRs — see ENGAGEMENT/FIXLIST_FEASIBILITY.md.

describe('FP#12 — a numbered sentence fragment may be empty on purpose', () => {
  // Hoppscotch sso.…verify_domain.instructions.step_2 splits one sentence across
  // part_1/part_2/part_3. Japanese and Korean move the verb into part_3, so part_1
  // is legitimately empty while its siblings are translated.
  const source = { sso: { step_2: { part_1: 'Create a', part_2: 'TXT record', part_3: 'and paste the value below.' } } }

  test('empty fragment with translated siblings is info, not error', () => {
    const r = checkTranslations({
      source,
      target: { sso: { step_2: { part_1: '', part_2: 'TXTレコード', part_3: 'を作成し、以下の値を貼り付けます。' } } },
      targetLang: 'ja',
      format: 'brace',
    })
    const empties = byType(r, 'empty-value')
    expect(empties).toHaveLength(1)
    expect(empties[0].severity).toBe('info')
    expect(empties[0].path).toBe('sso.step_2.part_1')
    expect(r.stats.errors).toBe(0)
  })

  test('every fragment empty is still a real gap', () => {
    const r = checkTranslations({
      source,
      target: { sso: { step_2: { part_1: '', part_2: '', part_3: '' } } },
      targetLang: 'ko',
      format: 'brace',
    })
    expect(byType(r, 'empty-value').every((f) => f.severity === 'error')).toBe(true)
    expect(byType(r, 'empty-value')).toHaveLength(3)
  })

  test('an ordinary empty translation is untouched', () => {
    const r = checkTranslations({ source: { title: 'Settings' }, target: { title: '' }, targetLang: 'de', format: 'brace' })
    expect(byType(r, 'empty-value')[0].severity).toBe('error')
  })

  test('line_2 / segment_3 spellings are recognised too', () => {
    const r = checkTranslations({
      source: { banner: { line_1: 'Welcome to', line_2: 'the dashboard' } },
      target: { banner: { line_1: '', line_2: 'ダッシュボードへようこそ' } },
      targetLang: 'ja',
      format: 'brace',
    })
    expect(byType(r, 'empty-value')[0].severity).toBe('info')
  })
})

describe('FP#13 — pipes are plural separators only where the format says so', () => {
  // ifme meetings.reminder_mailer.subject is 'if-me.org | Your meeting "%{meeting_name}"
  // is tomorrow at %{time}!'. id and vi dropped the brand prefix, which the pipe rule
  // read as a collapsed plural. Rails pluralizes with one:/other: keys; `|` is literal.
  const railsSource = {
    meetings: { reminder_mailer: { subject: 'if-me.org | Your meeting "%{meeting_name}" is tomorrow at %{time}!' } },
  }

  test('rails prose containing a literal pipe is not a plural', () => {
    const r = checkTranslations({
      source: railsSource,
      target: { meetings: { reminder_mailer: { subject: 'Rapat Anda "%{meeting_name}" dilaksanakan besok pada %{time}!' } } },
      targetLang: 'id',
      format: 'rails',
    })
    expect(byType(r, 'plural-forms')).toHaveLength(0)
  })

  test('neither is gettext, android or apple', () => {
    for (const format of ['gettext', 'android', 'apple']) {
      const r = checkTranslations({
        source: { k: 'Wallet | %{amount} available' },
        target: { k: 'Peněženka %{amount}' },
        targetLang: 'cs',
        format,
      })
      expect(byType(r, 'plural-forms')).toHaveLength(0)
    }
  })

  test('vue-i18n still reports a collapsed pipe plural', () => {
    const r = checkTranslations({
      source: { n: '{count} item | {count} items' },
      target: { n: '{count} položek' },
      targetLang: 'cs',
      format: 'vue',
    })
    expect(byType(r, 'plural-forms')).toHaveLength(1)
    expect(byType(r, 'plural-forms')[0].message).toMatch(/2 plural forms/)
  })
})

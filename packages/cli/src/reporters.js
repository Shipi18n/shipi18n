/**
 * Output formats for `shipi18n check`.
 *
 * Lifted into @shipi18n/core in 2.6.0 so the GitHub Action can run `check`
 * without the CLI. Re-exported here because the CLI's tests, docs and any
 * external importers are written against these names.
 */
export { humanReport, jsonReport, sarifReport, junitReport, REPORTERS, RULE_META } from '@shipi18n/core'

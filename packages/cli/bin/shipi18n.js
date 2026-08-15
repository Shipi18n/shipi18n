#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { translateCommand } from '../src/commands/translate.js'
import { checkCommand } from '../src/commands/check.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))

const program = new Command()
program
  .name('shipi18n')
  .description('🌍 Open-source i18n translation — bring your own LLM key')
  .version(pkg.version, '-v, --version')
  .addHelpText(
    'after',
    `
${chalk.cyan('Examples:')}
  $ export ANTHROPIC_API_KEY=sk-ant-...
  $ shipi18n translate en.json --target es,fr,de
  $ shipi18n translate en.json -p openai --target ja --incremental
  $ shipi18n check ./locales --source en --min-coverage 95

${chalk.cyan('Bring your own LLM:')}
  Set ${chalk.yellow('ANTHROPIC_API_KEY')} (default) or use ${chalk.yellow('-p openai')} with ${chalk.yellow('OPENAI_API_KEY')}.
  No Shipi18n account or hosted API — your keys, your models. Apache-2.0.

${chalk.gray('https://github.com/Shipi18n/shipi18n')}
`
  )

translateCommand(program)
checkCommand(program)
program.parse(process.argv)
if (!process.argv.slice(2).length) program.outputHelp()

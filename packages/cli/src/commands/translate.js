import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { translateJSON } from '@shipi18n/core'

const PROVIDER_ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }

export function translateCommand(program) {
  program
    .command('translate <input>')
    .description('Translate a JSON locale file to other languages using your own LLM')
    .option('-t, --target <languages>', 'Target languages (comma-separated)', 'es,fr')
    .option('-s, --source <language>', 'Source language', 'en')
    .option('-o, --output <dir>', 'Output directory', './locales')
    .option('-p, --provider <name>', 'LLM provider: anthropic | openai', 'anthropic')
    .option('--api-key <key>', 'LLM API key (else read from provider env var)')
    .option('--model <model>', 'Override the provider default model')
    .option('-i, --incremental', 'Only translate new/missing keys (reuse existing output files)')
    .action(async (input, options) => {
      const provider = options.provider
      if (!PROVIDER_ENV[provider]) {
        console.error(chalk.red(`Unknown provider '${provider}'. Use 'anthropic' or 'openai'.`))
        process.exit(1)
      }
      const apiKey = options.apiKey || process.env[PROVIDER_ENV[provider]]
      if (!apiKey) {
        console.error(chalk.red(`No API key. Set ${chalk.yellow(PROVIDER_ENV[provider])} or pass --api-key.`))
        console.error(chalk.gray(`This tool uses YOUR own ${provider} key — no account or Shipi18n key needed.`))
        process.exit(1)
      }
      if (!existsSync(input)) {
        console.error(chalk.red(`Input file not found: ${input}`))
        process.exit(1)
      }
      let content
      try {
        content = JSON.parse(readFileSync(input, 'utf8'))
      } catch (e) {
        console.error(chalk.red(`Invalid JSON in ${input}: ${e.message}`))
        process.exit(1)
      }

      const targets = options.target.split(',').map((s) => s.trim()).filter(Boolean)
      mkdirSync(options.output, { recursive: true })
      console.log(chalk.cyan(`\n🌍 Translating ${input} (${options.source} → ${targets.join(', ')}) via ${provider}\n`))

      let hadWarnings = false
      for (const to of targets) {
        const spinner = ora(`Translating to ${to}...`).start()
        const outPath = join(options.output, `${to}.json`)
        const existing =
          options.incremental && existsSync(outPath)
            ? JSON.parse(readFileSync(outPath, 'utf8'))
            : undefined
        try {
          const { result, stats } = await translateJSON({
            content,
            from: options.source,
            to,
            provider,
            apiKey,
            model: options.model,
            existing,
          })
          writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8')
          const warn = stats.placeholderWarnings.length
          if (warn) hadWarnings = true
          spinner.succeed(
            `${to} → ${chalk.green(outPath)} ` +
              chalk.gray(`(${stats.translated} translated, ${stats.reused} reused` +
                (warn ? chalk.yellow(`, ${warn} placeholder warnings`) : '') + ')')
          )
          for (const w of stats.placeholderWarnings) {
            console.log(chalk.yellow(`   ⚠ ${w.path}: placeholder drift — missing ${JSON.stringify(w.missing)}`))
          }
        } catch (e) {
          spinner.fail(`${to}: ${e.message}`)
          process.exitCode = 1
        }
      }
      console.log(
        hadWarnings
          ? chalk.yellow('\nDone, with placeholder warnings — review the flagged keys.')
          : chalk.green('\n✓ Done.')
      )
    })
}

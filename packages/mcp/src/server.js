#!/usr/bin/env node
/**
 * @shipi18n/mcp — Model Context Protocol server for i18n translation.
 *
 * Exposes translate_json, translate_file, list_languages, and check_placeholders to any MCP client
 * (Claude Desktop, Cursor, …). Bring your own LLM: set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run
 * with no key and it uses the client's own model via MCP sampling.
 *
 * Usage (Claude Desktop config):
 *   { "mcpServers": { "shipi18n": { "command": "npx", "args": ["-y", "@shipi18n/mcp"],
 *     "env": { "ANTHROPIC_API_KEY": "sk-ant-..." } } } }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allTools } from './tools.js'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
)

export function createServer(env = process.env) {
  const server = new McpServer({ name: 'shipi18n', version: pkg.version })
  // `server.server` is the low-level Server used for sampling (createMessage).
  for (const tool of allTools(server.server, env)) {
    server.registerTool(tool.name, tool.config, tool.handler)
  }
  return server
}

async function main() {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Log to stderr — stdout is the MCP transport and must stay clean.
  console.error(`🌍 shipi18n-mcp v${pkg.version} ready (stdio). Tools: translate_json, translate_file, list_languages, check_placeholders`)
}

/**
 * True when this file is the process entrypoint, false when it is imported (e.g. by tests).
 *
 * Both sides must be realpath'd: npm installs the `bin` as a SYMLINK
 * (`node_modules/.bin/shipi18n-mcp` → `../@shipi18n/mcp/src/server.js`), so when a client runs
 * `npx @shipi18n/mcp`, `process.argv[1]` is the symlink while `import.meta.url` is the real file.
 * Comparing them unresolved never matches, and the server silently exits without serving.
 */
export function isDirectRun(argv1 = process.argv[1], moduleUrl = import.meta.url) {
  if (!argv1) return false
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error('shipi18n-mcp fatal:', err)
    process.exit(1)
  })
}

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
import { readFileSync } from 'node:fs'
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

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('shipi18n-mcp fatal:', err)
    process.exit(1)
  })
}

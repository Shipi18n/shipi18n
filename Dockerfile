# Dockerfile for the Shipi18n MCP server — used by Glama's release build
# (and works standalone). Installs the published package rather than building
# the monorepo: it's what users actually run via `npx -y @shipi18n/mcp`, and
# the validator tools need no API key at all.
#
#   docker build -t shipi18n-mcp .
#   docker run -i --rm shipi18n-mcp          # stdio MCP server
#
# Optional env for the translate tools only (validators never use them):
#   -e ANTHROPIC_API_KEY=...   or   -e OPENAI_API_KEY=...
FROM node:22-alpine

RUN npm install -g @shipi18n/mcp@2.1.0 \
  && npm cache clean --force

# stdio transport — the MCP client speaks over stdin/stdout.
# CMD (not ENTRYPOINT) so platforms that supply their own command — Glama's
# build spec requires at least one command argument — override cleanly.
CMD ["shipi18n-mcp"]

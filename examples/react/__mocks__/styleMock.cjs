// Jest cannot parse CSS. Vite handles real style imports at build time; in tests
// they only need to resolve to something harmless.
module.exports = {}

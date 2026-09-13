import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import shipi18n from 'vite-plugin-shipi18n'

// Only run translation when a key is actually present. Generated locale files
// are committed, so a keyless build — CI, a contributor's laptop — reuses them.
//
// Note: the plugin requires a non-empty targetLanguages, so gate the PLUGIN,
// not the list. Passing an empty array throws.
const translate = process.env.ANTHROPIC_API_KEY
  ? [
      shipi18n({
        provider: 'anthropic',
        targetLanguages: ['es', 'fr', 'de'],
        sourceDir: 'src/locales/en',
        outputDir: 'src/locales',
        // apiKey defaults to ANTHROPIC_API_KEY / OPENAI_API_KEY
      }),
    ]
  : []

export default defineConfig({
  plugins: [vue(), ...translate],
  server: { port: 3000 },
})

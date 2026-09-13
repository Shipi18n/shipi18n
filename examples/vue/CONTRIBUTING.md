# Contributing to Shipi18n Vue Example

Thank you for your interest in contributing to the Shipi18n Vue Example! This document provides guidelines and instructions for contributing.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, Node version, browser, Vue version)
- Screenshots if applicable

### Suggesting Enhancements

We welcome suggestions for new examples or improvements! Please create an issue with:

- A clear description of the enhancement
- Why this would be useful
- Example use cases
- Any implementation ideas

### Pull Requests

1. **Fork the repository** and create your branch from `main`

```bash
git checkout -b feature/my-new-example
```

2. **Make your changes**

   - Follow the existing code style
   - Add comments where necessary
   - Update documentation if needed

3. **Test your changes**

```bash
npm install
npm run dev
npm run build
```

4. **Commit your changes**

Use clear, descriptive commit messages:

```bash
git commit -m "Add example for file upload translation"
```

5. **Push to your fork**

```bash
git push origin feature/my-new-example
```

6. **Open a Pull Request**

   - Describe what your PR does
   - Reference any related issues
   - Include screenshots for UI changes

## Code Style Guidelines

### Vue 3 / JavaScript

- Use Composition API with `<script setup>`
- Use clear, descriptive variable names
- Add JSDoc comments for functions
- Keep components focused and single-purpose
- Handle errors gracefully

**Example:**

```vue
<script setup>
import { ref } from 'vue'
import { translate } from '@/lib/shipi18n'

/**
 * Translate text to multiple languages
 * @param {string} text - Text to translate
 * @param {string[]} languages - Target languages
 */
const translateText = async (text, languages) => {
  try {
    loading.value = true
    const result = await translate({ text, targetLanguages: languages })
    translations.value = result
  } catch (error) {
    console.error('Translation failed:', error)
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}
</script>
```

### CSS

- Use clear class names
- Keep styles scoped to components
- Use CSS variables for colors and common values
- Mobile-first responsive design

### File Organization

```
src/
├── lib/          # API clients and utilities
├── components/   # Vue components
├── App.vue       # Main app component
└── main.js       # Entry point
```

## Adding New Examples

To add a new example component:

1. **Create the component** in `src/components/YourExample.vue`
2. **Import it** in `src/App.vue`
3. **Add a tab** for it in the tabs array
4. **Update README.md** with a description
5. **Test thoroughly**

Example component template:

```vue
<script setup>
import { ref } from 'vue'
import { translate } from '@/lib/shipi18n'

const result = ref(null)
const loading = ref(false)
const error = ref(null)

const handleAction = async () => {
  loading.value = true
  error.value = null

  try {
    const data = await translate({ /* ... */ })
    result.value = data
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="example-card">
    <h2>Your Example Title</h2>
    <p class="description">Description of what this example demonstrates.</p>

    <!-- Your UI here -->

    <button @click="handleAction" :disabled="loading">
      {{ loading ? 'Loading...' : 'Action' }}
    </button>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="result" class="result">
      <!-- Display result -->
    </div>
  </div>
</template>

<style scoped>
/* Component styles */
</style>
```

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- A Shipi18n API key (for testing)

### Local Development

1. Clone your fork

```bash
git clone https://github.com/YOUR_USERNAME/shipi18n-vue-example.git
cd shipi18n-vue-example
```

2. Install dependencies

```bash
npm install
```

3. Create `.env` file

```bash
cp .env.example .env
# Add your API key to .env
```

4. Start development server

```bash
npm run dev
```

## Testing

Before submitting a PR:

1. Test all examples work correctly
2. Check responsive design on mobile
3. Verify error handling works
4. Test with and without API key
5. Check console for errors/warnings
6. Run production build

```bash
npm run build
npm run preview
```

## Documentation

If you add new features:

- Update README.md
- Add JSDoc comments to functions
- Include usage examples
- Document any new environment variables

## Questions?

- Open an issue for questions
- Check existing issues and PRs
- Read the [Vue 3 documentation](https://vuejs.org/guide/introduction.html)
- Read the [Shipi18n documentation](https://shipi18n.com/docs)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Keep discussions focused and professional

## License

By contributing, you agree that your contributions will be licensed under the Apache License, Version 2.0.

---

Thank you for contributing to Shipi18n Vue Example! 🎉

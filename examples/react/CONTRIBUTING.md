# Contributing to Shipi18n React Example

Thank you for your interest in contributing to the Shipi18n React Example! This document provides guidelines and instructions for contributing.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, Node version, browser)
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

### JavaScript/React

- Use functional components with hooks
- Use clear, descriptive variable names
- Add JSDoc comments for functions
- Keep components focused and single-purpose
- Handle errors gracefully

**Example:**

```javascript
/**
 * Translate text to multiple languages
 * @param {string} text - Text to translate
 * @param {string[]} languages - Target languages
 * @returns {Promise<Object>} Translation results
 */
async function translateText(text, languages) {
  try {
    const result = await translate({ text, targetLanguages: languages })
    return result
  } catch (error) {
    console.error('Translation failed:', error)
    throw error
  }
}
```

### CSS

- Use clear class names
- Keep styles organized by component
- Use CSS variables for colors and common values
- Mobile-first responsive design

### File Organization

```
src/
├── lib/          # API clients and utilities
├── components/   # React components
├── App.jsx       # Main app component
└── main.jsx      # Entry point
```

## Adding New Examples

To add a new example component:

1. **Create the component** in `src/components/YourExample.jsx`
2. **Import it** in `src/App.jsx`
3. **Add a tab** for it in the tabs array
4. **Update README.md** with a description
5. **Test thoroughly**

Example template:

```javascript
import { useState } from 'react'
import { translate } from '../lib/shipi18n'

export default function YourExample() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleAction = async () => {
    setLoading(true)
    setError(null)

    try {
      // Your logic here
      const data = await translate({ /* ... */ })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="example-card">
      <h2>Your Example Title</h2>
      <p className="description">Description of what this example demonstrates.</p>

      {/* Your UI here */}

      <button onClick={handleAction} disabled={loading}>
        {loading ? 'Loading...' : 'Action'}
      </button>

      {error && <div className="error">{error}</div>}
      {result && <div className="result">{/* Display result */}</div>}
    </div>
  )
}
```

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- A Shipi18n API key (for testing)

### Local Development

1. Clone your fork

```bash
git clone https://github.com/YOUR_USERNAME/shipi18n-react-example.git
cd shipi18n-react-example
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

## Documentation

If you add new features:

- Update README.md
- Add JSDoc comments to functions
- Include usage examples
- Document any new environment variables

## Questions?

- Open an issue for questions
- Check existing issues and PRs
- Read the [Shipi18n documentation](https://shipi18n.com/docs)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Keep discussions focused and professional

## License

By contributing, you agree that your contributions will be licensed under the Apache License, Version 2.0.

---

Thank you for contributing to Shipi18n! 🎉

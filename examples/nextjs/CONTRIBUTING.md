# Contributing to Shipi18n Next.js Example

Thank you for your interest in contributing to the Shipi18n Next.js Example! This document provides guidelines and instructions for contributing.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, Node version, browser, Next.js version)
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
git commit -m "Add example for SSG translation"
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

### Next.js 14 / React

- Use App Router (not Pages Router)
- Use Server Components by default
- Add `'use client'` only when needed
- Use clear, descriptive variable names
- Add JSDoc comments for functions
- Keep components focused and single-purpose
- Handle errors gracefully

**Example Server Component:**

```jsx
// No 'use client' - this is a Server Component
import { translate } from '@/lib/shipi18n'

export default async function Page() {
  const translations = await translate({
    text: 'Welcome',
    targetLanguages: ['es', 'fr'],
  })

  return (
    <div>
      <p>Spanish: {translations.es[0].translated}</p>
      <p>French: {translations.fr[0].translated}</p>
    </div>
  )
}
```

**Example Client Component:**

```jsx
'use client'
import { useState } from 'react'
import { translate } from '@/lib/shipi18n'

export default function MyComponent() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleTranslate = async () => {
    setLoading(true)
    try {
      const data = await translate({ /* ... */ })
      setResult(data)
    } catch (error) {
      console.error('Translation failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleTranslate} disabled={loading}>
      {loading ? 'Loading...' : 'Translate'}
    </button>
  )
}
```

### CSS

- Use Tailwind CSS utility classes
- Keep styles consistent with existing examples
- Mobile-first responsive design
- Use CSS variables from globals.css

### File Organization

```
src/
├── app/
│   ├── api/
│   │   └── translate/
│   │       └── route.js      # API route proxy
│   ├── examples/
│   │   └── your-example/
│   │       └── page.js       # Your example page
│   ├── layout.js
│   ├── page.js
│   └── globals.css
└── lib/
    └── shipi18n.js           # API client
```

## Adding New Examples

To add a new example:

1. **Create example directory** in `src/app/examples/your-example/`
2. **Create page.js** with your example code
3. **Add link** in `src/app/page.js`
4. **Update README.md** with description
5. **Test thoroughly**

Example page template:

```jsx
export const metadata = {
  title: 'Your Example - Shipi18n Next.js',
  description: 'Description of your example',
}

export default function YourExamplePage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">Your Example</h1>
      <p className="mb-8">Description of what this demonstrates.</p>

      {/* Your example code */}
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
git clone https://github.com/YOUR_USERNAME/shipi18n-nextjs-example.git
cd shipi18n-nextjs-example
```

2. Install dependencies

```bash
npm install
```

3. Create `.env.local` file

```bash
cp .env.example .env.local
# Add your API key to .env.local
```

4. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Testing

Before submitting a PR:

1. Test all examples work correctly
2. Check responsive design on mobile
3. Verify error handling works
4. Test both client and server components
5. Run production build

```bash
npm run build
npm start
```

6. Check console for errors/warnings
7. Verify API key security (not exposed to browser)

## Documentation

If you add new features:

- Update README.md with usage examples
- Add JSDoc comments to functions
- Include code snippets
- Document any new environment variables

## Next.js Best Practices

- Use Server Components for data fetching when possible
- Use Client Components only when needed (interactivity, hooks)
- Keep API keys server-side (never use `NEXT_PUBLIC_` for secrets)
- Use API routes as a proxy for sensitive operations
- Implement proper error boundaries
- Optimize images with `next/image`

## Questions?

- Open an issue for questions
- Check existing issues and PRs
- Read the [Next.js documentation](https://nextjs.org/docs)
- Read the [Shipi18n documentation](https://shipi18n.com/docs)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Keep discussions focused and professional

## License

By contributing, you agree that your contributions will be licensed under the Apache License, Version 2.0.

---

Thank you for contributing to Shipi18n Next.js Example! 🎉

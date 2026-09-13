# Contributing to Shipi18n Node.js Example

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/shipi18n-nodejs-example.git
   cd shipi18n-nodejs-example
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

### Running Examples

```bash
# Set up your API key
cp .env.example .env
# Edit .env with your API key

# Run the main example
npm start

# Run specific examples
npm run translate:json
npm run translate:text
npm run translate:file
npm run translate:i18next
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Code Style

- Use ES modules (`import`/`export`)
- Use `async`/`await` for asynchronous code
- Add JSDoc comments for public functions
- Keep examples simple and educational

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add a clear description of your changes
4. Reference any related issues

## Reporting Issues

When reporting issues, please include:

- Node.js version (`node --version`)
- npm version (`npm --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn

## License

By contributing, you agree that your contributions will be licensed under the Apache License, Version 2.0.

## Questions?

- Open an issue for questions
- Visit [shipi18n.com](https://shipi18n.com) for API documentation

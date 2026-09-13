export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/**/*.d.ts',
    '!**/node_modules/**',
  ],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  // Style imports are a build-time concern; stub them so jest can parse components.
  moduleNameMapper: {
    '\\.(css|sass|scss|less)$': '<rootDir>/__mocks__/styleMock.cjs',
  },
  moduleFileExtensions: ['js', 'jsx'],
};

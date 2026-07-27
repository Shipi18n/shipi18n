/**
 * Integration tests for the buildStart hook (v2 — BYO-LLM via @shipi18n/core).
 * Translation runs through a deterministic mock provider adapter — no network, no key.
 */

import { jest } from '@jest/globals';
import shipi18nPlugin from '../index.js';
import { makeMockProvider, makeThrowingProvider } from './mockProvider.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DICT = {
  Hello: { Spanish: 'Hola', French: 'Bonjour', Portuguese: 'Olá' },
  Click: { Spanish: 'Clic', French: 'Cliquer' },
};

// Suppress console output during tests
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});
afterAll(() => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

describe('buildStart hook', () => {
  let tempDir;
  let sourceDir;
  let outputDir;
  let cacheDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipi18n-test-'));
    sourceDir = path.join(tempDir, 'locales', 'en');
    outputDir = path.join(tempDir, 'locales');
    cacheDir = path.join(tempDir, '.cache');
    fs.mkdirSync(sourceDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  const createPlugin = (options = {}) => {
    const plugin = shipi18nPlugin({
      provider: makeMockProvider(DICT),
      targetLanguages: ['es', 'fr'],
      sourceDir: path.relative(tempDir, sourceDir),
      outputDir: path.relative(tempDir, outputDir),
      cacheDir: path.relative(tempDir, cacheDir),
      ...options,
    });
    plugin.configResolved({ root: tempDir });
    return plugin;
  };

  test('exits early when source directory does not exist', async () => {
    fs.rmSync(sourceDir, { recursive: true });
    const plugin = createPlugin();
    await plugin.buildStart();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Source directory not found'));
  });

  test('exits early when no JSON files found', async () => {
    fs.writeFileSync(path.join(sourceDir, 'README.md'), 'readme');
    const plugin = createPlugin();
    await plugin.buildStart();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No JSON files found'));
  });

  test('translates files through core and writes output', async () => {
    fs.writeFileSync(path.join(sourceDir, 'translation.json'), JSON.stringify({ greeting: 'Hello' }));

    const plugin = createPlugin({ cache: false });
    await plugin.buildStart();

    const esOutput = path.join(outputDir, 'es', 'translation.json');
    const frOutput = path.join(outputDir, 'fr', 'translation.json');
    expect(fs.existsSync(esOutput)).toBe(true);
    expect(fs.existsSync(frOutput)).toBe(true);

    expect(JSON.parse(fs.readFileSync(esOutput, 'utf-8')).greeting).toBe('Hola');
    expect(JSON.parse(fs.readFileSync(frOutput, 'utf-8')).greeting).toBe('Bonjour');
  });

  test('preserves placeholders through translation', async () => {
    fs.writeFileSync(
      path.join(sourceDir, 'translation.json'),
      JSON.stringify({ items: 'You have {{count}} items' })
    );

    // 'You have {{count}} items' is not in DICT → mock echoes it back, placeholder intact
    const plugin = createPlugin({ cache: false, targetLanguages: ['es'] });
    await plugin.buildStart();

    const es = JSON.parse(fs.readFileSync(path.join(outputDir, 'es', 'translation.json'), 'utf-8'));
    expect(es.items).toContain('{{count}}');
  });

  test('creates cache file when caching enabled', async () => {
    fs.writeFileSync(path.join(sourceDir, 'translation.json'), JSON.stringify({ greeting: 'Hello' }));

    const plugin = createPlugin({ cache: true });
    await plugin.buildStart();

    expect(fs.existsSync(cacheDir)).toBe(true);
    const cacheFiles = fs.readdirSync(cacheDir);
    expect(cacheFiles.length).toBeGreaterThan(0);
    expect(cacheFiles[0]).toContain('translation.json');
  });

  test('uses cached translations on second run', async () => {
    fs.writeFileSync(path.join(sourceDir, 'translation.json'), JSON.stringify({ greeting: 'Hello' }));

    const plugin = createPlugin({ cache: true });
    await plugin.buildStart();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Translating to'));

    console.log.mockClear();

    await plugin.buildStart();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Using cached translations'));
  });

  test('handles JSON parse error in source file', async () => {
    fs.writeFileSync(path.join(sourceDir, 'invalid.json'), '{ invalid json }');
    const plugin = createPlugin();
    await plugin.buildStart();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error parsing'));
  });

  test('handles translation error with fallback to source', async () => {
    fs.writeFileSync(path.join(sourceDir, 'translation.json'), JSON.stringify({ greeting: 'Hello' }));

    const plugin = createPlugin({
      cache: false,
      provider: makeThrowingProvider('LLM down'),
      fallback: { fallbackToSource: true },
    });
    await plugin.buildStart();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Translation failed'));

    const esOutput = path.join(outputDir, 'es', 'translation.json');
    expect(fs.existsSync(esOutput)).toBe(true);
    expect(JSON.parse(fs.readFileSync(esOutput, 'utf-8')).greeting).toBe('Hello'); // source fallback
  });

  test('skips writing on translation error when fallback disabled', async () => {
    fs.writeFileSync(path.join(sourceDir, 'translation.json'), JSON.stringify({ greeting: 'Hello' }));

    const plugin = createPlugin({
      cache: false,
      provider: makeThrowingProvider('LLM down'),
      fallback: { fallbackToSource: false },
    });
    await plugin.buildStart();

    expect(fs.existsSync(path.join(outputDir, 'es', 'translation.json'))).toBe(false);
  });

  test('processes multiple JSON files', async () => {
    fs.writeFileSync(path.join(sourceDir, 'translation.json'), JSON.stringify({ greeting: 'Hello' }));
    fs.writeFileSync(path.join(sourceDir, 'common.json'), JSON.stringify({ button: 'Click' }));

    const plugin = createPlugin({ cache: false });
    await plugin.buildStart();

    expect(fs.existsSync(path.join(outputDir, 'es', 'translation.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'es', 'common.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'fr', 'translation.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'fr', 'common.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'es', 'common.json'), 'utf-8')).button).toBe('Clic');
  });

  test('handles corrupted cache file by re-translating', async () => {
    const sourceContent = JSON.stringify({ greeting: 'Hello' });
    fs.writeFileSync(path.join(sourceDir, 'translation.json'), sourceContent);

    fs.mkdirSync(cacheDir, { recursive: true });
    const crypto = await import('crypto');
    const hash = crypto.createHash('md5').update(sourceContent + ['es', 'fr'].join(',')).digest('hex');
    fs.writeFileSync(path.join(cacheDir, `translation.json.${hash}.json`), '{ corrupted }');

    const plugin = createPlugin({ cache: true });
    await plugin.buildStart();

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Cache corrupted'));
    // still produces valid output after re-translating
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'es', 'translation.json'), 'utf-8')).greeting).toBe('Hola');
  });
});

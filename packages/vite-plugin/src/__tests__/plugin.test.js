/**
 * Tests for vite-plugin-shipi18n (v2 — BYO-LLM via @shipi18n/core).
 */

import shipi18nPlugin from '../index.js';
import crypto from 'crypto';
import path from 'path';

describe('Plugin Configuration', () => {
  describe('Required options', () => {
    test('throws error when targetLanguages is missing', () => {
      expect(() => {
        shipi18nPlugin({});
      }).toThrow('targetLanguages is required');
    });

    test('throws error when targetLanguages is empty', () => {
      expect(() => {
        shipi18nPlugin({ targetLanguages: [] });
      }).toThrow('targetLanguages is required');
    });

    test('does NOT require a Shipi18n apiKey (BYO-LLM)', () => {
      expect(() => {
        shipi18nPlugin({ targetLanguages: ['es'] });
      }).not.toThrow();
    });

    test('accepts valid configuration', () => {
      const plugin = shipi18nPlugin({
        targetLanguages: ['es', 'fr'],
        provider: 'anthropic',
      });

      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('vite-plugin-shipi18n');
    });
  });

  describe('Plugin structure', () => {
    test('plugin has correct name', () => {
      const plugin = shipi18nPlugin({ targetLanguages: ['es'] });
      expect(plugin.name).toBe('vite-plugin-shipi18n');
    });

    test('plugin has configResolved hook', () => {
      const plugin = shipi18nPlugin({ targetLanguages: ['es'] });
      expect(typeof plugin.configResolved).toBe('function');
    });

    test('plugin has buildStart hook', () => {
      const plugin = shipi18nPlugin({ targetLanguages: ['es'] });
      expect(typeof plugin.buildStart).toBe('function');
    });
  });

  describe('configResolved hook', () => {
    test('stores vite config without throwing', () => {
      const plugin = shipi18nPlugin({ targetLanguages: ['es'] });
      expect(() => plugin.configResolved({ root: '/test/project' })).not.toThrow();
    });
  });
});

describe('Cache Hash Generation', () => {
  test('generates consistent hash for same content', () => {
    const content = '{"greeting": "Hello"}';
    const targetLangs = ['es', 'fr'];

    const hash1 = crypto.createHash('md5').update(content + targetLangs.join(',')).digest('hex');
    const hash2 = crypto.createHash('md5').update(content + targetLangs.join(',')).digest('hex');

    expect(hash1).toBe(hash2);
  });

  test('generates different hash for different content', () => {
    const targetLangs = ['es', 'fr'];
    const hash1 = crypto.createHash('md5').update('{"greeting": "Hello"}' + targetLangs.join(',')).digest('hex');
    const hash2 = crypto.createHash('md5').update('{"greeting": "Hi"}' + targetLangs.join(',')).digest('hex');
    expect(hash1).not.toBe(hash2);
  });

  test('generates different hash for different target languages', () => {
    const content = '{"greeting": "Hello"}';
    const hash1 = crypto.createHash('md5').update(content + ['es', 'fr'].join(',')).digest('hex');
    const hash2 = crypto.createHash('md5').update(content + ['es', 'de'].join(',')).digest('hex');
    expect(hash1).not.toBe(hash2);
  });

  test('hash is 32 character hex string', () => {
    const hash = crypto.createHash('md5').update('{"greeting": "Hello"}' + ['es'].join(',')).digest('hex');
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('File Path Construction', () => {
  test('constructs cache file path correctly', () => {
    const cacheFile = path.join('node_modules/.cache/vite-plugin-shipi18n', `translation.json.abc123.json`);
    expect(cacheFile).toContain('translation.json.abc123.json');
  });

  test('constructs output file path correctly', () => {
    const outputFile = path.join('public/locales', 'es', 'translation.json');
    expect(outputFile).toContain('es');
    expect(outputFile).toContain('translation.json');
  });

  test('filters JSON files correctly', () => {
    const files = ['translation.json', 'common.json', 'README.md', 'config.yml'];
    const jsonFiles = files.filter((file) => file.endsWith('.json'));
    expect(jsonFiles).toEqual(['translation.json', 'common.json']);
  });
});

describe('Language Code Handling', () => {
  test('accepts standard language codes', () => {
    ['es', 'fr', 'de', 'ja', 'zh'].forEach((lang) => expect(lang).toMatch(/^[a-z]{2}$/));
  });

  test('accepts regional language codes', () => {
    ['zh-CN', 'zh-TW', 'pt-BR', 'en-US'].forEach((lang) => expect(lang).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/));
  });
});

describe('Integration Scenarios', () => {
  test('full configuration creates valid plugin', () => {
    const plugin = shipi18nPlugin({
      provider: 'openai',
      apiKey: 'sk-llm-key',
      targetLanguages: ['es', 'fr', 'de', 'ja'],
      sourceDir: 'src/locales/en',
      outputDir: 'src/locales',
      sourceLanguage: 'en',
      cache: true,
      cacheDir: '.cache/translations',
    });

    expect(plugin.name).toBe('vite-plugin-shipi18n');
    expect(typeof plugin.configResolved).toBe('function');
    expect(typeof plugin.buildStart).toBe('function');
  });

  test('minimal configuration creates valid plugin', () => {
    const plugin = shipi18nPlugin({ targetLanguages: ['es'] });
    expect(plugin.name).toBe('vite-plugin-shipi18n');
  });

  test('custom provider adapter is accepted', () => {
    const plugin = shipi18nPlugin({
      provider: { name: 'custom', complete: async () => '[]' },
      targetLanguages: ['es', 'fr'],
    });
    expect(plugin).toBeDefined();
  });
});

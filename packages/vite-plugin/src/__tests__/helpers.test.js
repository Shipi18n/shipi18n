/**
 * Tests for exported helper functions
 */

import {
  findMissingKeys,
  getNestedValue,
  setNestedValue,
  processRegionalLanguages,
  applyFallbacks,
} from '../index.js';

describe('findMissingKeys', () => {
  test('finds missing top-level keys', () => {
    const source = { greeting: 'Hello', farewell: 'Goodbye' };
    const translation = { greeting: 'Hola' };

    const missing = findMissingKeys(source, translation);

    expect(missing).toEqual(['farewell']);
  });

  test('finds missing nested keys', () => {
    const source = {
      app: {
        title: 'My App',
        buttons: {
          submit: 'Submit',
          cancel: 'Cancel',
        },
      },
    };
    const translation = {
      app: {
        title: 'Mi App',
        buttons: {
          submit: 'Enviar',
        },
      },
    };

    const missing = findMissingKeys(source, translation);

    expect(missing).toEqual(['app.buttons.cancel']);
  });

  test('finds multiple missing keys at different levels', () => {
    const source = {
      title: 'Title',
      nested: {
        key1: 'Value 1',
        key2: 'Value 2',
      },
    };
    const translation = {
      nested: {
        key1: 'Valor 1',
      },
    };

    const missing = findMissingKeys(source, translation);

    expect(missing).toContain('title');
    expect(missing).toContain('nested.key2');
  });

  test('treats empty string as missing', () => {
    const source = { greeting: 'Hello' };
    const translation = { greeting: '' };

    const missing = findMissingKeys(source, translation);

    expect(missing).toEqual(['greeting']);
  });

  test('treats null as missing', () => {
    const source = { greeting: 'Hello' };
    const translation = { greeting: null };

    const missing = findMissingKeys(source, translation);

    expect(missing).toEqual(['greeting']);
  });

  test('returns empty array when all keys present', () => {
    const source = { greeting: 'Hello', farewell: 'Goodbye' };
    const translation = { greeting: 'Hola', farewell: 'Adiós' };

    const missing = findMissingKeys(source, translation);

    expect(missing).toEqual([]);
  });

  test('handles deeply nested objects', () => {
    const source = {
      level1: {
        level2: {
          level3: {
            key: 'value',
          },
        },
      },
    };
    const translation = {
      level1: {
        level2: {
          level3: {},
        },
      },
    };

    const missing = findMissingKeys(source, translation);

    expect(missing).toEqual(['level1.level2.level3.key']);
  });
});

describe('getNestedValue', () => {
  test('gets top-level value', () => {
    const obj = { greeting: 'Hello' };

    expect(getNestedValue(obj, 'greeting')).toBe('Hello');
  });

  test('gets nested value', () => {
    const obj = {
      app: {
        buttons: {
          submit: 'Submit',
        },
      },
    };

    expect(getNestedValue(obj, 'app.buttons.submit')).toBe('Submit');
  });

  test('returns undefined for missing path', () => {
    const obj = { greeting: 'Hello' };

    expect(getNestedValue(obj, 'farewell')).toBeUndefined();
  });

  test('returns undefined for partial path', () => {
    const obj = { app: { title: 'Title' } };

    expect(getNestedValue(obj, 'app.buttons.submit')).toBeUndefined();
  });

  test('handles objects with various value types', () => {
    const obj = {
      string: 'text',
      number: 42,
      boolean: true,
      array: [1, 2, 3],
      nested: { key: 'value' },
    };

    expect(getNestedValue(obj, 'string')).toBe('text');
    expect(getNestedValue(obj, 'number')).toBe(42);
    expect(getNestedValue(obj, 'boolean')).toBe(true);
    expect(getNestedValue(obj, 'array')).toEqual([1, 2, 3]);
    expect(getNestedValue(obj, 'nested.key')).toBe('value');
  });
});

describe('setNestedValue', () => {
  test('sets top-level value', () => {
    const obj = {};
    setNestedValue(obj, 'greeting', 'Hello');

    expect(obj.greeting).toBe('Hello');
  });

  test('sets nested value', () => {
    const obj = {};
    setNestedValue(obj, 'app.buttons.submit', 'Submit');

    expect(obj.app.buttons.submit).toBe('Submit');
  });

  test('overwrites existing value', () => {
    const obj = { greeting: 'Hi' };
    setNestedValue(obj, 'greeting', 'Hello');

    expect(obj.greeting).toBe('Hello');
  });

  test('creates intermediate objects', () => {
    const obj = {};
    setNestedValue(obj, 'a.b.c.d', 'deep');

    expect(obj.a.b.c.d).toBe('deep');
  });

  test('preserves existing nested structure', () => {
    const obj = {
      app: {
        title: 'My App',
        buttons: {
          submit: 'Submit',
        },
      },
    };
    setNestedValue(obj, 'app.buttons.cancel', 'Cancel');

    expect(obj.app.title).toBe('My App');
    expect(obj.app.buttons.submit).toBe('Submit');
    expect(obj.app.buttons.cancel).toBe('Cancel');
  });
});

describe('processRegionalLanguages', () => {
  test('processes simple language codes', () => {
    const { processedTargets, regionalMap } = processRegionalLanguages(
      ['es', 'fr', 'de'],
      true
    );

    expect(processedTargets).toEqual(['es', 'fr', 'de']);
    expect(regionalMap).toEqual({});
  });

  test('adds base language for regional variants', () => {
    const { processedTargets, regionalMap } = processRegionalLanguages(
      ['pt-BR', 'zh-CN'],
      true
    );

    expect(processedTargets).toContain('pt');
    expect(processedTargets).toContain('pt-BR');
    expect(processedTargets).toContain('zh');
    expect(processedTargets).toContain('zh-CN');
    expect(regionalMap['pt-BR']).toBe('pt');
    expect(regionalMap['zh-CN']).toBe('zh');
  });

  test('does not add base language if already in targets', () => {
    const { processedTargets, regionalMap } = processRegionalLanguages(
      ['pt', 'pt-BR'],
      true
    );

    // Should not have duplicate 'pt'
    const ptCount = processedTargets.filter((l) => l === 'pt').length;
    expect(ptCount).toBe(1);
    expect(regionalMap['pt-BR']).toBe('pt');
  });

  test('skips regional processing when disabled', () => {
    const { processedTargets, regionalMap } = processRegionalLanguages(
      ['pt-BR', 'zh-CN'],
      false
    );

    expect(processedTargets).toEqual(['pt-BR', 'zh-CN']);
    expect(regionalMap).toEqual({});
  });

  test('handles mixed regional and standard codes', () => {
    const { processedTargets, regionalMap } = processRegionalLanguages(
      ['es', 'pt-BR', 'fr', 'zh-TW'],
      true
    );

    expect(processedTargets).toContain('es');
    expect(processedTargets).toContain('fr');
    expect(processedTargets).toContain('pt');
    expect(processedTargets).toContain('pt-BR');
    expect(processedTargets).toContain('zh');
    expect(processedTargets).toContain('zh-TW');
    expect(regionalMap['pt-BR']).toBe('pt');
    expect(regionalMap['zh-TW']).toBe('zh');
  });

  test('handles multiple variants of same base', () => {
    const { processedTargets, regionalMap } = processRegionalLanguages(
      ['zh-CN', 'zh-TW'],
      true
    );

    // Should only add 'zh' once
    const zhCount = processedTargets.filter((l) => l === 'zh').length;
    expect(zhCount).toBe(1);
    expect(regionalMap['zh-CN']).toBe('zh');
    expect(regionalMap['zh-TW']).toBe('zh');
  });
});

describe('applyFallbacks', () => {
  const sourceContent = {
    greeting: 'Hello',
    farewell: 'Goodbye',
  };

  test('uses regional fallback for missing language', () => {
    const result = {
      pt: { greeting: 'Olá', farewell: 'Adeus' },
    };
    const regionalMap = { 'pt-BR': 'pt' };

    const applied = applyFallbacks(
      result,
      sourceContent,
      ['pt-BR'],
      'en',
      true,
      true,
      regionalMap
    );

    expect(applied['pt-BR']).toEqual({ greeting: 'Olá', farewell: 'Adeus' });
    expect(applied.fallbackInfo.used).toBe(true);
    expect(applied.fallbackInfo.regionalFallbacks['pt-BR']).toBe('pt');
  });

  test('falls back to source when translation missing', () => {
    const result = {};

    const applied = applyFallbacks(
      result,
      sourceContent,
      ['es'],
      'en',
      true,
      true,
      {}
    );

    expect(applied.es).toEqual(sourceContent);
    expect(applied.fallbackInfo.used).toBe(true);
    expect(applied.fallbackInfo.languagesFallbackToSource).toContain('es');
  });

  test('fills in missing keys from source', () => {
    const result = {
      es: { greeting: 'Hola' }, // missing farewell
    };

    const applied = applyFallbacks(
      result,
      sourceContent,
      ['es'],
      'en',
      true,
      true,
      {}
    );

    expect(applied.es.greeting).toBe('Hola');
    expect(applied.es.farewell).toBe('Goodbye');
    expect(applied.fallbackInfo.used).toBe(true);
    expect(applied.fallbackInfo.keysFallback.es).toContain('farewell');
  });

  test('prefers regional fallback over source for missing keys', () => {
    const result = {
      pt: { greeting: 'Olá', farewell: 'Adeus' },
      'pt-BR': { greeting: 'Oi' }, // missing farewell
    };
    const regionalMap = { 'pt-BR': 'pt' };

    const applied = applyFallbacks(
      result,
      sourceContent,
      ['pt-BR'],
      'en',
      true,
      true,
      regionalMap
    );

    // Should use pt's translation, not source
    expect(applied['pt-BR'].farewell).toBe('Adeus');
  });

  test('does not modify when fallbackToSource is false', () => {
    const result = {};

    const applied = applyFallbacks(
      result,
      sourceContent,
      ['es'],
      'en',
      false, // fallbackToSource disabled
      true,
      {}
    );

    expect(applied.es).toBeUndefined();
    expect(applied.fallbackInfo).toBeUndefined();
  });

  test('handles empty translation object', () => {
    const result = {
      es: {}, // empty object
    };

    const applied = applyFallbacks(
      result,
      sourceContent,
      ['es'],
      'en',
      true,
      true,
      {}
    );

    expect(applied.es).toEqual(sourceContent);
    expect(applied.fallbackInfo.languagesFallbackToSource).toContain('es');
  });

  test('returns result without fallbackInfo when no fallbacks used', () => {
    const result = {
      es: { greeting: 'Hola', farewell: 'Adiós' },
    };

    const applied = applyFallbacks(
      result,
      sourceContent,
      ['es'],
      'en',
      true,
      true,
      {}
    );

    expect(applied.es).toEqual({ greeting: 'Hola', farewell: 'Adiós' });
    expect(applied.fallbackInfo).toBeUndefined();
  });
});

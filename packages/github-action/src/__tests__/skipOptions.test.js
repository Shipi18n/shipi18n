/**
 * Tests for the Shipi18n GitHub Action (v2 — BYO-LLM via @shipi18n/core).
 * These exercise the REAL exported helpers (no hosted API, no node-fetch).
 */

// Mock the GitHub Actions toolkit so importing the action doesn't touch the runner.
jest.mock('@actions/core', () => ({
  getInput: jest.fn(() => ''),
  setOutput: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn(),
}));
jest.mock('@actions/github', () => ({
  context: { repo: { owner: 'o', repo: 'r' }, ref: 'refs/heads/main', sha: 'abc', runId: '1' },
  getOctokit: jest.fn(),
}));
jest.mock('@actions/exec', () => ({ exec: jest.fn().mockResolvedValue(0) }));

const {
  applySkip,
  globToRegex,
  flattenObject,
  unflattenObject,
  detectChangedKeys,
  extractKeys,
  extractPlaceholders,
  verifyPlaceholders,
  runVerification,
  removeKeys,
  deepMerge,
} = require('../index.js');

describe('Skip options — parsing', () => {
  const parse = (s) => (s ? s.split(',').map((k) => k.trim()).filter(Boolean) : []);

  test('parses comma-separated skip-keys', () => {
    expect(parse('brandName,company.name,legal.terms')).toEqual(['brandName', 'company.name', 'legal.terms']);
  });
  test('trims whitespace', () => {
    expect(parse(' brandName , company.name ')).toEqual(['brandName', 'company.name']);
  });
  test('filters empty segments', () => {
    expect(parse('brandName,,company.name,')).toEqual(['brandName', 'company.name']);
  });
  test('handles empty input', () => {
    expect(parse('')).toEqual([]);
  });
});

describe('globToRegex', () => {
  test('single wildcard matches one segment only', () => {
    const re = globToRegex('states.*');
    expect(re.test('states.CA')).toBe(true);
    expect(re.test('states.CA.name')).toBe(false);
    expect(re.test('countries.CA')).toBe(false);
  });
  test('leading wildcard', () => {
    const re = globToRegex('*.internal');
    expect(re.test('config.internal')).toBe(true);
    expect(re.test('a.b.internal')).toBe(false);
  });
  test('double wildcard crosses segments', () => {
    const re = globToRegex('**.secret');
    expect(re.test('a.secret')).toBe(true);
    expect(re.test('a.b.c.secret')).toBe(true);
  });
  test('middle wildcard', () => {
    const re = globToRegex('config.*.secret');
    expect(re.test('config.db.secret')).toBe(true);
    expect(re.test('config.secret')).toBe(false);
  });
  test('exact key', () => {
    const re = globToRegex('brandName');
    expect(re.test('brandName')).toBe(true);
    expect(re.test('brandNameX')).toBe(false);
  });
});

describe('applySkip', () => {
  const content = {
    greeting: 'Hello',
    brandName: 'Acme',
    company: { name: 'Acme Inc', tagline: 'We build' },
    states: { CA: 'California', NY: 'New York' },
  };

  test('skips exact keys and keeps the rest', () => {
    const { toTranslate, skippedInfo, skippedValues } = applySkip(content, ['brandName', 'company.name'], []);
    expect(skippedInfo.count).toBe(2);
    expect(skippedInfo.keys).toEqual(expect.arrayContaining(['brandName', 'company.name']));
    expect(skippedValues['brandName']).toBe('Acme');
    // kept content still has the translatable keys
    expect(flattenObject(toTranslate)).toHaveProperty('greeting', 'Hello');
    expect(flattenObject(toTranslate)).not.toHaveProperty('brandName');
  });

  test('skips glob paths', () => {
    const { toTranslate, skippedInfo } = applySkip(content, [], ['states.*']);
    expect(skippedInfo.keys.sort()).toEqual(['states.CA', 'states.NY']);
    expect(flattenObject(toTranslate)).not.toHaveProperty('states.CA');
  });

  test('no skip options returns everything', () => {
    const { toTranslate, skippedInfo } = applySkip(content, [], []);
    expect(skippedInfo.count).toBe(0);
    expect(Object.keys(flattenObject(toTranslate))).toEqual(Object.keys(flattenObject(content)));
  });
});

describe('flatten / unflatten round-trip', () => {
  test('preserves nested structure', () => {
    const obj = { a: { b: { c: 'x' } }, d: 'y' };
    expect(unflattenObject(flattenObject(obj))).toEqual(obj);
  });
});

describe('detectChangedKeys', () => {
  test('detects added, modified, deleted', () => {
    const oldC = { a: '1', b: '2', gone: '3' };
    const newC = { a: '1', b: 'changed', c: 'new' };
    const { added, modified, deleted } = detectChangedKeys(oldC, newC);
    expect(added).toEqual(['c']);
    expect(modified).toEqual(['b']);
    expect(deleted).toEqual(['gone']);
  });
});

describe('extractKeys', () => {
  test('extracts only requested keys', () => {
    const obj = { a: '1', b: { c: '2', d: '3' } };
    expect(extractKeys(obj, ['a', 'b.c'])).toEqual({ a: '1', b: { c: '2' } });
  });
});

describe('removeKeys / deepMerge', () => {
  test('removeKeys deletes dot-path keys (emptied parents drop out)', () => {
    expect(removeKeys({ a: '1', b: { c: '2' } }, ['b.c'])).toEqual({ a: '1' });
    expect(removeKeys({ a: '1', b: { c: '2', d: '3' } }, ['b.c'])).toEqual({ a: '1', b: { d: '3' } });
  });
  test('deepMerge merges nested (source wins)', () => {
    expect(deepMerge({ a: { x: '1' } }, { a: { y: '2' } })).toEqual({ a: { x: '1', y: '2' } });
  });
});

describe('verification', () => {
  test('extractPlaceholders finds i18next + printf tokens', () => {
    const ph = extractPlaceholders('Hi {{name}}, you have %d items and {count}');
    expect(ph).toEqual(expect.arrayContaining(['{{name}}', '%d', '{count}']));
  });

  test('verifyPlaceholders flags a dropped placeholder', () => {
    const issue = verifyPlaceholders('Hello {{name}}', 'Hola', 'greeting');
    expect(issue).not.toBeNull();
    expect(issue.severity).toBe('error');
    expect(issue.message).toContain('Missing placeholders');
  });

  test('verifyPlaceholders passes when placeholders survive', () => {
    expect(verifyPlaceholders('Hello {{name}}', 'Hola {{name}}', 'greeting')).toBeNull();
  });

  test('runVerification reports missing keys and placeholder errors', () => {
    const source = { greeting: 'Hello {{name}}', bye: 'Goodbye' };
    const translated = { greeting: 'Hola' }; // dropped placeholder + missing key
    const issues = runVerification(source, translated, 'es');
    expect(issues.some((i) => i.type === 'missing_keys')).toBe(true);
    expect(issues.some((i) => i.type === 'placeholder' && i.severity === 'error')).toBe(true);
  });
});

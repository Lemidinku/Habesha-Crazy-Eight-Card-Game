import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import { KNOWN_ERROR_CODES } from './errorCodes';

describe('en.json error translations', () => {
  it('has a non-empty translated message for every known error code', () => {
    const errors = (en as { errors?: Record<string, string> }).errors ?? {};
    for (const code of KNOWN_ERROR_CODES) {
      expect(errors).toHaveProperty(code);
      expect(typeof errors[code]).toBe('string');
      expect((errors[code] as string).length).toBeGreaterThan(0);
    }
  });
});

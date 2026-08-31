import { describe, expect, it } from 'vitest';
import { resolveErrorMessageKey } from './errorMessages';

describe('resolveErrorMessageKey', () => {
  it('returns the errors.<code> key when a translation exists for it', () => {
    const exists = (key: string) => key === 'errors.NOT_YOUR_TURN';
    expect(resolveErrorMessageKey('NOT_YOUR_TURN', exists)).toBe('errors.NOT_YOUR_TURN');
  });

  it('falls back to the generic key when no translation exists for the code', () => {
    expect(resolveErrorMessageKey('Failed to fetch', () => false)).toBe('errors.UNKNOWN');
  });
});

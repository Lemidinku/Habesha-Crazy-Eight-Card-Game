import { afterEach, describe, expect, it } from 'vitest';
import { getCorsOptions } from './cors';

describe('getCorsOptions', () => {
  const originalEnv = process.env.ALLOWED_ORIGIN;

  afterEach(() => {
    process.env.ALLOWED_ORIGIN = originalEnv;
  });

  it('defaults to the local Vite dev server origin when ALLOWED_ORIGIN is unset', () => {
    delete process.env.ALLOWED_ORIGIN;
    expect(getCorsOptions()).toEqual({ origin: 'http://localhost:5173' });
  });

  it('uses ALLOWED_ORIGIN when it is set', () => {
    process.env.ALLOWED_ORIGIN = 'https://crazy8.example.com';
    expect(getCorsOptions()).toEqual({ origin: 'https://crazy8.example.com' });
  });
});

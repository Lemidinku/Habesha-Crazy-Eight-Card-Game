import { describe, expect, it } from 'vitest';
import { generateRoomCode } from './room-code';

describe('generateRoomCode', () => {
  it('generates a 6-character code using only the safe charset', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('never includes visually ambiguous characters (0/O, 1/I/L)', () => {
    const codes = Array.from({ length: 50 }, () => generateRoomCode());
    for (const code of codes) {
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it('produces varied codes across many calls', () => {
    const codes = new Set(Array.from({ length: 30 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

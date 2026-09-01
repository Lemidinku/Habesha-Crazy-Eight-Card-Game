import { describe, expect, it } from 'vitest';
import type { Card } from '@crazy8/engine';
import { aceOfSpadesRingClass } from './cardDisplay';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({
  id: `${rank}-${suit}`,
  rank,
  suit,
});

describe('aceOfSpadesRingClass', () => {
  it('returns the crimson ring classes for the Ace of Spades', () => {
    expect(aceOfSpadesRingClass(card('A', 'spades'))).toBe(
      'ring-2 ring-crimson shadow-[0_0_10px_var(--color-crimson)]',
    );
  });

  it('returns nothing for any other card, including other aces and other spades', () => {
    expect(aceOfSpadesRingClass(card('A', 'hearts'))).toBe('');
    expect(aceOfSpadesRingClass(card('K', 'spades'))).toBe('');
    expect(aceOfSpadesRingClass(card('8', 'spades'))).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import type { Card } from '@crazy8/engine';
import { orderCardIdsForPlay } from './cardOrdering';

const card = (id: string, rank: Card['rank'], suit: Card['suit']): Card => ({ id, rank, suit });

describe('orderCardIdsForPlay', () => {
  it('moves a selected 7 to the front even when clicked last', () => {
    const hand = [card('k-hearts', 'K', 'hearts'), card('7-hearts', '7', 'hearts'), card('3-hearts', '3', 'hearts')];
    // User clicked the King, then the 3, then the 7 last -- this was the reported bug.
    const clickOrder = ['k-hearts', '3-hearts', '7-hearts'];
    expect(orderCardIdsForPlay(hand, clickOrder)).toEqual(['7-hearts', 'k-hearts', '3-hearts']);
  });

  it('leaves the 7 in front if it was already clicked first', () => {
    const hand = [card('7-hearts', '7', 'hearts'), card('k-hearts', 'K', 'hearts')];
    const clickOrder = ['7-hearts', 'k-hearts'];
    expect(orderCardIdsForPlay(hand, clickOrder)).toEqual(['7-hearts', 'k-hearts']);
  });

  it('leaves order unchanged when no 7 is selected', () => {
    const hand = [card('k-hearts', 'K', 'hearts'), card('3-hearts', '3', 'hearts')];
    const clickOrder = ['3-hearts', 'k-hearts'];
    expect(orderCardIdsForPlay(hand, clickOrder)).toEqual(['3-hearts', 'k-hearts']);
  });

  it('leaves a single selected card unchanged', () => {
    const hand = [card('7-hearts', '7', 'hearts')];
    expect(orderCardIdsForPlay(hand, ['7-hearts'])).toEqual(['7-hearts']);
  });
});

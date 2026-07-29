import type { Card } from '@crazy8/engine';

export const SUIT_SYMBOLS: Record<Card['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

/** Hearts/diamonds vs. clubs/spades render identically without this -- verified by actually
 * looking at a screenshot during manual browser testing, not something a type-check would catch. */
export function isRedSuit(suit: Card['suit']): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}


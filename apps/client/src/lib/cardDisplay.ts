import { isWild } from '@crazy8/engine';
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

/** Text colour for a card's rank/suit, on the ivory card-face background. */
export function suitTextClass(suit: Card['suit']): string {
  return isRedSuit(suit) ? 'text-crimson' : 'text-ink';
}

/** Crazy Eights gets its name from its one wild rank -- eights get a gold ring wherever a
 * physical card renders (hand, discard pile, pending stack) so the game's own name is visible
 * in the table itself, not just the rules. */
export function wildRingClass(card: Card): string {
  return isWild(card) ? 'ring-2 ring-gold shadow-[0_0_10px_var(--color-gold)]' : '';
}

/** The Ace of Spades is one of this game's two forced-draw stacking cards (R-10-R-14) -- a
 * completely different mechanic from the wild ring above (attack/stack, not suit-declaring),
 * so it gets its own visual rather than reusing the gold wild ring, which would wrongly imply
 * it can declare a suit. Crimson reuses this app's existing "aggressive/destructive" color
 * role (Leave Game, disconnected accents) instead of introducing a new token. Never combined
 * with wildRingClass on the same card -- the Ace of Spades is never wild in this ruleset. */
export function aceOfSpadesRingClass(card: Card): string {
  return card.rank === 'A' && card.suit === 'spades'
    ? 'ring-2 ring-crimson shadow-[0_0_10px_var(--color-crimson)]'
    : '';
}

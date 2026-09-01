import { SUIT_SYMBOLS } from '../lib/cardDisplay';
import type { Card } from '@crazy8/engine';

/** Rank + suit symbol, suit rendered larger since it's the part players scan for fastest.
 * Renders no color of its own -- inherits text color from whatever wraps it, since callers
 * (hand cards, discard pile) each have their own legal/dimmed color logic already. */
export function CardFace({ card }: { card: Card }) {
  if (card.rank === 'A' && card.suit === 'spades') {
    // A physical Ace's whole trick is a center pip blown up far past every other rank's --
    // recognizable by size and shape alone, so a player is always aware they're holding it
    // even at a glance. Rank stays put alongside it (unlike a real card, no second mirrored
    // index in the opposite corner -- this is a single card face, not a two-corner layout).
    return (
      <span className="flex flex-col items-center gap-0.5 font-display font-semibold">
        <span className="text-xl leading-none">{card.rank}</span>
        <span className="text-6xl leading-none">{SUIT_SYMBOLS.spades}</span>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-center gap-0.5 font-display font-semibold">
      <span className="text-xl leading-none">{card.rank}</span>
      <span className="text-3xl leading-none">{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  );
}

import { SUIT_SYMBOLS } from '../lib/cardDisplay';
import type { Card } from '@crazy8/engine';

/** Rank + suit symbol, suit rendered larger since it's the part players scan for fastest.
 * Renders no color of its own -- inherits text color from whatever wraps it, since callers
 * (hand cards, discard pile) each have their own legal/dimmed color logic already. */
export function CardFace({ card }: { card: Card }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="text-2xl leading-none">{card.rank}</span>
      <span className="text-4xl leading-none">{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  );
}

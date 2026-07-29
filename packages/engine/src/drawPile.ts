import { shuffle } from "./deck.js";
import type { Card } from "./types.js";

export interface DrawOneCardResult {
  card: Card;
  drawPile: Card[];
  discardPile: Card[];
  reshuffled: boolean;
}

/**
 * R-22, R-23: draws one card, reshuffling the discard pile (minus its current top card) into
 * a fresh draw pile if needed. Returns null if there are no cards left to draw at all (R-23) --
 * callers should treat that as a pass, not an error.
 *
 * Assumes the invariant that `discardPile`'s last element is always the current reference card
 * (matches RoundState.currentSuit/currentRank) -- callers appending a multi-card play (a 7-dump)
 * must push the reference card last so it's preserved correctly here.
 */
export function drawOneCard(
  drawPile: Card[],
  discardPile: Card[],
  rng: () => number = Math.random,
): DrawOneCardResult | null {
  let pile = drawPile;
  let discard = discardPile;
  let reshuffled = false;

  if (pile.length === 0) {
    if (discard.length <= 1) {
      return null;
    }
    const topCard = discard[discard.length - 1]!;
    const reshuffleable = discard.slice(0, -1);
    pile = shuffle(reshuffleable, rng);
    discard = [topCard];
    reshuffled = true;
  }

  const [card, ...remaining] = pile;
  return { card: card!, drawPile: remaining, discardPile: discard, reshuffled };
}

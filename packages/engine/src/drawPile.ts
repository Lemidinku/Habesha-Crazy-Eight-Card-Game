import { buildSingleDeck, shuffle } from "./deck.js";
import type { Card } from "./types.js";

export interface DrawOneCardResult {
  card: Card;
  drawPile: Card[];
  discardPile: Card[];
  reshuffled: boolean;
  /** True if the draw pile and discard pile were both empty (nothing left to reshuffle) and a
   * fresh 52-card deck was shuffled in to satisfy this draw (R-23, overridden below). */
  freshDeckAdded: boolean;
  /** The (possibly incremented) deck counter to store back on RoundState.decksInPlay. */
  decksInPlay: number;
}

/**
 * R-22: draws one card, reshuffling the discard pile (minus its current top card) into a fresh
 * draw pile if needed.
 *
 * R-23 (overridden): if the draw pile is empty AND there's nothing left to reshuffle (the
 * discard pile has at most its own top card), this shuffles in a fresh, standard 52-card deck
 * instead of leaving the player unable to draw. `decksInPlay` tracks how many decks (the
 * initial deal plus any auto-added since) exist in this round's card-id namespace, so each
 * fresh deck gets the next unused deck index (see deck.ts's `id: "{rank}-{suit}-{deckIndex}"`
 * scheme) and never collides with cards already dealt out. Draw always succeeds now -- this
 * never returns null.
 *
 * Assumes the invariant that `discardPile`'s last element is always the current reference card
 * (matches RoundState.currentSuit/currentRank) -- callers appending a multi-card play (a 7-dump)
 * must push the reference card last so it's preserved correctly here.
 */
export function drawOneCard(
  drawPile: Card[],
  discardPile: Card[],
  decksInPlay: number,
  rng: () => number = Math.random,
): DrawOneCardResult {
  let pile = drawPile;
  let discard = discardPile;
  let reshuffled = false;
  let freshDeckAdded = false;
  let nextDecksInPlay = decksInPlay;

  if (pile.length === 0) {
    if (discard.length <= 1) {
      pile = shuffle(buildSingleDeck(decksInPlay), rng);
      freshDeckAdded = true;
      nextDecksInPlay = decksInPlay + 1;
    } else {
      const topCard = discard[discard.length - 1]!;
      const reshuffleable = discard.slice(0, -1);
      pile = shuffle(reshuffleable, rng);
      discard = [topCard];
      reshuffled = true;
    }
  }

  const [card, ...remaining] = pile;
  return {
    card: card!,
    drawPile: remaining,
    discardPile: discard,
    reshuffled,
    freshDeckAdded,
    decksInPlay: nextDecksInPlay,
  };
}

import type { Card, RoundState } from "./types.js";

/** R-5: 8s and Jacks are wild — playable regardless of the current suit/rank. */
export function isWild(card: Card): boolean {
  return card.rank === "8" || card.rank === "J";
}

/** R-4: a card is playable if it's wild, or matches the current top card by suit or rank. */
export function isLegalPlay(card: Card, round: Pick<RoundState, "currentSuit" | "currentRank">): boolean {
  return isWild(card) || card.suit === round.currentSuit || card.rank === round.currentRank;
}

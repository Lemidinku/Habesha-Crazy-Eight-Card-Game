import type { Card, DrawStack } from "./types.js";

const isAceOfSpades = (card: Card): boolean => card.rank === "A" && card.suit === "spades";
const isTwoOfSpades = (card: Card): boolean => card.rank === "2" && card.suit === "spades";

export interface StackExtension {
  addedAmount: number;
}

/**
 * R-10-R-14: whether `card` can extend a pending draw-stack, and by how much.
 * Returns null if `card` cannot extend the stack (the player must instead absorb it).
 *
 * The adjacency is keyed off the stack's current top card:
 * - top is a 2 (any suit): any 2 extends by +2; if the top is specifically 2 of Spades,
 *   an Ace of Spades may also extend by +5.
 * - top is Ace of Spades: only 2 of Spades extends by +2, or another Ace of Spades by +5
 *   (a plain 2 of another suit does NOT extend an Ace-of-Spades-topped stack).
 */
export function extendsStack(card: Card, pendingStack: DrawStack): StackExtension | null {
  const top = pendingStack.topCard;

  if (top.rank === "2") {
    if (isTwoOfSpades(top) && isAceOfSpades(card)) {
      return { addedAmount: 5 };
    }
    if (card.rank === "2") {
      return { addedAmount: 2 };
    }
    return null;
  }

  if (isAceOfSpades(top)) {
    if (isTwoOfSpades(card)) {
      return { addedAmount: 2 };
    }
    if (isAceOfSpades(card)) {
      return { addedAmount: 5 };
    }
    return null;
  }

  return null;
}

/** The initial accumulated draw count when a card first opens a stack (not extends one). */
export function openingStackAmount(card: Card): number | null {
  if (card.rank === "2") return 2;
  if (isAceOfSpades(card)) return 5;
  return null;
}

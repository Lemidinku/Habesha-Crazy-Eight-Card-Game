import { isLegalPlay } from "./matching.js";
import { isSevenPlayError, resolveSevenPlay } from "./sevenDump.js";
import { openingStackAmount } from "./stacking.js";
import type { Card, EngineError, Rank, RoundState, Suit } from "./types.js";

export interface PlayContext {
  /** cards[0] is the lead card; only a 7 (R-17) may legally have more than one entry. */
  cards: Card[];
  round: Pick<RoundState, "currentSuit" | "currentRank">;
  declaredSuit?: Suit;
  /** R-5a: true if the acting player is currently locked out of a wild's suit-declaring power. */
  isSuitLocked?: boolean;
}

export interface PlayEffectResult {
  newSuit: Suit;
  newRank: Rank;
  /** Set when this play opens a new pending draw-stack (R-10, R-11, R-12). */
  opensStack?: number;
  skipsNext?: boolean;
  reversesDirection?: boolean;
  /** R-5a: true only when a wild just genuinely declared a new suit (the player was not
   * locked) -- this is what triggers a new lock for the next player. A suppressed wild (the
   * player WAS locked) leaves this unset, so it does not itself chain the lock forward. */
  suitDeclared?: boolean;
}

type CardEffectHandler = (ctx: PlayContext) => PlayEffectResult | EngineError;

function tooManyCardsError(): EngineError {
  return { code: "TOO_MANY_CARDS", message: "Only a 7 may be played together with other cards." };
}

function illegalPlayError(): EngineError {
  return { code: "ILLEGAL_PLAY", message: "That card does not match the current suit or rank." };
}

/** R-5: 8 and J are wild -- playable anytime, the player declares the next suit. R-5a: if the
 * player is currently suit-locked (they were the immediate next player after someone else's
 * wild), the declare is suppressed -- still a legal play, but the active suit doesn't change. */
const wildEffect: CardEffectHandler = ({ cards, declaredSuit, round, isSuitLocked }) => {
  const [card, ...rest] = cards;
  if (rest.length > 0) return tooManyCardsError();
  if (isSuitLocked) {
    return { newSuit: round.currentSuit, newRank: card!.rank };
  }
  if (!declaredSuit) {
    return { code: "SUIT_REQUIRED", message: "Playing an 8 or J requires declaring the next suit." };
  }
  return { newSuit: declaredSuit, newRank: card!.rank, suitDeclared: true };
};

/** R-8: a 5 must match normally, then skips the next player. */
const skipEffect: CardEffectHandler = ({ cards, round }) => {
  const [card, ...rest] = cards;
  if (rest.length > 0) return tooManyCardsError();
  if (!isLegalPlay(card!, round)) return illegalPlayError();
  return { newSuit: card!.suit, newRank: card!.rank, skipsNext: true };
};

/** R-6, R-7: a 2 (or Ace of Spades, handled separately below) must match normally to be led,
 * then opens a new pending draw-stack. */
const stackOpenerEffect: CardEffectHandler = ({ cards, round }) => {
  const [card, ...rest] = cards;
  if (rest.length > 0) return tooManyCardsError();
  if (!isLegalPlay(card!, round)) return illegalPlayError();
  const amount = openingStackAmount(card!);
  return { newSuit: card!.suit, newRank: card!.rank, opensStack: amount! };
};

/** R-15-R-19: fully delegated to sevenDump.ts, the only handler that ever sees more than one
 * card, since only a 7 may carry a same-suit dump. */
const sevenEffect: CardEffectHandler = ({ cards, round }) => {
  const result = resolveSevenPlay(cards, round);
  if (isSevenPlayError(result)) return result;
  return { newSuit: result.newSuit, newRank: result.newRank, reversesDirection: result.reversed };
};

/** Every other rank (3, 4, 6, 9, 10, Q, K, and non-Spade Aces): normal matching, no effect. */
const plainEffect: CardEffectHandler = ({ cards, round }) => {
  const [card, ...rest] = cards;
  if (rest.length > 0) return tooManyCardsError();
  if (!isLegalPlay(card!, round)) return illegalPlayError();
  return { newSuit: card!.suit, newRank: card!.rank };
};

/**
 * The Strategy-table dispatch (DESIGN.md §3.3): which handler runs is keyed by the lead
 * card's rank, except Ace of Spades which needs suit too -- handled by a pre-check in
 * `resolvePlayEffect` before falling through to this table.
 */
const CARD_EFFECTS: Partial<Record<Rank, CardEffectHandler>> = {
  "8": wildEffect,
  J: wildEffect,
  "2": stackOpenerEffect,
  "5": skipEffect,
  "7": sevenEffect,
};

/** Resolves the effect of playing `ctx.cards` (led by `ctx.cards[0]`) against the current
 * round state during the normal AWAITING_PLAY phase. Draw-stack *responses* (extending or
 * absorbing an already-pending stack) are handled separately via stacking.ts, not here. */
export function resolvePlayEffect(ctx: PlayContext): PlayEffectResult | EngineError {
  const lead = ctx.cards[0];
  if (!lead) {
    return { code: "NO_CARDS", message: "Must play at least one card." };
  }

  if (lead.rank === "A" && lead.suit === "spades") {
    return stackOpenerEffect(ctx);
  }

  const handler = CARD_EFFECTS[lead.rank] ?? plainEffect;
  return handler(ctx);
}

import { isLegalPlay } from "./matching.js";
import type { Card, RoundState } from "./types.js";

export interface SevenPlayResult {
  reversed: boolean;
  newSuit: Card["suit"];
  newRank: "7";
}

export interface SevenPlayError {
  code: "INVALID_SEVEN_PLAY" | "SEVEN_DOES_NOT_MATCH" | "SEVEN_RANK_MATCH_CANNOT_DUMP" | "DUMP_SUIT_MISMATCH";
  message: string;
}

export function isSevenPlayError(result: SevenPlayResult | SevenPlayError): result is SevenPlayError {
  return "code" in result;
}

/**
 * R-15-R-19: resolves a 7 play, which is either led alone (always reverses, R-16) or led
 * together with a dump of same-suit cards (R-17). Note the 7 itself does NOT need to match
 * the active suit directly to be played alone (rank-matching a different-suit 7 on top is
 * fine) — it only needs a suit match to carry a dump. Cards attached to a dump never trigger
 * their own effects (R-19); that's enforced by the caller never re-dispatching them, not by
 * anything in this function.
 */
export function resolveSevenPlay(
  cards: Card[],
  round: Pick<RoundState, "currentSuit" | "currentRank">,
): SevenPlayResult | SevenPlayError {
  const [seven, ...rest] = cards;
  if (!seven || seven.rank !== "7") {
    return { code: "INVALID_SEVEN_PLAY", message: "A seven-play must lead with a 7." };
  }

  if (!isLegalPlay(seven, round)) {
    return {
      code: "SEVEN_DOES_NOT_MATCH",
      message: "The 7 must match the current suit or rank to be played.",
    };
  }

  // R-16: played alone, always reverses -- regardless of suit-match or rank-match entry.
  if (rest.length === 0) {
    return { reversed: true, newSuit: seven.suit, newRank: "7" };
  }

  // R-17: a dump is only legal when the 7 matches the ACTIVE SUIT directly (not merely by
  // rank against a different-suit 7 already on top).
  if (seven.suit !== round.currentSuit) {
    return {
      code: "SEVEN_RANK_MATCH_CANNOT_DUMP",
      message:
        "A 7 that only matches the top card by rank cannot carry a dump; play it alone instead.",
    };
  }

  const offendingCard = rest.find((card) => card.suit !== round.currentSuit);
  if (offendingCard) {
    return {
      code: "DUMP_SUIT_MISMATCH",
      message: "Every card attached to a 7-dump must be of the suit that was already active.",
    };
  }

  // R-18: the active suit doesn't change (every dumped card already shares it); the 7 itself
  // becomes the reference card for the next player's matching.
  return { reversed: false, newSuit: round.currentSuit, newRank: "7" };
}

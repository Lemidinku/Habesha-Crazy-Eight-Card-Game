import { describe, expect, it } from "vitest";
import { isLegalPlay, isWild } from "../src/matching.js";
import type { Card } from "../src/types.js";

const card = (rank: Card["rank"], suit: Card["suit"] = "hearts"): Card => ({
  id: `${rank}-${suit}`,
  rank,
  suit,
});

describe("isWild", () => {
  it("treats 8 and J as wild", () => {
    expect(isWild(card("8"))).toBe(true);
    expect(isWild(card("J"))).toBe(true);
  });

  it("treats every other rank as not wild", () => {
    for (const rank of ["2", "3", "4", "5", "6", "7", "9", "10", "Q", "K", "A"] as const) {
      expect(isWild(card(rank))).toBe(false);
    }
  });
});

describe("isLegalPlay", () => {
  const round = { currentSuit: "hearts" as const, currentRank: "7" as const };

  it("allows a wild card regardless of suit/rank", () => {
    expect(isLegalPlay(card("8", "spades"), round)).toBe(true);
    expect(isLegalPlay(card("J", "clubs"), round)).toBe(true);
  });

  it("allows a same-suit non-wild card", () => {
    expect(isLegalPlay(card("K", "hearts"), round)).toBe(true);
  });

  it("allows a same-rank non-wild card of a different suit", () => {
    expect(isLegalPlay(card("7", "spades"), round)).toBe(true);
  });

  it("rejects a card matching neither suit nor rank", () => {
    expect(isLegalPlay(card("K", "spades"), round)).toBe(false);
  });
});

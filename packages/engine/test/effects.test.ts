import { describe, expect, it } from "vitest";
import { resolvePlayEffect } from "../src/effects.js";
import type { Card } from "../src/types.js";

const card = (rank: Card["rank"], suit: Card["suit"] = "hearts"): Card => ({
  id: `${rank}-${suit}`,
  rank,
  suit,
});
const activeHearts = { currentSuit: "hearts" as const, currentRank: "K" as const };

describe("resolvePlayEffect", () => {
  it("R-5: wild (8) requires a declared suit and adopts it", () => {
    const result = resolvePlayEffect({
      cards: [card("8", "clubs")],
      round: activeHearts,
      declaredSuit: "diamonds",
    });
    expect(result).toEqual({ newSuit: "diamonds", newRank: "8", suitDeclared: true });
  });

  it("R-5a: a suit-locked player can still play a wild, but the declare is suppressed", () => {
    const result = resolvePlayEffect({
      cards: [card("J", "clubs")],
      round: activeHearts,
      declaredSuit: "diamonds",
      isSuitLocked: true,
    });
    // The active suit stays whatever it already was (hearts) -- diamonds is ignored -- and the
    // rank still updates to J since that's just a normal consequence of the card being played.
    expect(result).toEqual({ newSuit: "hearts", newRank: "J" });
  });

  it("R-5: wild (J) without a declared suit is rejected", () => {
    const result = resolvePlayEffect({ cards: [card("J", "clubs")], round: activeHearts });
    expect(result).toEqual({ code: "SUIT_REQUIRED", message: expect.any(String) });
  });

  it("R-8: a matching 5 skips the next player", () => {
    const result = resolvePlayEffect({ cards: [card("5", "hearts")], round: activeHearts });
    expect(result).toEqual({ newSuit: "hearts", newRank: "5", skipsNext: true });
  });

  it("R-8: a non-matching 5 is rejected", () => {
    const result = resolvePlayEffect({ cards: [card("5", "clubs")], round: activeHearts });
    expect(result).toEqual({ code: "ILLEGAL_PLAY", message: expect.any(String) });
  });

  it("R-6: a matching 2 opens a stack of 2", () => {
    const result = resolvePlayEffect({ cards: [card("2", "hearts")], round: activeHearts });
    expect(result).toEqual({ newSuit: "hearts", newRank: "2", opensStack: 2 });
  });

  it("R-7: a matching Ace of Spades opens a stack of 5", () => {
    const spadesActive = { currentSuit: "spades" as const, currentRank: "K" as const };
    const result = resolvePlayEffect({ cards: [card("A", "spades")], round: spadesActive });
    expect(result).toEqual({ newSuit: "spades", newRank: "A", opensStack: 5 });
  });

  it("a non-Spade Ace is just a plain card, not a stack opener", () => {
    const result = resolvePlayEffect({ cards: [card("A", "hearts")], round: activeHearts });
    expect(result).toEqual({ newSuit: "hearts", newRank: "A" });
  });

  it("R-15-R-19: delegates 7 plays to sevenDump, alone case", () => {
    const sevenActive = { currentSuit: "hearts" as const, currentRank: "7" as const };
    const result = resolvePlayEffect({ cards: [card("7", "hearts")], round: sevenActive });
    expect(result).toEqual({ newSuit: "hearts", newRank: "7", reversesDirection: true });
  });

  it("R-15-R-19: delegates 7 plays to sevenDump, dump case", () => {
    const sevenActive = { currentSuit: "hearts" as const, currentRank: "7" as const };
    const result = resolvePlayEffect({
      cards: [card("7", "hearts"), card("K", "hearts")],
      round: sevenActive,
    });
    expect(result).toEqual({ newSuit: "hearts", newRank: "7", reversesDirection: false });
  });

  it("a plain card must match, and carries no effect", () => {
    expect(resolvePlayEffect({ cards: [card("K", "hearts")], round: activeHearts })).toEqual({
      newSuit: "hearts",
      newRank: "K",
    });
    // Q of clubs matches neither the active suit (hearts) nor rank (K).
    expect(resolvePlayEffect({ cards: [card("Q", "clubs")], round: activeHearts })).toEqual({
      code: "ILLEGAL_PLAY",
      message: expect.any(String),
    });
  });

  it("rejects multiple cards for every rank except 7", () => {
    const result = resolvePlayEffect({
      cards: [card("2", "hearts"), card("3", "hearts")],
      round: activeHearts,
    });
    expect(result).toEqual({ code: "TOO_MANY_CARDS", message: expect.any(String) });
  });

  it("rejects an empty play", () => {
    expect(resolvePlayEffect({ cards: [], round: activeHearts })).toEqual({
      code: "NO_CARDS",
      message: expect.any(String),
    });
  });
});

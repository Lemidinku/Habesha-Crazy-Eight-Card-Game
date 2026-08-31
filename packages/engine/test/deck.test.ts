import { describe, expect, it } from "vitest";
import { buildDeck, dealHands, dealNewRound, deckCountForPlayers, shuffle } from "../src/deck.js";

describe("deckCountForPlayers", () => {
  it("uses a single deck for 2-4 players", () => {
    expect(deckCountForPlayers(2)).toBe(1);
    expect(deckCountForPlayers(3)).toBe(1);
    expect(deckCountForPlayers(4)).toBe(1);
  });

  it("uses two decks for 5-8 players", () => {
    expect(deckCountForPlayers(5)).toBe(2);
    expect(deckCountForPlayers(8)).toBe(2);
  });
});

describe("buildDeck", () => {
  it("builds 52 unique cards for a 1-deck table", () => {
    const deck = buildDeck(4, () => 0.5);
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });

  it("builds 104 cards (two of each) for a 2-deck table", () => {
    const deck = buildDeck(6, () => 0.5);
    expect(deck).toHaveLength(104);
    expect(new Set(deck.map((c) => c.id)).size).toBe(104);

    const aceOfSpades = deck.filter((c) => c.rank === "A" && c.suit === "spades");
    expect(aceOfSpades).toHaveLength(2);
  });

});

describe("shuffle", () => {
  it("is deterministic given an injected rng, per the Fisher-Yates trace", () => {
    // rng=0 always picks index 0, so each pass swaps position i with position 0.
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3];
    shuffle(input, () => 0);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe("dealHands", () => {
  it("deals handSize cards to each seat, round-robin, and shrinks the remaining deck", () => {
    const deck = buildDeck(4, () => 0.5);
    const { hands, remainingDeck } = dealHands(deck, 4, 7);
    expect(hands).toHaveLength(4);
    for (const hand of hands) {
      expect(hand).toHaveLength(7);
    }
    expect(remainingDeck).toHaveLength(52 - 4 * 7);
  });

  it("throws if the deck cannot fill every hand", () => {
    const deck = buildDeck(2, () => 0.5).slice(0, 5);
    expect(() => dealHands(deck, 2, 7)).toThrow();
  });
});

describe("dealNewRound", () => {
  it("deals hands and flips one opening discard card (R-3)", () => {
    const { hands, round } = dealNewRound(4, 7, 0, () => 0.5);
    expect(hands).toHaveLength(4);
    expect(round.discardPile).toHaveLength(1);
    expect(round.drawPile).toHaveLength(52 - 4 * 7 - 1);
    expect(round.currentSuit).toBe(round.discardPile[0].suit);
    expect(round.currentRank).toBe(round.discardPile[0].rank);
    expect(round.phase).toBe("AWAITING_PLAY");
    expect(round.direction).toBe(1);
    expect(round.currentPlayerIndex).toBe(0);
    expect(round.pendingStack).toBeUndefined();
    expect(round.decksInPlay).toBe(1);
  });
});

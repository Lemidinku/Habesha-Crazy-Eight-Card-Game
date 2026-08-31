import { describe, expect, it } from "vitest";
import { drawOneCard } from "../src/drawPile.js";
import type { Card } from "../src/types.js";

const card = (rank: Card["rank"], suit: Card["suit"] = "hearts"): Card => ({
  id: `${rank}-${suit}`,
  rank,
  suit,
});

describe("drawOneCard", () => {
  it("draws from the draw pile when cards remain", () => {
    const drawPile = [card("3"), card("4")];
    const discardPile = [card("K")];
    const result = drawOneCard(drawPile, discardPile, 1, () => 0.5);
    expect(result.card).toEqual(card("3"));
    expect(result.drawPile).toEqual([card("4")]);
    expect(result.discardPile).toEqual(discardPile);
    expect(result.reshuffled).toBe(false);
    expect(result.freshDeckAdded).toBe(false);
    expect(result.decksInPlay).toBe(1);
  });

  it("R-22: reshuffles the discard pile (minus the top card) when the draw pile is empty", () => {
    const discardPile = [card("3"), card("4"), card("K")]; // K is the current top card
    const result = drawOneCard([], discardPile, 1, () => 0);
    expect(result.reshuffled).toBe(true);
    expect(result.freshDeckAdded).toBe(false);
    // the new discard pile keeps only the old top card
    expect(result.discardPile).toEqual([card("K")]);
    // the drawn card + remaining draw pile together account for the two reshuffled cards
    expect(result.drawPile.length + 1).toBe(2);
    expect(result.decksInPlay).toBe(1);
  });

  it("R-23 (overridden): shuffles in a fresh 52-card deck instead of returning null when nothing is reshuffleable", () => {
    const result = drawOneCard([], [card("K")], 1, () => 0.5);
    expect(result.freshDeckAdded).toBe(true);
    expect(result.reshuffled).toBe(false);
    // 52 fresh cards minus the one just drawn
    expect(result.drawPile).toHaveLength(51);
    // the untouched top card is still the only thing on the discard pile
    expect(result.discardPile).toEqual([card("K")]);
    // a new deck is built at index 1 (index 0 is already in play), which bumps the counter
    expect(result.decksInPlay).toBe(2);
    expect(result.card.id.endsWith("-1")).toBe(true);
  });

  it("R-23 (overridden): shuffles in a fresh deck when both piles are truly empty", () => {
    const result = drawOneCard([], [], 1, () => 0.5);
    expect(result.freshDeckAdded).toBe(true);
    expect(result.drawPile).toHaveLength(51);
    expect(result.discardPile).toEqual([]);
    expect(result.decksInPlay).toBe(2);
  });
});

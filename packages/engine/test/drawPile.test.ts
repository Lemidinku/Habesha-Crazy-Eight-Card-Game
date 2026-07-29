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
    const result = drawOneCard(drawPile, discardPile, () => 0.5);
    expect(result).not.toBeNull();
    expect(result!.card).toEqual(card("3"));
    expect(result!.drawPile).toEqual([card("4")]);
    expect(result!.discardPile).toEqual(discardPile);
    expect(result!.reshuffled).toBe(false);
  });

  it("R-22: reshuffles the discard pile (minus the top card) when the draw pile is empty", () => {
    const discardPile = [card("3"), card("4"), card("K")]; // K is the current top card
    const result = drawOneCard([], discardPile, () => 0);
    expect(result).not.toBeNull();
    expect(result!.reshuffled).toBe(true);
    // the new discard pile keeps only the old top card
    expect(result!.discardPile).toEqual([card("K")]);
    // the drawn card + remaining draw pile together account for the two reshuffled cards
    expect(result!.drawPile.length + 1).toBe(2);
  });

  it("R-23: returns null when both piles are empty (nothing left to reshuffle)", () => {
    const result = drawOneCard([], [card("K")], () => 0.5);
    expect(result).toBeNull();
  });

  it("R-23: returns null when both piles are truly empty", () => {
    const result = drawOneCard([], [], () => 0.5);
    expect(result).toBeNull();
  });
});

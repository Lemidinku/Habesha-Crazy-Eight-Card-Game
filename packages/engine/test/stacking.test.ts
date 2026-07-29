import { describe, expect, it } from "vitest";
import { extendsStack, openingStackAmount } from "../src/stacking.js";
import type { Card, DrawStack } from "../src/types.js";

const card = (rank: Card["rank"], suit: Card["suit"]): Card => ({ id: `${rank}-${suit}`, rank, suit });
const stackOn = (topCard: Card, accumulated: number): DrawStack => ({ topCard, accumulated });

describe("extendsStack — top is a plain 2", () => {
  const stack = stackOn(card("2", "hearts"), 2);

  it("allows any other 2 to extend by +2", () => {
    expect(extendsStack(card("2", "clubs"), stack)).toEqual({ addedAmount: 2 });
  });

  it("does not allow Ace of Spades to extend a non-spade 2", () => {
    expect(extendsStack(card("A", "spades"), stack)).toBeNull();
  });

  it("does not allow an unrelated card to extend", () => {
    expect(extendsStack(card("K", "hearts"), stack)).toBeNull();
  });
});

describe("extendsStack — top is 2 of Spades specifically", () => {
  const stack = stackOn(card("2", "spades"), 2);

  it("allows any other 2 to extend by +2 (still just 'a 2')", () => {
    expect(extendsStack(card("2", "diamonds"), stack)).toEqual({ addedAmount: 2 });
  });

  it("allows Ace of Spades to extend by +5", () => {
    expect(extendsStack(card("A", "spades"), stack)).toEqual({ addedAmount: 5 });
  });
});

describe("extendsStack — top is Ace of Spades", () => {
  const stack = stackOn(card("A", "spades"), 5);

  it("allows 2 of Spades specifically to extend by +2", () => {
    expect(extendsStack(card("2", "spades"), stack)).toEqual({ addedAmount: 2 });
  });

  it("does NOT allow a plain 2 of another suit to extend", () => {
    expect(extendsStack(card("2", "hearts"), stack)).toBeNull();
  });

  it("allows another Ace of Spades to extend by +5", () => {
    expect(extendsStack(card("A", "spades"), stack)).toEqual({ addedAmount: 5 });
  });
});

describe("openingStackAmount", () => {
  it("is 2 for any 2", () => {
    expect(openingStackAmount(card("2", "clubs"))).toBe(2);
  });

  it("is 5 for Ace of Spades", () => {
    expect(openingStackAmount(card("A", "spades"))).toBe(5);
  });

  it("is null for an Ace of a different suit", () => {
    expect(openingStackAmount(card("A", "hearts"))).toBeNull();
  });

  it("is null for unrelated ranks", () => {
    expect(openingStackAmount(card("K", "hearts"))).toBeNull();
  });
});

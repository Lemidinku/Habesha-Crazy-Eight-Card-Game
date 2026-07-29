import { describe, expect, it } from "vitest";
import { nextPlayerIndex, reverseDirection } from "../src/turn.js";

describe("nextPlayerIndex", () => {
  it("advances by one seat clockwise", () => {
    expect(nextPlayerIndex(0, 4, 1)).toBe(1);
  });

  it("wraps around at the end going clockwise", () => {
    expect(nextPlayerIndex(3, 4, 1)).toBe(0);
  });

  it("advances backwards counter-clockwise", () => {
    expect(nextPlayerIndex(1, 4, -1)).toBe(0);
  });

  it("wraps around at the start going counter-clockwise", () => {
    expect(nextPlayerIndex(0, 4, -1)).toBe(3);
  });

  it("R-8: a skip advances by two seats instead of one", () => {
    expect(nextPlayerIndex(0, 4, 1, true)).toBe(2);
  });

  it("a skip wraps correctly near the boundary", () => {
    expect(nextPlayerIndex(3, 4, 1, true)).toBe(1);
  });

  it("a skip works with counter-clockwise direction too", () => {
    expect(nextPlayerIndex(0, 4, -1, true)).toBe(2);
  });
});

describe("reverseDirection", () => {
  it("flips clockwise to counter-clockwise and back", () => {
    expect(reverseDirection(1)).toBe(-1);
    expect(reverseDirection(-1)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PENALTY_TABLE,
  cardPenalty,
  forceMatchEnd,
  scoreRound,
  updateLeaderRoundCounts,
} from "../src/scoring.js";
import type { Card, PlayerState } from "../src/types.js";

const card = (rank: Card["rank"], suit: Card["suit"] = "hearts"): Card => ({
  id: `${rank}-${suit}`,
  rank,
  suit,
});

const player = (playerId: string, hand: Card[], matchScore = 0, roundsWon = 0): PlayerState => ({
  playerId,
  hand,
  matchScore,
  roundsWon,
});

describe("cardPenalty", () => {
  it("uses face value for plain number cards", () => {
    expect(cardPenalty(card("4"))).toBe(4);
    expect(cardPenalty(card("9"))).toBe(9);
  });

  it("values 5 and 7 at 20 (special, non-wild)", () => {
    expect(cardPenalty(card("5"))).toBe(20);
    expect(cardPenalty(card("7"))).toBe(20);
  });

  it("values 8 and J (wild) at 50", () => {
    expect(cardPenalty(card("8"))).toBe(50);
    expect(cardPenalty(card("J"))).toBe(50);
  });

  it("values Ace of Spades at 50 but other Aces at 15", () => {
    expect(cardPenalty(card("A", "spades"))).toBe(50);
    expect(cardPenalty(card("A", "hearts"))).toBe(15);
  });

  it("values Q and K at 10", () => {
    expect(cardPenalty(card("Q"))).toBe(10);
    expect(cardPenalty(card("K"))).toBe(10);
  });
});

describe("scoreRound", () => {
  it("R-24/R-25: winner scores 0, others add their hand's penalty total", () => {
    const players = [
      player("alice", []),
      player("bob", [card("K"), card("A", "spades")], 10),
    ];
    const result = scoreRound(players, "alice", DEFAULT_PENALTY_TABLE);
    expect(result.scores).toEqual({ alice: 0, bob: 60 });
    expect(result.updatedPlayers.find((p) => p.playerId === "alice")!.matchScore).toBe(0);
    expect(result.updatedPlayers.find((p) => p.playerId === "bob")!.matchScore).toBe(70);
  });

  it("credits the winner with a roundsWon, leaving everyone else's unchanged", () => {
    const players = [player("alice", [], 0, 2), player("bob", [card("K")], 10, 5)];
    const result = scoreRound(players, "alice", DEFAULT_PENALTY_TABLE);
    expect(result.updatedPlayers.find((p) => p.playerId === "alice")!.roundsWon).toBe(3);
    expect(result.updatedPlayers.find((p) => p.playerId === "bob")!.roundsWon).toBe(5);
  });
});

describe("updateLeaderRoundCounts", () => {
  it("increments the count for whoever has the lowest cumulative score", () => {
    const players = [player("alice", [], 10), player("bob", [], 30)];
    const result = updateLeaderRoundCounts(players, {});
    expect(result).toEqual({ alice: 1 });
  });

  it("increments all tied leaders", () => {
    const players = [player("alice", [], 10), player("bob", [], 10)];
    const result = updateLeaderRoundCounts(players, { alice: 2 });
    expect(result).toEqual({ alice: 3, bob: 1 });
  });
});

describe("forceMatchEnd", () => {
  it("R-28: declares the LOWEST score the winner", () => {
    const players = [player("alice", [], 120), player("bob", [], 30)];
    expect(forceMatchEnd(players, {})).toEqual({ winnerPlayerId: "bob" });
  });

  it("R-29: breaks a score tie by fewest rounds spent as leader", () => {
    const players = [player("alice", [], 100), player("bob", [], 100)];
    const leaderRoundCounts = { alice: 3, bob: 1 };
    expect(forceMatchEnd(players, leaderRoundCounts)).toEqual({ winnerPlayerId: "bob" });
  });

  it("R-29: falls back to a deterministic pick if score AND leader counts both tie", () => {
    const players = [player("alice", [], 100), player("bob", [], 100)];
    const leaderRoundCounts = { alice: 2, bob: 2 };
    // A forced end always needs exactly one winner -- unlike the old auto-end, there's no
    // "continue to sudden death" option here, so the first tied player wins deterministically.
    expect(forceMatchEnd(players, leaderRoundCounts)).toEqual({ winnerPlayerId: "alice" });
  });
});

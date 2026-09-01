import { describe, expect, it } from "vitest";
import { applyMove, createMatch } from "../src/engine.js";
import { DEFAULT_PENALTY_TABLE } from "../src/scoring.js";
import type { Card, MatchState, PlayerState, RoundState } from "../src/types.js";

const card = (rank: Card["rank"], suit: Card["suit"] = "hearts", tag = ""): Card => ({
  id: `${rank}-${suit}${tag ? `-${tag}` : ""}`,
  rank,
  suit,
});

function makeMatch(
  players: (Omit<PlayerState, "roundsWon"> & Partial<Pick<PlayerState, "roundsWon">>)[],
  roundOverrides: Partial<RoundState> = {},
  matchOverrides: Partial<MatchState> = {},
): MatchState {
  const round: RoundState = {
    phase: "AWAITING_PLAY",
    drawPile: [],
    discardPile: [card("K", "hearts")],
    decksInPlay: 1,
    currentSuit: "hearts",
    currentRank: "K",
    direction: 1,
    currentPlayerIndex: 0,
    pendingStack: undefined,
    ...roundOverrides,
  };
  return {
    players: players.map((p) => ({ roundsWon: 0, ...p })),
    round,
    handSize: 7,
    roundStarterIndex: 0,
    penaltyTable: DEFAULT_PENALTY_TABLE,
    leaderRoundCounts: {},
    matchStatus: "IN_PROGRESS",
    ...matchOverrides,
  };
}

describe("createMatch", () => {
  it("deals every player a hand and starts round 1 with player 0 up", () => {
    const state = createMatch(["alice", "bob", "carol"], { rng: () => 0.5 });
    expect(state.players).toHaveLength(3);
    for (const player of state.players) {
      expect(player.hand).toHaveLength(7);
      expect(player.matchScore).toBe(0);
      expect(player.roundsWon).toBe(0);
    }
    expect(state.round.currentPlayerIndex).toBe(0);
    expect(state.matchStatus).toBe("IN_PROGRESS");
  });

  it("respects a handSize override", () => {
    const state = createMatch(["alice", "bob"], { rng: () => 0.5, handSize: 5 });
    expect(state.players[0]!.hand).toHaveLength(5);
  });
});

describe("applyMove — turn/phase gating", () => {
  it("rejects a command from a player who isn't up", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("Q", "hearts")], matchScore: 0 },
      { playerId: "bob", hand: [card("Q", "hearts")], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "bob", cardIds: ["Q-hearts"] });
    expect(result).toEqual({ ok: false, error: { code: "NOT_YOUR_TURN", message: expect.any(String) } });
  });

  it("rejects PLAY_CARDS while a stack response is pending", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("Q", "hearts")], matchScore: 0 },
        { playerId: "bob", hand: [], matchScore: 0 },
      ],
      { phase: "AWAITING_STACK_RESPONSE", pendingStack: { topCard: card("2", "hearts"), accumulated: 2 } },
    );
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["Q-hearts"] });
    expect(result.ok).toBe(false);
  });

  it("rejects playing a card that isn't in hand", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("Q", "hearts")], matchScore: 0 },
      { playerId: "bob", hand: [], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["9-clubs"] });
    expect(result).toEqual({
      ok: false,
      error: { code: "CARD_NOT_IN_HAND", message: expect.any(String) },
    });
  });

  it("returns an error instead of throwing/returning undefined for an unrecognized command type", () => {
    // Regression test: applyMove's dispatch switch had no default case, so a `type` outside
    // the six known Command variants fell through and implicitly returned undefined -- callers
    // (RoomService.handleCommand) do `if (!result.ok)` unconditionally, which throws on
    // undefined instead of surfacing a clean rejection. `command` crosses a JSON/network
    // boundary before reaching here, so this is a real runtime possibility, not just
    // hypothetical -- hence the cast, deliberately bypassing TypeScript's own Command type.
    const state = makeMatch([
      { playerId: "alice", hand: [card("Q", "hearts")], matchScore: 0 },
      { playerId: "bob", hand: [], matchScore: 0 },
    ]);
    const bogusCommand = { type: "BOGUS", playerId: "alice" } as unknown as Parameters<typeof applyMove>[1];
    const result = applyMove(state, bogusCommand);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNKNOWN_COMMAND");
  });
});

describe("applyMove — plain play", () => {
  it("advances the turn to the next seat after a legal plain play", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("K", "spades"), card("3", "clubs")], matchScore: 0 },
      { playerId: "bob", hand: [card("9", "hearts")], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["K-spades"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.currentSuit).toBe("spades");
    expect(result.state.round.currentRank).toBe("K");
    expect(result.state.round.currentPlayerIndex).toBe(1);
    expect(result.state.players[0]!.hand).toEqual([card("3", "clubs")]);
    expect(result.events).toContainEqual({
      type: "CARDS_PLAYED",
      playerId: "alice",
      cards: [card("K", "spades")],
    });
  });
});

describe("applyMove — wild (8/J)", () => {
  it("requires a declared suit and adopts it", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("8", "clubs"), card("3", "clubs")], matchScore: 0 },
      { playerId: "bob", hand: [card("9")], matchScore: 0 },
    ]);
    const result = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "alice",
      cardIds: ["8-clubs"],
      declaredSuit: "diamonds",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.currentSuit).toBe("diamonds");
    expect(result.state.round.currentRank).toBe("8");
  });

  it("rejects an 8 played without a declared suit", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("8", "clubs")], matchScore: 0 },
      { playerId: "bob", hand: [card("9")], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["8-clubs"] });
    expect(result).toEqual({ ok: false, error: { code: "SUIT_REQUIRED", message: expect.any(String) } });
  });
});

describe("applyMove — R-5a wild suit-lock", () => {
  it("locks the immediate next player after a genuine wild declare", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("8", "clubs"), card("3", "clubs")], matchScore: 0 },
      { playerId: "bob", hand: [card("J", "hearts"), card("3", "hearts")], matchScore: 0 },
      { playerId: "carol", hand: [card("9")], matchScore: 0 },
    ]);
    const result = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "alice",
      cardIds: ["8-clubs"],
      declaredSuit: "spades",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.currentSuit).toBe("spades");
    expect(result.state.round.currentPlayerIndex).toBe(1); // bob
    expect(result.state.round.suitLockedPlayerId).toBe("bob");
    expect(result.events).toContainEqual({ type: "SUIT_DECLARED", playerId: "alice", suit: "spades" });
  });

  it("a locked player's wild is still a legal play, but the declare is suppressed", () => {
    let state = makeMatch([
      { playerId: "alice", hand: [card("8", "clubs"), card("3", "clubs")], matchScore: 0 },
      { playerId: "bob", hand: [card("J", "hearts"), card("3", "hearts")], matchScore: 0 },
      { playerId: "carol", hand: [card("9")], matchScore: 0 },
    ]);
    const locked = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "alice",
      cardIds: ["8-clubs"],
      declaredSuit: "spades",
    });
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    state = locked.state;

    // Bob is now locked. He plays J-hearts and tries to declare diamonds -- should be legal,
    // but the suit stays spades (only the rank updates to J), and no SUIT_DECLARED fires.
    const suppressed = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "bob",
      cardIds: ["J-hearts"],
      declaredSuit: "diamonds",
    });
    expect(suppressed.ok).toBe(true);
    if (!suppressed.ok) return;
    expect(suppressed.state.round.currentSuit).toBe("spades");
    expect(suppressed.state.round.currentRank).toBe("J");
    expect(suppressed.events).not.toContainEqual(
      expect.objectContaining({ type: "SUIT_DECLARED" }),
    );

    // The lock is spent -- it's carol's turn now, and she is NOT locked (a suppressed wild
    // does not chain the lock forward).
    expect(suppressed.state.round.currentPlayerIndex).toBe(2); // carol
    expect(suppressed.state.round.suitLockedPlayerId).toBeUndefined();
  });

  it("an unlocked player can freely declare, establishing a fresh lock for whoever is next", () => {
    let state = makeMatch(
      [
        { playerId: "alice", hand: [card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("3", "hearts")], matchScore: 0 },
        { playerId: "carol", hand: [card("8", "spades"), card("9")], matchScore: 0 },
      ],
      { currentPlayerIndex: 2, currentSuit: "spades", currentRank: "K" },
    );
    // Carol is not locked -- her wild declare should succeed normally.
    const result = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "carol",
      cardIds: ["8-spades"],
      declaredSuit: "hearts",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.currentSuit).toBe("hearts");
    expect(result.state.round.currentPlayerIndex).toBe(0); // alice (wraps around)
    expect(result.state.round.suitLockedPlayerId).toBe("alice");
  });

  it("the lock clears even if the locked player plays a normal (non-wild) card", () => {
    let state = makeMatch([
      { playerId: "alice", hand: [card("8", "clubs"), card("3", "clubs")], matchScore: 0 },
      { playerId: "bob", hand: [card("K", "spades"), card("3", "hearts")], matchScore: 0 },
      { playerId: "carol", hand: [card("9")], matchScore: 0 },
    ]);
    const locked = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "alice",
      cardIds: ["8-clubs"],
      declaredSuit: "spades",
    });
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    state = locked.state;

    // Bob plays a plain spade card instead of a wild -- his turn still ends the lock.
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "bob", cardIds: ["K-spades"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.suitLockedPlayerId).toBeUndefined();
  });

  it("the lock clears even if the locked player just draws and declines", () => {
    let state = makeMatch(
      [
        { playerId: "alice", hand: [card("8", "clubs"), card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("3", "hearts")], matchScore: 0 },
        { playerId: "carol", hand: [card("9")], matchScore: 0 },
      ],
      { drawPile: [card("4", "clubs")] },
    );
    const locked = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "alice",
      cardIds: ["8-clubs"],
      declaredSuit: "spades",
    });
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    state = locked.state;

    const drew = applyMove(state, { type: "DRAW_CARD", playerId: "bob" });
    expect(drew.ok).toBe(true);
    if (!drew.ok) return;
    state = drew.state;

    const declined = applyMove(state, { type: "DRAW_CARD", playerId: "bob" });
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(declined.state.round.currentPlayerIndex).toBe(2); // carol
    expect(declined.state.round.suitLockedPlayerId).toBeUndefined();
  });
});

describe("applyMove — 5 skip", () => {
  it("skips the next player and moves to the one after", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("5", "hearts"), card("3", "clubs")], matchScore: 0 },
      { playerId: "bob", hand: [card("9")], matchScore: 0 },
      { playerId: "carol", hand: [card("9")], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["5-hearts"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.currentPlayerIndex).toBe(2); // bob (index 1) is skipped
    expect(result.events).toContainEqual({ type: "PLAYER_SKIPPED", playerId: "bob" });
  });
});

describe("applyMove — draw-stack chaining end to end", () => {
  it("opens a stack with a 2, extends with an Ace of Spades via 2 of Spades, then absorbs", () => {
    let state = makeMatch(
      [
        { playerId: "alice", hand: [card("2", "spades"), card("3", "diamonds")], matchScore: 0 },
        { playerId: "bob", hand: [card("A", "spades"), card("4", "diamonds")], matchScore: 0 },
        { playerId: "carol", hand: [card("9", "clubs")], matchScore: 0 },
      ],
      {
        currentSuit: "spades",
        currentRank: "K",
        // 5 in the draw pile + 2 reshuffleable from the discard pile (everything but the
        // eventual top card) = 7 available, exactly matching the accumulated stack below.
        drawPile: [
          card("3", "clubs"),
          card("4", "clubs"),
          card("5", "clubs"),
          card("6", "clubs"),
          card("7", "diamonds"),
        ],
      },
    );

    const opened = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["2-spades"] });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.round.phase).toBe("AWAITING_STACK_RESPONSE");
    expect(opened.state.round.pendingStack).toEqual({ topCard: card("2", "spades"), accumulated: 2 });
    expect(opened.state.round.currentPlayerIndex).toBe(1);
    state = opened.state;

    const extended = applyMove(state, { type: "RESOLVE_STACK", playerId: "bob", cardId: "A-spades" });
    expect(extended.ok).toBe(true);
    if (!extended.ok) return;
    expect(extended.state.round.pendingStack).toEqual({ topCard: card("A", "spades"), accumulated: 7 });
    expect(extended.state.round.currentPlayerIndex).toBe(2);
    state = extended.state;

    const absorbed = applyMove(state, { type: "RESOLVE_STACK", playerId: "carol" });
    expect(absorbed.ok).toBe(true);
    if (!absorbed.ok) return;
    expect(absorbed.state.players[2]!.hand).toHaveLength(1 + 7); // original 9-clubs + 7 drawn
    expect(absorbed.state.round.phase).toBe("AWAITING_PLAY");
    expect(absorbed.state.round.pendingStack).toBeUndefined();
    // R-14: absorbing does NOT end the turn -- it's still carol's turn afterward.
    expect(absorbed.state.round.currentPlayerIndex).toBe(2);
    expect(absorbed.events).toContainEqual({ type: "STACK_ABSORBED", playerId: "carol", drawnCount: 7 });
  });

  it("R-23 (overridden): absorbing keeps drawing from a fresh deck instead of stopping early", () => {
    const state = makeMatch(
      [{ playerId: "alice", hand: [], matchScore: 0 }],
      {
        phase: "AWAITING_STACK_RESPONSE",
        pendingStack: { topCard: card("2", "spades"), accumulated: 5 },
        drawPile: [card("3", "clubs")],
        discardPile: [card("K", "hearts")], // only the top card -- nothing reshuffleable
        decksInPlay: 1,
      },
    );

    const absorbed = applyMove(state, { type: "RESOLVE_STACK", playerId: "alice" });
    expect(absorbed.ok).toBe(true);
    if (!absorbed.ok) return;
    // 1 card from the original draw pile + 4 more from the fresh deck shuffled in partway through.
    expect(absorbed.state.players[0]!.hand).toHaveLength(5);
    expect(absorbed.events).toContainEqual({ type: "STACK_ABSORBED", playerId: "alice", drawnCount: 5 });
    expect(absorbed.events).toContainEqual({ type: "FRESH_DECK_ADDED_TO_DRAW_PILE", cardCount: 52 });
    expect(absorbed.state.round.decksInPlay).toBe(2);
    expect(absorbed.state.round.drawPile).toHaveLength(52 - 4); // 4 of the 5 draws came from the fresh deck
    expect(absorbed.state.round.discardPile).toEqual([card("K", "hearts")]);
  });

  it("R-14: after absorbing, the same player keeps their turn and can play normally", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("2", "spades")], matchScore: 0 },
        { playerId: "bob", hand: [card("K", "hearts")], matchScore: 0 },
      ],
      {
        phase: "AWAITING_STACK_RESPONSE",
        pendingStack: { topCard: card("2", "hearts"), accumulated: 2 },
        currentPlayerIndex: 1,
        drawPile: [card("Q", "hearts"), card("3", "clubs")],
      },
    );
    const absorbed = applyMove(state, { type: "RESOLVE_STACK", playerId: "bob" });
    expect(absorbed.ok).toBe(true);
    if (!absorbed.ok) return;
    expect(absorbed.state.round.currentPlayerIndex).toBe(1); // still bob
    expect(absorbed.state.round.phase).toBe("AWAITING_PLAY");

    // bob can now play a legal card from his (now 3-card) hand in the same turn.
    const played = applyMove(absorbed.state, {
      type: "PLAY_CARDS",
      playerId: "bob",
      cardIds: ["Q-hearts"],
    });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.round.currentPlayerIndex).toBe(0); // now advances to alice as normal
  });

  it("R-14a: a fresh stack opened right after absorbing starts from scratch, not continuing the old one", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("K", "spades")], matchScore: 0 },
        { playerId: "bob", hand: [card("2", "spades")], matchScore: 0 },
      ],
      {
        phase: "AWAITING_STACK_RESPONSE",
        pendingStack: { topCard: card("2", "spades"), accumulated: 6 }, // e.g. three 2s stacked
        currentPlayerIndex: 1,
        currentSuit: "spades",
        currentRank: "2",
        drawPile: [card("3", "clubs"), card("4", "clubs"), card("5", "clubs"), card("6", "clubs"), card("7", "clubs"), card("9", "clubs")],
      },
    );
    const absorbed = applyMove(state, { type: "RESOLVE_STACK", playerId: "bob" });
    expect(absorbed.ok).toBe(true);
    if (!absorbed.ok) return;
    expect(absorbed.state.players[1]!.hand).toHaveLength(1 + 6); // original 2-spades + 6 drawn

    // Bob's original 2 of spades still matches (suit spades, rank 2) -- playing it now opens a
    // BRAND NEW stack at +2, not a continuation of the absorbed one.
    const reopened = applyMove(absorbed.state, {
      type: "PLAY_CARDS",
      playerId: "bob",
      cardIds: ["2-spades"],
    });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.state.round.phase).toBe("AWAITING_STACK_RESPONSE");
    expect(reopened.state.round.pendingStack).toEqual({ topCard: card("2", "spades"), accumulated: 2 });
  });

  it("rejects a plain 2 trying to extend a stack topped by Ace of Spades", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("2", "hearts")], matchScore: 0 },
        { playerId: "bob", hand: [], matchScore: 0 },
      ],
      { phase: "AWAITING_STACK_RESPONSE", pendingStack: { topCard: card("A", "spades"), accumulated: 5 } },
    );
    const result = applyMove(state, { type: "RESOLVE_STACK", playerId: "alice", cardId: "2-hearts" });
    expect(result).toEqual({
      ok: false,
      error: { code: "CANNOT_EXTEND_STACK", message: expect.any(String) },
    });
  });

  it("rejects an empty-string cardId instead of silently treating it as absorb", () => {
    // Regression test: `if (command.cardId)` used to treat '' the same as undefined, silently
    // reinterpreting a malformed extend attempt as "absorb the whole stack."
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("2", "hearts")], matchScore: 0 },
        { playerId: "bob", hand: [], matchScore: 0 },
      ],
      { phase: "AWAITING_STACK_RESPONSE", pendingStack: { topCard: card("2", "clubs"), accumulated: 2 } },
    );
    const result = applyMove(state, { type: "RESOLVE_STACK", playerId: "alice", cardId: "" });
    expect(result).toEqual({
      ok: false,
      error: { code: "CARD_NOT_IN_HAND", message: expect.any(String) },
    });
  });
});

describe("applyMove — seven reverse-or-dump", () => {
  it("R-16: a lone 7 reverses direction and becomes the new active suit", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("7", "spades"), card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
        { playerId: "carol", hand: [card("9")], matchScore: 0 },
      ],
      { currentSuit: "hearts", currentRank: "7", direction: 1 },
    );
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["7-spades"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.direction).toBe(-1);
    expect(result.state.round.currentSuit).toBe("spades");
    // direction reversed, so from seat 0 the next seat counter-clockwise is seat 2 (carol).
    expect(result.state.round.currentPlayerIndex).toBe(2);
    expect(result.events).toContainEqual({ type: "DIRECTION_REVERSED" });
  });

  it("R-17: a suit-matching 7 dumps attached cards without reversing", () => {
    const state = makeMatch(
      [
        {
          playerId: "alice",
          hand: [card("7", "hearts"), card("K", "hearts"), card("3", "clubs")],
          matchScore: 0,
        },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { currentSuit: "hearts", currentRank: "K" },
    );
    const result = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "alice",
      cardIds: ["7-hearts", "K-hearts"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.direction).toBe(1);
    expect(result.state.round.currentSuit).toBe("hearts");
    expect(result.state.round.currentRank).toBe("7");
    expect(result.state.players[0]!.hand).toEqual([card("3", "clubs")]);
    expect(result.state.round.discardPile.at(-1)).toEqual(card("7", "hearts"));
  });

  it("R-17: a rank-only-matching 7 cannot carry a dump", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("7", "spades"), card("K", "spades")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { currentSuit: "hearts", currentRank: "7" },
    );
    const result = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "alice",
      cardIds: ["7-spades", "K-spades"],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "SEVEN_RANK_MATCH_CANNOT_DUMP", message: expect.any(String) },
    });
  });
});

describe("applyMove — round end and scoring", () => {
  it("R-24/R-25: emptying your hand ends the round and scores everyone else", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("K", "spades")], matchScore: 0 },
        { playerId: "bob", hand: [card("K", "hearts"), card("A", "spades")], matchScore: 10 },
      ],
      {},
      { handSize: 1 },
    );
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["K-spades"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toContainEqual({
      type: "ROUND_ENDED",
      winnerPlayerId: "alice",
      scores: { alice: 0, bob: 60 },
    });
    // bob: K (10) + Ace of Spades (50) = 60, added to his existing 10 -> 70.
    expect(result.state.players.find((p) => p.playerId === "bob")!.matchScore).toBe(70);
    // R-26 (revised): the round always PAUSES here rather than auto-dealing -- the next round
    // only deals on an explicit START_NEXT_ROUND command.
    expect(result.state.matchStatus).toBe("IN_PROGRESS");
    expect(result.state.round.phase).toBe("ROUND_SCORING");
    expect(result.state.players[0]!.hand).toHaveLength(0);
    expect(result.state.players[1]!.hand).toHaveLength(2);
    expect(result.state.roundStarterIndex).toBe(0);
    // R-24: the round winner's roundsWon tally goes up; nobody else's does.
    expect(result.state.players.find((p) => p.playerId === "alice")!.roundsWon).toBe(1);
    expect(result.state.players.find((p) => p.playerId === "bob")!.roundsWon).toBe(0);
  });

  it("clears pendingStack (not just phase) when a stack-extend empties the hand", () => {
    // Regression test: finishRound used to only set phase to ROUND_SCORING, leaving whatever
    // pendingStack the extend branch had just set moments earlier still attached to a round
    // that's supposedly paused.
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("2", "hearts")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      {
        phase: "AWAITING_STACK_RESPONSE",
        pendingStack: { topCard: card("2", "clubs"), accumulated: 2 },
      },
    );
    const result = applyMove(state, { type: "RESOLVE_STACK", playerId: "alice", cardId: "2-hearts" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.phase).toBe("ROUND_SCORING");
    expect(result.state.round.pendingStack).toBeUndefined();
  });

  it("R-27 (revised): there is no target score -- the match keeps going no matter how high scores get", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("K", "spades")], matchScore: 0 },
      { playerId: "bob", hand: [card("Q", "clubs")], matchScore: 9000 },
    ]);
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["K-spades"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.matchStatus).toBe("IN_PROGRESS");
    expect(result.state.round.phase).toBe("ROUND_SCORING");
    expect(result.events.some((e) => e.type === "MATCH_ENDED")).toBe(false);
  });

  it("rejects any further moves once the match has ended", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("K", "spades")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      {},
      { matchStatus: "MATCH_END" },
    );
    const result = applyMove(state, { type: "PLAY_CARDS", playerId: "alice", cardIds: ["K-spades"] });
    expect(result).toEqual({ ok: false, error: { code: "MATCH_ENDED", message: expect.any(String) } });
  });
});

describe("applyMove — round-end pause: START_NEXT_ROUND / END_MATCH_EARLY", () => {
  function pausedState() {
    return makeMatch(
      [
        { playerId: "alice", hand: [], matchScore: 0 },
        { playerId: "bob", hand: [card("K", "hearts")], matchScore: 60 },
      ],
      { phase: "ROUND_SCORING" },
      { roundStarterIndex: 0 },
    );
  }

  it("START_NEXT_ROUND is rejected outside the round-scoring pause", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("K", "hearts")], matchScore: 0 },
      { playerId: "bob", hand: [card("9")], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "START_NEXT_ROUND", playerId: "alice" });
    expect(result).toEqual({ ok: false, error: { code: "WRONG_PHASE", message: expect.any(String) } });
  });

  it("START_NEXT_ROUND deals a fresh round and rotates the starter seat, regardless of whose turn it was", () => {
    const state = pausedState();
    // Neither player is "up" during the pause -- bob (seat 1) can still continue the match.
    const result = applyMove(state, { type: "START_NEXT_ROUND", playerId: "bob" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.round.phase).toBe("AWAITING_PLAY");
    expect(result.state.roundStarterIndex).toBe(1);
    expect(result.state.round.currentPlayerIndex).toBe(1);
    for (const player of result.state.players) {
      expect(player.hand).toHaveLength(state.handSize);
    }
    expect(result.events).toContainEqual({ type: "NEXT_ROUND_STARTED" });
  });

  it("rejects a command from a playerId that isn't seated in the match", () => {
    const state = pausedState();
    const result = applyMove(state, { type: "START_NEXT_ROUND", playerId: "not-a-real-player" });
    expect(result).toEqual({ ok: false, error: { code: "NOT_SEATED", message: expect.any(String) } });
  });

  it("END_MATCH_EARLY is rejected outside the round-scoring pause", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("K", "hearts")], matchScore: 0 },
      { playerId: "bob", hand: [card("9")], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "END_MATCH_EARLY", playerId: "alice" });
    expect(result).toEqual({ ok: false, error: { code: "WRONG_PHASE", message: expect.any(String) } });
  });

  it("END_MATCH_EARLY ends the match using current standings, lowest score wins", () => {
    const state = pausedState(); // alice: 0 pts, bob: 60 pts
    const result = applyMove(state, { type: "END_MATCH_EARLY", playerId: "alice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.matchStatus).toBe("MATCH_END");
    expect(result.events).toContainEqual({
      type: "MATCH_ENDED",
      winnerPlayerId: "alice",
      finalScores: { alice: 0, bob: 60 },
    });
  });
});

describe("applyMove — ABANDON_MATCH", () => {
  it("ends the match regardless of phase or whose turn it is", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("K", "hearts")], matchScore: 20 },
      { playerId: "bob", hand: [card("9")], matchScore: 5 },
    ]); // currentPlayerIndex defaults to 0 (alice) -- bob abandons anyway.
    const result = applyMove(state, { type: "ABANDON_MATCH", playerId: "bob" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.matchStatus).toBe("MATCH_END");
    expect(result.events).toContainEqual({
      type: "MATCH_ABANDONED",
      playerId: "bob",
      winnerPlayerId: "bob", // lowest current score (5) wins
      finalScores: { alice: 20, bob: 5 },
    });
  });

  it("works even mid-stack-response, not just during a normal turn", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("2", "hearts")], matchScore: 0 },
        { playerId: "bob", hand: [], matchScore: 0 },
      ],
      { phase: "AWAITING_STACK_RESPONSE", pendingStack: { topCard: card("2", "hearts"), accumulated: 2 } },
    );
    const result = applyMove(state, { type: "ABANDON_MATCH", playerId: "alice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.matchStatus).toBe("MATCH_END");
  });

  it("rejects a command from a playerId that isn't seated in the match", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("K", "hearts")], matchScore: 0 },
      { playerId: "bob", hand: [card("9")], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "ABANDON_MATCH", playerId: "carol" });
    expect(result).toEqual({ ok: false, error: { code: "NOT_SEATED", message: expect.any(String) } });
  });
});

describe("applyMove — draw, then choose to play or skip", () => {
  it("draws a card, adds it to hand, and keeps the same player up to decide next", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { drawPile: [card("Q", "diamonds")] },
    );
    const result = applyMove(state, { type: "DRAW_CARD", playerId: "alice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0]!.hand).toEqual([card("3", "clubs"), card("Q", "diamonds")]);
    expect(result.state.round.currentPlayerIndex).toBe(0); // still alice's turn
    expect(result.state.round.hasDrawnThisTurn).toBe(true);
    expect(result.events).toContainEqual({
      type: "CARD_DRAWN",
      playerId: "alice",
      card: card("Q", "diamonds"),
    });
  });

  it("allows drawing even when the player already holds a legal play", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("K", "hearts")], matchScore: 0 }, // K-hearts already matches
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { drawPile: [card("Q", "diamonds")] },
    );
    const result = applyMove(state, { type: "DRAW_CARD", playerId: "alice" });
    expect(result.ok).toBe(true);
  });

  it("a second DRAW_CARD in the same turn skips without drawing again", () => {
    let state = makeMatch(
      [
        { playerId: "alice", hand: [card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { drawPile: [card("Q", "diamonds"), card("J", "diamonds")] },
    );
    const drew = applyMove(state, { type: "DRAW_CARD", playerId: "alice" });
    expect(drew.ok).toBe(true);
    if (!drew.ok) return;
    state = drew.state;

    const skipped = applyMove(state, { type: "DRAW_CARD", playerId: "alice" });
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.state.round.currentPlayerIndex).toBe(1);
    expect(skipped.state.round.hasDrawnThisTurn).toBeUndefined();
    // only one card was ever drawn -- the "skip" didn't draw the J of diamonds too.
    expect(skipped.state.players[0]!.hand).toEqual([card("3", "clubs"), card("Q", "diamonds")]);
    expect(skipped.events).toEqual([]);
  });

  it("can play a card immediately after drawing, which then advances the turn normally", () => {
    let state = makeMatch(
      [
        { playerId: "alice", hand: [card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { drawPile: [card("Q", "hearts")] }, // matches the default active suit (hearts)
    );
    const drew = applyMove(state, { type: "DRAW_CARD", playerId: "alice" });
    expect(drew.ok).toBe(true);
    if (!drew.ok) return;
    state = drew.state;

    const played = applyMove(state, {
      type: "PLAY_CARDS",
      playerId: "alice",
      cardIds: ["Q-hearts"],
    });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.round.currentPlayerIndex).toBe(1);
    expect(played.state.round.hasDrawnThisTurn).toBeUndefined();
    expect(played.state.players[0]!.hand).toEqual([card("3", "clubs")]);
  });

  it("R-23 (overridden): draws from a freshly shuffled deck instead of passing when nothing is left", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { drawPile: [], discardPile: [card("K", "hearts")] }, // only the top card remains, unreshuffleable
    );
    const result = applyMove(state, { type: "DRAW_CARD", playerId: "alice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0]!.hand).toHaveLength(2); // original 3-clubs + 1 freshly drawn
    expect(result.state.round.drawPile).toHaveLength(51); // 52 fresh minus the one just drawn
    expect(result.state.round.discardPile).toEqual([card("K", "hearts")]);
    expect(result.state.round.decksInPlay).toBe(2);
    expect(result.state.round.currentPlayerIndex).toBe(0);
    expect(result.state.round.hasDrawnThisTurn).toBe(true);
    expect(result.events).toContainEqual({ type: "FRESH_DECK_ADDED_TO_DRAW_PILE", cardCount: 52 });
    expect(result.events.some((e) => e.type === "CARD_DRAWN")).toBe(true);
  });
});

describe("applyMove — TIMEOUT (server-only)", () => {
  it("force-draws a card during AWAITING_PLAY and marks it with PLAYER_TIMED_OUT", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { drawPile: [card("Q", "hearts")] },
    );
    const result = applyMove(state, { type: "TIMEOUT", playerId: "alice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([
      { type: "PLAYER_TIMED_OUT", playerId: "alice" },
      { type: "CARD_DRAWN", playerId: "alice", card: card("Q", "hearts") },
    ]);
    expect(result.state.players[0]!.hand).toEqual([card("3", "clubs"), card("Q", "hearts")]);
    expect(result.state.round.hasDrawnThisTurn).toBe(true);
    expect(result.state.round.currentPlayerIndex).toBe(0); // still alice's follow-up decision
  });

  it("declines the R-4 follow-up and passes the turn if the player already drew this turn", () => {
    const state = makeMatch(
      [
        { playerId: "alice", hand: [card("3", "clubs")], matchScore: 0 },
        { playerId: "bob", hand: [card("9")], matchScore: 0 },
      ],
      { drawPile: [card("Q", "hearts")], hasDrawnThisTurn: true },
    );
    const result = applyMove(state, { type: "TIMEOUT", playerId: "alice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([{ type: "PLAYER_TIMED_OUT", playerId: "alice" }]);
    expect(result.state.players[0]!.hand).toEqual([card("3", "clubs")]); // no card drawn
    expect(result.state.round.currentPlayerIndex).toBe(1); // turn passed to bob
    expect(result.state.round.hasDrawnThisTurn).toBeUndefined();
  });

  it("absorbs the pending draw-stack during AWAITING_STACK_RESPONSE", () => {
    const state = makeMatch(
      [{ playerId: "alice", hand: [], matchScore: 0 }],
      {
        phase: "AWAITING_STACK_RESPONSE",
        pendingStack: { topCard: card("2", "spades"), accumulated: 2 },
        drawPile: [card("3", "clubs"), card("4", "clubs")],
      },
    );
    const result = applyMove(state, { type: "TIMEOUT", playerId: "alice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toContainEqual({ type: "PLAYER_TIMED_OUT", playerId: "alice" });
    expect(result.events).toContainEqual({ type: "STACK_ABSORBED", playerId: "alice", drawnCount: 2 });
    expect(result.state.players[0]!.hand).toHaveLength(2);
    expect(result.state.round.phase).toBe("AWAITING_PLAY");
  });

  it("is turn-gated -- rejects a mismatched playerId with NOT_YOUR_TURN", () => {
    const state = makeMatch([
      { playerId: "alice", hand: [card("3", "clubs")], matchScore: 0 },
      { playerId: "bob", hand: [card("9")], matchScore: 0 },
    ]);
    const result = applyMove(state, { type: "TIMEOUT", playerId: "bob" });
    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_YOUR_TURN", message: "It is not this player's turn." },
    });
  });
});

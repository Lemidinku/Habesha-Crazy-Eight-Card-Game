import { dealNewRound } from "./deck.js";
import { drawOneCard } from "./drawPile.js";
import { resolvePlayEffect } from "./effects.js";
import { DEFAULT_PENALTY_TABLE, forceMatchEnd, scoreRound, updateLeaderRoundCounts } from "./scoring.js";
import { extendsStack } from "./stacking.js";
import { nextPlayerIndex, reverseDirection } from "./turn.js";
import type {
  ApplyMoveResult,
  Card,
  Command,
  DomainEvent,
  EngineError,
  MatchState,
  PenaltyTable,
  PlayerState,
  RoundState,
} from "./types.js";

function err(code: string, message: string): ApplyMoveResult {
  return { ok: false, error: { code, message } };
}

function isEngineError<T>(value: T | EngineError): value is EngineError {
  return typeof value === "object" && value !== null && "code" in value;
}

function resolveCards(hand: Card[], cardIds: string[]): Card[] | EngineError {
  if (cardIds.length === 0) {
    return { code: "NO_CARDS", message: "Must specify at least one card." };
  }
  const cards: Card[] = [];
  const usedIds = new Set<string>();
  for (const id of cardIds) {
    if (usedIds.has(id)) {
      return { code: "DUPLICATE_CARD", message: `Card ${id} was specified more than once.` };
    }
    const found = hand.find((c) => c.id === id);
    if (!found) {
      return { code: "CARD_NOT_IN_HAND", message: `Card ${id} is not in this player's hand.` };
    }
    cards.push(found);
    usedIds.add(id);
  }
  return cards;
}

function removeCardsFromHand(hand: Card[], cards: Card[]): Card[] {
  const idsToRemove = new Set(cards.map((c) => c.id));
  return hand.filter((c) => !idsToRemove.has(c.id));
}

/** R-18: the reference card (cards[0], which may be a 7 leading a dump) must end up last in
 * the discard pile so drawPile.ts's "last element is the top card" invariant holds. */
function discardAppendOrder(cards: Card[]): Card[] {
  if (cards.length > 1) {
    const [lead, ...rest] = cards;
    return [...rest, lead!];
  }
  return cards;
}

export interface CreateMatchOptions {
  handSize?: number;
  penaltyTable?: PenaltyTable;
  rng?: () => number;
}

/** Builds a fresh match: deals the opening round for R-1-R-3 and sets defaults for the
 * host-configurable options from SRS.md Assumptions A-3/A-4. There's no target score anymore --
 * rounds deal forever, tracking cumulative score and roundsWon, until a player explicitly ends
 * or abandons the match (R-27, revised). */
export function createMatch(playerIds: string[], options: CreateMatchOptions = {}): MatchState {
  const handSize = options.handSize ?? 7;
  const penaltyTable = options.penaltyTable ?? DEFAULT_PENALTY_TABLE;
  const rng = options.rng ?? Math.random;

  const { hands, round } = dealNewRound(playerIds.length, handSize, 0, rng);
  const players: PlayerState[] = playerIds.map((playerId, index) => ({
    playerId,
    hand: hands[index]!,
    matchScore: 0,
    roundsWon: 0,
  }));

  return {
    players,
    round,
    handSize,
    roundStarterIndex: 0,
    penaltyTable,
    leaderRoundCounts: {},
    matchStatus: "IN_PROGRESS",
  };
}

export interface ApplyMoveOptions {
  rng?: () => number;
}

/** The single mutation entry point (Command pattern, DESIGN.md §3.2): validates `command`
 * against the current phase-gated state and returns either the new state plus the events it
 * produced, or a rejection -- never throws for an expected rule violation. */
export function applyMove(
  state: MatchState,
  command: Command,
  options: ApplyMoveOptions = {},
): ApplyMoveResult {
  const rng = options.rng ?? Math.random;

  if (state.matchStatus !== "IN_PROGRESS") {
    return err("MATCH_ENDED", "This match has already ended.");
  }

  // These three are never turn-gated: nobody is "up" during the round-end pause, and abandoning
  // must work regardless of whose turn it is. Host-only enforcement for START_NEXT_ROUND/
  // END_MATCH_EARLY happens at the RoomService layer -- the engine only knows seated players.
  if (
    command.type === "ABANDON_MATCH" ||
    command.type === "START_NEXT_ROUND" ||
    command.type === "END_MATCH_EARLY"
  ) {
    if (!state.players.some((p) => p.playerId === command.playerId)) {
      return err("NOT_SEATED", "This player is not part of the match.");
    }
    switch (command.type) {
      case "ABANDON_MATCH":
        return handleAbandonMatch(state, command);
      case "START_NEXT_ROUND":
        return handleStartNextRound(state, command, rng);
      case "END_MATCH_EARLY":
        return handleEndMatchEarly(state, command);
    }
  }

  const currentPlayer = state.players[state.round.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.playerId !== command.playerId) {
    return err("NOT_YOUR_TURN", "It is not this player's turn.");
  }

  switch (command.type) {
    case "PLAY_CARDS":
      return handlePlayCards(state, command);
    case "DRAW_CARD":
      return handleDrawCard(state, command, rng);
    case "RESOLVE_STACK":
      return handleResolveStack(state, command, rng);
    case "TIMEOUT":
      return handleTimeout(state, command, rng);
    default: {
      // TypeScript considers Command exhaustive above, so this looks unreachable -- but
      // `command` crosses a network/JSON boundary before it ever reaches applyMove (see
      // RoomGateway's 'command' handler), so an unrecognized `type` from a malformed or
      // malicious client is a real runtime possibility, not just a type-checker formality.
      // Must return a proper error, not fall through and implicitly return undefined --
      // every caller does `if (!result.ok)` unconditionally.
      const unrecognized = command as { type: string };
      return err("UNKNOWN_COMMAND", `Unrecognized command type: ${unrecognized.type}`);
    }
  }
}

function handlePlayCards(
  state: MatchState,
  command: Extract<Command, { type: "PLAY_CARDS" }>,
): ApplyMoveResult {
  if (state.round.phase !== "AWAITING_PLAY") {
    return err("WRONG_PHASE", "Cannot play cards right now -- a draw-stack response is pending.");
  }

  const playerIndex = state.round.currentPlayerIndex;
  const player = state.players[playerIndex]!;
  const cardsOrError = resolveCards(player.hand, command.cardIds);
  if (isEngineError(cardsOrError)) return { ok: false, error: cardsOrError };
  const cards = cardsOrError;

  // R-5a: is this player currently locked out of a wild's suit-declaring power?
  const isSuitLocked = state.round.suitLockedPlayerId === player.playerId;

  const effect = resolvePlayEffect({
    cards,
    round: state.round,
    declaredSuit: command.declaredSuit,
    isSuitLocked,
  });
  if (isEngineError(effect)) return { ok: false, error: effect };

  const events: DomainEvent[] = [{ type: "CARDS_PLAYED", playerId: player.playerId, cards }];
  if (effect.suitDeclared) {
    events.push({ type: "SUIT_DECLARED", playerId: player.playerId, suit: effect.newSuit });
  }

  const updatedHand = removeCardsFromHand(player.hand, cards);
  const updatedPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, hand: updatedHand } : p,
  );
  const discardPile = [...state.round.discardPile, ...discardAppendOrder(cards)];
  const playerCount = state.players.length;

  const baseRound: RoundState = {
    ...state.round,
    discardPile,
    currentSuit: effect.newSuit,
    currentRank: effect.newRank,
    // R-4: this play resolves (or supersedes) any pending post-draw follow-up opportunity.
    hasDrawnThisTurn: undefined,
    // R-5a: cleared by default -- only a genuine (non-suppressed) wild declare re-establishes
    // it below, for the next player specifically. Every other play (or a suppressed wild)
    // ends this player's lock without renewing it for anyone.
    suitLockedPlayerId: undefined,
  };

  // R-24: the round ends the instant a player empties their hand, even mid-effect.
  if (updatedHand.length === 0) {
    return finishRound({ ...state, players: updatedPlayers, round: baseRound }, player.playerId, events);
  }

  let round: RoundState;
  if (effect.opensStack !== undefined) {
    round = {
      ...baseRound,
      phase: "AWAITING_STACK_RESPONSE",
      pendingStack: { topCard: cards[0]!, accumulated: effect.opensStack },
      currentPlayerIndex: nextPlayerIndex(playerIndex, playerCount, baseRound.direction),
    };
  } else if (effect.skipsNext) {
    const skippedIndex = nextPlayerIndex(playerIndex, playerCount, baseRound.direction);
    events.push({ type: "PLAYER_SKIPPED", playerId: state.players[skippedIndex]!.playerId });
    round = {
      ...baseRound,
      currentPlayerIndex: nextPlayerIndex(playerIndex, playerCount, baseRound.direction, true),
    };
  } else if (effect.reversesDirection) {
    const direction = reverseDirection(baseRound.direction);
    events.push({ type: "DIRECTION_REVERSED" });
    round = { ...baseRound, direction, currentPlayerIndex: nextPlayerIndex(playerIndex, playerCount, direction) };
  } else {
    const nextIndex = nextPlayerIndex(playerIndex, playerCount, baseRound.direction);
    round = {
      ...baseRound,
      currentPlayerIndex: nextIndex,
      // R-5a: a genuine wild declare locks the very next player for their upcoming turn.
      suitLockedPlayerId: effect.suitDeclared ? state.players[nextIndex]!.playerId : undefined,
    };
  }

  return { ok: true, state: { ...state, players: updatedPlayers, round }, events };
}

function handleDrawCard(
  state: MatchState,
  command: Extract<Command, { type: "DRAW_CARD" }>,
  rng: () => number,
): ApplyMoveResult {
  if (state.round.phase !== "AWAITING_PLAY") {
    return err("WRONG_PHASE", "Cannot draw right now -- a draw-stack response is pending.");
  }

  const playerIndex = state.round.currentPlayerIndex;
  const player = state.players[playerIndex]!;
  const playerCount = state.players.length;
  const events: DomainEvent[] = [];

  // Drawing is always voluntary -- allowed even with a legal play already in hand, not just
  // when forced. A second DRAW_CARD in the same turn means "I'm done, skip," ending the turn
  // without drawing again.
  if (state.round.hasDrawnThisTurn) {
    const round: RoundState = {
      ...state.round,
      hasDrawnThisTurn: undefined,
      currentPlayerIndex: nextPlayerIndex(playerIndex, playerCount, state.round.direction),
      // R-5a: this player's turn is ending (via decline) -- their lock (if any) is spent.
      suitLockedPlayerId: undefined,
    };
    return { ok: true, state: { ...state, round }, events };
  }

  const drawResult = drawOneCard(state.round.drawPile, state.round.discardPile, state.round.decksInPlay, rng);

  if (drawResult.reshuffled) {
    events.push({
      type: "DISCARD_RESHUFFLED_INTO_DRAW_PILE",
      cardCount: drawResult.drawPile.length + 1,
    });
  }
  if (drawResult.freshDeckAdded) {
    events.push({
      type: "FRESH_DECK_ADDED_TO_DRAW_PILE",
      cardCount: drawResult.drawPile.length + 1,
    });
  }
  events.push({ type: "CARD_DRAWN", playerId: player.playerId, card: drawResult.card });

  const updatedPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, hand: [...p.hand, drawResult.card] } : p,
  );
  const round: RoundState = {
    ...state.round,
    hasDrawnThisTurn: true,
    drawPile: drawResult.drawPile,
    discardPile: drawResult.discardPile,
    decksInPlay: drawResult.decksInPlay,
  };

  return { ok: true, state: { ...state, players: updatedPlayers, round }, events };
}

/** Server-only fallback for an elapsed turn-timeout (see Command's TIMEOUT doc comment). Pure
 * delegation, not a new rule: AWAITING_STACK_RESPONSE absorbs the pending stack exactly like a
 * real RESOLVE_STACK with no cardId; anything else (AWAITING_PLAY, including the R-4 follow-up
 * window after a forced draw) goes through handleDrawCard exactly like a real DRAW_CARD --
 * which already treats a second draw after hasDrawnThisTurn as "decline, end turn," so a
 * player who times out again after being force-drawn a card auto-declines for free, no extra
 * logic needed here. */
function handleTimeout(
  state: MatchState,
  command: Extract<Command, { type: "TIMEOUT" }>,
  rng: () => number,
): ApplyMoveResult {
  const result =
    state.round.phase === "AWAITING_STACK_RESPONSE"
      ? handleResolveStack(state, { type: "RESOLVE_STACK", playerId: command.playerId }, rng)
      : handleDrawCard(state, { type: "DRAW_CARD", playerId: command.playerId }, rng);

  if (!result.ok) return result;
  return {
    ok: true,
    state: result.state,
    events: [{ type: "PLAYER_TIMED_OUT", playerId: command.playerId }, ...result.events],
  };
}

function handleResolveStack(
  state: MatchState,
  command: Extract<Command, { type: "RESOLVE_STACK" }>,
  rng: () => number,
): ApplyMoveResult {
  if (state.round.phase !== "AWAITING_STACK_RESPONSE" || !state.round.pendingStack) {
    return err("WRONG_PHASE", "There is no pending draw-stack to resolve.");
  }

  const playerIndex = state.round.currentPlayerIndex;
  const player = state.players[playerIndex]!;
  const playerCount = state.players.length;
  const pendingStack = state.round.pendingStack;
  const events: DomainEvent[] = [];

  // A strict undefined-check, not truthiness: cardId: '' means the caller supplied a
  // (malformed) card id, not "no card id" -- it must fall into the extend branch and get
  // rejected by resolveCards (CARD_NOT_IN_HAND), not be silently reinterpreted as an absorb.
  if (command.cardId !== undefined) {
    const cardsOrError = resolveCards(player.hand, [command.cardId]);
    if (isEngineError(cardsOrError)) return { ok: false, error: cardsOrError };
    const card = cardsOrError[0]!;

    const extension = extendsStack(card, pendingStack);
    if (!extension) {
      return err("CANNOT_EXTEND_STACK", "That card cannot extend the pending draw-stack.");
    }

    const newAccumulated = pendingStack.accumulated + extension.addedAmount;
    events.push({ type: "CARDS_PLAYED", playerId: player.playerId, cards: [card] });
    events.push({ type: "STACK_EXTENDED", playerId: player.playerId, card, newAccumulated });

    const updatedHand = removeCardsFromHand(player.hand, [card]);
    const updatedPlayers = state.players.map((p, i) =>
      i === playerIndex ? { ...p, hand: updatedHand } : p,
    );
    const baseRound: RoundState = {
      ...state.round,
      discardPile: [...state.round.discardPile, card],
      currentSuit: card.suit,
      currentRank: card.rank,
      pendingStack: { topCard: card, accumulated: newAccumulated },
      // R-5a: 2s/Ace♠ are never wild, but this player's turn is ending either way -- any lock
      // they held is spent. (In practice this is always already unset by this point, since
      // entering AWAITING_STACK_RESPONSE only ever follows the opener's own turn clearing
      // their own lock -- kept explicit here so that invariant isn't load-bearing.)
      suitLockedPlayerId: undefined,
    };

    if (updatedHand.length === 0) {
      return finishRound({ ...state, players: updatedPlayers, round: baseRound }, player.playerId, events);
    }

    const round: RoundState = {
      ...baseRound,
      currentPlayerIndex: nextPlayerIndex(playerIndex, playerCount, baseRound.direction),
    };
    return { ok: true, state: { ...state, players: updatedPlayers, round }, events };
  }

  // R-14: absorb -- draw the full accumulated count, possibly spanning multiple reshuffles
  // and/or fresh decks (R-23, overridden) -- this loop always completes now.
  let drawPile = state.round.drawPile;
  let discardPile = state.round.discardPile;
  let decksInPlay = state.round.decksInPlay;
  const drawnCards: Card[] = [];
  for (let i = 0; i < pendingStack.accumulated; i++) {
    const drawResult = drawOneCard(drawPile, discardPile, decksInPlay, rng);
    if (drawResult.reshuffled) {
      events.push({
        type: "DISCARD_RESHUFFLED_INTO_DRAW_PILE",
        cardCount: drawResult.drawPile.length + 1,
      });
    }
    if (drawResult.freshDeckAdded) {
      events.push({
        type: "FRESH_DECK_ADDED_TO_DRAW_PILE",
        cardCount: drawResult.drawPile.length + 1,
      });
    }
    drawnCards.push(drawResult.card);
    drawPile = drawResult.drawPile;
    discardPile = drawResult.discardPile;
    decksInPlay = drawResult.decksInPlay;
  }

  events.push({ type: "STACK_ABSORBED", playerId: player.playerId, drawnCount: drawnCards.length });

  const updatedPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, hand: [...p.hand, ...drawnCards] } : p,
  );
  // R-14: absorbing does NOT end the turn -- the same player continues normally (they may play
  // a card, including one just drawn, or draw again per R-4a). currentPlayerIndex deliberately
  // stays put; currentSuit/currentRank are untouched too (still whatever the last stacking card
  // set them to), so a 2/Ace♠ played next opens a brand-new stack from scratch (R-14a) rather
  // than reviving the one that was just paid off.
  const round: RoundState = {
    ...state.round,
    drawPile,
    discardPile,
    decksInPlay,
    phase: "AWAITING_PLAY",
    pendingStack: undefined,
    hasDrawnThisTurn: undefined,
    // R-5a: not currently reachable (every path into AWAITING_STACK_RESPONSE already clears
    // the lock before entry, same as the extend branch above) -- cleared explicitly anyway so
    // that invariant isn't load-bearing here either.
    suitLockedPlayerId: undefined,
  };

  return { ok: true, state: { ...state, players: updatedPlayers, round }, events };
}

/** R-24, R-25: scores the round (and tallies the winner's roundsWon). The round always PAUSES
 * afterward (phase "ROUND_SCORING") rather than dealing the next one automatically -- an
 * explicit START_NEXT_ROUND command is required to continue. There's no automatic match end
 * (R-27, revised): scores and roundsWon just keep accumulating round after round until a player
 * explicitly ends or abandons the match (leaderRoundCounts is still tracked here purely so that
 * a later manual end has R-29 tie-break data available). */
function finishRound(state: MatchState, winnerPlayerId: string, events: DomainEvent[]): ApplyMoveResult {
  const { updatedPlayers, scores } = scoreRound(state.players, winnerPlayerId, state.penaltyTable);
  events.push({ type: "ROUND_ENDED", winnerPlayerId, scores });

  const leaderRoundCounts = updateLeaderRoundCounts(updatedPlayers, state.leaderRoundCounts);
  // Every transient per-turn/per-stack flag is meaningless once paused for scoring -- cleared
  // here, not left to each call site, since a stack-extend that empties a hand (handleResolveStack)
  // sets pendingStack just before reaching this function and would otherwise leave a phantom
  // "still owes N cards" stack attached to a round that's supposedly paused.
  const round: RoundState = {
    ...state.round,
    phase: "ROUND_SCORING",
    pendingStack: undefined,
    hasDrawnThisTurn: undefined,
    suitLockedPlayerId: undefined,
  };

  return {
    ok: true,
    state: { ...state, players: updatedPlayers, round, leaderRoundCounts },
    events,
  };
}

/** R-26 (revised): only fires on an explicit host-issued command, not automatically. Deals the
 * next round and rotates the starter seat -- the logic that used to run unconditionally inside
 * finishRound. */
function handleStartNextRound(
  state: MatchState,
  _command: Extract<Command, { type: "START_NEXT_ROUND" }>,
  rng: () => number,
): ApplyMoveResult {
  if (state.round.phase !== "ROUND_SCORING") {
    return err("WRONG_PHASE", "There is no round-end pause to continue from.");
  }

  const playerCount = state.players.length;
  const roundStarterIndex = nextPlayerIndex(state.roundStarterIndex, playerCount, 1);
  const { hands, round } = dealNewRound(playerCount, state.handSize, roundStarterIndex, rng);
  const dealtPlayers = state.players.map((p, i) => ({ ...p, hand: hands[i]! }));

  return {
    ok: true,
    state: { ...state, players: dealtPlayers, round, roundStarterIndex },
    events: [{ type: "NEXT_ROUND_STARTED" }],
  };
}

/** Ends the match right now, between rounds, using current standings (R-28/R-29 winner
 * resolution) -- since there's no automatic end, this plus ABANDON_MATCH are the only ways a
 * match ever concludes. */
function handleEndMatchEarly(
  state: MatchState,
  _command: Extract<Command, { type: "END_MATCH_EARLY" }>,
): ApplyMoveResult {
  if (state.round.phase !== "ROUND_SCORING") {
    return err("WRONG_PHASE", "The match can only be ended early during the pause between rounds.");
  }

  const { winnerPlayerId } = forceMatchEnd(state.players, state.leaderRoundCounts);
  return {
    ok: true,
    state: { ...state, matchStatus: "MATCH_END" },
    events: [
      {
        type: "MATCH_ENDED",
        winnerPlayerId,
        finalScores: Object.fromEntries(state.players.map((p) => [p.playerId, p.matchScore])),
      },
    ],
  };
}

/** A player can abandon at any time, in any phase -- unlike END_MATCH_EARLY this isn't
 * restricted to the between-rounds pause. Still resolves a winner (current lowest score)
 * rather than ending with no result, distinguished from a normal finish via MATCH_ABANDONED. */
function handleAbandonMatch(
  state: MatchState,
  command: Extract<Command, { type: "ABANDON_MATCH" }>,
): ApplyMoveResult {
  const { winnerPlayerId } = forceMatchEnd(state.players, state.leaderRoundCounts);
  return {
    ok: true,
    state: { ...state, matchStatus: "MATCH_END" },
    events: [
      {
        type: "MATCH_ABANDONED",
        playerId: command.playerId,
        winnerPlayerId,
        finalScores: Object.fromEntries(state.players.map((p) => [p.playerId, p.matchScore])),
      },
    ],
  };
}

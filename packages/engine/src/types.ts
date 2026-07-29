export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface PlayerState {
  playerId: string;
  hand: Card[];
  matchScore: number;
  /** Rounds this player has won outright (emptied their hand first, R-24) -- kept for as long
   * as the room lasts, since a match no longer ends on its own (see MatchState's comment). */
  roundsWon: number;
}

/** A pending forced-draw chain from a 2 or Ace of Spades (R-10-R-14). */
export interface DrawStack {
  topCard: Card;
  accumulated: number;
}

/** 1 = clockwise (seat index ascending), -1 = counter-clockwise (R-20). */
export type Direction = 1 | -1;

export type RoundPhase = "AWAITING_PLAY" | "AWAITING_STACK_RESPONSE" | "ROUND_SCORING";

export interface RoundState {
  phase: RoundPhase;
  drawPile: Card[];
  discardPile: Card[];
  /** The suit/rank a played card must match (R-4). Not derived from discardPile's last
   * element, because R-18 requires the 7 itself (not the last dumped card) to be the
   * reference after a seven-dump. */
  currentSuit: Suit;
  currentRank: Rank;
  direction: Direction;
  currentPlayerIndex: number;
  pendingStack?: DrawStack;
  /** R-4: set after a forced draw when the drawn card turned out to be playable -- the same
   * player gets one immediate follow-up PLAY_CARDS before the turn passes. Sending DRAW_CARD
   * again while this is set means "decline to play it," ending the turn without drawing a
   * second card. Always cleared once the turn moves to a different player. */
  hasDrawnThisTurn?: boolean;
  /** R-5a: set to the player immediately after a wild (8/J) genuinely declares a new suit --
   * that one player's own wild plays have their suit-declaring power suppressed for their next
   * turn (they can still play the wild, it just won't change the suit). Cleared the instant
   * that player's turn ends, regardless of what they did; a suppressed wild does not renew it
   * for whoever comes after. */
  suitLockedPlayerId?: string;
}

export interface PenaltyTable {
  byRank: Record<Rank, number>;
  /** Overrides byRank["A"] specifically for the Ace of Spades (R-23 default table). */
  aceOfSpades: number;
}

export interface MatchState {
  players: PlayerState[];
  round: RoundState;
  handSize: number;
  /** Index into players[] of who deals/starts the next round; rotates each round (R-26). */
  roundStarterIndex: number;
  penaltyTable: PenaltyTable;
  /** How many rounds each player has ended as sole/tied score leader (lowest cumulative
   * score) -- used only for the R-29 tie-break on a MANUAL end (END_MATCH_EARLY/ABANDON_MATCH).
   * There's no automatic target-score end anymore: rounds deal forever, scores and roundsWon
   * just keep accumulating, until a player explicitly ends or abandons the match. */
  leaderRoundCounts: Record<string, number>;
  matchStatus: "IN_PROGRESS" | "MATCH_END";
}

export type Command =
  | { type: "PLAY_CARDS"; playerId: string; cardIds: string[]; declaredSuit?: Suit }
  | { type: "DRAW_CARD"; playerId: string }
  | { type: "RESOLVE_STACK"; playerId: string; cardId?: string }
  /** Only valid while round.phase is "ROUND_SCORING" (the pause between rounds). Not
   * turn-gated -- nobody is "up" during the pause. Host-only enforcement happens at the
   * RoomService layer, not here (the engine has no concept of "host"). */
  | { type: "START_NEXT_ROUND"; playerId: string }
  | { type: "END_MATCH_EARLY"; playerId: string }
  /** Valid at any time the match is IN_PROGRESS, regardless of phase or whose turn it is. */
  | { type: "ABANDON_MATCH"; playerId: string };

export type DomainEvent =
  | { type: "CARDS_PLAYED"; playerId: string; cards: Card[] }
  | { type: "SUIT_DECLARED"; playerId: string; suit: Suit }
  | { type: "STACK_EXTENDED"; playerId: string; card: Card; newAccumulated: number }
  | { type: "STACK_ABSORBED"; playerId: string; drawnCount: number }
  | { type: "CARD_DRAWN"; playerId: string; card: Card }
  | { type: "PLAYER_SKIPPED"; playerId: string }
  | { type: "DIRECTION_REVERSED" }
  | { type: "DISCARD_RESHUFFLED_INTO_DRAW_PILE"; cardCount: number }
  | { type: "ROUND_ENDED"; winnerPlayerId: string; scores: Record<string, number> }
  | { type: "NEXT_ROUND_STARTED" }
  | { type: "MATCH_ENDED"; winnerPlayerId: string; finalScores: Record<string, number> }
  | { type: "MATCH_ABANDONED"; playerId: string; winnerPlayerId: string; finalScores: Record<string, number> };

export interface EngineError {
  code: string;
  message: string;
}

export type ApplyMoveResult =
  | { ok: true; state: MatchState; events: DomainEvent[] }
  | { ok: false; error: EngineError };

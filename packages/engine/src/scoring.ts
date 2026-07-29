import type { Card, PenaltyTable, PlayerState } from "./types.js";

/** SRS.md §4.8 default penalty table (Assumption A-3). */
export const DEFAULT_PENALTY_TABLE: PenaltyTable = {
  byRank: {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 20,
    "6": 6,
    "7": 20,
    "8": 50,
    "9": 9,
    "10": 10,
    J: 50,
    Q: 10,
    K: 10,
    A: 15,
  },
  aceOfSpades: 50,
};

export function cardPenalty(card: Card, table: PenaltyTable = DEFAULT_PENALTY_TABLE): number {
  if (card.rank === "A" && card.suit === "spades") {
    return table.aceOfSpades;
  }
  return table.byRank[card.rank];
}

export interface RoundScoreResult {
  winnerPlayerId: string;
  /** This round's added penalty per player (0 for the winner). */
  scores: Record<string, number>;
  updatedPlayers: PlayerState[];
}

/** R-24, R-25: the round winner scores 0 (and gains a win); every other player adds the penalty
 * value of the cards remaining in their hand to their running match score. */
export function scoreRound(
  players: PlayerState[],
  winnerPlayerId: string,
  penaltyTable: PenaltyTable = DEFAULT_PENALTY_TABLE,
): RoundScoreResult {
  const scores: Record<string, number> = {};
  const updatedPlayers = players.map((player) => {
    if (player.playerId === winnerPlayerId) {
      scores[player.playerId] = 0;
      return { ...player, roundsWon: player.roundsWon + 1 };
    }
    const penalty = player.hand.reduce((sum, card) => sum + cardPenalty(card, penaltyTable), 0);
    scores[player.playerId] = penalty;
    return { ...player, matchScore: player.matchScore + penalty };
  });
  return { winnerPlayerId, scores, updatedPlayers };
}

/** Tracks, for the R-29 tie-break, how many rounds each player has ended as sole/tied score
 * leader (lowest cumulative score so far). Call after scoreRound with the updated players. */
export function updateLeaderRoundCounts(
  players: PlayerState[],
  leaderRoundCounts: Record<string, number>,
): Record<string, number> {
  const lowestScore = Math.min(...players.map((player) => player.matchScore));
  const updated = { ...leaderRoundCounts };
  for (const player of players) {
    if (player.matchScore === lowestScore) {
      updated[player.playerId] = (updated[player.playerId] ?? 0) + 1;
    }
  }
  return updated;
}

/** The R-28/R-29 winner resolution (lowest score, tie-broken by fewest rounds spent as score
 * leader) used when a match ends via an explicit host/player action -- there's no automatic
 * target-score end anymore, so this only ever runs from forceMatchEnd. */
function resolveWinner(
  players: PlayerState[],
  leaderRoundCounts: Record<string, number>,
): { winnerPlayerId?: string; tiedPlayerIds?: string[] } {
  const lowestScore = Math.min(...players.map((player) => player.matchScore));
  const lowestScorers = players.filter((player) => player.matchScore === lowestScore);

  if (lowestScorers.length === 1) {
    return { winnerPlayerId: lowestScorers[0]!.playerId };
  }

  const fewestLeaderRounds = Math.min(
    ...lowestScorers.map((player) => leaderRoundCounts[player.playerId] ?? 0),
  );
  const finalists = lowestScorers.filter(
    (player) => (leaderRoundCounts[player.playerId] ?? 0) === fewestLeaderRounds,
  );

  if (finalists.length === 1) {
    return { winnerPlayerId: finalists[0]!.playerId };
  }

  return { tiedPlayerIds: finalists.map((player) => player.playerId) };
}

/** Forces the match to end right now (host "end game early" between rounds, or a player
 * abandoning at any time) -- the only way a match ever ends, since there's no automatic
 * target-score end. */
export function forceMatchEnd(
  players: PlayerState[],
  leaderRoundCounts: Record<string, number>,
): { winnerPlayerId: string } {
  const { winnerPlayerId, tiedPlayerIds } = resolveWinner(players, leaderRoundCounts);
  // A forced end still needs exactly one winner; resolveWinner only leaves this ambiguous in
  // the vanishingly rare case of a full tie with identical leader-round counts too -- pick the
  // first tied player deterministically rather than leaving the match unable to end.
  return { winnerPlayerId: winnerPlayerId ?? tiedPlayerIds![0]! };
}

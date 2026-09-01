import type { Card, DomainEvent, RoundPhase, RoundState } from '@crazy8/engine';
import type {
  ConnectionStatus,
  Room,
  RoomSettings,
  RoomStatus,
} from './room.types';

/**
 * NFR-4: the redaction boundary. A player's own hand is visible only to them; everyone else
 * gets a count. The draw pile's contents (order/identity) are secret to everyone -- only its
 * count is exposed. The discard pile is fully public since every card on it was already played
 * face-up.
 */
export interface RedactedPlayerView {
  playerId: string;
  displayName: string;
  seatIndex: number;
  connectionStatus: ConnectionStatus;
  matchScore: number;
  roundsWon: number;
  handCount: number;
  /** Present only on the recipient's own entry. */
  hand?: Card[];
}

export interface RedactedRoundState {
  phase: RoundPhase;
  drawPileCount: number;
  discardPile: Card[];
  currentSuit: RoundState['currentSuit'];
  currentRank: RoundState['currentRank'];
  direction: RoundState['direction'];
  currentPlayerIndex: number;
  pendingStack: RoundState['pendingStack'];
  hasDrawnThisTurn: RoundState['hasDrawnThisTurn'];
}

export interface RedactedRoomSync {
  roomId: string;
  code: string;
  hostPlayerId: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: RedactedPlayerView[];
  round?: RedactedRoundState;
  handSize?: number;
  matchStatus?: 'IN_PROGRESS' | 'MATCH_END';
  turnDeadlineAt?: number;
}

function redactRoundState(round: RoundState): RedactedRoundState {
  return {
    phase: round.phase,
    drawPileCount: round.drawPile.length,
    discardPile: round.discardPile,
    currentSuit: round.currentSuit,
    currentRank: round.currentRank,
    direction: round.direction,
    currentPlayerIndex: round.currentPlayerIndex,
    pendingStack: round.pendingStack,
    hasDrawnThisTurn: round.hasDrawnThisTurn,
  };
}

/** Builds the full `room:sync` payload for one specific recipient -- every other player's hand
 * is collapsed to a count, theirs stays visible. */
export function redactRoomForPlayer(
  room: Room,
  recipientPlayerId: string,
): RedactedRoomSync {
  const matchPlayerById = new Map(
    room.match?.players.map((p) => [p.playerId, p]) ?? [],
  );

  const players: RedactedPlayerView[] = room.players.map((roomPlayer) => {
    const matchPlayer = matchPlayerById.get(roomPlayer.playerId);
    const isRecipient = roomPlayer.playerId === recipientPlayerId;
    return {
      playerId: roomPlayer.playerId,
      displayName: roomPlayer.displayName,
      seatIndex: roomPlayer.seatIndex,
      connectionStatus: roomPlayer.connectionStatus,
      matchScore: matchPlayer?.matchScore ?? 0,
      roundsWon: matchPlayer?.roundsWon ?? 0,
      handCount: matchPlayer?.hand.length ?? 0,
      ...(isRecipient && matchPlayer ? { hand: matchPlayer.hand } : {}),
    };
  });

  return {
    roomId: room.id,
    code: room.code,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    settings: room.settings,
    players,
    ...(room.match
      ? {
          round: redactRoundState(room.match.round),
          handSize: room.match.handSize,
          matchStatus: room.match.matchStatus,
        }
      : {}),
    ...(room.turnDeadlineAt !== undefined ? { turnDeadlineAt: room.turnDeadlineAt } : {}),
  };
}

/** A `CARD_DRAWN` event carries the actual drawn card -- that must stay hidden from everyone
 * except the drawer, even though the broadcast itself (a draw happened) is public. Every other
 * event type is safe to pass through unchanged: played/extended/absorbed cards are already
 * public information once they're on the discard pile or counted as a draw-stack total. */
export type WireEvent =
  | Exclude<DomainEvent, { type: 'CARD_DRAWN' }>
  | { type: 'CARD_DRAWN'; playerId: string; card?: Card };

export function redactEventForRecipient(
  event: DomainEvent,
  recipientPlayerId: string,
): WireEvent {
  if (event.type === 'CARD_DRAWN') {
    return {
      type: 'CARD_DRAWN',
      playerId: event.playerId,
      ...(event.playerId === recipientPlayerId ? { card: event.card } : {}),
    };
  }
  return event;
}

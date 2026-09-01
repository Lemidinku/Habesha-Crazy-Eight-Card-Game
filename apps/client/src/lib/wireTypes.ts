import type { Card, Direction, DomainEvent, DrawStack, Rank, RoundPhase, Suit } from '@crazy8/engine';

export type ConnectionStatus = 'connected' | 'disconnected';

/**
 * Client-side mirror of apps/server/src/room/redaction.ts's payload shapes. There's no shared
 * wire-types package yet -- Card/Suit/Rank/Direction/etc. come straight from @crazy8/engine
 * since those are genuinely shared domain types, but these redaction-specific shapes are small
 * enough to duplicate by hand for now. Worth extracting into a shared package if a third
 * consumer of the wire protocol ever shows up; not worth the ceremony for two.
 */
export interface RedactedPlayerView {
  playerId: string;
  displayName: string;
  seatIndex: number;
  connectionStatus: ConnectionStatus;
  matchScore: number;
  roundsWon: number;
  handCount: number;
  hand?: Card[];
}

export interface RedactedRoundState {
  phase: RoundPhase;
  drawPileCount: number;
  discardPile: Card[];
  currentSuit: Suit;
  currentRank: Rank;
  direction: Direction;
  currentPlayerIndex: number;
  pendingStack?: DrawStack;
  hasDrawnThisTurn?: boolean;
}

export interface RoomSettings {
  handSize: number;
  reconnectGraceMs: number;
  turnTimeoutMs: number;
}

export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'MATCH_END';

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

export type WireEvent = Exclude<DomainEvent, { type: 'CARD_DRAWN' }> | { type: 'CARD_DRAWN'; playerId: string; card?: Card };

export interface WireError {
  code: string;
  message: string;
}

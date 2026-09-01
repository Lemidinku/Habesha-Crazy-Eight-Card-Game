import type { MatchState } from '@crazy8/engine';

export type ConnectionStatus = 'connected' | 'disconnected';

export interface RoomSettings {
  handSize: number;
  reconnectGraceMs: number;
  turnTimeoutMs: number;
}

export interface RoomPlayer {
  playerId: string;
  sessionToken: string;
  displayName: string;
  seatIndex: number;
  connectionStatus: ConnectionStatus;
  /** Set once the reconnect grace period has expired -- this seat auto-plays a safe fallback
   * move on its turn until the player reconnects (FR-17). */
  autoPilot: boolean;
}

export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'MATCH_END';

export interface Room {
  id: string;
  code: string;
  hostPlayerId: string;
  settings: RoomSettings;
  players: RoomPlayer[];
  status: RoomStatus;
  /** Only present once the host has started the match. */
  match?: MatchState;
  /** Epoch ms deadline for whoever must currently act (AWAITING_PLAY/AWAITING_STACK_RESPONSE
   * only) -- set and cleared by RoomService.scheduleTurnTimer. Purely informational for the
   * client's cosmetic countdown; RoomService's own timer is what actually enforces it. */
  turnDeadlineAt?: number;
}

import { io, type Socket } from 'socket.io-client';
import type { Command } from '@crazy8/engine';
import type { RedactedRoomSync, WireError, WireEvent } from './wireTypes';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE_URL, { transports: ['websocket'] });
  }
  return socket;
}

export interface RoomSocketHandlers {
  /** Fires on the initial connection *and* every time socket.io-client silently
   * reconnects the transport after a drop (its default auto-reconnect behavior) --
   * not just once on mount. This is the hook a caller needs to re-authenticate a
   * room session after a network blip, not only after a full page reload. */
  onConnect: () => void;
  onSync: (room: RedactedRoomSync) => void;
  onEvent: (event: WireEvent) => void;
  onError: (error: WireError) => void;
}

/** Subscribes to connection lifecycle + the three server->client message types,
 * and returns an unsubscribe function. */
export function connectRoomSocket(handlers: RoomSocketHandlers): () => void {
  const s = getSocket();
  s.on('connect', handlers.onConnect);
  s.on('room:sync', handlers.onSync);
  s.on('event', handlers.onEvent);
  s.on('error', handlers.onError);
  return () => {
    s.off('connect', handlers.onConnect);
    s.off('room:sync', handlers.onSync);
    s.off('event', handlers.onEvent);
    s.off('error', handlers.onError);
  };
}

export function joinRoomSocket(roomId: string, playerId: string, sessionToken: string): void {
  getSocket().emit('room:join', { roomId, playerId, sessionToken });
}

export function startMatchSocket(): void {
  getSocket().emit('match:start');
}

/** Only valid pre-match (LOBBY) -- removes the player from the room's seat list, distinct from
 * ABANDON_MATCH which ends an already-started match for everyone. */
export function leaveRoomSocket(): void {
  getSocket().emit('room:leave');
}

export function sendCommand(command: Command): void {
  getSocket().emit('command', command);
}

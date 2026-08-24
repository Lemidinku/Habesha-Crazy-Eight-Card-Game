import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  applyMove,
  createMatch,
  type Command,
  type DomainEvent,
  type MatchState,
} from '@crazy8/engine';
import { generateRoomCode } from './room-code';
import { ROOM_STORE, type RoomStore } from './room.store';
import type { Room, RoomPlayer, RoomSettings } from './room.types';

/** How long a room with every seat disconnected is kept before being reaped -- generous
 * relative to the per-player reconnect grace period (which is host-configurable down to 5s, see
 * room.controller.ts) since this is a distinct, room-wide safety net rather than the reconnect
 * UX itself. Fixes the leak where a room nobody ever finishes joining (closed before the socket
 * ever connects), or a match everyone walks away from mid-game, would otherwise sit in
 * InMemoryRoomStore forever. */
export const ROOM_REAP_IDLE_MS = 10 * 60_000;

export type RoomResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): RoomResult<T> {
  return { ok: true, value };
}

function fail<T>(error: string): RoomResult<T> {
  return { ok: false, error };
}

/** sessionToken comparison must not leak timing information about how many leading characters
 * matched, the way a plain `!==` would. `timingSafeEqual` requires equal-length buffers (it
 * throws otherwise), so a length mismatch is checked first and short-circuits to `false` -- this
 * leaks only the *length* of the stored token, which is always a fixed 36-character randomUUID
 * and therefore not meaningful information to an attacker. */
function safeTokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * The "Room Manager" from DESIGN.md's component diagram: owns room/seat lifecycle and is the
 * only thing that calls into the engine's `applyMove`. Transport (REST controller, WebSocket
 * gateway) never touches the engine directly -- this is the seam that keeps the authoritative
 * boundary (DESIGN.md §1) in one place.
 */
@Injectable()
export class RoomService {
  private readonly graceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly roomReapTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly updateListeners = new Set<
    (roomId: string, events: DomainEvent[]) => void
  >();
  private readonly logger = new Logger(RoomService.name);

  constructor(@Inject(ROOM_STORE) private readonly roomStore: RoomStore) {}

  /** Subscribes to state changes produced asynchronously (grace-period auto-play), which the
   * request/response flow of createRoom/handleCommand can't itself return to a caller. The
   * Gateway uses this to know when to broadcast outside of a direct client request. */
  onRoomUpdated(
    listener: (roomId: string, events: DomainEvent[]) => void,
  ): void {
    this.updateListeners.add(listener);
  }

  getRoom(roomId: string): Room | undefined {
    return this.roomStore.get(roomId);
  }

  createRoom(
    displayName: string,
    settingsOverride: Partial<RoomSettings> = {},
  ): { room: Room; player: RoomPlayer } {
    const player: RoomPlayer = {
      playerId: randomUUID(),
      sessionToken: randomUUID(),
      displayName,
      seatIndex: 0,
      connectionStatus: 'disconnected',
      autoPilot: false,
    };
    const settings: RoomSettings = {
      handSize: settingsOverride.handSize ?? 7,
      reconnectGraceMs: settingsOverride.reconnectGraceMs ?? 60_000,
    };
    const room: Room = {
      id: randomUUID(),
      code: this.uniqueRoomCode(),
      hostPlayerId: player.playerId,
      settings,
      players: [player],
      status: 'LOBBY',
    };
    this.roomStore.save(room);
    this.logger.log(`Room ${room.code} created by "${displayName}"`);
    this.scheduleRoomReapIfAbandoned(room);
    return { room, player };
  }

  joinRoom(
    code: string,
    displayName: string,
  ): RoomResult<{ room: Room; player: RoomPlayer }> {
    const room = this.roomStore.getByCode(code.toUpperCase());
    if (!room) return fail('ROOM_NOT_FOUND');
    if (room.status !== 'LOBBY') return fail('ROOM_ALREADY_STARTED');
    if (room.players.length >= 8) return fail('ROOM_FULL');
    if (room.players.some((p) => p.displayName === displayName))
      return fail('NAME_TAKEN');

    const player: RoomPlayer = {
      playerId: randomUUID(),
      sessionToken: randomUUID(),
      displayName,
      // Not room.players.length -- leaveLobby removes a player from the array via filter
      // without renumbering the rest, so length can collide with a seatIndex still in use
      // (seats [0,1,2], seat 1 leaves -> [seat0, seat2] has length 2, colliding with seat2 if
      // the next joiner used length directly). Always strictly greater than the current max
      // instead, so a new seat index is never reused.
      seatIndex:
        room.players.reduce((max, p) => Math.max(max, p.seatIndex), -1) + 1,
      connectionStatus: 'disconnected',
      autoPilot: false,
    };
    room.players.push(player);
    this.roomStore.save(room);
    this.scheduleRoomReapIfAbandoned(room);
    return ok({ room, player });
  }

  /** Removes a player from a room that hasn't started yet -- distinct from `ABANDON_MATCH`,
   * which ends an already-started match for everyone. Promotes a new host if the host leaves,
   * and deletes the room entirely if the last player leaves. */
  leaveLobby(
    roomId: string,
    playerId: string,
  ): RoomResult<{ room: Room | null }> {
    const room = this.roomStore.get(roomId);
    if (!room) return fail('ROOM_NOT_FOUND');
    if (room.status !== 'LOBBY') return fail('MATCH_ALREADY_STARTED');

    room.players = room.players.filter((p) => p.playerId !== playerId);

    if (room.players.length === 0) {
      this.roomStore.delete(roomId);
      return ok({ room: null });
    }

    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = room.players[0].playerId;
    }

    this.roomStore.save(room);
    return ok({ room });
  }

  startMatch(
    roomId: string,
    requestingPlayerId: string,
  ): RoomResult<{ room: Room; events: DomainEvent[] }> {
    const room = this.roomStore.get(roomId);
    if (!room) return fail('ROOM_NOT_FOUND');
    if (room.hostPlayerId !== requestingPlayerId) return fail('NOT_HOST');
    if (room.status !== 'LOBBY') return fail('ALREADY_STARTED');
    if (room.players.length < 2) return fail('NOT_ENOUGH_PLAYERS');

    room.match = createMatch(
      room.players.map((p) => p.playerId),
      { handSize: room.settings.handSize },
    );
    room.status = 'IN_PROGRESS';
    this.roomStore.save(room);
    this.logger.log(
      `Match started in room ${room.code} (${room.players.length} players)`,
    );

    return ok(this.resolveAutoPilotChain(room));
  }

  /** The only path (besides auto-play) that ever calls the engine's `applyMove` -- real player
   * commands and the grace-period fallback both flow through here identically. */
  handleCommand(
    roomId: string,
    command: Command,
  ): RoomResult<{ room: Room; events: DomainEvent[] }> {
    const room = this.roomStore.get(roomId);
    if (!room || !room.match) return fail('ROOM_OR_MATCH_NOT_FOUND');

    // Host-only, exactly like startMatch -- the engine has no concept of "host," so this is
    // enforced here rather than in applyMove.
    if (
      (command.type === 'START_NEXT_ROUND' ||
        command.type === 'END_MATCH_EARLY') &&
      command.playerId !== room.hostPlayerId
    ) {
      return fail('NOT_HOST');
    }

    const result = applyMove(room.match, command);
    if (!result.ok) return fail(result.error.code);

    room.match = result.state;
    if (room.match.matchStatus === 'MATCH_END') room.status = 'MATCH_END';
    this.roomStore.save(room);

    return ok(this.resolveAutoPilotChain(room, result.events));
  }

  /** Marks a player disconnected and starts their reconnect grace-period timer (FR-14). If the
   * timer fires before they reconnect, their seat flips into auto-pilot (FR-17). */
  markDisconnected(roomId: string, playerId: string): void {
    const room = this.roomStore.get(roomId);
    const player = room?.players.find((p) => p.playerId === playerId);
    if (!room || !player) return;

    player.connectionStatus = 'disconnected';
    this.roomStore.save(room);
    this.logger.log(`Player ${playerId} disconnected from room ${room.code}`);

    const timerKey = `${roomId}:${playerId}`;
    this.clearGraceTimer(timerKey);
    const timer = setTimeout(() => {
      this.graceTimers.delete(timerKey);
      this.expireGracePeriod(roomId, playerId);
    }, room.settings.reconnectGraceMs);
    this.graceTimers.set(timerKey, timer);

    this.scheduleRoomReapIfAbandoned(room);
  }

  /** Authenticates a socket against a previously-issued session token -- used identically for
   * the player's first connection and for a later reconnection (FR-16); there's no meaningful
   * difference server-side between the two. */
  authenticate(
    roomId: string,
    playerId: string,
    sessionToken: string,
  ): RoomResult<{ room: Room; player: RoomPlayer }> {
    const room = this.roomStore.get(roomId);
    if (!room) return fail('ROOM_NOT_FOUND');
    const player = room.players.find((p) => p.playerId === playerId);
    if (!player || !safeTokensEqual(player.sessionToken, sessionToken))
      return fail('INVALID_SESSION');

    this.clearGraceTimer(`${roomId}:${playerId}`);
    this.clearRoomReapTimer(roomId);
    player.connectionStatus = 'connected';
    player.autoPilot = false;
    this.roomStore.save(room);
    return ok({ room, player });
  }

  private expireGracePeriod(roomId: string, playerId: string): void {
    const room = this.roomStore.get(roomId);
    const player = room?.players.find((p) => p.playerId === playerId);
    if (!room || !player || player.connectionStatus === 'connected') return;

    player.autoPilot = true;
    this.roomStore.save(room);
    this.logger.warn(
      `Grace period expired for player ${playerId} in room ${room.code} -- auto-pilot engaged`,
    );

    const { events } = this.resolveAutoPilotChain(room);
    this.emitRoomUpdated(roomId, events);
  }

  /** Repeatedly plays the safe fallback move (same one `scripts/fuzz.ts` uses to always make
   * progress) for as long as whoever needs to act next is in auto-pilot, so the match is never
   * blocked on one absent player (FR-15). */
  private resolveAutoPilotChain(
    room: Room,
    initialEvents: DomainEvent[] = [],
  ): { room: Room; events: DomainEvent[] } {
    const events = [...initialEvents];
    let current = room;

    while (current.match && current.match.matchStatus === 'IN_PROGRESS') {
      const command = this.autoPilotCommandFor(current);
      if (!command) break;

      const result = applyMove(current.match, command);
      if (!result.ok) break; // the fallback is always valid; this is just a safety net.

      current = {
        ...current,
        match: result.state,
        status:
          result.state.matchStatus === 'MATCH_END'
            ? 'MATCH_END'
            : current.status,
      };
      events.push(...result.events);
    }

    this.roomStore.save(current);
    return { room: current, events };
  }

  /** Picks the auto-pilot fallback command for the room's current state, or null if nobody
   * whose action is actually needed right now is in auto-pilot.
   *
   * During ROUND_SCORING nobody is "up" -- currentPlayerIndex is just whatever stale value was
   * left over from the last active turn, and only the host can act (START_NEXT_ROUND /
   * END_MATCH_EARLY, both host-only). Checking currentPlayerIndex's auto-pilot status here would
   * be checking the wrong player entirely: if the host specifically is disconnected, no one --
   * human or auto-pilot -- could ever advance the match again, since safeFallbackCommand's
   * DRAW_CARD/RESOLVE_STACK vocabulary is turn-gated and always fails WRONG_PHASE during a
   * pause. So this branches on whether the *host* is in auto-pilot instead, and always answers
   * with START_NEXT_ROUND (not END_MATCH_EARLY) -- ending the match early is a one-way decision
   * a temporarily-absent host shouldn't have made for them; dealing the next round is fully
   * reversible and matches the "always keep the game moving" spirit of every other fallback. */
  private autoPilotCommandFor(room: Room): Command | null {
    const match = room.match!;

    if (match.round.phase === 'ROUND_SCORING') {
      const host = room.players.find((p) => p.playerId === room.hostPlayerId)!;
      if (!host.autoPilot) return null;
      return { type: 'START_NEXT_ROUND', playerId: host.playerId };
    }

    const currentPlayerId =
      match.players[match.round.currentPlayerIndex].playerId;
    const roomPlayer = room.players.find(
      (p) => p.playerId === currentPlayerId,
    )!;
    if (!roomPlayer.autoPilot) return null;
    return this.safeFallbackCommand(match);
  }

  private safeFallbackCommand(match: MatchState): Command {
    const currentPlayer = match.players[match.round.currentPlayerIndex];
    if (match.round.phase === 'AWAITING_STACK_RESPONSE') {
      return { type: 'RESOLVE_STACK', playerId: currentPlayer.playerId };
    }
    return { type: 'DRAW_CARD', playerId: currentPlayer.playerId };
  }

  private emitRoomUpdated(roomId: string, events: DomainEvent[]): void {
    if (events.length === 0) return;
    for (const listener of this.updateListeners) listener(roomId, events);
  }

  private clearGraceTimer(timerKey: string): void {
    const existing = this.graceTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.graceTimers.delete(timerKey);
    }
  }

  private scheduleRoomReapIfAbandoned(room: Room): void {
    const allDisconnected = room.players.every(
      (p) => p.connectionStatus === 'disconnected',
    );
    if (!allDisconnected) {
      this.clearRoomReapTimer(room.id);
      return;
    }
    if (this.roomReapTimers.has(room.id)) return;

    const timer = setTimeout(() => {
      this.roomReapTimers.delete(room.id);
      const current = this.roomStore.get(room.id);
      if (!current) return;
      const stillAbandoned = current.players.every(
        (p) => p.connectionStatus === 'disconnected',
      );
      if (!stillAbandoned) return;
      this.logger.log(
        `Reaping abandoned room ${current.code} after ${ROOM_REAP_IDLE_MS}ms with no connected players`,
      );
      this.roomStore.delete(room.id);
    }, ROOM_REAP_IDLE_MS);
    this.roomReapTimers.set(room.id, timer);
  }

  private clearRoomReapTimer(roomId: string): void {
    const existing = this.roomReapTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.roomReapTimers.delete(roomId);
    }
  }

  private uniqueRoomCode(): string {
    let code = generateRoomCode();
    while (this.roomStore.getByCode(code)) {
      code = generateRoomCode();
    }
    return code;
  }
}

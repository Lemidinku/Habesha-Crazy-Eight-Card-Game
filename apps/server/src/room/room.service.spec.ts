import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { ROOM_REAP_IDLE_MS, RoomService } from './room.service';
import { InMemoryRoomStore } from './room.store';

function setup() {
  const store = new InMemoryRoomStore();
  const service = new RoomService(store);
  return { store, service };
}

describe('RoomService — create/join', () => {
  it('creates a room with the creator as host, seat 0', () => {
    const { service } = setup();
    const { room, player } = service.createRoom('Alice');
    expect(room.hostPlayerId).toBe(player.playerId);
    expect(room.players).toHaveLength(1);
    expect(player.seatIndex).toBe(0);
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.status).toBe('LOBBY');
  });

  it('joins an existing room at the next seat', () => {
    const { service } = setup();
    const { room } = service.createRoom('Alice');
    const result = service.joinRoom(room.code, 'Bob');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.player.seatIndex).toBe(1);
    expect(service.getRoom(room.id)!.players).toHaveLength(2);
  });

  it('rejects joining a nonexistent room code', () => {
    const { service } = setup();
    const result = service.joinRoom('ZZZZZZ', 'Bob');
    expect(result).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('rejects a duplicate display name within the same room', () => {
    const { service } = setup();
    const { room } = service.createRoom('Alice');
    const result = service.joinRoom(room.code, 'Alice');
    expect(result).toEqual({ ok: false, error: 'NAME_TAKEN' });
  });

  it('rejects joining once the room is full (8 seats)', () => {
    const { service } = setup();
    const { room } = service.createRoom('P0');
    for (let i = 1; i < 8; i++) {
      expect(service.joinRoom(room.code, `P${i}`).ok).toBe(true);
    }
    expect(service.joinRoom(room.code, 'P8')).toEqual({
      ok: false,
      error: 'ROOM_FULL',
    });
  });

  it('rejects joining a room whose match has already started', () => {
    const { service } = setup();
    const { room, player } = service.createRoom('Alice');
    service.joinRoom(room.code, 'Bob');
    service.startMatch(room.id, player.playerId);
    expect(service.joinRoom(room.code, 'Carol')).toEqual({
      ok: false,
      error: 'ROOM_ALREADY_STARTED',
    });
  });

  it('never reuses a seatIndex still held by another player after a mid-lobby leave', () => {
    // Regression test: joinRoom used to assign seatIndex: room.players.length, which collides
    // with an existing player's seatIndex once someone in the middle has left (leaveLobby
    // filters the array without renumbering the rest).
    const { service } = setup();
    const { room, player: p0 } = service.createRoom('P0');
    const p1 = service.joinRoom(room.code, 'P1');
    const p2 = service.joinRoom(room.code, 'P2');
    if (!p1.ok || !p2.ok) throw new Error('setup failed');
    expect([
      p0.seatIndex,
      p1.value.player.seatIndex,
      p2.value.player.seatIndex,
    ]).toEqual([0, 1, 2]);

    service.leaveLobby(room.id, p1.value.player.playerId);

    const p3 = service.joinRoom(room.code, 'P3');
    if (!p3.ok) throw new Error('setup failed');
    const seatIndexes = service
      .getRoom(room.id)!
      .players.map((p) => p.seatIndex);
    expect(new Set(seatIndexes).size).toBe(seatIndexes.length); // every seatIndex still unique
    expect(seatIndexes).not.toContain(undefined);
  });
});

describe('RoomService — leaveLobby', () => {
  it('removes a non-host player, leaving the host and room intact', () => {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    const joined = service.joinRoom(room.code, 'Bob');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    const result = service.leaveLobby(room.id, joined.value.player.playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.room!.players).toHaveLength(1);
    expect(result.value.room!.hostPlayerId).toBe(host.playerId);
  });

  it('promotes a new host when the host leaves and other players remain', () => {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    const joined = service.joinRoom(room.code, 'Bob');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    const result = service.leaveLobby(room.id, host.playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.room!.players).toHaveLength(1);
    expect(result.value.room!.hostPlayerId).toBe(joined.value.player.playerId);
  });

  it('deletes the room entirely when the last player leaves', () => {
    const { service, store } = setup();
    const { room, player: host } = service.createRoom('Alice');

    const result = service.leaveLobby(room.id, host.playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.room).toBeNull();
    expect(store.get(room.id)).toBeUndefined();
  });

  it('rejects leaving a room whose match has already started', () => {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    service.joinRoom(room.code, 'Bob');
    service.startMatch(room.id, host.playerId);
    expect(service.leaveLobby(room.id, host.playerId)).toEqual({
      ok: false,
      error: 'MATCH_ALREADY_STARTED',
    });
  });

  it('rejects leaving a nonexistent room', () => {
    const { service } = setup();
    expect(service.leaveLobby('nonexistent-room-id', 'someone')).toEqual({
      ok: false,
      error: 'ROOM_NOT_FOUND',
    });
  });
});

describe('RoomService — startMatch', () => {
  it('rejects a non-host trying to start the match', () => {
    const { service } = setup();
    const { room } = service.createRoom('Alice');
    const joined = service.joinRoom(room.code, 'Bob');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const result = service.startMatch(room.id, joined.value.player.playerId);
    expect(result).toEqual({ ok: false, error: 'NOT_HOST' });
  });

  it('rejects starting with fewer than 2 players', () => {
    const { service } = setup();
    const { room, player } = service.createRoom('Alice');
    expect(service.startMatch(room.id, player.playerId)).toEqual({
      ok: false,
      error: 'NOT_ENOUGH_PLAYERS',
    });
  });

  it('deals a match once the host starts with 2+ players', () => {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    service.joinRoom(room.code, 'Bob');
    const result = service.startMatch(room.id, host.playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.room.status).toBe('IN_PROGRESS');
    expect(result.value.room.match!.players).toHaveLength(2);
    for (const p of result.value.room.match!.players) {
      expect(p.hand).toHaveLength(7);
    }
  });
});

describe('RoomService — handleCommand', () => {
  it('delegates to the engine and rejects a move from the wrong player', () => {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    const joined = service.joinRoom(room.code, 'Bob');
    if (!joined.ok) throw new Error('setup failed');
    service.startMatch(room.id, host.playerId);

    const currentMatch = service.getRoom(room.id)!.match!;
    const upNextPlayerId =
      currentMatch.players[currentMatch.round.currentPlayerIndex].playerId;
    const otherPlayerId =
      upNextPlayerId === host.playerId
        ? joined.value.player.playerId
        : host.playerId;

    const result = service.handleCommand(room.id, {
      type: 'DRAW_CARD',
      playerId: otherPlayerId,
    });
    expect(result).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('applies a legal move and returns the produced events', () => {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    service.joinRoom(room.code, 'Bob');
    service.startMatch(room.id, host.playerId);

    const match = service.getRoom(room.id)!.match!;
    const upNextPlayerId =
      match.players[match.round.currentPlayerIndex].playerId;

    const result = service.handleCommand(room.id, {
      type: 'DRAW_CARD',
      playerId: upNextPlayerId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.events.some(
        (e) =>
          e.type === 'CARD_DRAWN' ||
          e.type === 'DISCARD_RESHUFFLED_INTO_DRAW_PILE',
      ),
    ).toBe(true);
  });
});

describe('RoomService — host-only gating for round-pause commands', () => {
  function setupPausedMatch() {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    const joined = service.joinRoom(room.code, 'Bob');
    if (!joined.ok) throw new Error('setup failed');
    service.startMatch(room.id, host.playerId);

    // Force a tiny, low-scoring round: the current player gets a single low-value card (so
    // playing it empties their hand and ends the round), and the OTHER player's hand is also
    // forced to a low-penalty card -- otherwise their random 7-card hand could coincidentally
    // total >= the default 100-point target and end the whole match instead of just pausing it.
    const match = service.getRoom(room.id)!.match!;
    const upNextIndex = match.round.currentPlayerIndex;
    const otherIndex = upNextIndex === 0 ? 1 : 0;
    const upNext = match.players[upNextIndex];
    const other = match.players[otherIndex];
    const forcedCard = {
      id: 'forced-2-hearts',
      suit: 'hearts' as const,
      rank: '2' as const,
    };
    match.players[upNextIndex] = { ...upNext, hand: [forcedCard] };
    match.players[otherIndex] = {
      ...other,
      hand: [{ id: 'other-3-clubs', suit: 'clubs', rank: '3' }],
    };
    match.round.currentSuit = forcedCard.suit;
    match.round.currentRank = forcedCard.rank;
    const result = service.handleCommand(room.id, {
      type: 'PLAY_CARDS',
      playerId: upNext.playerId,
      cardIds: [forcedCard.id],
    });
    if (!result.ok) throw new Error(`setup play failed: ${result.error}`);

    return { service, room, host, bob: joined.value.player };
  }

  it('rejects START_NEXT_ROUND from a non-host player', () => {
    const { service, room, bob } = setupPausedMatch();
    const result = service.handleCommand(room.id, {
      type: 'START_NEXT_ROUND',
      playerId: bob.playerId,
    });
    expect(result).toEqual({ ok: false, error: 'NOT_HOST' });
  });

  it('rejects END_MATCH_EARLY from a non-host player', () => {
    const { service, room, bob } = setupPausedMatch();
    const result = service.handleCommand(room.id, {
      type: 'END_MATCH_EARLY',
      playerId: bob.playerId,
    });
    expect(result).toEqual({ ok: false, error: 'NOT_HOST' });
  });

  it('allows the host to continue to the next round', () => {
    const { service, room, host } = setupPausedMatch();
    const result = service.handleCommand(room.id, {
      type: 'START_NEXT_ROUND',
      playerId: host.playerId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.room.match!.round.phase).toBe('AWAITING_PLAY');
  });

  it('allows ANY player (not just host) to abandon the match', () => {
    const { service, room, bob } = setupPausedMatch();
    const result = service.handleCommand(room.id, {
      type: 'ABANDON_MATCH',
      playerId: bob.playerId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.room.match!.matchStatus).toBe('MATCH_END');
  });

  it("auto-plays START_NEXT_ROUND once the disconnected host's grace period expires, instead of permanently deadlocking the pause", () => {
    // Regression test: safeFallbackCommand only ever issued DRAW_CARD/RESOLVE_STACK, both
    // turn-gated and both WRONG_PHASE during ROUND_SCORING -- a disconnected host had no way to
    // ever be auto-piloted past the round-pause, and nobody else could act since
    // START_NEXT_ROUND/END_MATCH_EARLY are host-only. With every other player present and
    // connected, the match could never advance again.
    vi.useFakeTimers();
    try {
      const { service, room, host } = setupPausedMatch();
      expect(service.getRoom(room.id)!.match!.round.phase).toBe(
        'ROUND_SCORING',
      );

      service.markDisconnected(room.id, host.playerId);
      vi.advanceTimersByTime(60_000);

      const hostAfter = service
        .getRoom(room.id)!
        .players.find((p) => p.playerId === host.playerId)!;
      expect(hostAfter.autoPilot).toBe(true);
      // The pause is over -- a new round actually got dealt on the host's behalf.
      expect(service.getRoom(room.id)!.match!.round.phase).toBe(
        'AWAITING_PLAY',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RoomService — reconnection and grace-period auto-play', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('authenticate() marks a player connected given a valid session token', () => {
    const { service } = setup();
    const { room, player } = service.createRoom('Alice');
    const result = service.authenticate(
      room.id,
      player.playerId,
      player.sessionToken,
    );
    expect(result.ok).toBe(true);
    expect(service.getRoom(room.id)!.players[0].connectionStatus).toBe(
      'connected',
    );
  });

  it('rejects authentication with an invalid session token', () => {
    const { service } = setup();
    const { room, player } = service.createRoom('Alice');
    expect(
      service.authenticate(room.id, player.playerId, 'wrong-token'),
    ).toEqual({
      ok: false,
      error: 'INVALID_SESSION',
    });
  });

  it('rejects authentication when the provided token has a different length than the real one', () => {
    // Regression coverage for the constant-time comparison: crypto.timingSafeEqual throws if
    // given two buffers of unequal length rather than returning false, so this proves that
    // path is guarded, not just the equal-length invalid-token case above.
    const { service } = setup();
    const { room, player } = service.createRoom('Alice');
    expect(service.authenticate(room.id, player.playerId, 'short')).toEqual({
      ok: false,
      error: 'INVALID_SESSION',
    });
  });

  it('reconnecting before the grace period expires clears autoPilot without auto-playing', () => {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    const joined = service.joinRoom(room.code, 'Bob');
    if (!joined.ok) throw new Error('setup failed');
    service.startMatch(room.id, host.playerId);

    service.markDisconnected(room.id, host.playerId);
    vi.advanceTimersByTime(30_000); // half of the default 60s grace period
    service.authenticate(room.id, host.playerId, host.sessionToken);

    const player = service
      .getRoom(room.id)!
      .players.find((p) => p.playerId === host.playerId)!;
    expect(player.connectionStatus).toBe('connected');
    expect(player.autoPilot).toBe(false);
  });

  it("auto-plays a safe fallback move once the grace period expires on the disconnected player's turn", () => {
    const { service } = setup();
    const { room, player: host } = service.createRoom('Alice');
    const joined = service.joinRoom(room.code, 'Bob');
    if (!joined.ok) throw new Error('setup failed');
    service.startMatch(room.id, host.playerId);

    const matchBefore = service.getRoom(room.id)!.match!;
    const upNextPlayerId =
      matchBefore.players[matchBefore.round.currentPlayerIndex].playerId;

    const updates: Array<{ roomId: string; events: unknown[] }> = [];
    service.onRoomUpdated((roomId, events) => updates.push({ roomId, events }));

    service.markDisconnected(room.id, upNextPlayerId);
    vi.advanceTimersByTime(60_000);

    const player = service
      .getRoom(room.id)!
      .players.find((p) => p.playerId === upNextPlayerId)!;
    expect(player.autoPilot).toBe(true);
    // the auto-played move should have advanced the turn away from the disconnected player.
    const matchAfter = service.getRoom(room.id)!.match!;
    expect(
      matchAfter.players[matchAfter.round.currentPlayerIndex].playerId,
    ).not.toBe(upNextPlayerId);
    expect(updates).toHaveLength(1);
    expect(updates[0].events.length).toBeGreaterThan(0);
  });
});

describe('RoomService — abandoned-room reap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reaps a room nobody ever connects a socket to, once the idle window elapses', () => {
    const { service, store } = setup();
    const { room } = service.createRoom('Alice'); // host starts 'disconnected' by default

    vi.advanceTimersByTime(ROOM_REAP_IDLE_MS);

    expect(store.get(room.id)).toBeUndefined();
  });

  it('does not reap a room once its creator connects', () => {
    const { service, store } = setup();
    const { room, player } = service.createRoom('Alice');
    service.authenticate(room.id, player.playerId, player.sessionToken);

    vi.advanceTimersByTime(ROOM_REAP_IDLE_MS);

    expect(store.get(room.id)).toBeDefined();
  });

  it('reaps a room where every seat disconnects mid-lobby', () => {
    const { service, store } = setup();
    const { room, player: host } = service.createRoom('Alice');
    service.authenticate(room.id, host.playerId, host.sessionToken);
    const joined = service.joinRoom(room.code, 'Bob');
    if (!joined.ok) throw new Error('setup failed');
    service.authenticate(
      room.id,
      joined.value.player.playerId,
      joined.value.player.sessionToken,
    );

    service.markDisconnected(room.id, host.playerId);
    service.markDisconnected(room.id, joined.value.player.playerId);

    vi.advanceTimersByTime(ROOM_REAP_IDLE_MS);

    expect(store.get(room.id)).toBeUndefined();
  });

  it('does not reap a room while at least one seat is still connected', () => {
    const { service, store } = setup();
    const { room, player: host } = service.createRoom('Alice');
    service.authenticate(room.id, host.playerId, host.sessionToken);
    const joined = service.joinRoom(room.code, 'Bob');
    if (!joined.ok) throw new Error('setup failed');
    service.authenticate(
      room.id,
      joined.value.player.playerId,
      joined.value.player.sessionToken,
    );

    service.markDisconnected(room.id, host.playerId); // Bob is still connected

    vi.advanceTimersByTime(ROOM_REAP_IDLE_MS);

    expect(store.get(room.id)).toBeDefined();
  });
});

describe('RoomService — lifecycle logging', () => {
  it('logs when a room is created', () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { service } = setup();

    service.createRoom('Alice');

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

describe('RoomService — turn timeout', () => {
  it('force-draws a connected, idle player once turnTimeoutMs elapses', () => {
    vi.useFakeTimers();
    try {
      const { service } = setup();
      const { room, player: host } = service.createRoom('Alice', {
        turnTimeoutMs: 10_000,
      });
      const joined = service.joinRoom(room.code, 'Bob');
      if (!joined.ok) throw new Error('setup failed');
      service.startMatch(room.id, host.playerId);

      const matchBefore = service.getRoom(room.id)!.match!;
      const upNextPlayerId =
        matchBefore.players[matchBefore.round.currentPlayerIndex].playerId;

      const updates: Array<{ roomId: string; events: unknown[] }> = [];
      service.onRoomUpdated((roomId, events) => updates.push({ roomId, events }));

      vi.advanceTimersByTime(10_000);

      expect(updates).toHaveLength(1);
      expect(
        updates[0].events.some(
          (e) => (e as { type: string }).type === 'PLAYER_TIMED_OUT',
        ),
      ).toBe(true);
      const matchAfter = service.getRoom(room.id)!.match!;
      const idlePlayerAfter = matchAfter.players.find(
        (p) => p.playerId === upNextPlayerId,
      )!;
      expect(idlePlayerAfter.hand.length).toBeGreaterThan(7); // started with 7, forced draw adds 1
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-declines the R-4 follow-up and passes the turn if the idle player times out again after being force-drawn', () => {
    vi.useFakeTimers();
    try {
      const { service } = setup();
      const { room, player: host } = service.createRoom('Alice', {
        turnTimeoutMs: 10_000,
      });
      const joined = service.joinRoom(room.code, 'Bob');
      if (!joined.ok) throw new Error('setup failed');
      service.startMatch(room.id, host.playerId);

      // Simulate "already force-drawn once, now facing the R-4 follow-up decision" directly,
      // rather than depending on which random card the first forced draw happened to produce.
      const match = service.getRoom(room.id)!.match!;
      match.round.hasDrawnThisTurn = true;
      const upNextPlayerId = match.players[match.round.currentPlayerIndex].playerId;

      vi.advanceTimersByTime(10_000);

      const matchAfter = service.getRoom(room.id)!.match!;
      expect(matchAfter.round.hasDrawnThisTurn).toBeUndefined();
      expect(
        matchAfter.players[matchAfter.round.currentPlayerIndex].playerId,
      ).not.toBe(upNextPlayerId);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still force-acts for a disconnected player within their reconnect grace period, independent of the 60s grace timer', () => {
    vi.useFakeTimers();
    try {
      const { service } = setup();
      const { room, player: host } = service.createRoom('Alice', {
        turnTimeoutMs: 10_000,
      });
      const joined = service.joinRoom(room.code, 'Bob');
      if (!joined.ok) throw new Error('setup failed');
      service.startMatch(room.id, host.playerId);

      const matchBefore = service.getRoom(room.id)!.match!;
      const upNextPlayerId =
        matchBefore.players[matchBefore.round.currentPlayerIndex].playerId;

      service.markDisconnected(room.id, upNextPlayerId);
      vi.advanceTimersByTime(10_000); // well before the (default 60s) reconnect grace period

      const playerAfter = service
        .getRoom(room.id)!
        .players.find((p) => p.playerId === upNextPlayerId)!;
      expect(playerAfter.autoPilot).toBe(false); // grace period hasn't expired yet

      const matchAfter = service.getRoom(room.id)!.match!;
      expect(
        matchAfter.players.find((p) => p.playerId === upNextPlayerId)!.hand
          .length,
      ).toBeGreaterThan(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not arm a turn timer during ROUND_SCORING -- the host-decision pause is out of scope', () => {
    vi.useFakeTimers();
    try {
      const { service } = setup();
      const { room, player: host } = service.createRoom('Alice', {
        turnTimeoutMs: 10_000,
      });
      const joined = service.joinRoom(room.code, 'Bob');
      if (!joined.ok) throw new Error('setup failed');
      service.startMatch(room.id, host.playerId);

      const match = service.getRoom(room.id)!.match!;
      const upNextIndex = match.round.currentPlayerIndex;
      const upNext = match.players[upNextIndex];
      const forcedCard = {
        id: 'forced-2-hearts',
        suit: 'hearts' as const,
        rank: '2' as const,
      };
      match.players[upNextIndex] = { ...upNext, hand: [forcedCard] };
      match.round.currentSuit = forcedCard.suit;
      match.round.currentRank = forcedCard.rank;
      const result = service.handleCommand(room.id, {
        type: 'PLAY_CARDS',
        playerId: upNext.playerId,
        cardIds: [forcedCard.id],
      });
      if (!result.ok) throw new Error(`setup play failed: ${result.error}`);
      expect(service.getRoom(room.id)!.match!.round.phase).toBe(
        'ROUND_SCORING',
      );

      const updates: Array<{ roomId: string; events: unknown[] }> = [];
      service.onRoomUpdated((roomId, events) => updates.push({ roomId, events }));

      vi.advanceTimersByTime(10_000);

      expect(updates).toHaveLength(0);
      expect(service.getRoom(room.id)!.match!.round.phase).toBe(
        'ROUND_SCORING',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults turnTimeoutMs to 30 seconds when not overridden', () => {
    const { service } = setup();
    const { room } = service.createRoom('Alice');
    expect(room.settings.turnTimeoutMs).toBe(30_000);
  });
});

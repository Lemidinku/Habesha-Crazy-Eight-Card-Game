import { describe, expect, it } from 'vitest';
import type { Card, MatchState } from '@crazy8/engine';
import { redactEventForRecipient, redactRoomForPlayer } from './redaction';
import type { Room } from './room.types';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({
  id: `${rank}-${suit}`,
  rank,
  suit,
});

function makeRoom(): Room {
  const match: MatchState = {
    players: [
      {
        playerId: 'alice',
        hand: [card('K', 'hearts'), card('3', 'clubs')],
        matchScore: 0,
        roundsWon: 2,
      },
      {
        playerId: 'bob',
        hand: [card('9', 'clubs')],
        matchScore: 10,
        roundsWon: 0,
      },
    ],
    round: {
      phase: 'AWAITING_PLAY',
      drawPile: [card('4', 'clubs'), card('5', 'clubs'), card('6', 'clubs')],
      discardPile: [card('Q', 'hearts')],
      decksInPlay: 1,
      currentSuit: 'hearts',
      currentRank: 'Q',
      direction: 1,
      currentPlayerIndex: 0,
      pendingStack: undefined,
    },
    handSize: 7,
    roundStarterIndex: 0,
    penaltyTable: { byRank: {} as never, aceOfSpades: 0 },
    leaderRoundCounts: {},
    matchStatus: 'IN_PROGRESS',
  };

  return {
    id: 'room-1',
    code: 'ABCDEF',
    hostPlayerId: 'alice',
    settings: { handSize: 7, reconnectGraceMs: 60_000, turnTimeoutMs: 30_000 },
    players: [
      {
        playerId: 'alice',
        sessionToken: 'tok-a',
        displayName: 'Alice',
        seatIndex: 0,
        connectionStatus: 'connected',
        autoPilot: false,
      },
      {
        playerId: 'bob',
        sessionToken: 'tok-b',
        displayName: 'Bob',
        seatIndex: 1,
        connectionStatus: 'connected',
        autoPilot: false,
      },
    ],
    status: 'IN_PROGRESS',
    match,
  };
}

describe('redactRoomForPlayer', () => {
  it("shows the recipient's own hand but only a count for everyone else", () => {
    const room = makeRoom();
    const view = redactRoomForPlayer(room, 'alice');

    const aliceView = view.players.find((p) => p.playerId === 'alice')!;
    const bobView = view.players.find((p) => p.playerId === 'bob')!;

    expect(aliceView.hand).toEqual([card('K', 'hearts'), card('3', 'clubs')]);
    expect(aliceView.handCount).toBe(2);
    expect(bobView.hand).toBeUndefined();
    expect(bobView.handCount).toBe(1);
  });

  it('passes roundsWon through unredacted (a public stat, unlike hand contents)', () => {
    const room = makeRoom();
    const view = redactRoomForPlayer(room, 'bob');
    expect(view.players.find((p) => p.playerId === 'alice')!.roundsWon).toBe(2);
    expect(view.players.find((p) => p.playerId === 'bob')!.roundsWon).toBe(0);
  });

  it('exposes only the draw pile COUNT, never its contents', () => {
    const room = makeRoom();
    const view = redactRoomForPlayer(room, 'alice');
    expect(view.round?.drawPileCount).toBe(3);
    expect(view.round).not.toHaveProperty('drawPile');
  });

  it('includes the fully-public discard pile as-is', () => {
    const room = makeRoom();
    const view = redactRoomForPlayer(room, 'bob');
    expect(view.round?.discardPile).toEqual([card('Q', 'hearts')]);
  });

  it('omits round/match fields entirely before a match has started', () => {
    const room = makeRoom();
    room.match = undefined;
    room.status = 'LOBBY';
    const view = redactRoomForPlayer(room, 'alice');
    expect(view.round).toBeUndefined();
    expect(view.matchStatus).toBeUndefined();
  });

  it('includes turnDeadlineAt when present on the room', () => {
    const room = makeRoom();
    room.turnDeadlineAt = 1_700_000_000_000;
    const view = redactRoomForPlayer(room, 'alice');
    expect(view.turnDeadlineAt).toBe(1_700_000_000_000);
  });

  it('omits turnDeadlineAt when the room has none set', () => {
    const room = makeRoom();
    const view = redactRoomForPlayer(room, 'alice');
    expect(view.turnDeadlineAt).toBeUndefined();
  });
});

describe('redactEventForRecipient', () => {
  it('hides the drawn card from everyone except the drawer', () => {
    const event = {
      type: 'CARD_DRAWN' as const,
      playerId: 'alice',
      card: card('7', 'spades'),
    };
    expect(redactEventForRecipient(event, 'alice')).toEqual(event);
    expect(redactEventForRecipient(event, 'bob')).toEqual({
      type: 'CARD_DRAWN',
      playerId: 'alice',
    });
  });

  it('passes every other event type through unchanged', () => {
    const event = {
      type: 'CARDS_PLAYED' as const,
      playerId: 'alice',
      cards: [card('K', 'hearts')],
    };
    expect(redactEventForRecipient(event, 'bob')).toEqual(event);
  });
});

import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { InMemoryRoomStore } from './room.store';

function setup() {
  const store = new InMemoryRoomStore();
  const service = new RoomService(store);
  const controller = new RoomController(service);
  return { controller };
}

describe('RoomController — createRoom handSize validation', () => {
  // Regression tests: handSize used to reach RoomService.createRoom (and eventually
  // packages/engine's dealHands) completely unvalidated. An oversized value throws deep inside
  // dealHands once the deck can't cover it -- uncaught, and *before* room.status flips to
  // IN_PROGRESS in RoomService.startMatch -- permanently stranding the room in LOBBY with no
  // client-facing error at all.

  it('accepts a room created with no handSize override (defaults apply)', () => {
    const { controller } = setup();
    expect(() => controller.createRoom({ displayName: 'Alice' })).not.toThrow();
  });

  it('accepts handSize values within the safe range', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', handSize: 5 }),
    ).not.toThrow();
    expect(() =>
      controller.createRoom({ displayName: 'Bob', handSize: 10 }),
    ).not.toThrow();
  });

  it('rejects a handSize large enough to exhaust the deck', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', handSize: 50 }),
    ).toThrow(BadRequestException);
  });

  it('rejects a zero or negative handSize', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', handSize: 0 }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createRoom({ displayName: 'Bob', handSize: -3 }),
    ).toThrow(BadRequestException);
  });

  it('rejects a non-integer handSize', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', handSize: 4.5 }),
    ).toThrow(BadRequestException);
  });

  it('rejects an out-of-range handSize with the HAND_SIZE_OUT_OF_RANGE code', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', handSize: 0 }),
    ).toThrow('HAND_SIZE_OUT_OF_RANGE');
  });
});

describe('RoomController — createRoom reconnectGraceMs validation', () => {
  it('accepts a room created with no reconnectGraceMs override (defaults apply)', () => {
    const { controller } = setup();
    expect(() => controller.createRoom({ displayName: 'Alice' })).not.toThrow();
  });

  it('accepts reconnectGraceMs values within the safe range', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', reconnectGraceMs: 5_000 }),
    ).not.toThrow();
    expect(() =>
      controller.createRoom({ displayName: 'Bob', reconnectGraceMs: 600_000 }),
    ).not.toThrow();
  });

  it('rejects a reconnectGraceMs below the minimum', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', reconnectGraceMs: 1_000 }),
    ).toThrow(BadRequestException);
  });

  it('rejects a reconnectGraceMs above the maximum', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({
        displayName: 'Alice',
        reconnectGraceMs: 3_600_000,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a non-integer reconnectGraceMs', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', reconnectGraceMs: 100.5 }),
    ).toThrow(BadRequestException);
  });

  it('rejects an out-of-range reconnectGraceMs with the RECONNECT_GRACE_OUT_OF_RANGE code', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'Alice', reconnectGraceMs: 1_000 }),
    ).toThrow('RECONNECT_GRACE_OUT_OF_RANGE');
  });
});

describe('RoomController — displayName length cap', () => {
  it('accepts a displayName at exactly the 32-character limit', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'a'.repeat(32) }),
    ).not.toThrow();
  });

  it('rejects a displayName over 32 characters on createRoom', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'a'.repeat(33) }),
    ).toThrow(BadRequestException);
  });

  it('rejects a displayName over 32 characters on joinRoom', () => {
    const { controller } = setup();
    controller.createRoom({ displayName: 'Alice' });
    expect(() =>
      controller.joinRoom('AAAAAA', { displayName: 'b'.repeat(33) }),
    ).toThrow(BadRequestException);
  });

  it('rejects an over-length displayName with the DISPLAY_NAME_TOO_LONG code', () => {
    const { controller } = setup();
    expect(() =>
      controller.createRoom({ displayName: 'a'.repeat(33) }),
    ).toThrow('DISPLAY_NAME_TOO_LONG');
  });
});

describe('RoomController — displayName required', () => {
  it('rejects an empty displayName on createRoom with the DISPLAY_NAME_REQUIRED code', () => {
    const { controller } = setup();
    expect(() => controller.createRoom({ displayName: '' })).toThrow(
      'DISPLAY_NAME_REQUIRED',
    );
  });

  it('rejects an empty displayName on joinRoom with the DISPLAY_NAME_REQUIRED code', () => {
    const { controller } = setup();
    controller.createRoom({ displayName: 'Alice' });
    expect(() => controller.joinRoom('AAAAAA', { displayName: '' })).toThrow(
      'DISPLAY_NAME_REQUIRED',
    );
  });
});

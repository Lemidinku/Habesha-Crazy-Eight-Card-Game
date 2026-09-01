import { describe, expect, it, vi } from 'vitest';
import type { Command } from '@crazy8/engine';
import type { Socket } from 'socket.io';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';
import { InMemoryRoomStore } from './room.store';

function fakeSocket(): Socket {
  return {
    data: {},
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
  } as unknown as Socket;
}

function setup() {
  const store = new InMemoryRoomStore();
  const service = new RoomService(store);
  const gateway = new RoomGateway(service);
  gateway.onModuleInit();
  return { service, gateway };
}

describe('RoomGateway — stale disconnect after a fast reconnect', () => {
  // Regression test: handleDisconnect used to key purely off playerId with no check that the
  // disconnecting socket was still the one currently registered. A player whose old connection
  // drops and who reconnects with a new socket before the old socket's own delayed 'disconnect'
  // event fires would have that stale event evict the live socket and incorrectly flip an
  // actively-connected player to 'disconnected'.
  it('does not evict or mark disconnected an already-reconnected player', () => {
    const { service, gateway } = setup();
    const { room, player } = service.createRoom('Alice');
    service.joinRoom(room.code, 'Bob');

    const oldSocket = fakeSocket();
    gateway.handleJoin(oldSocket, {
      roomId: room.id,
      playerId: player.playerId,
      sessionToken: player.sessionToken,
    });

    // The client silently reconnects with a new socket and re-authenticates before the old
    // socket's disconnect is ever noticed server-side.
    const newSocket = fakeSocket();
    gateway.handleJoin(newSocket, {
      roomId: room.id,
      playerId: player.playerId,
      sessionToken: player.sessionToken,
    });

    const markDisconnectedSpy = vi.spyOn(service, 'markDisconnected');

    // The old socket's delayed 'disconnect' event finally arrives.
    gateway.handleDisconnect(oldSocket);

    expect(markDisconnectedSpy).not.toHaveBeenCalled();
    expect(
      service
        .getRoom(room.id)!
        .players.find((p) => p.playerId === player.playerId)!.connectionStatus,
    ).toBe('connected');

    const socketsByRoom = (
      gateway as unknown as { socketsByRoom: Map<string, Map<string, Socket>> }
    ).socketsByRoom;
    expect(socketsByRoom.get(room.id)?.get(player.playerId)).toBe(newSocket);
  });

  it('still cleans up and marks disconnected when the current socket disconnects normally', () => {
    const { service, gateway } = setup();
    const { room, player } = service.createRoom('Alice');
    service.joinRoom(room.code, 'Bob');

    const socket = fakeSocket();
    gateway.handleJoin(socket, {
      roomId: room.id,
      playerId: player.playerId,
      sessionToken: player.sessionToken,
    });

    gateway.handleDisconnect(socket);

    expect(
      service
        .getRoom(room.id)!
        .players.find((p) => p.playerId === player.playerId)!.connectionStatus,
    ).toBe('disconnected');
    const socketsByRoom = (
      gateway as unknown as { socketsByRoom: Map<string, Map<string, Socket>> }
    ).socketsByRoom;
    expect(socketsByRoom.get(room.id)?.get(player.playerId)).toBeUndefined();
  });
});

describe('RoomGateway — TIMEOUT is server-only', () => {
  it('rejects a client-sent TIMEOUT command with FORBIDDEN_COMMAND, never reaching RoomService', () => {
    const { service, gateway } = setup();
    const { room, player } = service.createRoom('Alice');
    service.joinRoom(room.code, 'Bob');
    service.startMatch(room.id, player.playerId);

    const socket = fakeSocket();
    gateway.handleJoin(socket, {
      roomId: room.id,
      playerId: player.playerId,
      sessionToken: player.sessionToken,
    });

    const handleCommandSpy = vi.spyOn(service, 'handleCommand');

    gateway.handleCommand(socket, {
      type: 'TIMEOUT',
      playerId: player.playerId,
    } as unknown as Command);

    expect(handleCommandSpy).not.toHaveBeenCalled();
    // Narrowed to a plain function-typed property (not socket.io's method-shorthand `emit`)
    // so asserting on it doesn't trip @typescript-eslint/unbound-method.
    const emit = (socket as unknown as { emit: (...args: unknown[]) => void })
      .emit;
    expect(emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN_COMMAND',
      message: 'That action cannot be requested directly.',
    });
  });
});

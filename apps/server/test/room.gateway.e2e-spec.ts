import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('RoomGateway (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let clientSockets: ClientSocket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.listen(0);
    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    for (const socket of clientSockets) socket.disconnect();
    clientSockets = [];
  });

  function connectSocket(): ClientSocket {
    const socket = io(baseUrl, { transports: ['websocket'], forceNew: true });
    clientSockets.push(socket);
    return socket;
  }

  function waitForEvent<T = unknown>(
    socket: ClientSocket,
    event: string,
  ): Promise<T> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  it('creates a room, joins a second player, starts the match, and redacts a drawn card from the other player', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/rooms')
      .send({ displayName: 'Alice' })
      .expect(201);
    const createBody = createRes.body as {
      roomId: string;
      code: string;
      playerId: string;
      sessionToken: string;
    };
    const {
      roomId,
      code,
      playerId: alicePlayerId,
      sessionToken: aliceToken,
    } = createBody;

    const joinRes = await request(app.getHttpServer())
      .post(`/rooms/${code}/join`)
      .send({ displayName: 'Bob' })
      .expect(201);
    const joinBody = joinRes.body as { playerId: string; sessionToken: string };
    const { playerId: bobPlayerId, sessionToken: bobToken } = joinBody;

    const aliceSocket = connectSocket();
    const bobSocket = connectSocket();
    await Promise.all([
      waitForEvent(aliceSocket, 'connect'),
      waitForEvent(bobSocket, 'connect'),
    ]);

    const aliceJoinSync = waitForEvent<{
      players: Array<{ playerId: string; hand?: unknown }>;
    }>(aliceSocket, 'room:sync');
    aliceSocket.emit('room:join', {
      roomId,
      playerId: alicePlayerId,
      sessionToken: aliceToken,
    });
    const aliceSyncOnJoin = await aliceJoinSync;

    // Redaction sanity check even before the match starts: Alice's own (empty) hand is an
    // array, but she has no visibility into it for players who haven't been dealt cards yet.
    expect(
      aliceSyncOnJoin.players.find((p) => p.playerId === alicePlayerId),
    ).toBeTruthy();

    const bobJoinSync = waitForEvent(bobSocket, 'room:sync');
    bobSocket.emit('room:join', {
      roomId,
      playerId: bobPlayerId,
      sessionToken: bobToken,
    });
    await bobJoinSync;

    const aliceStartSync = waitForEvent<{
      matchStatus?: string;
      round?: { currentPlayerIndex: number };
      players: Array<{ playerId: string; hand?: unknown[] }>;
    }>(aliceSocket, 'room:sync');
    const bobStartSync = waitForEvent<{
      players: Array<{ playerId: string; hand?: unknown[] }>;
    }>(bobSocket, 'room:sync');
    aliceSocket.emit('match:start');
    const [aliceSync, bobSync] = await Promise.all([
      aliceStartSync,
      bobStartSync,
    ]);

    expect(aliceSync.matchStatus).toBe('IN_PROGRESS');
    // Alice sees her own hand, but not Bob's.
    expect(
      aliceSync.players.find((p) => p.playerId === alicePlayerId)!.hand,
    ).toHaveLength(7);
    expect(
      aliceSync.players.find((p) => p.playerId === bobPlayerId)!.hand,
    ).toBeUndefined();
    // Symmetric redaction: Bob sees his own hand, not Alice's.
    expect(
      bobSync.players.find((p) => p.playerId === bobPlayerId)!.hand,
    ).toHaveLength(7);
    expect(
      bobSync.players.find((p) => p.playerId === alicePlayerId)!.hand,
    ).toBeUndefined();

    // Seat 0 (Alice, the host who created the room) is dealt in first and acts first.
    const upNextPlayerId = alicePlayerId;
    const upNextSocket =
      upNextPlayerId === alicePlayerId ? aliceSocket : bobSocket;
    const otherSocket =
      upNextPlayerId === alicePlayerId ? bobSocket : aliceSocket;

    const upNextEvent = waitForEvent<{ type: string; card?: unknown }>(
      upNextSocket,
      'event',
    );
    const otherEvent = waitForEvent<{ type: string; card?: unknown }>(
      otherSocket,
      'event',
    );
    upNextSocket.emit('command', {
      type: 'DRAW_CARD',
      playerId: upNextPlayerId,
    });
    const [selfSeenEvent, otherSeenEvent] = await Promise.all([
      upNextEvent,
      otherEvent,
    ]);

    // The drawer sees which card they drew...
    expect(selfSeenEvent.type).toBe('CARD_DRAWN');
    expect(selfSeenEvent.card).toBeDefined();
    // ...but the other player only learns that a draw happened, not which card (NFR-4).
    expect(otherSeenEvent.type).toBe('CARD_DRAWN');
    expect(otherSeenEvent.card).toBeUndefined();
  });

  it('rejects a command carrying a spoofed playerId -- the socket identity always wins (NFR-6)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/rooms')
      .send({ displayName: 'Alice' })
      .expect(201);
    const createBody = createRes.body as {
      roomId: string;
      code: string;
      playerId: string;
      sessionToken: string;
    };
    const {
      roomId,
      code,
      playerId: alicePlayerId,
      sessionToken: aliceToken,
    } = createBody;
    const joinRes = await request(app.getHttpServer())
      .post(`/rooms/${code}/join`)
      .send({ displayName: 'Bob' })
      .expect(201);
    const joinBody = joinRes.body as { playerId: string; sessionToken: string };
    const { playerId: bobPlayerId, sessionToken: bobToken } = joinBody;

    const aliceSocket = connectSocket();
    const bobSocket = connectSocket();
    await Promise.all([
      waitForEvent(aliceSocket, 'connect'),
      waitForEvent(bobSocket, 'connect'),
    ]);

    aliceSocket.emit('room:join', {
      roomId,
      playerId: alicePlayerId,
      sessionToken: aliceToken,
    });
    await waitForEvent(aliceSocket, 'room:sync');
    bobSocket.emit('room:join', {
      roomId,
      playerId: bobPlayerId,
      sessionToken: bobToken,
    });
    await waitForEvent(bobSocket, 'room:sync');

    const startSync = waitForEvent(aliceSocket, 'room:sync');
    aliceSocket.emit('match:start');
    await startSync;
    await waitForEvent(bobSocket, 'room:sync');

    // Bob's socket claims to be acting as Alice (seat 0, who is actually up first). The
    // Gateway must ignore the claimed playerId and use Bob's authenticated identity instead.
    const bobErrorPromise = waitForEvent<{ code: string }>(bobSocket, 'error');
    bobSocket.emit('command', { type: 'DRAW_CARD', playerId: alicePlayerId });
    const bobError = await bobErrorPromise;

    expect(bobError.code).toBe('NOT_YOUR_TURN');
  });
});

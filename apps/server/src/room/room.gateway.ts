import { OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Command, DomainEvent } from '@crazy8/engine';
import type { Socket } from 'socket.io';
import { redactEventForRecipient, redactRoomForPlayer } from './redaction';
import { RoomService } from './room.service';

interface JoinPayload {
  roomId: string;
  playerId: string;
  sessionToken: string;
}

interface ClientData {
  roomId?: string;
  playerId?: string;
}

/**
 * The transport adapter (DESIGN.md §2/§5): translates Socket.IO events into RoomService calls
 * and back into redacted, per-recipient payloads. Never touches the engine directly.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RoomGateway implements OnModuleInit, OnGatewayDisconnect {
  /** playerId -> connected socket, per room. Needed because redaction means every recipient
   * gets a different payload -- Socket.IO's built-in room broadcast (one shared payload) can't
   * be used directly for anything involving hand contents. */
  private readonly socketsByRoom = new Map<string, Map<string, Socket>>();

  constructor(private readonly roomService: RoomService) {}

  onModuleInit(): void {
    // Grace-period auto-play (FR-17) happens on a timer, outside any client request -- this is
    // how the Gateway finds out it needs to broadcast the result.
    this.roomService.onRoomUpdated((roomId, events) => {
      this.broadcast(roomId, events);
      this.syncRoom(roomId);
    });
  }

  handleDisconnect(client: Socket): void {
    const { roomId, playerId } = client.data as ClientData;
    if (!roomId || !playerId) return;

    const roomSockets = this.socketsByRoom.get(roomId);
    // A newer socket may have already reconnected and overwritten this entry (e.g. a brief
    // network blip: the client reconnects and re-joins before this stale socket's own delayed
    // 'disconnect' event fires). Only clean up and mark the player disconnected if this socket
    // is still the one currently registered -- otherwise this would evict the live reconnected
    // socket and incorrectly flag an actively-connected player as disconnected.
    if (roomSockets?.get(playerId) !== client) return;

    roomSockets.delete(playerId);
    this.roomService.markDisconnected(roomId, playerId);
  }

  @SubscribeMessage('room:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ): void {
    const result = this.roomService.authenticate(
      payload.roomId,
      payload.playerId,
      payload.sessionToken,
    );
    if (!result.ok) {
      client.emit('error', {
        code: result.error,
        message: 'Could not join the room.',
      });
      return;
    }

    const data = client.data as ClientData;
    data.roomId = payload.roomId;
    data.playerId = payload.playerId;
    client.join(payload.roomId);

    let roomSockets = this.socketsByRoom.get(payload.roomId);
    if (!roomSockets) {
      roomSockets = new Map();
      this.socketsByRoom.set(payload.roomId, roomSockets);
    }
    roomSockets.set(payload.playerId, client);

    this.syncRoom(payload.roomId);
  }

  @SubscribeMessage('room:leave')
  handleLeave(@ConnectedSocket() client: Socket): void {
    const { roomId, playerId } = client.data as ClientData;
    if (!roomId || !playerId) return;

    const result = this.roomService.leaveLobby(roomId, playerId);
    if (!result.ok) {
      client.emit('error', {
        code: result.error,
        message: 'Could not leave the room.',
      });
      return;
    }

    this.socketsByRoom.get(roomId)?.delete(playerId);
    client.leave(roomId);
    const data = client.data as ClientData;
    data.roomId = undefined;
    data.playerId = undefined;

    if (result.value.room) {
      this.syncRoom(roomId);
    }
  }

  @SubscribeMessage('match:start')
  handleStart(@ConnectedSocket() client: Socket): void {
    const { roomId, playerId } = client.data as ClientData;
    if (!roomId || !playerId) {
      client.emit('error', {
        code: 'NOT_JOINED',
        message: 'Join the room before starting it.',
      });
      return;
    }

    const result = this.roomService.startMatch(roomId, playerId);
    if (!result.ok) {
      client.emit('error', {
        code: result.error,
        message: 'Could not start the match.',
      });
      return;
    }

    this.broadcast(roomId, result.value.events);
    this.syncRoom(roomId);
  }

  @SubscribeMessage('command')
  handleCommand(
    @ConnectedSocket() client: Socket,
    @MessageBody() command: Command,
  ): void {
    const { roomId, playerId } = client.data as ClientData;
    if (!roomId || !playerId) {
      client.emit('error', {
        code: 'NOT_JOINED',
        message: 'Join the room before sending commands.',
      });
      return;
    }

    // TIMEOUT is server-only (RoomService issues it directly, never via this socket path) --
    // a client-supplied one is either a bug or an attempt to force another player's turn to
    // advance early. Rejected before it ever reaches RoomService.
    if (command.type === 'TIMEOUT') {
      client.emit('error', {
        code: 'FORBIDDEN_COMMAND',
        message: 'That action cannot be requested directly.',
      });
      return;
    }

    // NFR-6: the socket's authenticated identity is the source of truth for who this command
    // is from -- never the client-supplied playerId in the payload.
    const trustedCommand: Command = { ...command, playerId };

    const result = this.roomService.handleCommand(roomId, trustedCommand);
    if (!result.ok) {
      client.emit('error', {
        code: result.error,
        message: 'That move was rejected.',
      });
      return;
    }

    this.broadcast(roomId, result.value.events);
    this.syncRoom(roomId);
  }

  private broadcast(roomId: string, events: DomainEvent[]): void {
    if (events.length === 0) return;
    const roomSockets = this.socketsByRoom.get(roomId);
    if (!roomSockets) return;
    for (const [playerId, socket] of roomSockets) {
      for (const event of events) {
        socket.emit('event', redactEventForRecipient(event, playerId));
      }
    }
  }

  private syncRoom(roomId: string): void {
    const room = this.roomService.getRoom(roomId);
    const roomSockets = this.socketsByRoom.get(roomId);
    if (!room || !roomSockets) return;
    for (const [playerId, socket] of roomSockets) {
      socket.emit('room:sync', redactRoomForPlayer(room, playerId));
    }
  }
}

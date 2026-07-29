import { Injectable } from '@nestjs/common';
import type { Room } from './room.types';

/** Repository-pattern seam (DESIGN.md §3.5): RoomService depends only on this interface, so
 * swapping the in-memory implementation for a Redis-backed one later (§7 scale-out) is a new
 * class, not a rewrite of every call site. */
export interface RoomStore {
  get(roomId: string): Room | undefined;
  getByCode(code: string): Room | undefined;
  save(room: Room): void;
  delete(roomId: string): void;
}

export const ROOM_STORE = Symbol('ROOM_STORE');

@Injectable()
export class InMemoryRoomStore implements RoomStore {
  private readonly roomsById = new Map<string, Room>();
  private readonly idsByCode = new Map<string, string>();

  get(roomId: string): Room | undefined {
    return this.roomsById.get(roomId);
  }

  getByCode(code: string): Room | undefined {
    const roomId = this.idsByCode.get(code);
    return roomId ? this.roomsById.get(roomId) : undefined;
  }

  save(room: Room): void {
    this.roomsById.set(room.id, room);
    this.idsByCode.set(room.code, room.id);
  }

  delete(roomId: string): void {
    const room = this.roomsById.get(roomId);
    if (room) this.idsByCode.delete(room.code);
    this.roomsById.delete(roomId);
  }
}

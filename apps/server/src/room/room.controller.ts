import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { RoomService } from './room.service';

interface CreateRoomBody {
  displayName: string;
  handSize?: number;
  reconnectGraceMs?: number;
}

interface JoinRoomBody {
  displayName: string;
}

/** Deck size is 52 for <=4 players (1 deck) or 104 for 5-8 (2 decks, deckCountForPlayers in
 * packages/engine/src/deck.ts). A room's final player count isn't known at creation time (more
 * can still join), so this cap has to be safe for *any* eventual count 2-8 -- the tightest case
 * across that whole range is 4 players on 1 deck (floor(51/4) = 12) and 8 players on 2 decks
 * (floor(103/8) = 12). 10 leaves headroom under that ceiling for the opening discard card and
 * matches realistic Crazy Eights hand sizes anyway. Without this, an unbounded handSize reaches
 * packages/engine/src/deck.ts's dealHands, which throws once the deck can't cover it -- and
 * since that throw happens inside RoomService.startMatch *before* room.status flips to
 * IN_PROGRESS, an uncaught throw there leaves the room permanently stuck in LOBBY. */
const MIN_HAND_SIZE = 1;
const MAX_HAND_SIZE = 10;

/** The thin REST half of the room lifecycle (DESIGN.md §5.1) -- everything after a player is
 * seated goes over the WebSocket gateway instead. */
@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  createRoom(@Body() body: CreateRoomBody) {
    const displayName = body?.displayName?.trim();
    if (!displayName) {
      throw new BadRequestException('displayName is required');
    }

    if (body.handSize !== undefined) {
      if (
        !Number.isInteger(body.handSize) ||
        body.handSize < MIN_HAND_SIZE ||
        body.handSize > MAX_HAND_SIZE
      ) {
        throw new BadRequestException(
          `handSize must be an integer between ${MIN_HAND_SIZE} and ${MAX_HAND_SIZE}`,
        );
      }
    }

    const { room, player } = this.roomService.createRoom(displayName, {
      handSize: body.handSize,
      reconnectGraceMs: body.reconnectGraceMs,
    });

    return {
      roomId: room.id,
      code: room.code,
      playerId: player.playerId,
      sessionToken: player.sessionToken,
    };
  }

  @Post(':code/join')
  joinRoom(@Param('code') code: string, @Body() body: JoinRoomBody) {
    const displayName = body?.displayName?.trim();
    if (!displayName) {
      throw new BadRequestException('displayName is required');
    }

    const result = this.roomService.joinRoom(code, displayName);
    if (!result.ok) {
      if (result.error === 'ROOM_NOT_FOUND')
        throw new NotFoundException(result.error);
      throw new BadRequestException(result.error);
    }

    const { room, player } = result.value;
    return {
      roomId: room.id,
      playerId: player.playerId,
      sessionToken: player.sessionToken,
    };
  }
}

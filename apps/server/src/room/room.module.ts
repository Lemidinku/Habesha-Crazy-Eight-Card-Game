import { Module } from '@nestjs/common';
import { RoomController } from './room.controller';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';
import { InMemoryRoomStore, ROOM_STORE } from './room.store';

@Module({
  controllers: [RoomController],
  providers: [
    RoomService,
    RoomGateway,
    { provide: ROOM_STORE, useClass: InMemoryRoomStore },
  ],
})
export class RoomModule {}

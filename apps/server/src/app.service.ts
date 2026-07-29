import { Injectable } from '@nestjs/common';
import { buildDeck } from '@crazy8/engine';

@Injectable()
export class AppService {
  getHello(): string {
    const deckSize = buildDeck(4).length;
    return `Hello World! Engine says: a 4-player deck has ${deckSize} cards`;
  }
}

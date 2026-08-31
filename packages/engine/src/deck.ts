import type { Card, Rank, RoundState, Suit } from "./types.js";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** R-1: 2-4 players use a single 52-card deck, 5-8 players use two decks shuffled together. */
export function deckCountForPlayers(playerCount: number): 1 | 2 {
  return playerCount <= 4 ? 1 : 2;
}

export function buildSingleDeck(deckIndex: number): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${rank}-${suit}-${deckIndex}`, suit, rank });
    }
  }
  return cards;
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** R-1: builds a shuffled deck sized for the given player count. */
export function buildDeck(playerCount: number, rng: () => number = Math.random): Card[] {
  const deckCount = deckCountForPlayers(playerCount);
  const cards: Card[] = [];
  for (let deckIndex = 0; deckIndex < deckCount; deckIndex++) {
    cards.push(...buildSingleDeck(deckIndex));
  }
  return shuffle(cards, rng);
}

export interface DealResult {
  hands: Card[][];
  remainingDeck: Card[];
}

/** R-2: deals `handSize` cards to each of `playerCount` seats, in round-robin order. */
export function dealHands(deck: Card[], playerCount: number, handSize: number): DealResult {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const remainingDeck = deck.slice();
  for (let round = 0; round < handSize; round++) {
    for (let seat = 0; seat < playerCount; seat++) {
      const card = remainingDeck.shift();
      if (!card) {
        throw new Error("Deck ran out of cards while dealing the opening hands");
      }
      hands[seat].push(card);
    }
  }
  return { hands, remainingDeck };
}

export interface NewRoundResult {
  hands: Card[][];
  round: RoundState;
}

/** R-1, R-2, R-3: builds a deck sized for the table, deals hands, and flips the opening
 * discard card. A special card in that opening flip has no effect (R-3) — it's simply the
 * starting top card. */
export function dealNewRound(
  playerCount: number,
  handSize: number,
  startingPlayerIndex: number,
  rng: () => number = Math.random,
): NewRoundResult {
  const deck = buildDeck(playerCount, rng);
  const { hands, remainingDeck } = dealHands(deck, playerCount, handSize);

  const openingCard = remainingDeck.shift();
  if (!openingCard) {
    throw new Error("Deck ran out of cards while flipping the opening discard card");
  }

  const round: RoundState = {
    phase: "AWAITING_PLAY",
    drawPile: remainingDeck,
    discardPile: [openingCard],
    decksInPlay: deckCountForPlayers(playerCount),
    currentSuit: openingCard.suit,
    currentRank: openingCard.rank,
    direction: 1,
    currentPlayerIndex: startingPlayerIndex,
    pendingStack: undefined,
  };

  return { hands, round };
}

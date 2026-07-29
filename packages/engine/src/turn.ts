import type { Direction } from "./types.js";

/**
 * R-20, R-21: computes the next player's seat index, respecting the current direction and
 * whether this turn's play triggered a skip (R-8 - the very next player is skipped entirely).
 */
export function nextPlayerIndex(
  currentIndex: number,
  playerCount: number,
  direction: Direction,
  skip = false,
): number {
  const step = skip ? direction * 2 : direction;
  return (((currentIndex + step) % playerCount) + playerCount) % playerCount;
}

export function reverseDirection(direction: Direction): Direction {
  return (direction * -1) as Direction;
}

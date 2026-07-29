import type { Card } from '@crazy8/engine';

/** The engine treats cardIds[0] as the "lead" card that decides which effect applies
 * (DESIGN.md §3.3) -- for a 7-dump that must be the 7, regardless of the order the player
 * happened to click cards in. Click order has no rule significance, so it shouldn't matter here
 * either: clicking the other same-suit cards before the 7 must still work. */
export function orderCardIdsForPlay(hand: Card[], selectedIds: string[]): string[] {
  const sevenId = selectedIds.find((id) => hand.find((c) => c.id === id)?.rank === '7');
  if (!sevenId) return selectedIds;
  return [sevenId, ...selectedIds.filter((id) => id !== sevenId)];
}

import { formatCard } from '../lib/cardDisplay';
import type { RedactedRoomSync } from '../lib/wireTypes';
import type { WireEvent } from '../lib/wireTypes';
import { useRoomStore } from '../store/roomStore';

function playerName(room: RedactedRoomSync, playerId: string): string {
  return room.players.find((p) => p.playerId === playerId)?.displayName ?? 'Someone';
}

function describeEvent(event: WireEvent, room: RedactedRoomSync): string {
  switch (event.type) {
    case 'CARDS_PLAYED':
      return `${playerName(room, event.playerId)} played ${event.cards.map(formatCard).join(', ')}`;
    case 'SUIT_DECLARED':
      return `${playerName(room, event.playerId)} declared the suit: ${event.suit}`;
    case 'STACK_EXTENDED':
      return `${playerName(room, event.playerId)} stacked with ${formatCard(event.card)} (now draw ${event.newAccumulated})`;
    case 'STACK_ABSORBED':
      return `${playerName(room, event.playerId)} drew ${event.drawnCount} card${event.drawnCount === 1 ? '' : 's'} from the stack`;
    case 'CARD_DRAWN':
      return `${playerName(room, event.playerId)} drew a card`;
    case 'PLAYER_SKIPPED':
      return `${playerName(room, event.playerId)} was skipped`;
    case 'DIRECTION_REVERSED':
      return 'Direction reversed';
    case 'DISCARD_RESHUFFLED_INTO_DRAW_PILE':
      return `Discard pile reshuffled into a new draw pile (${event.cardCount} cards)`;
    case 'ROUND_ENDED':
      return `${playerName(room, event.winnerPlayerId)} won the round`;
    case 'NEXT_ROUND_STARTED':
      return 'Next round started';
    case 'MATCH_ENDED':
      return `${playerName(room, event.winnerPlayerId)} wins the match!`;
    case 'MATCH_ABANDONED':
      return `${playerName(room, event.playerId)} left the game — ${playerName(room, event.winnerPlayerId)} wins`;
  }
}

const VISIBLE_EVENT_COUNT = 5;

export function ActivityFeed() {
  const room = useRoomStore((s) => s.room);
  const events = useRoomStore((s) => s.events);
  if (!room) return null;

  // The store keeps more history than this for other components (e.g. RoundEndOverlay/
  // MatchEndOverlay search backwards for a specific event type) -- only the feed's own display
  // is capped and newest-first.
  const visibleEvents = events.slice(-VISIBLE_EVENT_COUNT).reverse();

  return (
    <div className="w-full max-w-3xl">
      <div className="text-xs uppercase tracking-wide text-card/35 mb-1.5">Activity</div>
      <ul className="space-y-1 text-sm text-card/70 bg-felt-raised/60 rounded-lg p-3">
        {visibleEvents.length === 0 && <li className="text-card/35">Nothing has happened yet.</li>}
        {visibleEvents.map((event, i) => (
          <li key={i}>{describeEvent(event, room)}</li>
        ))}
      </ul>
    </div>
  );
}

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { formatCard } from '../lib/cardDisplay';
import type { RedactedRoomSync } from '../lib/wireTypes';
import type { WireEvent } from '../lib/wireTypes';
import { useRoomStore } from '../store/roomStore';

function playerName(room: RedactedRoomSync, playerId: string, t: TFunction): string {
  return room.players.find((p) => p.playerId === playerId)?.displayName ?? t('activityFeed.someone');
}

function describeEvent(event: WireEvent, room: RedactedRoomSync, t: TFunction): string {
  switch (event.type) {
    case 'CARDS_PLAYED':
      return t('activityFeed.cardsPlayed', {
        name: playerName(room, event.playerId, t),
        cards: event.cards.map(formatCard).join(', '),
      });
    case 'SUIT_DECLARED':
      return t('activityFeed.suitDeclared', {
        name: playerName(room, event.playerId, t),
        suit: t(`common.suits.${event.suit}`),
      });
    case 'STACK_EXTENDED':
      return t('activityFeed.stackExtended', {
        name: playerName(room, event.playerId, t),
        card: formatCard(event.card),
        count: event.newAccumulated,
      });
    case 'STACK_ABSORBED':
      return t('activityFeed.stackAbsorbed', {
        name: playerName(room, event.playerId, t),
        count: event.drawnCount,
      });
    case 'CARD_DRAWN':
      return t('activityFeed.cardDrawn', { name: playerName(room, event.playerId, t) });
    case 'PLAYER_SKIPPED':
      return t('activityFeed.playerSkipped', { name: playerName(room, event.playerId, t) });
    case 'DIRECTION_REVERSED':
      return t('activityFeed.directionReversed');
    case 'DISCARD_RESHUFFLED_INTO_DRAW_PILE':
      return t('activityFeed.discardReshuffled', { count: event.cardCount });
    case 'FRESH_DECK_ADDED_TO_DRAW_PILE':
      return t('activityFeed.freshDeckAdded', { count: event.cardCount });
    case 'ROUND_ENDED':
      return t('activityFeed.roundEnded', { name: playerName(room, event.winnerPlayerId, t) });
    case 'NEXT_ROUND_STARTED':
      return t('activityFeed.nextRoundStarted');
    case 'MATCH_ENDED':
      return t('activityFeed.matchEnded', { name: playerName(room, event.winnerPlayerId, t) });
    case 'MATCH_ABANDONED':
      return t('activityFeed.matchAbandoned', {
        name: playerName(room, event.playerId, t),
        winner: playerName(room, event.winnerPlayerId, t),
      });
  }
}

const VISIBLE_EVENT_COUNT = 5;

export function ActivityFeed() {
  const { t } = useTranslation();
  const room = useRoomStore((s) => s.room);
  const events = useRoomStore((s) => s.events);
  if (!room) return null;

  // The store keeps more history than this for other components (e.g. RoundEndOverlay/
  // MatchEndOverlay search backwards for a specific event type) -- only the feed's own display
  // is capped and newest-first.
  const visibleEvents = events.slice(-VISIBLE_EVENT_COUNT).reverse();

  return (
    <div className="w-full max-w-3xl">
      <div className="text-xs uppercase tracking-wide text-card/35 mb-1.5">{t('activityFeed.heading')}</div>
      <ul className="space-y-1 text-sm text-card/70 bg-felt-raised/60 rounded-lg p-3">
        {visibleEvents.length === 0 && <li className="text-card/35">{t('activityFeed.empty')}</li>}
        {visibleEvents.map((event, i) => (
          <li key={i}>{describeEvent(event, room, t)}</li>
        ))}
      </ul>
    </div>
  );
}

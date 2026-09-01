import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { extendsStack, isLegalPlay, isWild, type Card, type Suit } from '@crazy8/engine';
import { orderCardIdsForPlay } from '../lib/cardOrdering';
import { suitTextClass, wildRingClass } from '../lib/cardDisplay';
import { sendCommand } from '../lib/socket';
import type { RedactedRoundState } from '../lib/wireTypes';
import { useRoomStore } from '../store/roomStore';
import { CardFace } from './CardFace';
import { SuitPicker } from './SuitPicker';

/** Client-side ADVISORY legality only (DESIGN.md §2) -- purely for highlighting which cards
 * are worth clicking. The server independently re-validates every command regardless (NFR-4);
 * nothing here is trusted. */
function isCardHighlightable(card: Card, round: RedactedRoundState): boolean {
  if (round.phase === 'AWAITING_STACK_RESPONSE') {
    return round.pendingStack ? extendsStack(card, round.pendingStack) !== null : false;
  }
  return isLegalPlay(card, round);
}

interface PlayerHandProps {
  selectedIds: string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
}

export function PlayerHand({ selectedIds, setSelectedIds }: PlayerHandProps) {
  const { t } = useTranslation();
  const room = useRoomStore((s) => s.room);
  const session = useRoomStore((s) => s.session);
  const [pendingWildCardIds, setPendingWildCardIds] = useState<string[] | null>(null);

  const round = room?.round;
  const me = room?.players.find((p) => p.playerId === session?.playerId);
  const hand = useMemo(() => me?.hand ?? [], [me]);
  const isMyTurn = round ? room?.players[round.currentPlayerIndex]?.playerId === session?.playerId : false;

  const orderedSelectedIds = useMemo(() => orderCardIdsForPlay(hand, selectedIds), [selectedIds, hand]);

  const leadCard = hand.find((c) => c.id === orderedSelectedIds[0]);
  const leadIsWild = leadCard ? isWild(leadCard) : false;

  if (!room || !session || !round || !me) return null;

  function toggleCard(cardId: string) {
    if (!isMyTurn) return;
    setSelectedIds((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]));
  }

  function handlePlaySelected() {
    if (orderedSelectedIds.length === 0) return;
    if (leadIsWild) {
      setPendingWildCardIds(orderedSelectedIds);
      return;
    }
    sendCommand({ type: 'PLAY_CARDS', playerId: session!.playerId, cardIds: orderedSelectedIds });
    setSelectedIds([]);
  }

  function handleChooseSuit(suit: Suit) {
    if (!pendingWildCardIds) return;
    sendCommand({ type: 'PLAY_CARDS', playerId: session!.playerId, cardIds: pendingWildCardIds, declaredSuit: suit });
    setPendingWildCardIds(null);
    setSelectedIds([]);
  }

  function handleSkip() {
    sendCommand({ type: 'DRAW_CARD', playerId: session!.playerId });
    setSelectedIds([]);
  }

  function handleExtendStack(cardId: string) {
    sendCommand({ type: 'RESOLVE_STACK', playerId: session!.playerId, cardId });
  }

  function handleAbsorbStack() {
    sendCommand({ type: 'RESOLVE_STACK', playerId: session!.playerId });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-center gap-2">
        {hand.map((card) => {
          const highlightable = isCardHighlightable(card, round);
          const selected = selectedIds.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              disabled={!isMyTurn}
              onClick={() => (round.phase === 'AWAITING_STACK_RESPONSE' ? handleExtendStack(card.id) : toggleCard(card.id))}
              className={[
                'w-16 h-24 rounded-lg flex items-center justify-center transition',
                highlightable ? 'bg-card' : 'bg-card/45',
                selected
                  ? 'ring-2 ring-gold -translate-y-2 shadow-[0_4px_14px_rgba(0,0,0,0.4)]'
                  : wildRingClass(card),
                !isMyTurn ? 'opacity-60' : highlightable ? 'cursor-pointer hover:-translate-y-1' : 'cursor-pointer',
              ].join(' ')}
            >
              <span className={highlightable ? suitTextClass(card.suit) : `${suitTextClass(card.suit)} opacity-50`}>
                <CardFace card={card} />
              </span>
            </button>
          );
        })}
      </div>

      {isMyTurn && round.phase === 'AWAITING_PLAY' && (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-jade px-4 py-2 font-semibold text-felt transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
            disabled={selectedIds.length === 0}
            onClick={handlePlaySelected}
          >
            {t('playerHand.playSelected')}
          </button>
          {round.hasDrawnThisTurn ? (
            <button
              type="button"
              className="rounded-lg bg-felt-raised border border-card/15 px-4 py-2 font-medium text-card hover:border-card/30"
              onClick={handleSkip}
            >
              {t('playerHand.skip')}
            </button>
          ) : (
            <p className="text-xs text-card/45 self-center">{t('playerHand.orClickDrawPile')}</p>
          )}
        </div>
      )}

      {isMyTurn && round.phase === 'AWAITING_STACK_RESPONSE' && (
        <div className="text-center space-y-2">
          <p className="text-gold text-sm">{t('playerHand.stackHint')}</p>
          <button
            type="button"
            className="rounded-lg bg-felt-raised border border-card/15 px-4 py-2 font-medium text-card hover:border-card/30"
            onClick={handleAbsorbStack}
          >
            {t('playerHand.drawAbsorb', { count: round.pendingStack?.accumulated ?? 0 })}
          </button>
        </div>
      )}

      {pendingWildCardIds && <SuitPicker onChoose={handleChooseSuit} onCancel={() => setPendingWildCardIds(null)} />}
    </div>
  );
}

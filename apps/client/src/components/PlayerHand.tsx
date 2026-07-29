import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { extendsStack, isLegalPlay, isWild, type Card, type Suit } from '@crazy8/engine';
import { orderCardIdsForPlay } from '../lib/cardOrdering';
import { isRedSuit } from '../lib/cardDisplay';
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
    <div className="space-y-3">
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
                'w-16 h-24 rounded border-2 flex items-center justify-center font-semibold transition-transform',
                selected ? 'border-emerald-400 -translate-y-2' : 'border-transparent',
                highlightable
                  ? isRedSuit(card.suit) ? 'bg-white text-red-600' : 'bg-white text-slate-900'
                  : isRedSuit(card.suit) ? 'bg-slate-400 text-red-900' : 'bg-slate-400 text-slate-600',
                !isMyTurn ? 'opacity-60' : 'cursor-pointer',
              ].join(' ')}
            >
              <CardFace card={card} />
            </button>
          );
        })}
      </div>

      {isMyTurn && round.phase === 'AWAITING_PLAY' && (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50"
            disabled={selectedIds.length === 0}
            onClick={handlePlaySelected}
          >
            Play Selected
          </button>
          {round.hasDrawnThisTurn ? (
            <button type="button" className="rounded bg-slate-700 px-4 py-2 font-medium" onClick={handleSkip}>
              Skip
            </button>
          ) : (
            <p className="text-xs text-slate-400 self-center">or click the draw pile above</p>
          )}
        </div>
      )}

      {isMyTurn && round.phase === 'AWAITING_STACK_RESPONSE' && (
        <div className="text-center space-y-2">
          <p className="text-amber-300 text-sm">Click a highlighted card to extend the stack, or absorb it.</p>
          <button type="button" className="rounded bg-slate-700 px-4 py-2 font-medium" onClick={handleAbsorbStack}>
            Draw {round.pendingStack?.accumulated}
          </button>
        </div>
      )}

      {pendingWildCardIds && <SuitPicker onChoose={handleChooseSuit} onCancel={() => setPendingWildCardIds(null)} />}
    </div>
  );
}

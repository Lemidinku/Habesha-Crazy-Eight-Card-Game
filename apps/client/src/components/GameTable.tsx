import { useState } from 'react';
import { SUIT_SYMBOLS, formatCard, isRedSuit, suitTextClass, wildRingClass } from '../lib/cardDisplay';
import { sendCommand } from '../lib/socket';
import { useRoomStore } from '../store/roomStore';
import { ActivityFeed } from './ActivityFeed';
import { CardFace } from './CardFace';
import { MatchEndOverlay } from './MatchEndOverlay';
import { PlayerHand } from './PlayerHand';
import { RoundEndOverlay } from './RoundEndOverlay';

export function GameTable() {
  const room = useRoomStore((s) => s.room);
  const session = useRoomStore((s) => s.session);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  if (!room || !session || !room.round) return null;

  const round = room.round;
  const currentPlayer = room.players[round.currentPlayerIndex];
  const isMyTurn = currentPlayer?.playerId === session.playerId;
  const topCard = round.discardPile.at(-1);
  // The pile only ever handles the *initial* voluntary draw (R-4a) -- once a card's been drawn
  // this turn, declining to play it is "Skip", which lives back in PlayerHand's action row.
  const canDraw = isMyTurn && round.phase === 'AWAITING_PLAY' && !round.hasDrawnThisTurn;

  function handleAbandon() {
    if (!window.confirm('Leave the game? This ends the match for everyone.')) return;
    sendCommand({ type: 'ABANDON_MATCH', playerId: session!.playerId });
  }

  function handleDrawPileClick() {
    if (!canDraw) return;
    sendCommand({ type: 'DRAW_CARD', playerId: session!.playerId });
    setSelectedIds([]);
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      {room.matchStatus === 'MATCH_END' && <MatchEndOverlay />}
      {room.matchStatus === 'IN_PROGRESS' && round.phase === 'ROUND_SCORING' && <RoundEndOverlay />}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAbandon}
          className="text-xs text-card/40 hover:text-crimson underline"
        >
          Leave Game
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-3 text-sm">
        {room.players.map((p) => (
          <div
            key={p.playerId}
            className={[
              'rounded-lg px-3 py-2 min-w-28 border transition-colors',
              p.playerId === currentPlayer?.playerId
                ? 'bg-jade/15 border-jade text-jade'
                : 'bg-felt-raised border-card/10 text-card/70',
            ].join(' ')}
          >
            <div className="font-medium text-card">{p.displayName}</div>
            <div className="font-display text-2xl font-bold leading-tight text-card">
              {p.handCount} <span className="text-xs font-body font-normal text-card/50">cards</span>
            </div>
            <div className="text-xs text-card/45">
              {p.matchScore} pts &middot; {p.roundsWon} win{p.roundsWon === 1 ? '' : 's'}
            </div>
            {p.connectionStatus === 'disconnected' && <div className="text-gold">disconnected</div>}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-felt-raised border border-card/10 py-5 flex justify-center items-center gap-6">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-card/40 mb-1.5">Draw pile</div>
          <button
            type="button"
            onClick={handleDrawPileClick}
            disabled={!canDraw}
            className={[
              'w-16 h-24 rounded-lg flex flex-col items-center justify-center font-display text-lg font-bold transition',
              'bg-[repeating-linear-gradient(135deg,var(--color-felt)_0px,var(--color-felt)_4px,var(--color-felt-raised)_4px,var(--color-felt-raised)_8px)] border-2',
              canDraw ? 'border-gold cursor-pointer hover:brightness-125' : 'border-card/15 cursor-default',
            ].join(' ')}
          >
            <span className="text-card">{round.drawPileCount}</span>
            {canDraw && <span className="text-[10px] font-body font-normal text-gold">Draw</span>}
          </button>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-card/40 mb-1.5">Discard</div>
          <div
            className={[
              'w-16 h-24 rounded-lg bg-card flex items-center justify-center',
              topCard ? wildRingClass(topCard) : '',
            ].join(' ')}
          >
            {topCard ? (
              <span className={suitTextClass(topCard.suit)}>
                <CardFace card={topCard} />
              </span>
            ) : (
              <span className="text-ink/30">-</span>
            )}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-card/40 mb-1.5">Active suit</div>
          <div className={`text-3xl ${isRedSuit(round.currentSuit) ? 'text-crimson' : 'text-card'}`}>
            {SUIT_SYMBOLS[round.currentSuit]}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-card/40 mb-1.5">Direction</div>
          <div className="text-3xl text-card">{round.direction === 1 ? '⟳' : '⟲'}</div>
        </div>
      </div>

      {round.pendingStack && (
        <div className="text-center text-gold text-sm">
          Pending draw-stack: {round.pendingStack.accumulated} card
          {round.pendingStack.accumulated === 1 ? '' : 's'} on top of{' '}
          <span
            className={`font-display font-semibold ${
              isRedSuit(round.pendingStack.topCard.suit) ? 'text-crimson' : 'text-card'
            }`}
          >
            {formatCard(round.pendingStack.topCard)}
          </span>
        </div>
      )}

      <div
        className={[
          'mx-auto w-fit rounded-full px-5 py-1.5 text-lg font-display font-bold transition-colors',
          isMyTurn
            ? 'bg-gold/15 text-gold ring-2 ring-gold shadow-[0_0_16px_rgba(214,162,74,0.35)]'
            : 'text-card/45 font-body font-medium',
        ].join(' ')}
      >
        {isMyTurn ? 'Your Turn' : `${currentPlayer?.displayName ?? '…'}'s turn`}
      </div>

      <PlayerHand selectedIds={selectedIds} setSelectedIds={setSelectedIds} />

      <ActivityFeed />
    </div>
  );
}

import { useState } from 'react';
import { SUIT_SYMBOLS, isRedSuit } from '../lib/cardDisplay';
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
          className="text-xs text-slate-400 hover:text-red-400 underline"
        >
          Leave Game
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-4 text-sm">
        {room.players.map((p) => (
          <div
            key={p.playerId}
            className={`rounded px-3 py-2 min-w-28 ${
              p.playerId === currentPlayer?.playerId ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <div className="font-medium text-slate-100">{p.displayName}</div>
            <div className="text-2xl font-bold leading-tight">{p.handCount} <span className="text-xs font-normal">cards</span></div>
            <div className="text-xs text-slate-400">{p.matchScore} pts &middot; {p.roundsWon} win{p.roundsWon === 1 ? '' : 's'}</div>
            {p.connectionStatus === 'disconnected' && <div className="text-amber-400">disconnected</div>}
          </div>
        ))}
      </div>

      <div className="flex justify-center items-center gap-6">
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">Draw pile</div>
          <button
            type="button"
            onClick={handleDrawPileClick}
            disabled={!canDraw}
            className={[
              'w-16 h-24 rounded flex flex-col items-center justify-center text-lg font-semibold transition-colors',
              canDraw ? 'bg-slate-700 hover:bg-slate-600 cursor-pointer ring-2 ring-emerald-400' : 'bg-slate-700 cursor-default',
            ].join(' ')}
          >
            <span>{round.drawPileCount}</span>
            {canDraw && <span className="text-[10px] font-normal text-emerald-300">Draw</span>}
          </button>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">Discard</div>
          <div
            className={`w-16 h-24 rounded bg-white flex items-center justify-center text-lg font-semibold ${
              topCard && isRedSuit(topCard.suit) ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {topCard ? <CardFace card={topCard} /> : '-'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">Active suit</div>
          <div className="text-3xl">{SUIT_SYMBOLS[round.currentSuit]}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">Direction</div>
          <div className="text-3xl">{round.direction === 1 ? '⟳' : '⟲'}</div>
        </div>
      </div>

      {round.pendingStack && (
        <div className="text-center text-amber-300 text-sm flex items-center justify-center gap-1">
          Pending draw-stack: {round.pendingStack.accumulated} cards on top of <CardFace card={round.pendingStack.topCard} />
        </div>
      )}

      <div
        className={[
          'mx-auto w-fit rounded-lg px-4 py-1.5 text-lg font-bold transition-colors',
          isMyTurn ? 'bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400' : 'text-slate-400 font-medium',
        ].join(' ')}
      >
        {isMyTurn ? 'Your Turn' : `${currentPlayer?.displayName ?? '...'}'s turn`}
      </div>

      <PlayerHand selectedIds={selectedIds} setSelectedIds={setSelectedIds} />

      <ActivityFeed />
    </div>
  );
}

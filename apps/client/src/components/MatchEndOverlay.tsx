import { returnToHome } from '../hooks/useRoomConnection';
import { useRoomStore } from '../store/roomStore';

export function MatchEndOverlay() {
  const room = useRoomStore((s) => s.room);
  const events = useRoomStore((s) => s.events);
  if (!room) return null;

  const abandonedEvent = [...events].reverse().find((e) => e.type === 'MATCH_ABANDONED');
  const abandonerName =
    abandonedEvent?.type === 'MATCH_ABANDONED'
      ? room.players.find((p) => p.playerId === abandonedEvent.playerId)?.displayName
      : undefined;

  const sorted = [...room.players].sort((a, b) => a.matchScore - b.matchScore);
  const winner = sorted[0];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-felt-raised border border-gold/25 rounded-xl p-8 space-y-4 text-center min-w-64">
        <h2 className="font-display text-2xl font-bold text-card">{abandonerName ? 'Game ended' : 'Match over!'}</h2>
        {abandonerName && <p className="text-card/50">{abandonerName} left the game</p>}
        {winner && <p className="text-gold text-lg font-semibold">{winner.displayName} wins</p>}
        <ul className="space-y-1 text-card/80">
          {sorted.map((p) => (
            <li key={p.playerId} className="flex justify-between gap-8">
              <span>{p.displayName}</span>
              <span>{p.matchScore} pts &middot; {p.roundsWon} win{p.roundsWon === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="rounded-lg bg-jade px-4 py-2 font-semibold text-felt transition hover:brightness-110"
          onClick={returnToHome}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

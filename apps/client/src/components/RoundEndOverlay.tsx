import { sendCommand } from '../lib/socket';
import { useRoomStore } from '../store/roomStore';

/** Shown during the pause between rounds (round.phase === 'ROUND_SCORING', match still
 * IN_PROGRESS) -- the round no longer auto-continues; the host explicitly chooses to continue
 * or end the match early using current standings. */
export function RoundEndOverlay() {
  const room = useRoomStore((s) => s.room);
  const session = useRoomStore((s) => s.session);
  const events = useRoomStore((s) => s.events);
  if (!room || !session) return null;

  const isHost = room.hostPlayerId === session.playerId;
  const lastRoundEnded = [...events].reverse().find((e) => e.type === 'ROUND_ENDED');
  const roundScores = lastRoundEnded?.type === 'ROUND_ENDED' ? lastRoundEnded.scores : {};
  const winnerId = lastRoundEnded?.type === 'ROUND_ENDED' ? lastRoundEnded.winnerPlayerId : undefined;
  const winnerName = room.players.find((p) => p.playerId === winnerId)?.displayName;

  function handleContinue() {
    sendCommand({ type: 'START_NEXT_ROUND', playerId: session!.playerId });
  }

  function handleEndGame() {
    sendCommand({ type: 'END_MATCH_EARLY', playerId: session!.playerId });
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded p-8 space-y-4 text-center min-w-72">
        <h2 className="text-2xl font-semibold">Round over</h2>
        {winnerName && <p className="text-emerald-400">{winnerName} won the round</p>}
        <ul className="space-y-1 text-left">
          {room.players.map((p) => (
            <li key={p.playerId} className="flex justify-between gap-8">
              <span>{p.displayName}</span>
              <span>
                +{roundScores[p.playerId] ?? 0} (total {p.matchScore}, {p.roundsWon} win{p.roundsWon === 1 ? '' : 's'})
              </span>
            </li>
          ))}
        </ul>
        {isHost ? (
          <div className="flex gap-3 justify-center pt-2">
            <button type="button" className="rounded bg-emerald-600 px-4 py-2 font-medium" onClick={handleContinue}>
              Continue
            </button>
            <button type="button" className="rounded bg-red-700 px-4 py-2 font-medium" onClick={handleEndGame}>
              End Game
            </button>
          </div>
        ) : (
          <p className="text-slate-400 text-sm pt-2">Waiting for the host to continue...</p>
        )}
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { sendCommand } from '../lib/socket';
import { useRoomStore } from '../store/roomStore';

/** Shown during the pause between rounds (round.phase === 'ROUND_SCORING', match still
 * IN_PROGRESS) -- the round no longer auto-continues; the host explicitly chooses to continue
 * or end the match early using current standings. */
export function RoundEndOverlay() {
  const { t } = useTranslation();
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
      <div className="bg-felt-raised border border-gold/25 rounded-xl p-8 space-y-4 text-center min-w-72">
        <h2 className="font-display text-2xl font-bold text-card">{t('roundEndOverlay.title')}</h2>
        {winnerName && <p className="text-gold font-semibold">{t('roundEndOverlay.wonRound', { name: winnerName })}</p>}
        <ul className="space-y-1 text-left text-card/80">
          {room.players.map((p) => (
            <li key={p.playerId} className="flex justify-between gap-8">
              <span>{p.displayName}</span>
              <span>
                {t('roundEndOverlay.scoreLine', {
                  gained: roundScores[p.playerId] ?? 0,
                  total: p.matchScore,
                  count: p.roundsWon,
                })}
              </span>
            </li>
          ))}
        </ul>
        {isHost ? (
          <div className="flex gap-3 justify-center pt-2">
            <button
              type="button"
              className="rounded-lg bg-jade px-4 py-2 font-semibold text-felt transition hover:brightness-110"
              onClick={handleContinue}
            >
              {t('roundEndOverlay.continue')}
            </button>
            <button
              type="button"
              className="rounded-lg bg-crimson px-4 py-2 font-semibold text-card transition hover:brightness-110"
              onClick={handleEndGame}
            >
              {t('roundEndOverlay.endGame')}
            </button>
          </div>
        ) : (
          <p className="text-card/50 text-sm pt-2">{t('roundEndOverlay.waitingForHost')}</p>
        )}
      </div>
    </div>
  );
}

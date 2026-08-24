import { returnToHome } from '../hooks/useRoomConnection';
import { leaveRoomSocket, startMatchSocket } from '../lib/socket';
import { useRoomStore } from '../store/roomStore';

export function LobbyScreen() {
  const room = useRoomStore((s) => s.room);
  const session = useRoomStore((s) => s.session);
  if (!room || !session) return null;

  const isHost = room.hostPlayerId === session.playerId;

  function handleLeave() {
    leaveRoomSocket();
    returnToHome();
  }

  return (
    <div className="w-full max-w-md space-y-5">
      <div className="rounded-xl bg-felt-raised border border-gold/25 py-5 text-center space-y-1">
        <p className="text-xs uppercase tracking-widest text-card/45">Room code</p>
        <p className="font-display text-4xl font-bold tracking-[0.3em] text-gold">{room.code}</p>
        <p className="text-xs text-card/40">Share this code with friends to join</p>
      </div>
      <ul className="space-y-2">
        {room.players.map((p) => (
          <li
            key={p.playerId}
            className="flex justify-between items-center rounded-lg bg-felt-raised border border-card/10 px-3 py-2.5"
          >
            <span className="text-card">
              {p.displayName}
              {p.playerId === room.hostPlayerId && <span className="text-gold text-xs ml-1.5">HOST</span>}
            </span>
            <span
              className={`text-xs flex items-center gap-1.5 ${p.connectionStatus === 'connected' ? 'text-jade' : 'text-card/35'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${p.connectionStatus === 'connected' ? 'bg-jade' : 'bg-card/35'}`} />
              {p.connectionStatus}
            </span>
          </li>
        ))}
      </ul>
      {isHost ? (
        <button
          type="button"
          className="w-full rounded-lg bg-jade px-3 py-2.5 font-semibold text-felt transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
          disabled={room.players.length < 2}
          onClick={() => startMatchSocket()}
        >
          {room.players.length < 2 ? 'Waiting for more players…' : 'Start Match'}
        </button>
      ) : (
        <p className="text-center text-card/50 text-sm">Waiting for the host to start the match…</p>
      )}
      <button
        type="button"
        className="w-full text-center text-sm text-card/40 hover:text-crimson underline"
        onClick={handleLeave}
      >
        Leave Room
      </button>
    </div>
  );
}

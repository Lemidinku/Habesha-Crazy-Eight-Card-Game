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
    <div className="w-full max-w-md space-y-4">
      <h2 className="text-xl font-semibold text-center">Room {room.code}</h2>
      <p className="text-center text-slate-400 text-sm">Share this code with friends to join.</p>
      <ul className="space-y-2">
        {room.players.map((p) => (
          <li key={p.playerId} className="flex justify-between rounded bg-slate-800 px-3 py-2">
            <span>
              {p.displayName}
              {p.playerId === room.hostPlayerId && <span className="text-slate-400"> (host)</span>}
            </span>
            <span className={p.connectionStatus === 'connected' ? 'text-emerald-400' : 'text-slate-500'}>
              {p.connectionStatus}
            </span>
          </li>
        ))}
      </ul>
      {isHost ? (
        <button
          type="button"
          className="w-full rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50"
          disabled={room.players.length < 2}
          onClick={() => startMatchSocket()}
        >
          {room.players.length < 2 ? 'Waiting for more players...' : 'Start Match'}
        </button>
      ) : (
        <p className="text-center text-slate-400 text-sm">Waiting for the host to start the match...</p>
      )}
      <button type="button" className="w-full text-center text-sm text-slate-400 hover:text-red-400 underline" onClick={handleLeave}>
        Leave Room
      </button>
    </div>
  );
}

import { useState } from 'react';
import { joinRoom } from '../lib/api';
import { storeSession } from '../hooks/useRoomConnection';
import { joinRoomSocket } from '../lib/socket';
import { setRoomUrl } from '../lib/urlRoom';
import { useRoomStore } from '../store/roomStore';

interface JoinByUrlScreenProps {
  code: string;
}

/** Shown when the page loads on /room/:code with no matching stored session -- e.g. someone
 * opened a shared invite link. Just needs a name; the room code is already known from the URL. */
export function JoinByUrlScreen({ code }: JoinByUrlScreenProps) {
  const setSession = useRoomStore((s) => s.setSession);
  const setError = useRoomStore((s) => s.setError);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleJoin() {
    const name = displayName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await joinRoom(code, name);
      const session = {
        roomId: res.roomId,
        code,
        playerId: res.playerId,
        sessionToken: res.sessionToken,
        displayName: name,
      };
      storeSession(session);
      setSession(session);
      setRoomUrl(code);
      joinRoomSocket(session.roomId, session.playerId, session.sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join room');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold text-center">Join Room {code}</h1>
      <input
        className="w-full rounded bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
        placeholder="Your name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        autoFocus
      />
      <button
        type="button"
        className="w-full rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50"
        disabled={busy || !displayName.trim()}
        onClick={handleJoin}
      >
        Join Game
      </button>
    </div>
  );
}

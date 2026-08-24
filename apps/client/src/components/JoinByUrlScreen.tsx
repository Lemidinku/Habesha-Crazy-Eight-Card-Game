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
    <div className="w-full max-w-sm space-y-5">
      <div className="text-center space-y-1">
        <p className="text-sm text-card/50">You've been invited to</p>
        <h1 className="font-display text-3xl font-bold text-card tracking-widest">{code}</h1>
      </div>
      <input
        className="w-full rounded-lg bg-felt-raised border border-card/10 px-3 py-2.5 text-card placeholder:text-card/35 outline-none focus:ring-2 focus:ring-gold focus:border-gold"
        placeholder="Your name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
        autoFocus
      />
      <button
        type="button"
        className="w-full rounded-lg bg-jade px-3 py-2.5 font-semibold text-felt transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
        disabled={busy || !displayName.trim()}
        onClick={handleJoin}
      >
        Join Game
      </button>
    </div>
  );
}

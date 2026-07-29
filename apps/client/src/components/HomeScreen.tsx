import { useState } from 'react';
import { createRoom, joinRoom } from '../lib/api';
import { storeSession } from '../hooks/useRoomConnection';
import { joinRoomSocket } from '../lib/socket';
import { setRoomUrl } from '../lib/urlRoom';
import { useRoomStore } from '../store/roomStore';

export function HomeScreen() {
  const setSession = useRoomStore((s) => s.setSession);
  const setError = useRoomStore((s) => s.setError);
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const name = displayName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await createRoom(name);
      const session = {
        roomId: res.roomId,
        code: res.code,
        playerId: res.playerId,
        sessionToken: res.sessionToken,
        displayName: name,
      };
      storeSession(session);
      setSession(session);
      setRoomUrl(res.code);
      joinRoomSocket(session.roomId, session.playerId, session.sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create room');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    const name = displayName.trim();
    const roomCode = code.trim().toUpperCase();
    if (!name || !roomCode) return;
    setBusy(true);
    try {
      const res = await joinRoom(roomCode, name);
      const session = {
        roomId: res.roomId,
        code: roomCode,
        playerId: res.playerId,
        sessionToken: res.sessionToken,
        displayName: name,
      };
      storeSession(session);
      setSession(session);
      setRoomUrl(roomCode);
      joinRoomSocket(session.roomId, session.playerId, session.sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join room');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold text-center">Crazy Eights</h1>
      <input
        className="w-full rounded bg-slate-800 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
        placeholder="Your name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <button
        type="button"
        className="w-full rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50"
        disabled={busy || !displayName.trim()}
        onClick={handleCreate}
      >
        Create Room
      </button>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded bg-slate-800 px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="button"
          className="rounded bg-sky-600 px-4 py-2 font-medium disabled:opacity-50"
          disabled={busy || !displayName.trim() || !code.trim()}
          onClick={handleJoin}
        >
          Join
        </button>
      </div>
      {!displayName.trim() && (
        <p className="text-center text-amber-400 text-sm">Enter your name above to create or join a room.</p>
      )}
    </div>
  );
}

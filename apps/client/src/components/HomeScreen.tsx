import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRoom, joinRoom } from '../lib/api';
import { withColdStartWarning } from '../lib/coldStart';
import { storeSession } from '../hooks/useRoomConnection';
import { joinRoomSocket } from '../lib/socket';
import { setRoomUrl } from '../lib/urlRoom';
import { useRoomStore } from '../store/roomStore';

export function HomeScreen() {
  const { t } = useTranslation();
  const setSession = useRoomStore((s) => s.setSession);
  const setError = useRoomStore((s) => s.setError);
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);

  async function handleCreate() {
    const name = displayName.trim();
    if (!name) return;
    setBusy(true);
    setWakingUp(false);
    try {
      const res = await withColdStartWarning(createRoom(name), () =>
        setWakingUp(true),
      );
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
      setError(err instanceof Error ? err.message : 'UNKNOWN');
    } finally {
      setBusy(false);
      setWakingUp(false);
    }
  }

  async function handleJoin() {
    const name = displayName.trim();
    const roomCode = code.trim().toUpperCase();
    if (!name || !roomCode) return;
    setBusy(true);
    setWakingUp(false);
    try {
      const res = await withColdStartWarning(joinRoom(roomCode, name), () =>
        setWakingUp(true),
      );
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
      setError(err instanceof Error ? err.message : 'UNKNOWN');
    } finally {
      setBusy(false);
      setWakingUp(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-5">
      <div className="text-center space-y-1">
        <h1 className="font-display text-4xl font-bold text-card tracking-tight">
          {t('home.titlePlain')} <span className="text-gold">{t('home.titleAccent')}</span>
        </h1>
        <p className="text-sm text-card/50">{t('home.tagline')}</p>
      </div>
      <input
        className="w-full rounded-lg bg-felt-raised border border-card/10 px-3 py-2.5 text-card placeholder:text-card/35 outline-none focus:ring-2 focus:ring-gold focus:border-gold"
        placeholder={t('home.namePlaceholder')}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <button
        type="button"
        className="w-full rounded-lg bg-jade px-3 py-2.5 font-semibold text-felt transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
        disabled={busy || !displayName.trim()}
        onClick={handleCreate}
      >
        {t('home.createRoom')}
      </button>
      <div className="flex items-center gap-3 text-xs text-card/35">
        <div className="h-px flex-1 bg-card/10" />
        {t('home.orJoinWithCode')}
        <div className="h-px flex-1 bg-card/10" />
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 min-w-0 rounded-lg bg-felt-raised border border-card/10 px-3 py-2.5 uppercase tracking-widest text-card placeholder:text-card/35 placeholder:tracking-normal placeholder:normal-case outline-none focus:ring-2 focus:ring-gold focus:border-gold"
          placeholder={t('common.roomCode')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="button"
          className="rounded-lg bg-gold px-4 py-2.5 font-semibold text-felt transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
          disabled={busy || !displayName.trim() || !code.trim()}
          onClick={handleJoin}
        >
          {t('home.join')}
        </button>
      </div>
      {wakingUp && (
        <p className="text-center text-gold text-sm" role="status">
          {t('home.wakingUp')}
        </p>
      )}
      {!wakingUp && !displayName.trim() && (
        <p className="text-center text-gold text-sm">{t('home.enterNamePrompt')}</p>
      )}
    </div>
  );
}

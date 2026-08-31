import { useEffect, useRef, useState } from 'react';
import { returnToHome } from '../hooks/useRoomConnection';
import { leaveRoomSocket, startMatchSocket } from '../lib/socket';
import { useRoomStore } from '../store/roomStore';

type CopyState = 'idle' | 'copied' | 'failed';

/** Copies text via the Clipboard API, falling back to a hidden textarea + execCommand for
 * browsers/contexts where navigator.clipboard isn't available (older Safari, non-HTTPS). */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  try {
    if (!document.execCommand('copy')) throw new Error('execCommand failed');
  } finally {
    document.body.removeChild(el);
  }
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L18.5 4.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.49-1.49" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function LobbyScreen() {
  const room = useRoomStore((s) => s.room);
  const session = useRoomStore((s) => s.session);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  if (!room || !session) return null;

  const isHost = room.hostPlayerId === session.playerId;
  const roomCode = room.code;

  function handleLeave() {
    leaveRoomSocket();
    returnToHome();
  }

  async function handleCopyLink() {
    try {
      await copyToClipboard(`${window.location.origin}/room/${roomCode}`);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState('idle'), 1800);
  }

  return (
    <div className="w-full max-w-md space-y-5">
      <div className="rounded-xl bg-felt-raised border border-gold/25 py-5 text-center space-y-2">
        <p className="text-xs uppercase tracking-widest text-card/45">Room code</p>
        <p className="font-display text-4xl font-bold tracking-[0.3em] text-gold">{room.code}</p>
        <button
          type="button"
          onClick={handleCopyLink}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
            copyState === 'copied'
              ? 'text-jade'
              : copyState === 'failed'
                ? 'text-crimson'
                : 'text-card/40 hover:text-gold'
          }`}
        >
          {copyState === 'copied' ? <CheckIcon /> : <LinkIcon />}
          <span aria-live="polite">
            {copyState === 'copied'
              ? 'Copied!'
              : copyState === 'failed'
                ? "Couldn't copy — select the code above"
                : 'Copy invite link to share with friends'}
          </span>
        </button>
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

import { useEffect } from 'react';
import { connectRoomSocket, joinRoomSocket } from '../lib/socket';
import { clearRoomUrl, getRoomCodeFromUrl } from '../lib/urlRoom';
import { useRoomStore, type SessionInfo } from '../store/roomStore';

const STORAGE_KEY = 'crazy8-session';

export function loadStoredSession(): SessionInfo | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionInfo;
  } catch {
    return null;
  }
}

export function storeSession(session: SessionInfo): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Shared exit hatch used both after a match ends and when leaving a lobby before it starts:
 * clears the stored session, resets the URL back to `/`, and clears the in-memory room state. */
export function returnToHome(): void {
  clearStoredSession();
  clearRoomUrl();
  useRoomStore.getState().reset();
}

/** Wires the socket's connection lifecycle and three message types into the store.
 *
 * Rejoining a room from a previously-stored session (FR-16: a page refresh -- or a
 * reconnect -- mid-match shouldn't lose your seat) happens on every `onConnect`, not
 * just once on mount. socket.io-client fires `'connect'` both for the first connection
 * *and* for its own automatic reconnects after a dropped transport (a brief wifi blip,
 * a backgrounded tab, etc.) -- rejoining only on mount meant that class of reconnect
 * silently never re-authenticated: the server had already started that seat's grace
 * timer via `handleDisconnect`, but nothing on the client ever told it the socket was
 * back, so the only thing that actually worked was a full page reload. Tying the rejoin
 * attempt to `onConnect` instead covers both cases with one code path. */
export function useRoomConnection(): void {
  const setRoom = useRoomStore((s) => s.setRoom);
  const addEvent = useRoomStore((s) => s.addEvent);
  const setError = useRoomStore((s) => s.setError);
  const setSession = useRoomStore((s) => s.setSession);

  useEffect(() => {
    function attemptRejoin() {
      const stored = loadStoredSession();
      if (!stored) return;
      const urlCode = getRoomCodeFromUrl();
      // If the URL points at a *different* room than the stored session, prefer the URL --
      // don't silently rejoin the old room when the user opened a fresh invite link.
      if (urlCode && stored.code !== urlCode) return;
      setSession(stored);
      joinRoomSocket(stored.roomId, stored.playerId, stored.sessionToken);
    }

    return connectRoomSocket({
      onConnect: attemptRejoin,
      onSync: (room) => setRoom(room),
      onEvent: (event) => addEvent(event),
      onError: (error) => setError(error.code),
    });
  }, [setRoom, addEvent, setError, setSession]);
}

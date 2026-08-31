import { create } from 'zustand';
import type { RedactedRoomSync, WireEvent } from '../lib/wireTypes';

export interface SessionInfo {
  roomId: string;
  /** The shareable join code (distinct from roomId) -- kept here so the URL's /room/:code can
   * be compared against a stored session to decide whether it's the same room. */
  code: string;
  playerId: string;
  sessionToken: string;
  displayName: string;
}

const MAX_EVENT_LOG = 20;

interface RoomStoreState {
  session: SessionInfo | null;
  room: RedactedRoomSync | null;
  events: WireEvent[];
  /** A server-supplied error *code* (see the `errors.*` translation keys and
   * lib/errorMessages.ts), never a display message directly -- every setError call site must
   * pass a code, translated only at render time in App.tsx. */
  error: string | null;
  setSession: (session: SessionInfo | null) => void;
  setRoom: (room: RedactedRoomSync) => void;
  addEvent: (event: WireEvent) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

/** Mirrors the last server broadcast (DESIGN.md §3.6) -- this store never computes game state
 * itself, it just holds whatever `room:sync` most recently said. Updated from the socket
 * listener in hooks/useRoomConnection.ts, which lives outside the React tree, which is exactly
 * why Zustand (not Context) was chosen for this (see DESIGN.md tech table). */
export const useRoomStore = create<RoomStoreState>((set) => ({
  session: null,
  room: null,
  events: [],
  error: null,
  setSession: (session) => set({ session }),
  setRoom: (room) => set({ room }),
  addEvent: (event) => set((state) => ({ events: [...state.events, event].slice(-MAX_EVENT_LOG) })),
  setError: (message) => set({ error: message }),
  reset: () => set({ session: null, room: null, events: [], error: null }),
}));

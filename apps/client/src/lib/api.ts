const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export interface CreateRoomResponse {
  roomId: string;
  code: string;
  playerId: string;
  sessionToken: string;
}

export interface JoinRoomResponse {
  roomId: string;
  playerId: string;
  sessionToken: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}) as { message?: string });
    throw new Error(payload.message ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function createRoom(displayName: string): Promise<CreateRoomResponse> {
  return postJson('/rooms', { displayName });
}

export function joinRoom(code: string, displayName: string): Promise<JoinRoomResponse> {
  return postJson(`/rooms/${code}/join`, { displayName });
}

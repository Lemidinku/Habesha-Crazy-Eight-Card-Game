const ROOM_URL_PATTERN = /^\/room\/([A-Za-z0-9]+)$/;

/** No routing library -- there's exactly one dynamic route (/room/:code), so plain History API
 * calls are simpler than pulling in a router for it. */
export function getRoomCodeFromUrl(): string | null {
  const match = window.location.pathname.match(ROOM_URL_PATTERN);
  return match ? match[1]!.toUpperCase() : null;
}

export function setRoomUrl(code: string): void {
  const path = `/room/${code}`;
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
  }
}

export function clearRoomUrl(): void {
  if (window.location.pathname !== '/') {
    window.history.pushState(null, '', '/');
  }
}

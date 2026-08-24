/** Render's free Web Service tier sleeps after ~15 minutes idle; the first request after that
 * can take 30-60s to respond while the instance cold-boots. Without this, a visitor's first
 * click looks hung rather than just slow. */
export const COLD_START_WARNING_DELAY_MS = 3000;

/** Wraps a promise so `onSlow` fires if it hasn't settled after `delayMs` -- purely a UI signal,
 * it never changes the outcome or timing of `promise` itself. */
export function withColdStartWarning<T>(
  promise: Promise<T>,
  onSlow: () => void,
  delayMs: number = COLD_START_WARNING_DELAY_MS,
): Promise<T> {
  const timer = setTimeout(onSlow, delayMs);
  return promise.finally(() => clearTimeout(timer));
}

const FALLBACK_ERROR_KEY = 'errors.UNKNOWN';

/** Maps a server-supplied error code (or, rarely, an arbitrary browser/network error message
 * that was never a code at all) to its translation key, falling back to a generic message for
 * anything without a translated entry. `exists` is injected (rather than importing the i18n
 * singleton directly) so this stays a plain, unit-testable function -- callers pass
 * `i18n.exists.bind(i18n)`. */
export function resolveErrorMessageKey(code: string, exists: (key: string) => boolean): string {
  const key = `errors.${code}`;
  return exists(key) ? key : FALLBACK_ERROR_KEY;
}

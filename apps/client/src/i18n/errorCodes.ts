/** Every error code the app can surface to a player, from any source: packages/engine's
 * EngineError codes (propagated through apps/server/src/room/room.service.ts's
 * `fail(result.error.code)`), apps/server's own room-lifecycle/validation codes, and the two
 * client-only synthetic codes ('REQUEST_FAILED', 'UNKNOWN') used when a REST/network failure
 * carries no code of its own. This list exists so errorCodes.test.ts can verify every one of
 * them has a translated `errors.<code>` entry in en.json. */
export const KNOWN_ERROR_CODES = [
  'ROOM_NOT_FOUND',
  'ROOM_ALREADY_STARTED',
  'ROOM_FULL',
  'NAME_TAKEN',
  'MATCH_ALREADY_STARTED',
  'NOT_HOST',
  'ALREADY_STARTED',
  'NOT_ENOUGH_PLAYERS',
  'ROOM_OR_MATCH_NOT_FOUND',
  'INVALID_SESSION',
  'NOT_JOINED',
  'FORBIDDEN_COMMAND',
  'DISPLAY_NAME_REQUIRED',
  'DISPLAY_NAME_TOO_LONG',
  'HAND_SIZE_OUT_OF_RANGE',
  'RECONNECT_GRACE_OUT_OF_RANGE',
  'TURN_TIMEOUT_OUT_OF_RANGE',
  'INTERNAL_SERVER_ERROR',
  'NO_CARDS',
  'DUPLICATE_CARD',
  'CARD_NOT_IN_HAND',
  'MATCH_ENDED',
  'NOT_SEATED',
  'NOT_YOUR_TURN',
  'UNKNOWN_COMMAND',
  'WRONG_PHASE',
  'CANNOT_EXTEND_STACK',
  'TOO_MANY_CARDS',
  'ILLEGAL_PLAY',
  'SUIT_REQUIRED',
  'INVALID_SEVEN_PLAY',
  'SEVEN_DOES_NOT_MATCH',
  'SEVEN_RANK_MATCH_CANNOT_DUMP',
  'DUMP_SUIT_MISMATCH',
  'REQUEST_FAILED',
  'UNKNOWN',
] as const;

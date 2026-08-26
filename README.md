# Crazy Eights Online

A real-time, browser-based multiplayer implementation of a house-rules variant of Crazy
Eights - 2 to 8 players, private rooms joined by a shareable code, live play over
WebSockets, built on the same trust model real competitive game servers use: the server
owns every card, every rule, and every legal move; the client only renders state and
collects input.

## Features

- **Authoritative server, zero client trust** - the client can *guess* what's legal (to
highlight playable cards) but never decides; every command is independently re-validated
server-side, and a spoofed `playerId` in a socket payload is silently overridden by the
authenticated session, not trusted - covered by a dedicated regression test.
- **A real, non-trivial ruleset** - wild-suit lock (playing an 8/J locks the *next* player
out of re-declaring, but not out of playing a wild at all), asymmetric 2/Ace-of-Spades
draw-stack chaining, and a 7 that either reverses direction or dumps a same-suit run -
all encoded as an explicit finite-state machine and a Strategy-pattern effect table, not
a growing if/else ladder.
- **Per-recipient hand secrecy** - every player's hand is redacted at the transport
boundary before it ever leaves the server; everyone else sees a card *count*, never the
cards. Enforced in one function, not "remembered" at every emit call site.
- **Live reconnection with auto-pilot** - close the tab mid-match and reopen it later;
your seat resumes exactly where it left off. Stay gone past the grace period and the
server plays safe fallback moves on your behalf so the other players are never blocked
waiting on someone who left.
- **A pure, portable game engine** - `packages/engine` has zero I/O and zero framework
dependency, unit-tested module by module and fuzz-tested with randomized-but-legal play
sequences that assert invariants (card conservation, no duplicate IDs, valid turn index)
rather than fixed expected outputs.
- **Hardened for public exposure** - CORS allowlist (not a wildcard), bounded
`reconnectGraceMs`/`displayName` inputs, CSPRNG room codes, constant-time session-token
comparison, a global exception filter that never leaks an internal error's real message,
and abandoned rooms that reap themselves instead of leaking memory forever.

## The problem

A real-time multiplayer card game can't be faked with CRUD skills. Two players can act
within milliseconds of each other, house rules stack in ways standard Crazy Eights
never has to handle (a suit lock that survives a wild play but suppresses its
suit-declare; an Ace of Spades that both opens *and* extends a draw-stack depending on
what's already on top of it), and the moment you let a browser decide anything
authoritative, someone will open devtools and cheat. This project answers that with a
strict authoritative-server architecture: one pure rules engine, one service that is the
only thing allowed to call it, and a client that is deliberately kept dumb.

## Architecture

```
┌─────────────────────────┐        WebSocket (game events)        ┌──────────────────────────┐
│   Browser Client (SPA)  │◄──────────────────────────────────────►│   Node.js Game Server    │
│  React + TS             │        HTTPS (room create/join)        │   TS, Socket.IO           │
│                          │────────────────────────────────────►  │                          │
│  - Render table/hand    │                                        │  ┌────────────────────┐  │
│  - Send intents         │                                        │  │  Transport Adapter  │  │
│  - Advisory-only hints  │                                        │  │  (Socket.IO events) │  │
└─────────────────────────┘                                        │  └─────────┬──────────┘  │
                                                                    │            │             │
                                                                    │  ┌─────────▼──────────┐  │
                                                                    │  │   Room Manager      │  │
                                                                    │  │ (session/seat/reconn)│  │
                                                                    │  └─────────┬──────────┘  │
                                                                    │            │             │
                                                                    │  ┌─────────▼──────────┐  │
                                                                    │  │  Game Engine (pure) │  │
                                                                    │  │  @crazy8/engine pkg │  │
                                                                    │  └─────────────────────┘  │
                                                                    └──────────────────────────┘
```

**Engine** (`packages/engine`) - pure TypeScript, zero knowledge of WebSockets, HTTP, or
Node. `applyMove(state, command) -> { state, events }` is the single mutation entry
point; every rule (card effects, draw-stack adjacency, the seven's reverse-or-dump, scoring
and tie-breaks) lives in its own small, independently unit-tested module. This purity is
what makes the ruleset fuzz-testable in isolation and reusable, unmodified, for the
client's advisory legality hints - client and server share the exact same rule code, so
they can never disagree about what merely *looks* legal.

**Server** (`apps/server`) - NestJS. A REST `Controller` handles the two actions that
happen before a socket exists (create/join a room); a Socket.IO `Gateway` handles
everything after a player is seated. Both funnel through one `RoomService`, the only
thing in the codebase that calls into the engine - it also owns everything the engine
deliberately has no concept of: who's the host, who's connected, reconnection grace
timers, and auto-pilot.

**Client** (`apps/client`) - React + TypeScript + Vite, Zustand for state (chosen
specifically because it can be updated from the Socket.IO listener outside the React
tree, which is the client's main write path), Tailwind for styling. The store never
computes game state - it purely mirrors whatever the server's last broadcast said.

## The hardest decisions (and why)

**1. An explicit finite-state machine for round/turn phase, not scattered booleans.**
`WAITING_FOR_PLAYERS -> DEALING -> AWAITING_PLAY <-> AWAITING_STACK_RESPONSE ->
ROUND_SCORING`, looping back to `DEALING` only via an explicit `START_NEXT_ROUND`
command. "Can this player do this right now" becomes a single phase lookup instead of a
web of flags - and it paid off in a way that only showed up during implementation: an
originally-sketched `AWAITING_SUIT_CHOICE` phase turned out to be unnecessary, since a
wild play already carries its declared suit inline and is rejected outright if it
doesn't. One fewer state than the design doc predicted, found by building it.

**2. The suit-lock (R-5a) is a suppressed effect, not a blocked move.** After a wild is
played, the very next player is locked out of *re-declaring* a suit - but they can still
legally play a wild of their own; it just silently fails to change the active suit. The
engine models this as `wildEffect` checking `isSuitLocked` and returning
`newSuit: round.currentSuit` with no `suitDeclared` flag, so the `SUIT_DECLARED` event
simply never fires for a suppressed declare - the client still shows the player a normal
suit picker and lets them "choose," and the server just quietly ignores it. No special
rejection path, no separate "locked" error code - the lock is invisible in outcome, not
enforced as a hard block.

**3. Absorbing a draw-stack doesn't end your turn - and that single rule makes the
"stack after absorbing" case work for free.** A player who can't extend a pending
2/Ace-of-Spades stack draws the full accumulated penalty but immediately continues their
turn as normal (R-14). Because `currentPlayerIndex` deliberately isn't advanced and the
engine doesn't re-enter `AWAITING_STACK_RESPONSE` on its own, a 2 or Ace of Spades played
right after an absorb goes through the *ordinary opening* path rather than
extension logic - a brand-new stack, correctly, with zero extra code written to special-case
it.

**4. Per-recipient hand redaction can't use Socket.IO's built-in room broadcast.**
`io.to(room).emit(...)` sends one shared payload to everyone in a room - but every
recipient here needs a *different* payload (their own hand vs. everyone else's card
count). The Gateway maintains its own `Map<roomId, Map<playerId, Socket>>` and redacts
each event individually per socket before emitting, rather than relying on Socket.IO's
native broadcast at all. This is also the specific reason a future multi-instance
deployment can't just reach for the standard `@socket.io/redis-adapter` recipe -
per-recipient redaction has to happen somewhere that recipe doesn't reach, so scaling out
would need a custom Pub/Sub layer built around that constraint instead.

**5. Auto-pilot resolution bypasses the socket, on purpose.** When a disconnected
player's grace period expires mid-turn, `resolveAutoPilotChain` calls `applyMove`
directly - not through any client request - looping for as long as whoever's now up is
also in auto-pilot, then pushing the result out through the same broadcast path a real
player's move would take. This keeps the engine's "one function mutates state" guarantee
intact even for state changes a timer causes rather than a request, and reuses the exact
guaranteed-legal fallback move the fuzz harness relies on to guarantee it can never get
the match stuck.

## Security

- **CORS allowlist**, not a wildcard - `getCorsOptions()` resolves the deployed client's
real origin from an env var, unit- and e2e-tested independently of the app's bootstrap.
- **Bounded, validated room settings** - `reconnectGraceMs` is clamped to a sane
5-second-to-10-minute range and `displayName` is capped at 32 characters on both create
and join, closing what was previously an unbounded, unvalidated request body.
- **CSPRNG room codes** - `crypto.randomInt` instead of `Math.random()`, over a charset
that excludes visually-ambiguous characters (`0`/`O`, `1`/`I`/`L`) since these codes get
read aloud and typed by hand.
- **Constant-time session-token comparison** - `crypto.timingSafeEqual` instead of a
plain `!==`, so authenticating a reconnect doesn't leak how many leading characters of a
guessed token matched.
- **A global exception filter** normalizes every thrown exception - expected
(`HttpException`) or not - into one response envelope, and logs an unexpected one
exactly once server-side instead of letting its real message reach the client as-is.

## Reliability & engineering practices

- **Abandoned rooms reap themselves.** A room where every seat has been disconnected
past an idle window is deleted automatically, reusing the same per-key `setTimeout`
pattern the reconnect-grace-period logic already established - closes a real memory leak
(a room nobody ever finishes joining, or a match everyone walks away from) rather than
just documenting it as a known gap.
- **Real lifecycle logging** - room creation, match start, disconnects, auto-pilot
engaging, and room reaps are now observable server-side via Nest's `Logger`, where
previously none of it was visible except by reading client-facing socket traffic.
- **Cold-start UX for a free-tier deploy** - Render's free Web Service tier sleeps after
15 minutes idle, and the first request after that can take up to a minute. A small,
independently-tested timing utility (`withColdStartWarning`) surfaces a "waking up the
server" message instead of leaving a visitor's first click looking hung.
- **CI on every push and PR** (GitHub Actions) - lint, build, and the full test suite
across all three workspace packages (engine unit tests, server unit + e2e tests over
real sockets, client unit tests) before anything merges.
- **Testing in depth, not just breadth** - engine rules get one unit-test file per
module *and* a fuzz harness that plays randomized-but-legal games asserting invariants
rather than fixed outputs; the server has integration tests against a real Nest app and
e2e tests over real `socket.io-client` sockets (including a regression test that a
spoofed `playerId` gets overridden, not honored).

## What changes at scale

The v1 room store is a single process's in-memory `Map` - correct and fast for the dozens
of concurrent rooms this is built for, but it doesn't survive a restart and can't be
served by more than one process. The upgrade path: swap the store for a Redis-backed
implementation behind the same `RoomStore` interface the service already depends on
(zero call-site changes), then replace the in-process pub/sub the Gateway currently
subscribes to with real Redis Pub/Sub scoped per room - built around the constraint
that per-recipient hand redaction can't go through a shared-broadcast adapter (decision
#4 above).

## Local development

Requires Node 20.x and pnpm 9.x.

```bash
pnpm install
pnpm --filter @crazy8/engine build   # server/client resolve the engine via its compiled dist/
pnpm dev                             # runs server + client in parallel
```

The client expects the server at `VITE_API_URL` (defaults to `http://localhost:3000`;
see `apps/client/.env.local`). Run `pnpm test` to run every package's test suite,
`pnpm build` to build all three.

## Try it

1. Open the app in two browser windows (or one regular + one incognito), create a room
in window A, and join it from window B using the room code.
2. Play a 2 or an Ace of Spades to open a draw-stack, then chain it with another
qualifying card instead of absorbing it.
3. Play an 8 or a Jack and declare a suit - watch the *next* player's suit-picker still
appear if they also play a wild, but the active suit doesn't actually change (R-5a's
suit lock).
4. Close window B's tab mid-match and wait past the reconnect grace period - window A
sees that seat switch to auto-pilot and keep playing safe fallback moves. Reopen the
room's URL as B in a new tab to resync back into the same seat.
5. From a fresh, cold visit after the server's been idle a while, watch for the "waking
up the server" message before the room loads.

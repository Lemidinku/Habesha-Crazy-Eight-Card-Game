# Crazy Eights Online

A real-time, browser-based multiplayer implementation of a house-rules variant of Crazy Eights —
private rooms via a shareable join code, 2-8 players, live play over WebSockets. Built as an
authoritative-server / thin-client system: the server is the sole source of truth for every hand
and every legal move, the client only renders state and collects input (see `DESIGN.md` §1) — the
same trust model real-time competitive games (chess servers, other card-game servers) use.

**Play it live:** <!-- add the deployed URL here once render.yaml is connected and deployed -->

<!-- Screenshot/GIF: add after the first live deploy -->

## Tech stack

- **Engine** (`packages/engine`) — pure TypeScript game rules, zero I/O, unit-tested and fuzz-tested independently of any server.
- **Server** (`apps/server`) — NestJS, a Socket.IO gateway plus a REST controller, holds all room/match state.
- **Client** (`apps/client`) — React + TypeScript + Vite, Zustand for state, Tailwind CSS for styling.
- **Monorepo** — pnpm workspaces (`packages/engine`, `apps/server`, `apps/client`).

## Run it locally

```bash
pnpm install
pnpm --filter @crazy8/engine build   # server/client resolve the engine via its compiled dist/
pnpm dev                             # runs both apps in parallel
```

The client expects the server at `VITE_API_URL` (defaults to `http://localhost:3000`; see
`apps/client/.env.local`). Run `pnpm test` to run every package's test suite, `pnpm build` to
build all three.

## Learn more

- [`DESIGN.md`](./DESIGN.md) — architecture, design patterns, and the reasoning behind each one.
- [`SRS.md`](./SRS.md) — the full game rules specification (this is a house-rules variant).
- [`HOW_IT_WORKS.md`](./HOW_IT_WORKS.md) — a code-level walkthrough of the current implementation.

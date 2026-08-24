# @crazy8/server

The NestJS backend for Crazy Eights Online — REST endpoints for room create/join, a Socket.IO
gateway for everything after a player is seated. See the [root README](../../README.md) for the
full project overview, and [`HOW_IT_WORKS.md`](../../HOW_IT_WORKS.md) §3 for how this app is
structured.

Run `pnpm --filter server start:dev` (from the repo root, after `pnpm install`) to run this app
alone against a local build of `@crazy8/engine`.

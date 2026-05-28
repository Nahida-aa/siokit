# Progress

## Goal
- Build a WebSocket + HTTP polling framework (sokit) compatible with socket.io-client, using factory functions and full generics.

## Constraints & Preferences
- No `class` syntax; factory functions / closures for state.
- Wire-compatible with socket.io-client v4 (Engine.IO + Socket.IO protocols).
- Use `newEventBus` from `src/core/eventBus.ts`.
- Runtime-agnostic (Bun, Hono, Node.js) for transport layer.
- Type checking via `tsgo --noEmit` (`bun run typecheck`).
- Avoid `as any` unless absolutely necessary.

## Progress
### Done
- All EIO/SIO packet encode/decode + binary support (parser dirs).
- Namespace factory with middleware chain, `emit`, `to()`, `except()`, `BroadcastOperator`.
- ServerSocket factory with event routing and ack handling (`src/sio/socket.ts`).
- Main server factory with generic params, runtime-agnostic handlers, `emit`/`to`/`except` broadcast.
- Client factory (`src/sio/client.ts`).
- All code migrated to `newEventBus`; `emitter.ts` removed.
- Removed `ws` package dependency; `handleConnection` / `handleMessage` / `handleClose`.
- Refactored `Conn` type from interface to `ReturnType<typeof newConn>`.
- Extracted base transport factory `src/eio/transports/conn.ts` (accepts `sendRaw` fn).
- Created `src/eio/transports/ws.ts` (`newWsConn` — WS transport wrapper).
- Created `src/eio/transports/polling.ts` (`newPollingConn` with output buffer + `drain()`).
- `eio/server.ts` now re-exports all transport factories.
- `sio/server.ts` updated:
  - Uses `newWsConn` for WS connections.
  - Added `sidToPolling` map and `pendingPollingGets` map for polling connections.
  - `dispatch` routes `transport=polling` requests: GET connect/drain, POST data, OPTIONS preflight.
  - CORS headers on polling responses when `opts.cors` set.
  - **Long-polling** implemented: GET holds request open (Promise) until data arrives or `pingInterval + pingTimeout` timeout; POST attempts to resolve a pending GET with buffered outgoing data.
  - Cleanup removes both `sidToPolling` and `pendingPollingGets` entries.
- `test/types.ts`: `reply` event type changed to `{ received: boolean } | { from: string }`.
- `test/test-server.ts`: non-WS `fetch` delegates to `app.fetch` instead of 404.
- Polling integration test passes (`test/test-polling.ts`): client connects via polling, receives events, sends messages/acks, all cleanly.
- WS integration test passes (`test/test-integration.ts`): 3 clients, `.to()`/`.except()` broadcast chains.
- Raw HTTP curl test validates all polling endpoints work correctly (open → CONNECT → EVENT → ACK → echo).

### In Progress
- *(none)*

### Blocked
- *(none)*

## Known Issues & Notes
- Ping timers active for polling connections — long-poll hold timeout `pingInterval + pingTimeout` ensures held GETs eventually resolve to NOOP if no data arrives.
- `test-client.ts` expects a running server (not auto-started).
- Integration test starts its own server (port 4000) without `app.fetch`, so it only tests WS transport.
- Long-poll hold uses a single pending GET per sid (client should never have >1 concurrent GET).

## Key Decisions
- Transport split into 3 layers: `conn.ts` (base, takes `sendRaw`) → `ws.ts` / `polling.ts` (specialize `sendRaw`).
- Polling binary encoded as `b` + base64 in buffer; `\x1e`-split happens in `sio/server.ts` before `handleData`.
- CORS handled inline in `sio/server.ts` (not delegated to hosting framework) when `opts.cors` set.
- Long-polling: GET holds open via Promise; POST resolves it with buffered data; cleanup on disconnect/timeout.
- `Conn` type derived via `ReturnType<typeof newConn>` instead of manual interface.

## Next Steps
- Consider adding upgrade transport (polling → WS) support.
- Consider adding integration test that starts server with `app.fetch` and tests both transport paths from the same server.
- Possibly remove the `console.log` in `dispatch` for production readiness.

## Critical Context
- Engine.IO v4 polling: GET for receive, POST for send, `\x1e` between packets, `b` + base64 for binary.
- socket.io-client with `transports: ['polling']` now connects and works correctly with long-poll holding.
- `pendingPollingGets` stores per-sid resolvers for held GET requests; `handlePollingPost` drains buffer and resolves pending GET after processing incoming data.
- `buildPollingResponse` adds CORS headers from request origin when `opts.cors` is configured.

## Relevant Files
- `/home/aa/repos/env_ls/sokit/packages/sokit/src/eio/transports/conn.ts`: Base transport factory (`newConn` takes `sendRaw` fn).
- `/home/aa/repos/env_ls/sokit/packages/sokit/src/eio/transports/ws.ts`: `newWsConn` — WebSocket transport wrapper.
- `/home/aa/repos/env_ls/sokit/packages/sokit/src/eio/transports/polling.ts`: `newPollingConn` — polling transport with buffer + `drain()`.
- `/home/aa/repos/env_ls/sokit/packages/sokit/src/eio/server.ts`: Re-exports all transports.
- `/home/aa/repos/env_ls/sokit/packages/sokit/src/sio/server.ts`: Server factory; `dispatch` routes polling (`transport=polling`), CORS, `sidToPolling` map, `pendingPollingGets` map for long-poll.
- `/home/aa/repos/env_ls/sokit/packages/sokit/src/sio/socket.ts`: ServerSocket factory; `_send` auto-detects binary.
- `/home/aa/repos/env_ls/sokit/packages/sokit/src/sio/namespace.ts`: Namespace factory; `BroadcastOperator`, `to`, `except`, `emit`.
- `/home/aa/repos/env_ls/sokit/packages/sokit/test/test-polling.ts`: Polling integration test (passes).
- `/home/aa/repos/env_ls/sokit/packages/sokit/test/test-server.ts`: Test server; non-WS fetch delegates to `app.fetch`.
- `/home/aa/repos/env_ls/sokit/packages/sokit/test/types.ts`: `reply` event type supports both `{ received: boolean }` and `{ from: string }`.

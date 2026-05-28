# siokit

Socket.IO-compatible server & client library written in TypeScript.

- **Engine.IO v4** — WebSocket and HTTP long-polling transports
- **Socket.IO protocol** — typed events, namespaces, acknowledgements, binary attachments
- **Runtime-agnostic** — works with Bun, Hono, Node.js (via adapters)
- **Zero dependencies** at runtime — only `siokit-core` and `siokit-parser` sub-packages

## Packages

| Package | Description |
|---------|-------------|
| `siokit` | Server — EIO + SIO, websocket & polling, namespaces |
| `siokit-client` | Client — WebSocket transport, typed emit/on/emitWithAck |
| `siokit-parser` | Socket.IO packet encode/decode + binary attachments |
| `siokit-core` | Generic types, event bus, and shared primitives |

## Quick Start

### Server

```ts
import { newServer } from 'siokit'
import { newSocket } from 'siokit-client'

const app = newServer()

app.on('connection', (socket) => {
  socket.on('hello', () => {
    socket.emit('reply', 'world')
  })
})

// Bun
Bun.serve({
  port: 3000,
  fetch(req, srv) {
    if (srv.upgrade(req)) return
    return app.fetch(req)
  },
  websocket: app.websocket,
})
```

### Client

```ts
const socket = newSocket('http://localhost:3000')
socket.on('connect', () => {
  socket.emit('hello')
  socket.on('reply', (msg) => console.log(msg)) // 'world'
})
```

### Binary

```ts
socket.emit('data', new Uint8Array([1, 2, 3]))
socket.on('binaryReply', (data) => {
  // data instanceof Uint8Array
})
```

### Acknowledgements

```ts
const result = await socket.emitWithAck('ping')
// result === 'pong'
```

## Architecture

```
siokit-core       — event.ts + eventBus.ts (zero deps)
       ↓
siokit-parser     — encode, decode, binary (dep: core)
       ↓
siokit-client     — WebSocket transport, client socket (dep: core + parser)
siokit            — EIO + SIO server (dep: core + parser)
```

## License

MIT

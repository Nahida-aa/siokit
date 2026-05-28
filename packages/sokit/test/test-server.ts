import { createServer } from '../src/index.ts'
import { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from './types.ts';

const app = createServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>()

app.use((socket, next) => {
  console.log(`[middleware] ${socket.id}`)
  next()
})

app.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`)

  socket.on('ping', (cb) => {
    if (typeof cb === 'function') cb('pong')
  })

  socket.on('echo', (data) => {
    socket.emit('echo', data)
  })

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
  })
})

const admin = app.of('/admin')
admin.on('connection', (socket) => {
  console.log(`[admin connect] ${socket.id}`)
})

console.log('Starting server on port 4000...')
Bun.serve({
  port: 4000,
  fetch(req, server) {
    if (server.upgrade(req)) {
      console.log('WebSocket connection established')
      return
    }
    return new Response('Not Found', { status: 404 })
  },
  websocket: app.websocket,
})
console.log('Server running on port 4000')

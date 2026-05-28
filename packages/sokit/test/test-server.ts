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

  socket.emit('noArg')

  socket.emit('basicEmit', 1, 'two', new Uint8Array([3, 4, 5]))

  socket.on('hello', () => {
    console.log(`[hello] ${socket.id}`)
  })

  socket.on('message', (data) => {
    console.log(`[message] ${socket.id}:`, data)
    socket.emit('reply', { received: true })
  })

  socket.on('msg', (text) => {
    console.log(`[msg] ${socket.id}: ${text}`)
  })

  socket.on('binaryEcho', (data) => {
    console.log(`[binaryEcho] ${socket.id}:`, data)
    socket.emit('echo', { hello: 'from binaryEcho' })
  })

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

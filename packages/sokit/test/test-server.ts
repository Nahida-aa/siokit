import { createServer } from '../src/index.ts'
import { WsSession } from '../src/sio/server.ts';
import { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from './types.ts';


const app = createServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>({
  cors: {
		origin: [
			'https://admin.socket.io',
			'http://localhost:4000',
			'http://localhost:3000',
			'http://localhost:3001',
			'http://localhost:3002',
      'http://localhost:8000',
      'http://localhost:9007',
		],
		credentials: true,
	},
})

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
    app.emit('msg', [text, 'broadcast!'])
  })

  socket.on('binaryEcho', (data) => {
    console.log(`[binaryEcho] ${socket.id}:`, data)
    socket.emit('echo', { hello: 'from binaryEcho' })
  })

  setTimeout(() => {
    app.to(socket.id).emit('reply', { from: 'to(socket.id)' })
    app.to('nonexistent').emit('reply', { from: 'to(nonexistent)' })
    app.except(socket.id).emit('reply', { from: 'except(socket.id)' })
  }, 100)

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
Bun.serve<WsSession>({
  port: 4000,
  fetch(req, server) {
    if (server.upgrade(req, {} as any)) {
      return
    }
    return app.fetch(req)
  },
  // websocket: {
  //   open(ws) {
  //     ws.data = app.createWsSession(ws)
  //     console.log('WebSocket connection established')
  //   },
  //   message(ws, data) { (ws.data).handleData(data) },
  //   close(ws) { (ws.data).close('transport close') },
  // },
  websocket: app.websocket,
})
console.log('Server running on port 4000')

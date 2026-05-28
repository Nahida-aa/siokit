import { createServer } from './packages/sokit/src/sio/server.ts'

const app = createServer()

app.use((socket, next) => {
  console.log(`[middleware] ${socket.id}`)
  next()
})

app.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`)

  socket.on('ping', (cb?: any) => {
    if (typeof cb === 'function') cb('pong')
  })

  socket.on('echo', (data: any) => {
    socket.emit('echoed', data)
  })

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
  })
})

const admin = app.of('/admin')
admin.on('connection', (socket) => {
  console.log(`[admin connect] ${socket.id}`)
})

if (typeof Bun !== 'undefined') {
  Bun.serve({
    port: 4000,
    fetch(req, server) {
      if (server.upgrade(req)) return
      return new Response('Not Found', { status: 404 })
    },
    websocket: {
      open: (ws: any) => app.handleConnection(ws),
      message: (ws: any, msg: any) => app.handleMessage(ws, msg),
      close: (ws: any) => app.handleClose(ws),
    },
  })
  console.log('Server running on port 4000')
} else {
  console.log('Need Bun or a WebSocket server adapter')
}

import { newServer } from 'siokit'

const app = newServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>({
  pingInterval: 25000,
  pingTimeout: 20000,
})

app.use((socket, next) => {
  console.log(`[middleware] socket ${socket.id} connecting`)
  next()
})

app.onConnection((socket) => {
  console.log(`[connect] ${socket.id}`)

  socket.on('message',async (data) => {
    console.log(`[message] ${socket.id}:`, data)
    socket.emit('reply', { received: true })
    
    socket.emit('withAck', 'Are you there?', (response) => {
      console.log(`[withAck] ${socket.id}:`, response)
    })
    const res = await socket.emitWithAck('withAck', 'Are you there?')
  })

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
  })
})

const chat = app.of('/admin')
chat.on('connection', (socket) => {
  socket.on('msg', (text: string) => {
    console.log(`[admin] ${socket.id}: ${text}`)
    app.of('/admin').emit('msg', [text])
  })
})

export default app
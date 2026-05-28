import { Server } from 'socket.io'
import { Server as Engine } from "@socket.io/bun-engine"
const app = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>({
  pingInterval: 25000,
  pingTimeout: 20000,
})

export const engine = new Engine({
  path: "/ws/",
});
engine.handler().websocket
app.bind(engine);

app.use((socket, next) => {
  console.log(`[middleware] socket ${socket.id} connecting`)
  next()
})

app.on('connect', async (socket) => {
  console.log(`[connect] ${socket.id}`)

  socket.on('message', (data) => {
    console.log(`[message] ${socket.id}:`, data)
    socket.emit('reply', { received: true })
  })

  socket.emit('withAck', 'Are you there?', (response) => {
    console.log(`[withAck] ${socket.id}:`, response)
  })

  const res = await socket.emitWithAck('withAck', 'Are you there?')

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
  })
})

const chat = app.of('/chat')
chat.on('connection', (socket) => {
  socket.on('msg', (text: string) => {
    console.log(`[chat] ${socket.id}: ${text}`)
    app.of('/chat').emit('msg', [text],)
  })
})


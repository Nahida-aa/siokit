import { createServer } from 'sokit'

const app = createServer({
  pingInterval: 25000,
  pingTimeout: 20000,
})

app.use((socket, next) => {
  console.log(`[middleware] socket ${socket.id} connecting`)
  next()
})

app.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`)

  socket.on('message', (data: any) => {
    console.log(`[message] ${socket.id}:`, data)
    socket.emit('reply', { received: true })
  })

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
  })
})

const chat = app.of('/chat')
chat.on('connection', (socket) => {
  socket.on('msg', (text: string) => {
    console.log(`[chat] ${socket.id}: ${text}`)
    app.of('/chat')._broadcast('msg', [text], socket)
  })
})

app.listen(3000, () => {
  console.log('sokit server running on port 3000')
})

import { createServer } from './packages/sokit/src/index.ts'

const app = createServer()

app.use((socket, next) => {
  console.log(`[middleware] ${socket.id}`)
  next()
})

app.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`)

  socket.on('ping', (cb: any) => {
    if (typeof cb === 'function') cb('pong')
  })

  socket.on('echo', (data: any) => {
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
await app.listen(4000)
console.log('Server running on port 4000')

import { io as ioc } from 'socket.io-client'

const socket = ioc('http://localhost:4000', {
  transports: ['websocket'],
  forceNew: true,
})

socket.onAny((event, ...args) => {
  console.log(`[onAny] ${event}`, args)
})

socket.on('connect', () => {
  console.log('[client] connected! id:', socket.id)

  socket.emit('hello')
  socket.emit('message', 'hello from client')
  socket.emit('msg', 'chat message')
  socket.emit('ping', (resp: any) => {
    console.log('[client] ping response:', resp)
  })
  socket.emit('echo', { hello: 'world' })
  socket.emit('binaryEcho', new Uint8Array([10, 20, 30]))
})

socket.on('noArg', () => {
  console.log('[client] noArg received')
})

socket.on('basicEmit', (a: number, b: string, c: Uint8Array) => {
  console.log('[client] basicEmit received:', { a, b, c: Array.from(c) })
})

socket.on('reply', (data: { received: boolean }) => {
  console.log('[client] reply received:', data)
})

socket.on('msg', (data: string[]) => {
  console.log('[client] msg received:', data)
})

socket.on('echo', (data: any) => {
  console.log('[client] echo received:', data)
})

socket.on('connect_error', (err: any) => {
  console.error('[client] connect_error:', err.message)
})

socket.on('disconnect', (reason: any) => {
  console.log('[client] disconnected:', reason)
})

setTimeout(() => {
  console.log('[client] disconnecting...')
  socket.disconnect()
  process.exit(0)
}, 3000)

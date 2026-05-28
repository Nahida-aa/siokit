import { io as ioc } from 'socket.io-client'

const socket = ioc('http://localhost:4000', {
  transports: ['websocket'],
  forceNew: true,
})

socket.on('connect', () => {
  console.log('[client] connected! id:', socket.id)

  // Test emit with ack
  socket.emit('ping', (resp: any) => {
    console.log('[client] ping response:', resp)
  })

  // Test echo
  socket.emit('echo', { hello: 'world' })
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

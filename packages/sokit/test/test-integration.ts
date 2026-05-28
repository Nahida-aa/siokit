import { createServer } from '../src/index.ts'
import { io as ioc } from 'socket.io-client'

const PORT = 4000
const URL = `http://localhost:${PORT}`

const app = createServer()

interface Result {
  client: string
  event: string
  data: any
}
const results: Result[] = []

app.on('connection', (socket) => {
  socket.on('join', (room: string) => socket.join(room))

  socket.on('serverBroadcast', () => {
    socket.emit('msg', ['server-broadcast'])
  })

  socket.on('roomBroadcast', (room: string) => {
    app.to(room).emit('msg', [`room-${room}`])
  })

  socket.on('roomExclude', (data: { room: string; exclude: string }) => {
    app.to(data.room).except(data.exclude).emit('msg', [`room-${data.room}-except-${data.exclude}`])
  })

  socket.on('multiRoomBroadcast', (rooms: string[]) => {
    app.to(rooms).emit('msg', [`multi-${rooms.join('-')}`])
  })
})

const server = Bun.serve({
  port: PORT,
  fetch(req, srv) {
    if (srv.upgrade(req)) return
    return new Response('Not Found', { status: 404 })
  },
  websocket: {
    open(ws: any) { ws.data = app.createWsSession(ws) },
    message(ws: any, data) { ws.data.handleData(data) },
    close(ws: any) { ws.data.close('transport close') },
  },
})

const connect = (name: string): Promise<any> => new Promise((resolve) => {
  const sock = ioc(URL, { transports: ['websocket'], forceNew: true })
  sock.on('connect', () => {
    console.log(`[${name}] connected id=${sock.id}`)
    resolve(sock)
  })
  sock.on('msg', (data: string[]) => {
    results.push({ client: name, event: 'msg', data })
    console.log(`[${name}] received msg:`, data)
  })
})

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  else console.log(`PASS: ${msg}`)
}

const hasResult = (client: string, event: string, data: any) =>
  results.some(r => r.client === client && r.event === event && JSON.stringify(r.data) === JSON.stringify(data))

const main = async () => {
  const alice = await connect('alice')
  const bob = await connect('bob')
  const charlie = await connect('charlie')

  // Alice joins room1 & room2, Bob joins room1, Charlie joins nothing
  alice.emit('join', 'room1')
  alice.emit('join', 'room2')
  bob.emit('join', 'room1')
  await sleep(100)

  results.length = 0

  // Test 1: app.emit — broadcast to all
  app.emit('msg', ['all'])
  await sleep(100)
  assert(hasResult('alice', 'msg', ['all']), 'alice receives all-broadcast')
  assert(hasResult('bob', 'msg', ['all']), 'bob receives all-broadcast')
  assert(hasResult('charlie', 'msg', ['all']), 'charlie receives all-broadcast')
  results.length = 0

  // Test 2: to('room1') — only alice and bob
  app.to('room1').emit('msg', ['room1'])
  await sleep(100)
  assert(hasResult('alice', 'msg', ['room1']), 'alice receives room1')
  assert(hasResult('bob', 'msg', ['room1']), 'bob receives room1')
  assert(!hasResult('charlie', 'msg', ['room1']), 'charlie does NOT receive room1')
  results.length = 0

  // Test 3: to('room2') — only alice
  app.to('room2').emit('msg', ['room2'])
  await sleep(100)
  assert(hasResult('alice', 'msg', ['room2']), 'alice receives room2')
  assert(!hasResult('bob', 'msg', ['room2']), 'bob does NOT receive room2')
  assert(!hasResult('charlie', 'msg', ['room2']), 'charlie does NOT receive room2')
  results.length = 0

  // Test 4: to('room1').except(bob.id) — only alice
  app.to('room1').except(bob.id).emit('msg', ['room1-except-bob'])
  await sleep(100)
  assert(hasResult('alice', 'msg', ['room1-except-bob']), 'alice receives room1-except-bob')
  assert(!hasResult('bob', 'msg', ['room1-except-bob']), 'bob does NOT receive room1-except-bob')
  assert(!hasResult('charlie', 'msg', ['room1-except-bob']), 'charlie does NOT receive room1-except-bob')
  results.length = 0

  // Test 5: to(['room1', 'room2']) — alice (in both) and bob (in room1)
  app.to(['room1', 'room2']).emit('msg', ['room1-room2'])
  await sleep(100)
  assert(hasResult('alice', 'msg', ['room1-room2']), 'alice receives multi-room')
  assert(hasResult('bob', 'msg', ['room1-room2']), 'bob receives multi-room')
  assert(!hasResult('charlie', 'msg', ['room1-room2']), 'charlie does NOT receive multi-room')
  results.length = 0

  // Test 6: except alone — exclude one
  app.except(bob.id).emit('msg', ['except-bob'])
  await sleep(100)
  assert(hasResult('alice', 'msg', ['except-bob']), 'alice receives except-bob')
  assert(!hasResult('bob', 'msg', ['except-bob']), 'bob does NOT receive except-bob')
  assert(hasResult('charlie', 'msg', ['except-bob']), 'charlie receives except-bob')
  results.length = 0

  // Test 7: chained to + to + except
  app.to('room1').to('room2').except(alice.id).emit('msg', ['room1-room2-except-alice'])
  await sleep(100)
  assert(!hasResult('alice', 'msg', ['room1-room2-except-alice']), 'alice does NOT receive chained-except')
  assert(hasResult('bob', 'msg', ['room1-room2-except-alice']), 'bob receives chained-except')
  assert(!hasResult('charlie', 'msg', ['room1-room2-except-alice']), 'charlie does NOT receive chained-except')
  results.length = 0

  console.log('\nAll tests passed!')
  alice.disconnect()
  bob.disconnect()
  charlie.disconnect()
  server.stop()
  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })

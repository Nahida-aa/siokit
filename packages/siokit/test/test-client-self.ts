import { createServer } from '../src/index.ts'
import { createClientSocket } from '../../siokit-client/src/index.ts'

const PORT = 4010
const URL = `http://localhost:${PORT}`

const app = createServer()

app.on('connection', (socket) => {
  socket.on('hello', () => {
    socket.emit('reply', 'world')
  })

  socket.on('ping', (cb: any) => {
    if (typeof cb === 'function') cb('pong')
  })

  socket.on('echo', (data: any) => {
    socket.emit('echo', data)
  })

  socket.on('binaryEcho', (data: any, cb?: any) => {
    socket.emit('binaryReply', data)
    if (typeof cb === 'function') cb('ok')
  })

  socket.on('broadcast', (msg: string) => {
    app.emit('broadcast', msg)
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  else console.log(`PASS: ${msg}`)
}

const connect = () => new Promise<any>((resolve, reject) => {
  const client = createClientSocket(URL)
  client.on('connect', () => resolve(client))
  client.on('connect_error', (err: Error) => reject(err))
  setTimeout(() => reject(new Error('connect timeout')), 3000)
})

const main = async () => {
  // Test 1: connect + on/emit
  {
    const client = await connect()
    const reply = await new Promise<string>((resolve) => {
      client.on('reply', (data: string) => resolve(data))
      client.emit('hello')
    })
    await sleep(50)
    assert(reply === 'world', 'client: basic emit + on')
    client.disconnect()
    await sleep(50)
  }

  // Test 2: emitWithAck
  {
    const client = await connect()
    const resp = await client.emitWithAck('ping')
    assert(resp === 'pong', 'client: emitWithAck')
    client.disconnect()
    await sleep(50)
  }

  // Test 3: binary roundtrip
  {
    const client = await connect()
    const sent = new Uint8Array([1, 2, 3, 4, 255])
    const received = await new Promise<any>((resolve) => {
      client.on('binaryReply', (data: any) => resolve(data))
      client.emit('binaryEcho', sent)
    })
    await sleep(50)
    assert(received instanceof Uint8Array, 'client-binary: type')
    assert(
      JSON.stringify(Array.from(received)) === JSON.stringify(Array.from(sent)),
      'client-binary: values',
    )
    client.disconnect()
    await sleep(50)
  }

  // Test 4: broadcast
  {
    const alice = await connect()
    const bob = await connect()

    const received: string[] = []
    bob.on('broadcast', (msg: string) => received.push(msg))

    alice.emit('broadcast', 'hi from alice')
    await sleep(100)
    assert(received.length === 1, 'client-broadcast: count')
    assert(received[0] === 'hi from alice', 'client-broadcast: content')

    alice.disconnect()
    bob.disconnect()
    await sleep(50)
  }

  console.log('\nAll client tests passed!')
  server.stop()
  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })

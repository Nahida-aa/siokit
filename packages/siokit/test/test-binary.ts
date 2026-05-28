import { newServer } from '../src/index.ts'
import { io as ioc } from 'socket.io-client'

const PORT = 4001
const URL = `http://localhost:${PORT}`

const app = newServer()

app.on('connection', (socket) => {
  socket.on('binaryEcho', (data: any, cb?: any) => {
    socket.emit('binaryReply', data)
    if (typeof cb === 'function') cb('ok')
  })

  socket.on('binaryWithAck', (data: any, cb: (resp: string) => void) => {
    cb('ack:' + data.byteLength)
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

const connect = (): Promise<any> => new Promise((resolve) => {
  const sock = ioc(URL, { transports: ['websocket'], forceNew: true })
  sock.on('connect', () => resolve(sock))
})

const main = async () => {
  const client = await connect()
  console.log('[binary-test] connected')

  // Test 1: pure Uint8Array
  {
    const sent = new Uint8Array([10, 20, 30, 40, 255, 0, 128])
    const received = await new Promise<any>((resolve) => {
      client.once('binaryReply', (data: any) => resolve(data))
      client.emit('binaryEcho', sent)
    })
    await sleep(50)
    const receivedArr = received instanceof Uint8Array ? Array.from(received) : received
    assert(
      JSON.stringify(receivedArr) === JSON.stringify(Array.from(sent)),
      'pure Uint8Array roundtrip',
    )
  }

  // Test 2: object with nested binary
  {
    const buf = new Uint8Array([1, 2, 3, 4])
    const sent = { name: 'test', data: buf, count: 42 }
    const received = await new Promise<any>((resolve) => {
      client.once('binaryReply', (data: any) => resolve(data))
      client.emit('binaryEcho', sent)
    })
    await sleep(50)
    assert(received.name === 'test', 'object binary: name')
    assert(received.count === 42, 'object binary: count')
    const receivedBuf = received.data instanceof Uint8Array ? Array.from(received.data) : received.data
    assert(
      JSON.stringify(receivedBuf) === JSON.stringify(Array.from(buf)),
      'object binary: data field',
    )
  }

  // Test 3: array with multiple binaries
  {
    const buf1 = new Uint8Array([100])
    const buf2 = new Uint8Array([200, 201])
    const sent = [buf1, buf2]
    const received = await new Promise<any>((resolve) => {
      client.once('binaryReply', (data: any) => resolve(data))
      client.emit('binaryEcho', sent)
    })
    await sleep(50)
    assert(Array.isArray(received), 'array binary: is array')
    assert(
      received[0] instanceof Uint8Array && received![0]![0] === 100,
      'array binary: first element',
    )
    assert(
      received[1] instanceof Uint8Array && received![1]![0] === 200 && received![1]![1] === 201,
      'array binary: second element',
    )
  }

  // Test 4: emitWithAck with binary
  if (typeof client.emitWithAck === 'function') {
    const buf = new Uint8Array([42])
    const resp: string = await client.emitWithAck?.('binaryWithAck', buf)
    assert(resp === 'ack:1', 'emitWithAck binary')
  }

  console.log('\nAll binary tests passed!')
  client.disconnect()
  server.stop()
  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })

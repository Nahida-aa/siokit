import { Hono } from 'hono'
import { upgradeWebSocket, websocket } from 'hono/bun'
import { newServer } from '../src/index.ts'
import type { WsSession } from '../src/eio/server.ts'
import { io as ioc } from 'socket.io-client'

const PORT = 4003
const URL = `http://localhost:${PORT}`

const sokitApp = newServer()
const hono = new Hono()

sokitApp.on('connection', (socket) => {
  socket.on('msg', (...args) => {
    sokitApp.emit('msg', args)
  })
  socket.on('binaryEcho', (data: any, cb?: any) => {
    socket.emit('binaryReply', data)
    if (typeof cb === 'function') cb('ok')
  })
  socket.on('binaryWithAck', (data: any, cb: any) => {
    cb('ack:' + (data.byteLength ?? data.length ?? 0))
  })
})

hono.get('/socket.io/', upgradeWebSocket((c) => {
  let session: WsSession | null = null
  return {
    onOpen(_event, ws) {
      const transport = {
        send: ws.send,
      }
      session = sokitApp.createWsSession(transport)
    },
    onMessage(event, ws) {
      session!.handleData(event.data)
    },
    onClose(_event, ws) {
      session?.close('transport close')
    },
  }
}))

hono.all('/socket.io/', (c) => sokitApp.fetch(c.req.raw))

const server = Bun.serve({ port: PORT, fetch: hono.fetch, websocket })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const connect = (): Promise<any> => new Promise((resolve) => {
  const sock = ioc(URL, { transports: ['websocket'], forceNew: true })
  sock.on('connect', () => resolve(sock))
})

const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  else console.log(`PASS: ${msg}`)
}

const main = async () => {
  // ── WS upgrade via Hono ──
  {
    const alice = await connect()
    const bob = await connect()
    await sleep(100)

    const results: any[] = []
    bob.on('msg', (data: any) => results.push(data))

    alice.emit('msg', 'hello from alice')
    await sleep(100)
    assert(results.length === 1, 'hono-ws: bob receives msg')
    assert(results[0][0] === 'hello from alice', 'hono-ws: msg content')

    alice.disconnect()
    bob.disconnect()
    await sleep(50)
  }

  // ── Binary via Hono WS ──
  {
    const client = await connect()
    await sleep(50)

    // pure Uint8Array
    const sent = new Uint8Array([10, 20, 30])
    const received = await new Promise<any>((resolve) => {
      client.once('binaryReply', (data: any) => resolve(data))
      client.emit('binaryEcho', sent)
    })
    await sleep(50)
    assert(received instanceof Uint8Array || received instanceof ArrayBuffer, 'hono-binary: is binary')
    const arr = received instanceof Uint8Array ? Array.from(received) : Array.from(new Uint8Array(received))
    assert(JSON.stringify(arr) === JSON.stringify([10, 20, 30]), 'hono-binary: values match')

    // emitWithAck with binary
    if (typeof client.emitWithAck === 'function') {
      const resp: string = await client.emitWithAck('binaryWithAck', new Uint8Array([42]))
      assert(resp === 'ack:1', 'hono-binary: emitWithAck')
    }

    client.disconnect()
    await sleep(50)
  }

  // ── HTTP polling via Hono ──
  {
    const sock = ioc(URL, { transports: ['polling'], forceNew: true })
    await new Promise<void>((resolve) => { sock.on('connect', () => resolve()) })
    await sleep(200)

    const results: any[] = []
    sock.on('msg', (data: any) => results.push(data))

    sock.emit('msg', 'polling-msg')
    await sleep(200)
    assert(results.length === 1, 'hono-polling: receives msg')
    assert(results[0][0] === 'polling-msg', 'hono-polling: msg content')

    sock.disconnect()
    await sleep(50)
  }

  console.log('\nAll Hono adapter tests passed!')
  server.stop()
  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })

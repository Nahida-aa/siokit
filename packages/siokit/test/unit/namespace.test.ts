import { describe, it, expect } from 'bun:test'
import { createNamespace } from '../../src/sio/namespace.ts'
import { createSocket } from '../../src/sio/socket.ts'
import { newConn } from '../../src/eio/transports/conn.ts'

const makeConn = () => newConn(() => {})

describe('createNamespace', () => {
  it('returns namespace with given name', () => {
    const nsp = createNamespace('/test')
    expect(nsp.name).toBe('/test')
  })

  it('broadcast emits to all sockets', () => {
    const nsp = createNamespace<{ msg: (d: string) => void }>('/')
    const received: string[] = []
    const conn1 = makeConn()
    const conn2 = makeConn()
    const sock1 = createSocket(conn1, nsp, 's1')
    const sock2 = createSocket(conn2, nsp, 's2')
    sock1._send = (pkt: any) => { received.push('s1:' + pkt.data?.[1]) }
    sock2._send = (pkt: any) => { received.push('s2:' + pkt.data?.[1]) }
    nsp._addSocket(sock1)
    nsp._addSocket(sock2)
    nsp.emit('msg', 'broadcast')
    expect(received).toContain('s1:broadcast')
    expect(received).toContain('s2:broadcast')
  })

  it('to() filters by room', () => {
    const nsp = createNamespace<{ msg: (d: string) => void }>('/')
    const received: string[] = []
    const sock1 = createSocket(makeConn(), nsp, 's1')
    const sock2 = createSocket(makeConn(), nsp, 's2')
    sock1._send = (pkt: any) => { received.push('s1:' + pkt.data?.[1]) }
    sock2._send = (pkt: any) => { received.push('s2:' + pkt.data?.[1]) }
    sock1.join('roomA')
    nsp._addSocket(sock1)
    nsp._addSocket(sock2)
    nsp.to('roomA').emit('msg', 'only-room-a')
    expect(received).toEqual(['s1:only-room-a'])
  })

  it('except() excludes socket by id', () => {
    const nsp = createNamespace<{ msg: (d: string) => void }>('/')
    const received: string[] = []
    const sock1 = createSocket(makeConn(), nsp, 's1')
    const sock2 = createSocket(makeConn(), nsp, 's2')
    sock1._send = (pkt: any) => { received.push('s1:' + pkt.data?.[1]) }
    sock2._send = (pkt: any) => { received.push('s2:' + pkt.data?.[1]) }
    nsp._addSocket(sock1)
    nsp._addSocket(sock2)
    nsp.except('s1').emit('msg', 'not-s1')
    expect(received).toEqual(['s2:not-s1'])
  })

  it('to().except() chained correctly', () => {
    const nsp = createNamespace<{ msg: (d: string) => void }>('/')
    const received: string[] = []
    const sock1 = createSocket(makeConn(), nsp, 's1')
    const sock2 = createSocket(makeConn(), nsp, 's2')
    const sock3 = createSocket(makeConn(), nsp, 's3')
    sock1._send = (pkt: any) => { received.push('s1:' + pkt.data?.[1]) }
    sock2._send = (pkt: any) => { received.push('s2:' + pkt.data?.[1]) }
    sock3._send = (pkt: any) => { received.push('s3:' + pkt.data?.[1]) }
    sock1.join('room')
    sock3.join('room')
    nsp._addSocket(sock1)
    nsp._addSocket(sock2)
    nsp._addSocket(sock3)
    nsp.to('room').except('s1').emit('msg', 'only-s3')
    expect(received).toEqual(['s3:only-s3'])
  })

  it('multi-to merges rooms', () => {
    const nsp = createNamespace<{ msg: (d: string) => void }>('/')
    const received: string[] = []
    const a = createSocket(makeConn(), nsp, 'a')
    const b = createSocket(makeConn(), nsp, 'b')
    const c = createSocket(makeConn(), nsp, 'c')
    a._send = (p: any) => { received.push('a:' + p.data?.[1]) }
    b._send = (p: any) => { received.push('b:' + p.data?.[1]) }
    c._send = (p: any) => { received.push('c:' + p.data?.[1]) }
    a.join('r1')
    b.join('r2')
    nsp._addSocket(a)
    nsp._addSocket(b)
    nsp._addSocket(c)
    nsp.to('r1').to('r2').emit('msg', 'multi-room')
    expect(received.sort()).toEqual(['a:multi-room', 'b:multi-room'])
  })

  it('middleware chain passes on success', () => {
    const nsp = createNamespace('/')
    const order: number[] = []
    nsp.use((_s, next) => { order.push(1); next() })
    nsp.use((_s, next) => { order.push(2); next() })
    const sock = createSocket(makeConn(), nsp, 's')
    nsp._runMiddleware(sock, (err) => {
      expect(err).toBeUndefined()
      expect(order).toEqual([1, 2])
    })
  })

  it('middleware chain stops on error', () => {
    const nsp = createNamespace('/')
    nsp.use((_s, next) => { next(new Error('fail')) })
    nsp.use((_s, _next) => { throw new Error('should not reach') })
    const sock = createSocket(makeConn(), nsp, 's')
    nsp._runMiddleware(sock, (err) => {
      expect(err).toBeDefined()
      expect(err!.message).toBe('fail')
    })
  })

  it('middleware throws synchronously', () => {
    const nsp = createNamespace('/')
    nsp.use((_s, _next) => { throw new Error('sync error') })
    const sock = createSocket(makeConn(), nsp, 's')
    nsp._runMiddleware(sock, (err) => {
      expect(err).toBeDefined()
      expect(err!.message).toBe('sync error')
    })
  })
})

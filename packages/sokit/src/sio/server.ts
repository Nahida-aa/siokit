import { newEventBus } from '../core/eventBus.ts'
import type { DefaultEventsMap, EventsMap, EventNames, EventParams } from '../core/event.ts'
import { newWsConn, newPollingConn } from '../eio/server.ts'
import type { Conn } from '../eio/server.ts'
import { decodeSioPacket, PacketType } from './parser/index.ts'
import { replacePlaceholders } from './parser/binary.ts'
import type { SioPacket } from './parser/index.ts'
import { createNamespace } from './namespace.ts'
import type { Namespace } from './namespace.ts'
import { createSocket } from './socket.ts'
import type { Socket } from './socket.ts'
import { Packet, RawData } from '../eio/parser/shared.ts';
import { serverOptions, ServerOptions } from './config.ts';
import { WsRaw } from '../eio/transports/ws.ts';

type ServerReservedEvents<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
> = {
  connection: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => void
  disconnect: (socket: any) => void
}

export interface WsSession {
  handleData(data: any): void
  close(reason: string): void
}

export const createServer = <
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
>(_opts?: ServerOptions) => {
  const opts = serverOptions(_opts)
  const emitter = newEventBus<ListenEvents, EmitEvents, ServerReservedEvents<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()
  const namespaces = new Map<string, Namespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()
  const defaultNsp = createNamespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData>('/')
  namespaces.set('/', defaultNsp)

  const conns = new Map<string, Conn>()
  const allSockets = new Map<string, Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()

  const getNsp = (name: string): Namespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData> => {
    let nsp = namespaces.get(name)
    if (!nsp) {
      nsp = createNamespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData>(name)
      namespaces.set(name, nsp)
    }
    return nsp
  }

  const processSioPacket = (eio: Conn, sioPacket: SioPacket) => {
    const nspName = sioPacket.nsp || '/'
    const nsp = getNsp(nspName)

    if (sioPacket.type === PacketType.CONNECT) {
      const sessionId = generateSioId()
      const sock = createSocket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>(eio, nsp, sessionId)
      allSockets.set(sessionId, sock)

      nsp._runMiddleware(sock, (err?: Error) => {
        if (err) {
          sock._send({
            type: PacketType.CONNECT_ERROR,
            data: { message: err.message },
            nsp: nspName,
          })
          return
        }
        sock._send({
          type: PacketType.CONNECT,
          data: { sid: sessionId },
          nsp: nspName,
        })
        nsp._addSocket(sock)
        emitter.emitReserved('connection', sock)
      })
    } else {
      for (const [, sock] of allSockets) {
        if ((sock)._conn === eio) {
          sock._handlePacket(sioPacket)
          break
        }
      }
    }
  }

  const handleSioMessage = (eio: Conn, raw: string) => {
    try {
      const sioPacket = decodeSioPacket(raw)

      if (sioPacket.type === PacketType.BINARY_EVENT || sioPacket.type === PacketType.BINARY_ACK) {
        if (sioPacket.attachments && sioPacket.attachments > 0) {
          (eio as any)._pendingBinary = { packet: sioPacket, buffers: [] }
          return
        }
      }

      processSioPacket(eio, sioPacket)
    } catch {}
  }

  const setupTransport = (eio: Conn, cleanupTransport: () => void) => {
    const onMessage = (packet: Packet) => {
      if (packet.type !== 'message') return

      if (packet.data instanceof Uint8Array || packet.data instanceof ArrayBuffer) {
        const uint8 = packet.data instanceof Uint8Array ? packet.data : new Uint8Array(packet.data)
        const pending = (eio as any)._pendingBinary
        if (pending) {
          pending.buffers.push(uint8)
          if (pending.buffers.length === pending.packet.attachments) {
            pending.packet.data = replacePlaceholders(pending.packet.data, pending.buffers)
            delete (eio as any)._pendingBinary
            processSioPacket(eio, pending.packet)
          }
        }
        return
      }

      if (typeof packet.data === 'string') {
        handleSioMessage(eio, packet.data)
      }
    }

    const onClose = () => {
      delete (eio as any)._pendingBinary
      for (const [sid, sock] of allSockets) {
        if ((sock)._conn === eio) {
          sock._disconnect('transport close')
          allSockets.delete(sid)
          emitter.emitReserved('disconnect', sock)
          break
        }
      }
      cleanupTransport()
    }

    eio.on('message', onMessage)
    eio.on('close', onClose)
  }

  const createWsSession = (ws: { send(data: string | Uint8Array): void }): WsSession => {
    const eio = newWsConn(ws, {
      pingInterval: opts.pingInterval,
      pingTimeout: opts.pingTimeout,
      maxPayload: opts.maxHttpBufferSize,
    })
    conns.set(eio.id, eio)
    setupTransport(eio, () => { conns.delete(eio.id) })
    return {
      handleData: (data) => eio.handleData(data),
      close: (reason) => eio.close(reason || 'transport close'),
    }
  }

  const dispatch = (request: Request): Response | Promise<Response> => {
    const url = new URL(request.url)
    const transport = url.searchParams.get('transport')

    if (transport === 'polling') {
      console.log(`[polling] ${request.method} ${url.pathname}${url.search}`)
      const sid = url.searchParams.get('sid')
      let conn: any = sid ? conns.get(sid) : null
      if (sid && !conn) return new Response('Session ID unknown', { status: 400 })
      if (!conn) {
        if (!opts.transports.includes('polling')) {
          return new Response('Transport unknown', { status: 400 })
        }
        conn = newPollingConn({
          pingInterval: opts.pingInterval,
          pingTimeout: opts.pingTimeout,
          maxPayload: opts.maxHttpBufferSize,
          cors: !!_opts?.cors,
        })
        conns.set(conn.id, conn)
        setupTransport(conn, () => { conns.delete(conn.id) })
      }
      return conn.onRequest(request)
    }

    return new Response('404 Not Found', { status: 404 })
  }

  const app = {
    onConnection: (fn: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => void) => {
      emitter.on('connection', fn)
    },

    on: emitter.on,

    emit: <Ev extends EventNames<EmitEvents>>(event: Ev, ...args: EventParams<EmitEvents, Ev>) => {
      defaultNsp.emit(event, ...args)
      return app
    },

    of: (name: string): Namespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData> => getNsp(name),

    to: (room: string | string[]) => defaultNsp.to(room),

    except: (id: string) => defaultNsp.except(id),

    use: (fn: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, next: (err?: Error) => void) => void) => {
      defaultNsp.use(fn)
      return app
    },

    get default() { return defaultNsp },
    get namespaces() { return namespaces },
    idleTimeout: ((opts.pingInterval ?? 25000) / 1000) + 35,
    fetch: dispatch,
    createWsSession,
    websocket: {
      open(ws: WsRaw<WsSession>) {
        ws.data = app.createWsSession(ws)
        console.log('WebSocket connection established')
      },
      message(ws: WsRaw<WsSession>, data: RawData) { (ws.data).handleData(data) },
      close(ws: WsRaw<WsSession>) { (ws.data).close('transport close') },
    },
  }

  return app
}

let sioIdCounter = 0
const generateSioId = () => {
  sioIdCounter++
  return `sokit_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}${sioIdCounter}`
}

import { newEventBus } from '../core/eventBus.ts'
import type { DefaultEventsMap, EventsMap, EventNames, EventParams } from '../core/event.ts'
import { createEioServer, type WsSession } from '../eio/server.ts'
import type { Conn } from '../eio/server.ts'
import { PacketType } from './parser/index.ts'
import type { SioPacket } from './parser/index.ts'
import { createNamespace } from './namespace.ts'
import type { Namespace } from './namespace.ts'
import { createSocket } from './socket.ts'
import type { Socket } from './socket.ts'
import { Packet, RawData } from '../eio/parser/shared.ts'
import { serverOptions, ServerOptions } from './config.ts'
import { WsRaw } from '../eio/transports/ws.ts'

type ServerReservedEvents<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
> = {
  connection: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => void
  disconnect: (socket: any) => void
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

  const setupTransport = (eio: Conn) => {
    eio.decoder.on('decoded', (sioPacket) => {
      processSioPacket(eio, sioPacket)
    })

    eio.on('message', (packet: Packet) => {
      if (packet.type !== 'message') return
      try { eio.decoder.add(packet.data) } catch {}
    })

    eio.on('close', () => {
      eio.decoder.destroy()
      for (const [sid, sock] of allSockets) {
        if ((sock)._conn === eio) {
          sock._disconnect('transport close')
          allSockets.delete(sid)
          emitter.emitReserved('disconnect', sock)
          break
        }
      }
    })
  }

  const eioServer = createEioServer({
    pingInterval: opts.pingInterval,
    pingTimeout: opts.pingTimeout,
    maxPayload: opts.maxHttpBufferSize,
    cors: !!_opts?.cors,
    transports: opts.transports,
    onconn: setupTransport,
  })

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
    fetch: (req: Request) => eioServer.handleRequest(req),
    createWsSession: (ws: { send(data: string | Uint8Array): void }) => eioServer.createWsSession(ws),
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

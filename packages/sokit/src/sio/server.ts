import { newEventBus } from '../core/eventBus.ts'
import type { DefaultEventsMap, EventsMap, ReservedOrUserEventNames, ReservedOrUserListener } from '../core/eventBus.ts'
import { createEioSocket } from '../eio/server.ts'
import type { EioSocket } from '../eio/server.ts'
import type { WsRaw } from '../eio/transports/websocket.ts'
import { decodeSioPacket, PacketType } from './parser/index.ts'
import type { SioPacket } from './parser/index.ts'
import { createNamespace } from './namespace.ts'
import type { Namespace } from './namespace.ts'
import { createSocket } from './socket.ts'
import type { Socket } from './socket.ts'

type ServerReservedEvents<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
> = {
  connection: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => void
  disconnect: (socket: any) => void
}

export type ServerOptions = {
  pingInterval?: number
  pingTimeout?: number
  maxPayload?: number
}

export const createServer = <
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
>(opts?: ServerOptions) => {
  const emitter = newEventBus<ListenEvents, EmitEvents, ServerReservedEvents>()
  const namespaces = new Map<string, Namespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()
  const defaultNsp = createNamespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData>('/')
  namespaces.set('/', defaultNsp)

  const wsToEio = new WeakMap<object, EioSocket>()
  const sioSockets = new Map<string, Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()

  const getNsp = (name: string): Namespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData> => {
    let nsp = namespaces.get(name)
    if (!nsp) {
      nsp = createNamespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData>(name)
      namespaces.set(name, nsp)
    }
    return nsp
  }

  const handleSioMessage = (eio: EioSocket, raw: string) => {
    try {
      const sioPacket = decodeSioPacket(raw)
      const nspName = sioPacket.nsp || '/'
      const nsp = getNsp(nspName)

      if (sioPacket.type === PacketType.CONNECT) {
        const sessionId = generateSioId()
        const sock = createSocket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>(eio, nsp, sessionId)
        sioSockets.set(sessionId, sock)

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
        for (const [, sock] of sioSockets) {
          if ((sock as any)._eio === eio) {
            sock._handlePacket(sioPacket)
            break
          }
        }
      }
    } catch {}
  }

  const handleConnection = (ws: object) => {
    const eio = createEioSocket(ws as unknown as WsRaw, {
      pingInterval: opts?.pingInterval,
      pingTimeout: opts?.pingTimeout,
      maxPayload: opts?.maxPayload,
    })

    ;(eio as any)._ws = ws
    wsToEio.set(ws, eio)
    eio.sendOpen()
    eio.startPingTimers()

    const onMessage = (packet: any) => {
      if (packet.type === 'message' && typeof packet.data === 'string') {
        handleSioMessage(eio, packet.data)
      }
    }

    const onClose = () => {
      for (const [sid, sock] of sioSockets) {
        if ((sock as any)._eio === eio) {
          sock._disconnect('transport close')
          sioSockets.delete(sid)
          emitter.emitReserved('disconnect', sock)
          break
        }
      }
      wsToEio.delete(ws)
    }

    eio.on('message', onMessage)
    eio.on('close', onClose)
  }

  const handleMessage = (ws: object, data: any) => {
    const eio = wsToEio.get(ws)
    if (eio) eio.handleData(data)
  }

  const handleClose = (ws: object) => {
    const eio = wsToEio.get(ws)
    if (eio) eio.close('transport close')
  }

  const app = {
    ...emitter,

    of: (name: string): Namespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData> => getNsp(name),

    use: (fn: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, next: (err?: Error) => void) => void) => {
      defaultNsp.use(fn)
      return app
    },

    get default() { return defaultNsp },
    get namespaces() { return namespaces },

    handleConnection,
    handleMessage,
    handleClose,
  }

  return app
}

let sioIdCounter = 0
const generateSioId = () => {
  sioIdCounter++
  return `sokit_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}${sioIdCounter}`
}

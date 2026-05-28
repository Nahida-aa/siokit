import { createEmitter } from '../core/emitter.ts'
import type { DefaultEventsMap, EventsMap } from '../core/eventBus.ts'
import { createEioSocket } from '../eio/server.ts'
import type { EioSocket } from '../eio/server.ts'
import type { WsRaw } from '../eio/transports/websocket.ts'
import { decodeSioPacket, PacketType } from './parser/index.ts'
import type { SioPacket } from './parser/index.ts'
import { createNamespace } from './namespace.ts'
import type { Namespace } from './namespace.ts'
import { createSocket } from './socket.ts'
import type { ServerSocket } from './socket.ts'

let wsModule: any = null
const loadWs = async () => {
  if (!wsModule) wsModule = await import('ws')
  return wsModule.WebSocketServer
}

type ServerReservedEvents = {
  connection: (socket: ServerSocket) => void
  disconnect: (socket: ServerSocket) => void
}

type ServerOptions = {
  pingInterval?: number
  pingTimeout?: number
  maxPayload?: number
}

declare const Bun: {
  serve: (opts: any) => any
} | undefined

export const createServer = <
	ListenEvents extends EventsMap = DefaultEventsMap,
	EmitEvents extends EventsMap = ListenEvents,
	ServerSideEvents extends EventsMap = DefaultEventsMap,
	SocketData = any,
>(opts?: ServerOptions) => {
  const emitter = createEmitter<EventsMap, EventsMap, ServerReservedEvents>()
  const namespaces = new Map<string, Namespace>()
  const defaultNsp = createNamespace('/')
  namespaces.set('/', defaultNsp)

  const wsToEio = new WeakMap<object, EioSocket>()
  const sioSockets = new Map<string, ServerSocket>()

  const getNsp = (name: string): Namespace => {
    let nsp = namespaces.get(name)
    if (!nsp) {
      nsp = createNamespace(name)
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
        const sock = createSocket(eio, nsp, sessionId)
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

  const handleWsOpen = (ws: object) => {
    const eio = createEioSocket(ws as unknown as WsRaw, {
      pingInterval: opts?.pingInterval,
      pingTimeout: opts?.pingTimeout,
      maxPayload: opts?.maxPayload,
    })

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

  const app = {
    ...emitter,

    of: (name: string) => getNsp(name),

    use: (fn: (socket: ServerSocket, next: (err?: Error) => void) => void) => {
      defaultNsp.use(fn)
      return app
    },

    on: (event: string, handler: (...args: any[]) => void) => {
      emitter.on(event as any, handler as any)
      return app
    },

    get default() { return defaultNsp },
    get namespaces() { return namespaces },

    listen: async (port: number, cb?: () => void) => {
      if (typeof Bun !== 'undefined') {
        const b = Bun!
        b.serve({
          port,
          fetch(req: any, server: any) {
            if (server.upgrade(req)) return
            return new Response('Not Found', { status: 404 })
          },
          websocket: {
            open(ws: any) { handleWsOpen(ws) },
            message(ws: any, msg: any) {
              const eio = wsToEio.get(ws)
              if (eio) eio.handleData(msg)
            },
            close(ws: any) {
              const eio = wsToEio.get(ws)
              if (eio) eio.close('transport close')
            },
          },
        })
      } else {
        const WebSocketServer = await loadWs()
        const wss = new WebSocketServer({ port })
        wss.on('connection', (ws: any) => {
          handleWsOpen(ws)
          ws.on('message', (data: any) => {
            const eio = wsToEio.get(ws)
            if (eio) eio.handleData(data)
          })
          ws.on('close', () => {
            const eio = wsToEio.get(ws)
            if (eio) eio.close('transport close')
          })
        })
      }
      if (cb) cb()
      return app
    },
  }

  return app
}

let sioIdCounter = 0
const generateSioId = () => {
  sioIdCounter++
  return `sokit_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}${sioIdCounter}`
}

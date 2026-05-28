import { newEventBus } from '../core/eventBus.ts'
import type { DefaultEventsMap, EventsMap, EventNames, EventParams, ReservedOrUserEventNames, ReservedOrUserListener } from '../core/event.ts'
import { newConn } from '../eio/server.ts'
import type { Conn } from '../eio/server.ts'
import type { WsRaw } from '../eio/transports/websocket.ts'
import { decodeSioPacket, PacketType } from './parser/index.ts'
import { replacePlaceholders } from './parser/binary.ts'
import type { SioPacket } from './parser/index.ts'
import { createNamespace } from './namespace.ts'
import type { Namespace, BroadcastOperator } from './namespace.ts'
import { createSocket } from './socket.ts'
import type { Socket } from './socket.ts'
import type { CorsOptions, CorsOptionsDelegate } from "cors";
import { Packet, RawData } from '../eio/parser/shared.ts';
import { TransportName } from '../eio/transports/index.ts';
import { ExecutionContext } from '../context.ts';
import { Env, FetchEventLike } from '../types.ts';

type ServerReservedEvents<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
> = {
  connection: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => void
  disconnect: (socket: any) => void
}

export interface ServerOptions {
  /**
   * how many ms without a pong packet to consider the connection closed
   * @default 20000
   */
  pingTimeout?: number;
  /**
   * how many ms before sending a new ping packet
   * @default 25000
   */
  pingInterval?: number;
  /**
   * how many ms before an uncompleted transport upgrade is cancelled
   * @default 10000
   */
  upgradeTimeout?: number;
    /**
   * how many bytes or characters a message can be, before closing the session (to avoid DoS).
   * @default 1e5 (1000 KB)
   */
  maxHttpBufferSize?: number;
    /**
   * The low-level transports that are enabled. WebTransport is disabled by default and must be manually enabled:
   *
   * @example
   * new Server({
   *   transports: ["polling", "websocket", "webtransport"]
   * });
   *
   * @default ["polling", "websocket"]
   */
  transports?: TransportName[];
  /**
   * whether to allow transport upgrades
   * @default true
   */
  allowUpgrades?: boolean;
  /**
   * parameters of the WebSocket permessage-deflate extension (see ws module api docs). Set to false to disable.
   * @default false
   */
  perMessageDeflate?: boolean
    /**
   * an optional packet which will be concatenated to the handshake packet emitted by Engine.IO.
   */
  initialPacket?: any;
    /**
   * the options that will be forwarded to the cors module
   */
  cors?: CorsOptions | CorsOptionsDelegate;
    /**
   * parameters of the http compression for the polling transports (see zlib api docs). Set to false to disable.
   * @default true
   */
  httpCompression?: boolean | object;
}
export const serverOptions = (opts?:ServerOptions) => ({
  pingTimeout: opts?.pingTimeout ?? 20000,
  pingInterval: opts?.pingInterval ?? 25000,
  upgradeTimeout: opts?.upgradeTimeout ?? 10000, 
  maxHttpBufferSize: opts?.maxHttpBufferSize ?? 1e6, // 1000000
  transports: opts?.transports ?? ["polling", "websocket"],
  allowUpgrades: true,
  httpCompression: {
    threshold: 1024,
  },
  ...opts,
} satisfies ServerOptions)


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

  const wsToEio = new WeakMap<object, Conn>()
  const sioSockets = new Map<string, Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()
  const pendingBinaries = new Map<Conn, { packet: SioPacket; buffers: Uint8Array[] }>()

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
        if ((sock)._eio === eio) {
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
          pendingBinaries.set(eio, { packet: sioPacket, buffers: [] })
          return
        }
      }

      processSioPacket(eio, sioPacket)
    } catch {}
  }

  const handleConnection = (ws: WsRaw) => {
    const eio = newConn(ws, {
      pingInterval: opts?.pingInterval,
      pingTimeout: opts?.pingTimeout,
      maxPayload: opts?.maxHttpBufferSize,
    })
    wsToEio.set(ws, eio)
    eio.sendOpen()
    eio.startPingTimers()

    const onMessage = (packet: Packet) => {
      if (packet.type !== 'message') return

      if (packet.data instanceof Uint8Array || packet.data instanceof ArrayBuffer) {
        const uint8 = packet.data instanceof Uint8Array ? packet.data : new Uint8Array(packet.data)
        const pending = pendingBinaries.get(eio)
        if (pending) {
          pending.buffers.push(uint8)
          if (pending.buffers.length === pending.packet.attachments) {
            pending.packet.data = replacePlaceholders(pending.packet.data, pending.buffers)
            pendingBinaries.delete(eio)
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
      pendingBinaries.delete(eio)
      for (const [sid, sock] of sioSockets) {
        if ((sock)._eio === eio) {
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

  const handleMessage = (ws: object, data: RawData) => {
    const eio = wsToEio.get(ws)
    if (eio) eio.handleData(data)
  }

  const handleClose = (ws: object) => {
    const eio = wsToEio.get(ws)
    if (eio) eio.close('transport close')
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
    idleTimeout: ((opts.pingInterval ?? 25000) / 1000) + 35, // Sets the number of seconds to wait before timing out a connection due to inactivity. by http server
    fetch,
    websocket: {
      open: handleConnection,
      message: handleMessage,
      close: handleClose,
      maxPayloadLength: opts.maxHttpBufferSize,
      perMessageDeflate: opts.perMessageDeflate,
    }
  }

  return app
}

let sioIdCounter = 0
const generateSioId = () => {
  sioIdCounter++
  return `sokit_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}${sioIdCounter}`
}

const  dispatch = async <E extends Env>(
  request: Request,
  executionCtx: ExecutionContext | FetchEventLike | undefined,
  env: E['Bindings'],
  method: string
) => {

  return new Response('404 Not Found', { status: 404 })
}
const fetch: <E extends Env>(
  request: Request,
  Env?: E['Bindings'] | {},
  executionCtx?: ExecutionContext
) => Response | Promise<Response> = (request, ...rest) => {
  return dispatch(request, rest[1], rest[0], request.method)
}
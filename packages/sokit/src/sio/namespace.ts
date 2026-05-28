import { newEventBus } from '../core/eventBus.ts'
import type { EventsMap, DefaultEventsMap, ReservedOrUserEventNames, ReservedOrUserListener } from '../core/eventBus.ts'
import { encodeSioPacket, PacketType } from './parser/index.ts'
import type { SioPacket } from './parser/index.ts'
import type { Socket } from './socket.ts'

export type NamespaceReservedEvents<SocketT> = {
  connection: (socket: SocketT) => void
  connect: (socket: SocketT) => void
}

export interface Namespace<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
> {
  name: string
  sockets: Map<string, Socket<ListenEvents, EmitEvents>>
  middlewares: Array<(socket: Socket<ListenEvents, EmitEvents>, next: (err?: Error) => void) => void>

  use(fn: (socket: Socket<ListenEvents, EmitEvents>, next: (err?: Error) => void) => void): Namespace<ListenEvents, EmitEvents>

  on<Ev extends ReservedOrUserEventNames<NamespaceReservedEvents<Socket<ListenEvents, EmitEvents>>, {}>>(
    event: Ev,
    fn: ReservedOrUserListener<NamespaceReservedEvents<Socket<ListenEvents, EmitEvents>>, {}, Ev>,
  ): Namespace<ListenEvents, EmitEvents>

  off(event?: string, fn?: (...args: any[]) => void): Namespace<ListenEvents, EmitEvents>
  once(event: string, fn: (...args: any[]) => void): Namespace<ListenEvents, EmitEvents>
  listeners(event: string): ((...args: any[]) => void)[]

  _addSocket(socket: Socket<ListenEvents, EmitEvents>): void
  _removeSocket(socket: Socket<ListenEvents, EmitEvents>): void
  _broadcast(event: string, args: any[], from: Socket<ListenEvents, EmitEvents>, room?: string): void
  _runMiddleware(socket: Socket<ListenEvents, EmitEvents>, next: (err?: Error) => void): void
}

export const createNamespace = <
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
>(name: string): Namespace<ListenEvents, EmitEvents> => {
  const emitter = newEventBus<{}, {}, NamespaceReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>>()
  const sockets = new Map<string, Socket<ListenEvents, EmitEvents>>()
  const middlewares: Array<(socket: Socket<ListenEvents, EmitEvents>, next: (err?: Error) => void) => void> = []

  const _addSocket = (socket: Socket<ListenEvents, EmitEvents>) => {
    sockets.set(socket.id, socket)
    emitter.emitReserved('connection', socket)
    emitter.emitReserved('connect', socket)
  }

  const _removeSocket = (socket: Socket<ListenEvents, EmitEvents>) => {
    sockets.delete(socket.id)
  }

  const _broadcast = (event: string, args: any[], from: Socket<ListenEvents, EmitEvents>, room?: string) => {
    for (const [, sock] of sockets) {
      if (sock === from) continue
      if (room && !sock.rooms.has(room)) continue
      const data = [event, ...args]
      sock._send({ type: PacketType.EVENT, data, nsp: name } as SioPacket)
    }
  }

  const _runMiddleware = (socket: Socket<ListenEvents, EmitEvents>, next: (err?: Error) => void) => {
    let i = 0
    const run = (err?: Error) => {
      if (err) return next(err)
      if (i >= middlewares.length) return next()
      const fn = middlewares[i++]
      try {
        fn(socket, run)
      } catch (e) {
        next(e as Error)
      }
    }
    run()
  }

  const nsp: Namespace<ListenEvents, EmitEvents> = {
    name,
    sockets,
    middlewares,

    on: (event: any, fn: any) => { emitter.on(event, fn); return nsp },
    off: (event?: any, fn?: any) => { if (event !== undefined) emitter.off(event, fn); return nsp },
    once: (event: any, fn: any) => { emitter.once(event, fn); return nsp },
    listeners: (event: any) => emitter.listeners(event),
    use: (fn) => { middlewares.push(fn); return nsp },

    _addSocket,
    _removeSocket,
    _broadcast,
    _runMiddleware,
  }

  return nsp
}

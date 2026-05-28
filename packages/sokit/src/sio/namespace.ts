import { newEventBus } from '../core/eventBus.ts'
import type { EventsMap, DefaultEventsMap, ReservedOrUserEventNames, ReservedOrUserListener } from '../core/eventBus.ts'
import { encodeSioPacket, PacketType } from './parser/index.ts'
import type { SioPacket } from './parser/index.ts'
import type { Socket } from './socket.ts'

type NsReservedEvents<SocketT> = {
  connection: (socket: SocketT) => void
  connect: (socket: SocketT) => void
}

export const createNamespace = <
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
>(name: string) => {
  const emitter = newEventBus<{}, {}, NsReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>>()
  const sockets = new Map<string, Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()
  const middlewares: Array<(socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, next: (err?: Error) => void) => void> = []

  const _addSocket = (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => {
    sockets.set(socket.id, socket)
    emitter.emitReserved('connection', socket)
    emitter.emitReserved('connect', socket)
  }

  const _removeSocket = (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => {
    sockets.delete(socket.id)
  }

  const _broadcast = (event: string, args: any[], from: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, room?: string) => {
    for (const [, sock] of sockets) {
      if (sock === from) continue
      if (room && !sock.rooms.has(room)) continue
      const data = [event, ...args]
      sock._send({ type: PacketType.EVENT, data, nsp: name } as SioPacket)
    }
  }

  const _runMiddleware = (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, next: (err?: Error) => void) => {
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

  const nsp = {
    name,
    sockets,
    middlewares,

    on: <Ev extends ReservedOrUserEventNames<NsReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>, {}>>(
      event: Ev,
      fn: ReservedOrUserListener<NsReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>, {}, Ev>,
    ) => { emitter.on(event, fn as any); return nsp },

    off: <Ev extends ReservedOrUserEventNames<NsReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>, {}>>(
      event?: Ev,
      fn?: ReservedOrUserListener<NsReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>, {}, Ev>,
    ) => { if (event !== undefined) emitter.off(event, fn as any); return nsp },

    once: <Ev extends ReservedOrUserEventNames<NsReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>, {}>>(
      event: Ev,
      fn: ReservedOrUserListener<NsReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>, {}, Ev>,
    ) => { emitter.once(event, fn as any); return nsp },

    listeners: <Ev extends ReservedOrUserEventNames<NsReservedEvents<Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>, {}>>(
      event: Ev,
    ) => emitter.listeners(event),

    use: (fn: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, next: (err?: Error) => void) => void) => {
      middlewares.push(fn)
      return nsp
    },
    // emit: 
    _addSocket,
    _removeSocket,
    _broadcast,
    _runMiddleware,
  }

  return nsp
}

export type Namespace<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
> = ReturnType<typeof createNamespace<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>

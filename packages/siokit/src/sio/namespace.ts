import { newEventBus } from 'siokit-core'
import type { EventsMap, DefaultEventsMap, EventNames, EventParams, ReservedOrUserEventNames, ReservedOrUserListener } from 'siokit-core'
import { encodeSioPacket, PacketType } from 'siokit-parser'
import type { SioPacket } from 'siokit-parser'
import type { Socket } from './socket.ts'

type NsReservedEvents<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
> = {
  connection: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => void
  connect: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => void
}

export interface BroadcastOperator<EmitEvents extends EventsMap> {
  emit<Ev extends EventNames<EmitEvents>>(event: Ev, ...args: EventParams<EmitEvents, Ev>): BroadcastOperator<EmitEvents>
  to(room: string | string[]): BroadcastOperator<EmitEvents>
  except(id: string): BroadcastOperator<EmitEvents>
}

export const createNamespace = <
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
>(name: string) => {
  const emitter = newEventBus<ListenEvents, EmitEvents,  NsReservedEvents<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()
  const sockets = new Map<string, Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>()
  const middlewares: Array<(socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, next: (err?: Error) => void) => void> = []

  const _sendToSockets = (rooms: string[], excludes: string[], event: string, args: unknown[]) => {
    for (const [, sock] of sockets) {
      if (excludes.includes(sock.id)) continue
      if (rooms.length > 0 && !rooms.some(r => sock.rooms.has(r))) continue
      sock._send({ type: PacketType.EVENT, data: [event, ...args], nsp: name })
    }
  }

  const createBroadcastOperator = (rooms: string[], excludes: string[]): BroadcastOperator<EmitEvents> => {
    const op: BroadcastOperator<EmitEvents> = {
      emit: <Ev extends EventNames<EmitEvents>>(event: Ev, ...args: EventParams<EmitEvents, Ev>) => {
        _sendToSockets(rooms, excludes, event as string, args)
        return op
      },
      to: (room: string | string[]) => {
        const add = typeof room === 'string' ? [room] : room
        return createBroadcastOperator(rooms.concat(add), excludes)
      },
      except: (id: string) => {
        return createBroadcastOperator(rooms, excludes.concat(id))
      },
    }
    return op
  }

  const _addSocket = (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => {
    sockets.set(socket.id, socket)
    emitter.emitReserved('connection', socket)
    emitter.emitReserved('connect', socket)
  }

  const _removeSocket = (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>) => {
    sockets.delete(socket.id)
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

    on: <Ev extends ReservedOrUserEventNames<NsReservedEvents<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, {}>>(
      event: Ev,
      fn: ReservedOrUserListener<NsReservedEvents<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, {}, Ev>,
    ) => { emitter.on(event, fn); return nsp },

    use: (fn: (socket: Socket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>, next: (err?: Error) => void) => void) => {
      middlewares.push(fn)
      return nsp
    },

    emit: <Ev extends EventNames<EmitEvents>>(event: Ev, ...args: EventParams<EmitEvents, Ev>) => {
      _sendToSockets([], [], event as string, args)
      return nsp
    },

    to: (room: string | string[]) => createBroadcastOperator(typeof room === 'string' ? [room] : room, []),

    except: (id: string) => createBroadcastOperator([], [id]),

    _addSocket,
    _removeSocket,
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

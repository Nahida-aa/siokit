import { createEmitter } from '../core/emitter.ts'
import type { EventsMap } from '../core/eventBus.ts'
import { encodeSioPacket, PacketType } from './parser/index.ts'
import type { SioPacket } from './parser/index.ts'
import type { ServerSocket } from './socket.ts'

type NspReservedEvents = {
  connection: (socket: ServerSocket) => void
  connect: (socket: ServerSocket) => void
}

export interface Namespace {
  name: string
  sockets: Map<string, ServerSocket>
  middlewares: Array<(socket: ServerSocket, next: (err?: Error) => void) => void>
  use(fn: (socket: ServerSocket, next: (err?: Error) => void) => void): Namespace
  on(event: string, handler: (...args: any[]) => void): Namespace
  off(event?: string, handler?: (...args: any[]) => void): Namespace
  once(event: string, handler: (...args: any[]) => void): Namespace
  listeners(event: string): ((...args: any[]) => void)[]
  hasListeners(event: string): boolean
  _addSocket(socket: ServerSocket): void
  _removeSocket(socket: ServerSocket): void
  _broadcast(event: string, args: any[], from: ServerSocket, room?: string): void
  _runMiddleware(socket: ServerSocket, next: (err?: Error) => void): void
}

export const createNamespace = (name: string): Namespace => {
  const emitter = createEmitter<EventsMap, EventsMap, NspReservedEvents>()
  const sockets = new Map<string, ServerSocket>()
  const middlewares: Array<(socket: ServerSocket, next: (err?: Error) => void) => void> = []

  const _addSocket = (socket: ServerSocket) => {
    sockets.set(socket.id, socket)
    emitter.emitReserved('connection', socket)
    emitter.emitReserved('connect', socket)
  }

  const _removeSocket = (socket: ServerSocket) => {
    sockets.delete(socket.id)
  }

  const _broadcast = (event: string, args: any[], from: ServerSocket, room?: string) => {
    for (const [, sock] of sockets) {
      if (sock === from) continue
      if (room && !sock.rooms.has(room)) continue
      const data = [event, ...args]
      sock._send({ type: PacketType.EVENT, data, nsp: name } as SioPacket)
    }
  }

  const _runMiddleware = (socket: ServerSocket, next: (err?: Error) => void) => {
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

  const nsp: Namespace = {
    name,
    sockets,
    middlewares,
    on: (event: string, handler: (...args: any[]) => void) => {
      emitter.on(event as any, handler as any)
      return nsp
    },
    off: (event?: string, handler?: (...args: any[]) => void) => {
      emitter.off(event as any, handler as any)
      return nsp
    },
    once: (event: string, handler: (...args: any[]) => void) => {
      emitter.once(event as any, handler as any)
      return nsp
    },
    listeners: (event: string) => emitter.listeners(event as any),
    hasListeners: (event: string) => emitter.hasListeners(event as any),
    use: (fn) => { middlewares.push(fn); return nsp },
    _addSocket,
    _removeSocket,
    _broadcast,
    _runMiddleware,
  }

  return nsp
}

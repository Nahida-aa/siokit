import { createEmitter } from '../core/emitter.ts'
import type { EventsMap } from '../core/eventBus.ts'
import type { EioSocket } from '../eio/server.ts'
import { encodeSioPacket, PacketType } from './parser/index.ts'
import type { SioPacket } from './parser/index.ts'

type SocketReservedEvents = {
  disconnect: (reason: string) => void
}

export interface ServerSocket {
  id: string
  connected: boolean
  recovered: boolean
  rooms: Set<string>
  on(event: string, handler: (...args: any[]) => void): ServerSocket
  once(event: string, handler: (...args: any[]) => void): ServerSocket
  off(event?: string, handler?: (...args: any[]) => void): ServerSocket
  emit(event: string, ...args: any[]): ServerSocket
  emitWithAck(event: string, ...args: any[]): Promise<any>
  join(...rooms: string[]): void
  leave(room: string): void
  disconnect(): void
  to(room: string): { emit: (event: string, ...args: any[]) => ServerSocket }
  listeners(event: string): ((...args: any[]) => void)[]
  hasListeners(event: string): boolean
  _handlePacket(packet: SioPacket): void
  _disconnect(reason: string): void
  _send(packet: SioPacket): void
  [key: string]: any
}

export const createSocket = (
  eio: EioSocket,
  nsp: { name: string; _removeSocket: (s: ServerSocket) => void; _broadcast: (event: string, args: any[], from: ServerSocket, room?: string) => void },
  sessionId: string,
): ServerSocket => {
  const emitter = createEmitter<EventsMap, EventsMap, SocketReservedEvents>()
  let connected = true
  let ackIdCounter = 0
  const acks = new Map<number, (...args: any[]) => void>()
  const rooms = new Set<string>()
  rooms.add(sessionId)

  const _send = (packet: SioPacket) => {
    if (!connected) return
    const encoded = encodeSioPacket(packet)
    eio.sendMessage(encoded)
  }

  const _handlePacket = (sioPacket: SioPacket) => {
    switch (sioPacket.type) {
      case PacketType.EVENT:
      case PacketType.BINARY_EVENT: {
        const args = sioPacket.data ? [...sioPacket.data] : []
        if (sioPacket.id != null) {
          args.push((...respArgs: any[]) => {
            _send({
              type: PacketType.ACK,
              id: sioPacket.id,
              data: respArgs,
            })
          })
        }
        if (args.length > 0) {
          const eventName = args[0]
          const eventArgs = args.slice(1)
          ;(emitter).emit(eventName, ...eventArgs)
        }
        break
      }
      case PacketType.ACK:
      case PacketType.BINARY_ACK: {
        const ack = acks.get(sioPacket.id!)
        if (ack) {
          acks.delete(sioPacket.id!)
          if (sioPacket.data) ack(...sioPacket.data)
          else ack()
        }
        break
      }
      case PacketType.DISCONNECT: {
        _disconnect('client disconnect')
        break
      }
    }
  }

  const _disconnect = (reason: string) => {
    if (!connected) return
    connected = false
    nsp._removeSocket(sock)
    eio.close(reason)
    emitter.emitReserved('disconnect', reason)
  }

  const sock: ServerSocket = {
    _eio: eio,
    id: sessionId,
    get connected() { return connected },
    get recovered() { return false },
    rooms,

    on: (event: string, handler: (...args: any[]) => void) => {
      emitter.on(event as any, handler as any)
      return sock
    },
    once: (event: string, handler: (...args: any[]) => void) => {
      emitter.once(event as any, handler as any)
      return sock
    },
    off: (event?: string, handler?: (...args: any[]) => void) => {
      if (event) emitter.off(event as any, handler as any)
      return sock
    },
    listeners: (event: string) => emitter.listeners(event as any),
    hasListeners: (event: string) => emitter.hasListeners(event as any),

    emit: (event: string, ...args: any[]) => {
      const data = [event, ...args]
      const packet: SioPacket = { type: PacketType.EVENT, data, nsp: nsp.name }
      _send(packet)
      return sock
    },

    emitWithAck: (event: string, ...args: any[]) => {
      return new Promise((resolve, reject) => {
        const id = ++ackIdCounter
        const data = [event, ...args]
        acks.set(id, (...resp: any[]) => resolve(resp.length <= 1 ? resp[0] : resp))
        _send({ type: PacketType.EVENT, id, data, nsp: nsp.name })
      })
    },

    join: (...roomNames: string[]) => {
      for (const room of roomNames) rooms.add(room)
    },

    leave: (room: string) => {
      rooms.delete(room)
    },

    disconnect: () => {
      _send({ type: PacketType.DISCONNECT, nsp: nsp.name })
      _disconnect('client disconnect')
    },

    to: (room: string) => {
      const broadcastFn = (event: string, ...args: any[]) => {
        nsp._broadcast(event, args, sock, room)
        return sock
      }
      return { emit: broadcastFn }
    },

    _handlePacket,
    _disconnect,
    _send,
  }

  return sock
}

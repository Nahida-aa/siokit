import { createEmitter } from '../core/emitter.ts'
import type { EventsMap } from '../core/eventBus.ts'
import { encodeSioPacket, decodeSioPacket, PacketType } from './parser/index.ts'
import type { SioPacket } from './parser/index.ts'

type ClientReservedEvents = {
  connect: () => void
  disconnect: (reason: string) => void
  connect_error: (err: Error) => void
}

type ClientOptions = {
  auth?: Record<string, any>
  transports?: string[]
  reconnection?: boolean
  reconnectionAttempts?: number
  reconnectionDelay?: number
  timeout?: number
}

export const createClient = (url: string, opts?: ClientOptions) => {
  const emitter = createEmitter<EventsMap, EventsMap, ClientReservedEvents>()
  let ws: WebSocket | null = null
  let connected = false
  let _id: string | undefined
  let ackIdCounter = 0
  const acks = new Map<number, (...args: any[]) => void>()
  let _nsp = '/'

  const _send = (packet: SioPacket) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const encoded = encodeSioPacket(packet)
    ws.send(encoded)
  }

  const connect = () => {
    const targetUrl = url.replace(/^http/, 'ws')
    ws = new WebSocket(targetUrl)

    ws.onopen = () => {
      _send({ type: PacketType.CONNECT, data: opts?.auth, nsp: _nsp })
    }

    ws.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)

      if (raw.startsWith('0')) {
        connected = true
        emitter.emitReserved('connect')
        return
      }

      if (raw === '2') {
        ws?.send('3')
        return
      }

      if (raw === '3') return

      if (raw.startsWith('4')) {
        try {
          const sioRaw = raw.substring(1)
          const sioPacket = decodeSioPacket(sioRaw)

          switch (sioPacket.type) {
            case PacketType.CONNECT: {
              _id = sioPacket.data?.sid
              connected = true
              emitter.emitReserved('connect')
              break
            }
            case PacketType.CONNECT_ERROR: {
              const err = new Error(sioPacket.data?.message ?? 'connection error')
              emitter.emitReserved('connect_error', err)
              break
            }
            case PacketType.EVENT:
            case PacketType.BINARY_EVENT: {
              const args = sioPacket.data ?? []
              const eventName = args[0]
              const eventArgs = args.slice(1)
              if (sioPacket.id != null) {
                eventArgs.push((...respArgs: any[]) => {
                  _send({ type: PacketType.ACK, id: sioPacket.id, data: respArgs })
                })
              }
              emitter.emit(eventName, ...eventArgs)
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
              connected = false
              _id = undefined
              emitter.emitReserved('disconnect', 'io server disconnect')
              break
            }
          }
        } catch {}
        return
      }
    }

    ws.onclose = () => {
      connected = false
      _id = undefined
      emitter.emitReserved('disconnect', 'transport close')
    }

    ws.onerror = (err) => {
      emitter.emitReserved('connect_error', new Error('connection error'))
    }
  }

  const client = {
    ...emitter,
    get id() { return _id },
    get connected() { return connected },

    connect,
    open: connect,

    emit: (event: string, ...args: any[]) => {
      const data = [event, ...args]
      let ack: ((...args: any[]) => void) | undefined
      if (typeof data[data.length - 1] === 'function') {
        ack = data.pop() as (...args: any[]) => void
      }
      const packet: SioPacket = {
        type: PacketType.EVENT,
        data,
        nsp: _nsp,
      }
      if (ack) {
        const id = ++ackIdCounter
        packet.id = id
        acks.set(id, ack)
      }
      _send(packet)
      return client
    },

    emitWithAck: (event: string, ...args: any[]) => {
      return new Promise((resolve, reject) => {
        const id = ++ackIdCounter
        const data = [event, ...args]
        acks.set(id, (...resp: any[]) => {
          resolve(resp.length <= 1 ? resp[0] : resp)
        })
        _send({ type: PacketType.EVENT, id, data, nsp: _nsp })
      })
    },

    disconnect: () => {
      _send({ type: PacketType.DISCONNECT, nsp: _nsp })
      ws?.close()
    },

    close: () => {
      client.disconnect()
    },

    on: (event: string, handler: (...args: any[]) => void) => {
      emitter.on(event as any, handler as any)
      return client
    },
  }

  return client
}

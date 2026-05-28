import { newEventBus } from 'siokit-core'
import type { EventsMap, DefaultEventsMap, EventNames, EventParams, ReservedOrUserEventNames, ReservedOrUserListener, EventNamesWithAck, Last, FirstNonErrorArg, AllButLast } from 'siokit-core'
import { encodeSioPacket, encodeSioPacketBinary, PacketType, hasBinary, newDecoder } from 'siokit-parser'
import type { SioPacket } from 'siokit-parser'
import { createTransport } from './transport.ts'

type ClientReservedEvents = {
  connect: () => void
  disconnect: (reason: string) => void
  connect_error: (err: Error) => void
}

export const createClientSocket = <
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
>(
  url: string,
) => {
  const emitter = newEventBus<ListenEvents, EmitEvents, ClientReservedEvents>()
  const transport = createTransport(url)
  let connected = false
  let ackIdCounter = 0
  const acks = new Map<number, (...args: any[]) => void>()

  const processPacket = (packet: SioPacket) => {
    if (packet.type === PacketType.CONNECT) {
      connected = true
      emitter.emitReserved('connect')
    } else if (packet.type === PacketType.EVENT) {
      const args = packet.data ? [...packet.data] : []
      if (packet.id != null) {
        args.push((...resp: any[]) => {
          transport.send('4' + encodeSioPacket({
            type: PacketType.ACK,
            id: packet.id,
            data: resp,
          }))
        })
      }
      if (args.length > 0) {
        const eventName = args[0]
        const eventArgs: any = args.slice(1)
        emitter.emit(eventName, ...eventArgs)
      }
    } else if (packet.type === PacketType.ACK) {
      const ack = acks.get(packet.id!)
      if (ack) {
        acks.delete(packet.id!)
        if (packet.data) ack(...packet.data)
        else ack()
      }
    } else if (packet.type === PacketType.DISCONNECT) {
      connected = false
      emitter.emitReserved('disconnect', 'server disconnect')
    } else if (packet.type === PacketType.CONNECT_ERROR) {
      const msg = packet.data?.message || 'connect error'
      emitter.emitReserved('connect_error', new Error(msg))
    }
  }

  const decoder = newDecoder()
  decoder.on('decoded', processPacket)

  const connect = async () => {
    try {
      await transport.connect()
      transport.handlers.onmessage = (data) => decoder.add(data)
      transport.handlers.onclose = (reason) => {
        connected = false
        decoder.destroy()
        emitter.emitReserved('disconnect', reason)
      }
      transport.send('40')
    } catch (err) {
      emitter.emitReserved('connect_error', err as Error)
    }
  }

  const disconnect = () => {
    transport.send('41')
    connected = false
    transport.close()
    decoder.destroy()
    emitter.emitReserved('disconnect', 'io client disconnect')
  }

  const sendSioPacket = (packet: SioPacket) => {
    if (hasBinary(packet.data)) {
      const result = encodeSioPacketBinary(packet)
      if (result) {
        transport.send('4' + result.text)
        for (const bin of result.attachments) {
          transport.send(bin)
        }
        return
      }
    }
    transport.send('4' + encodeSioPacket(packet))
  }

  const sock = {
    id: '',
    get connected() { return connected },

    on: emitter.on,

    emit: <Ev extends EventNames<EmitEvents>>(event: Ev, ...args: EventParams<EmitEvents, Ev>) => {
      sendSioPacket({ type: PacketType.EVENT, data: [event, ...args] })
      return sock
    },

    emitWithAck: <Ev extends EventNamesWithAck<EmitEvents>>(
      event: Ev,
      ...args: AllButLast<EventParams<EmitEvents, Ev>>
    ): Promise<FirstNonErrorArg<Last<EventParams<EmitEvents, Ev>>>>  => {
      return new Promise((resolve) => {
        const id = ++ackIdCounter
        acks.set(id, (...resp: any[]) => resolve(resp.length <= 1 ? resp[0] : resp))
        sendSioPacket({ type: PacketType.EVENT, id, data: [event, ...args] })
      })
    },

    disconnect,
  }

  connect().catch((err) => {
    if (!connected) emitter.emitReserved('connect_error', err as Error)
  })

  return sock
}

export type ClientSocket<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
> = ReturnType<typeof createClientSocket<ListenEvents, EmitEvents>>

import { newEventBus } from '../core/eventBus.ts'
import type { EventsMap, DefaultEventsMap, EventNames, EventParams, ReservedOrUserEventNames, ReservedOrUserListener } from '../core/event.ts'
import type { Conn } from '../eio/server.ts'
import { encodeSioPacket, PacketType } from './parser/index.ts'
import { encodeSioPacketBinary, hasBinary } from './parser/binary.ts'
import type { SioPacket } from './parser/index.ts'
import { AllButLast, EventNamesWithAck, FirstNonErrorArg, Last } from './type.ts';

type SocketReservedEvents = {
  disconnect: (reason: string) => void
}

export const createSocket = <
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
>(
  eio: Conn,
  nsp: { name: string; _removeSocket: (s: any) => void },
  sessionId: string,
)=> {
  const emitter = newEventBus<ListenEvents, EmitEvents, SocketReservedEvents>()
  let connected = true
  let ackIdCounter = 0
  const acks = new Map<number, (...args: any[]) => void>()
  const rooms = new Set<string>()
  rooms.add(sessionId)

  const _send = (packet: SioPacket) => {
    if (!connected) return

    if (hasBinary(packet.data)) {
      const result = encodeSioPacketBinary(packet)
      if (result) {
        eio.sendMessage(result.text)
        for (const bin of result.attachments) {
          eio.sendBinary(bin)
        }
        return
      }
    }

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
          const eventArgs: any[] = args.slice(1)
          ;(emitter as any).emit(eventName, ...eventArgs)
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

  const sock = {
    id: sessionId,
    get connected() { return connected },
    get recovered() { return false },
    rooms,
    _conn: eio,

    on: <Ev extends ReservedOrUserEventNames<SocketReservedEvents, ListenEvents>>(
      event: Ev,
      fn: ReservedOrUserListener<SocketReservedEvents, ListenEvents, Ev>,
    ) => { emitter.on(event, fn); return sock },

    emit: <Ev extends EventNames<EmitEvents>>(event: Ev, ...args: EventParams<EmitEvents, Ev>) => {
      const data = [event, ...args]
      _send({ type: PacketType.EVENT, data, nsp: nsp.name })
      return sock
    },

    emitWithAck: <Ev extends EventNamesWithAck<EmitEvents>>(event: Ev, ...args: AllButLast<EventParams<EmitEvents, Ev>>): Promise<FirstNonErrorArg<Last<EventParams<EmitEvents, Ev>>>> => {
      return new Promise((resolve) => {
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

    _handlePacket,
    _disconnect,
    _send,
  }

  return sock
}

export type Socket<
  ListenEvents extends EventsMap = DefaultEventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ServerSideEvents extends EventsMap = DefaultEventsMap,
  SocketData = any,
> = ReturnType<typeof createSocket<ListenEvents, EmitEvents, ServerSideEvents, SocketData>>
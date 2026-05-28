import { PacketType } from './shared.ts'
import type { SioPacket } from './shared.ts'

const RESERVED_EVENTS = [
  'connect', 'connect_error', 'disconnect', 'disconnecting',
  'newListener', 'removeListener',
]

export const encodeSioPacket = (packet: SioPacket): string => {
  let str = '' + packet.type

  if (packet.type === PacketType.BINARY_EVENT || packet.type === PacketType.BINARY_ACK) {
    str += (packet.attachments ?? 0) + '-'
  }

  if (packet.nsp && packet.nsp !== '/') {
    str += packet.nsp + ','
  }

  if (packet.id != null) {
    str += packet.id
  }

  if (packet.data != null) {
    str += JSON.stringify(packet.data)
  }

  return str
}

export const decodeSioPacket = (raw: string): SioPacket => {
  let i = 0

  const type = Number(raw.charAt(i)) as PacketType
  if (PacketType[type] === undefined) {
    throw new Error(`unknown packet type ${type}`)
  }
  const p: SioPacket = { type }

  if (type === PacketType.BINARY_EVENT || type === PacketType.BINARY_ACK) {
    const start = ++i
    while (raw.charAt(i) !== '-' && i < raw.length) i++
    const buf = raw.substring(start, i)
    p.attachments = Number(buf)
  }

  if (raw.charAt(i + 1) === '/') {
    const start = i + 1
    while (++i < raw.length) {
      if (raw.charAt(i) === ',') break
    }
    p.nsp = raw.substring(start, i)
  } else {
    p.nsp = '/'
  }

  const next = raw.charAt(i + 1)
  if (next && /^\d$/.test(next)) {
    const start = i + 1
    while (++i < raw.length) {
      if (!/^\d$/.test(raw.charAt(i))) {
        i--
        break
      }
    }
    p.id = Number(raw.substring(start, i + 1))
  }

  if (raw.charAt(++i)) {
    try {
      p.data = JSON.parse(raw.substring(i))
    } catch {
      p.data = raw.substring(i)
    }
  }

  return p
}

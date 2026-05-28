import { PACKET_TYPES } from './shared.ts'
import type { Packet, RawData } from './shared.ts'

export const encodePacket = (
  packet: Packet,
  supportsBinary: boolean,
  callback: (encoded: string | RawData) => void,
) => {
  const type = PACKET_TYPES[packet.type]
  if (type === undefined) {
    callback('')
    return
  }
  if (supportsBinary && packet.data instanceof Uint8Array) {
    const prefix = new Uint8Array(1)
    prefix[0] = Number(type)
    const combined = new Uint8Array(1 + packet.data.length)
    combined.set(prefix)
    combined.set(packet.data, 1)
    callback(combined)
  } else {
    callback(type + (packet.data ?? ''))
  }
}

export const encodePayload = (
  packets: Packet[],
  callback: (encoded: string) => void,
) => {
  let result = ''
  let pending = packets.length
  if (pending === 0) {
    callback(result)
    return
  }
  for (let i = 0; i < packets.length; i++) {
    const p = packets[i]
    const type = PACKET_TYPES[p.type]
    const data = String(p.data ?? '')
    result += type + data
    pending--
    if (pending === 0) callback(result)
  }
}

import { PACKET_TYPES_REVERSE, ERROR_PACKET } from './shared.ts'
import type { Packet, PacketType, RawData } from './shared.ts'

export const decodePacket = (
  data: RawData,
  binaryType?: 'nodebuffer' | 'arraybuffer' | 'blob',
): Packet => {
  if (typeof data === 'string') {
    const typeChar = data.charAt(0)
    const type = PACKET_TYPES_REVERSE[typeChar] as PacketType | undefined
    if (!type) return ERROR_PACKET as Packet
    const payload = data.substring(1)
    return { type, data: payload || undefined } as Packet
  }

  const arr = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (arr.length === 0) return ERROR_PACKET as Packet
  const typeCode = arr[0]
  const type = PACKET_TYPES_REVERSE[String(typeCode)] as PacketType | undefined
  if (!type) return ERROR_PACKET as Packet
  const payload = arr.slice(1)
  return { type, data: payload } as Packet
}

export const decodePayload = (
  data: string,
): Packet[] => {
  const packets: Packet[] = []
  let i = 0
  while (i < data.length) {
    const typeChar = data.charAt(i)
    const type = PACKET_TYPES_REVERSE[typeChar] as PacketType | undefined
    if (!type) break
    i++
    const rest = data.substring(i)
    packets.push({ type, data: rest || undefined } as Packet)
    i = data.length
  }
  return packets
}

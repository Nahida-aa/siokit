import { PacketType } from './shared.ts'
import type { SioPacket } from './shared.ts'

export const hasBinary = (data: unknown): boolean => {
  if (data == null) return false
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) return true
  if (Array.isArray(data)) return data.some(hasBinary)
  if (typeof data === 'object') return Object.values(data as Record<string, unknown>).some(hasBinary)
  return false
}

export const extractBinaries = (data: unknown, attachments: Uint8Array[]): unknown => {
  if (data instanceof Uint8Array) {
    const idx = attachments.length
    attachments.push(data)
    return { _placeholder: true, num: idx }
  }
  if (data instanceof ArrayBuffer) {
    return extractBinaries(new Uint8Array(data), attachments)
  }
  if (Array.isArray(data)) {
    return data.map(item => extractBinaries(item, attachments))
  }
  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = extractBinaries(value, attachments)
    }
    return result
  }
  return data
}

export const replacePlaceholders = (data: unknown, attachments: Uint8Array[]): unknown => {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    if (obj._placeholder === true && typeof obj.num === 'number') {
      return attachments[obj.num] ?? data
    }
  }
  if (Array.isArray(data)) {
    return data.map(item => replacePlaceholders(item, attachments))
  }
  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = replacePlaceholders(value, attachments)
    }
    return result
  }
  return data
}

export const encodeSioPacketBinary = (
  packet: SioPacket,
): { text: string; attachments: Uint8Array[] } | null => {
  if (!hasBinary(packet.data)) return null

  const bins: Uint8Array[] = []
  const dataClean = extractBinaries(packet.data, bins)
  const binaryType = packet.type === PacketType.ACK ? PacketType.BINARY_ACK : PacketType.BINARY_EVENT
  const text = encodeTextPacket({ ...packet, type: binaryType, data: dataClean, attachments: bins.length })
  return { text, attachments: bins }
}

const encodeTextPacket = (packet: SioPacket): string => {
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
